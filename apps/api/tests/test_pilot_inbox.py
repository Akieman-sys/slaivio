from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api import inbox


ROOT = Path(__file__).parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pilot_inbox_migration_links_existing_business_records_without_duplication():
    sql = read("infra/sql/096_pilot_inbox_context.sql").lower()

    for column in ("client_id uuid", "dossier_id uuid", "last_read_at timestamptz", "row_version integer"):
        assert column in sql
    assert "references clients(org_id, id)" in sql
    assert "references dossiers(org_id, id)" in sql
    assert "from dossier_clients relation" in sql
    assert "conversation_client_not_in_dossier" in sql
    assert "inbox.manage" in sql
    assert "create table clients" not in sql
    assert "create table dossiers" not in sql
    assert "delete from" not in sql


def test_pilot_inbox_repository_is_tenant_scoped_and_uses_the_multi_client_model():
    repository = read("apps/api/app/db/pilot_inbox_repository.py")
    messages = read("apps/api/app/db/message_repository.py")

    assert "where org_id = :org_id" in repository
    assert "join dossier_clients relation" in repository
    assert "candidate.id = assignment.dossier_id" in repository
    assert "client.id = assignment.client_id" in repository
    assert "conversation_assignments.unread_count, 0) + 1" in repository
    assert "client_not_in_dossier" in repository
    assert "insert into clients" not in repository
    assert "insert into dossiers" not in repository
    assert "from dossier_clients relation" in messages
    assert "normalized_phone = :normalized_phone" in messages
    assert "on conflict(org_id, idempotency_key)" in messages


def test_inbox_list_passes_only_the_active_tenant(monkeypatch):
    captured = {}

    def fake_list(org_id, view, query, page, page_size, *legacy_filters):
        captured.update(org_id=org_id, view=view, query=query, page=page, page_size=page_size)
        return {"items": [], "page": page, "page_size": page_size, "total": 0}

    monkeypatch.setattr(inbox, "list_pilot_conversations", fake_list)
    result = inbox.list_conversations(
        view="waiting", q="Mardoche", page=1, page_size=40,
        number_role=None, status=None, queue_name=None, priority=None, requires_attention=None,
        tenant={"org_id": "agency-a", "user_id": "owner-a"},
    )

    assert captured == {"org_id": "agency-a", "view": "waiting", "query": "Mardoche", "page": 1, "page_size": 40}
    assert result["pagination"]["total"] == 0


def test_pilot_inbox_rejects_technical_conversation_status():
    with pytest.raises(HTTPException) as error:
        inbox.change_conversation_state(
            "+243900000000",
            inbox.ConversationStateRequest(status="PENDING_VALIDATION", requires_attention=False),
            tenant={"org_id": "agency-a", "user_id": "owner-a"},
        )
    assert error.value.status_code == 400
    assert error.value.detail == "invalid_conversation_status"


def test_pilot_inbox_ui_is_a_real_whatsapp_workspace():
    page = read("apps/web/dashboard/components/inbox/pilot-inbox-page.tsx")
    route = read("apps/web/dashboard/app/app/inbox/page.tsx")
    service = read("apps/web/dashboard/services/inbox.ts")

    for label in (
        "À répondre",
        "En cours",
        "Terminées",
        "Rechercher une conversation",
        "Client",
        "Dossier lié",
        "À reprendre",
        "Écrire une réponse au nom de l’entreprise",
        "fenêtre de réponse WhatsApp de 24 heures",
        "Afficher les messages précédents",
    ):
        assert label in page

    assert "PilotInboxPage" in route
    assert "markInboxConversationRead" in page
    assert "updateInboxContext" in page
    assert "sendInboxReply" in page
    assert "setInterval" in page
    assert "encodeURIComponent(phone)" in service
    assert "has_older_messages" in service
    assert "assigned_manager" not in page
    assert "UUID" not in page


def test_inbox_endpoints_enforce_backend_permissions():
    api = read("apps/api/app/api/inbox.py")
    replies = read("apps/api/app/api/inbox_replies.py")

    assert 'require_permission("inbox.read")' in api
    assert 'require_permission("inbox.manage")' in api
    assert 'require_permission("inbox.reply")' in replies
    assert 'tenant.get("user_id")' in replies
    assert "body.manager_id" not in replies
    assert '"error": str(exc)' not in replies


def test_whatsapp_inbound_and_outbound_are_idempotent():
    webhook = read("apps/api/app/api/webhook.py")
    outbound = read("apps/api/app/db/outbound_message_repository.py")
    replies = read("apps/api/app/api/inbox_replies.py")
    service = read("apps/web/dashboard/services/inbox.ts")

    assert "register_inbound(" in webhook
    assert "on conflict(dedupe_key) do nothing" in outbound
    assert "idempotent_replay" in outbound
    assert "pilot-inbox:{org_id}:{body.idempotency_key}" in replies
    assert "crypto.randomUUID()" in service
