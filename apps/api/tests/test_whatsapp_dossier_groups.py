from pathlib import Path

from app.services import whatsapp_dossier_group_service as service


def test_runtime_repair_contains_inbox_and_group_dependencies():
    migration = (Path(__file__).parents[3] / "infra/sql/110_pilot_runtime_schema_repair.sql").read_text(encoding="utf-8")

    assert "add column if not exists ai_mode_override" in migration
    assert "add column if not exists pilot_response_mode" in migration
    assert "add column if not exists whatsapp_group_status" in migration
    assert "whatsapp_group_on_dossier_create" in migration


def test_group_status_and_manual_sync_are_exposed_to_the_dashboard():
    root = Path(__file__).parents[3]
    repository = (root / "apps/api/app/db/dossier_repository.py").read_text(encoding="utf-8")
    api = (root / "apps/api/app/api/dossiers.py").read_text(encoding="utf-8")
    dashboard = (root / "apps/web/dashboard/components/dossiers/dossier-detail-page.tsx").read_text(encoding="utf-8")

    assert "whatsapp_group_status" in repository
    assert "whatsapp_group_enabled" in repository
    assert '"/dossiers/{dossier_id}/whatsapp-group/sync"' in api
    assert 'require_permission("dossiers.update")' in api
    assert "WhatsappGroupPanel" in dashboard
    assert "Créer le groupe" in dashboard
    assert "Ajouter un participant" in dashboard
    assert "whatsapp_group_jid" in dashboard


def test_group_conversation_identity_is_persisted_and_visible_in_the_inbox():
    root = Path(__file__).parents[3]
    migration = (root / "infra/sql/111_pilot_whatsapp_conversation_identity.sql").read_text(encoding="utf-8")
    repository = (root / "apps/api/app/db/pilot_inbox_repository.py").read_text(encoding="utf-8")
    gateway = (root / "apps/whatsapp-qr-gateway/src/session-manager.js").read_text(encoding="utf-8")
    dashboard = (root / "apps/web/dashboard/components/inbox/pilot-inbox-page.tsx").read_text(encoding="utf-8")

    for column in ("conversation_jid", "sender_name", "conversation_name", "is_group"):
        assert f"add column if not exists {column}" in migration
        assert column in repository
    assert "from messages_raw raw" in migration
    assert 'rawTarget.endsWith("@g.us")' in gateway
    assert "item.pushName" in gateway
    assert 'label: "Groupes"' in dashboard
    assert "message.sender_phone" in dashboard


def test_group_waits_until_a_client_is_explicitly_attached(monkeypatch):
    monkeypatch.setattr(service, "_context", lambda *_: {
        "whatsapp_group_on_dossier_create": True,
        "connection_id": "connection-1",
        "phones": [],
        "whatsapp_group_jid": None,
    })
    statuses = []
    monkeypatch.setattr(service, "_save_status", lambda *args: statuses.append(args))

    result = service.sync_dossier_whatsapp_group("org-1", "dossier-1")

    assert result == {"status": "waiting_for_participant"}
    assert statuses[-1][2] == "WAITING_FOR_PARTICIPANT"


def test_group_is_created_with_explicit_dossier_clients(monkeypatch):
    monkeypatch.setattr(service, "_context", lambda *_: {
        "whatsapp_group_on_dossier_create": True,
        "connection_id": "connection-1",
        "phones": ["+243900000001", "+243900000002"],
        "whatsapp_group_jid": None,
        "title": "Dossier Mbote",
        "dossier_reference": "DOS-1",
    })
    statuses = []
    requests = []
    monkeypatch.setattr(service, "_save_status", lambda *args: statuses.append(args))
    monkeypatch.setattr(
        service,
        "qr_gateway_request",
        lambda method, path, payload: requests.append((method, path, payload)) or {
            "success": True,
            "group_jid": "120000000@g.us",
        },
    )

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, *_args, **_kwargs): return None

    monkeypatch.setattr(service.engine, "begin", lambda: Connection())

    result = service.sync_dossier_whatsapp_group("org-1", "dossier-1")

    assert result["status"] == "connected"
    assert requests[0][1] == "/connections/connection-1/groups"
    assert requests[0][2]["participants"] == ["+243900000001", "+243900000002"]
    assert statuses[0][2] == "CREATING"
