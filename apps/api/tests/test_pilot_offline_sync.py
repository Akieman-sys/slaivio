from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_offline_migration_is_tenant_scoped_idempotent_and_conflict_aware():
    sql = read("infra/sql/101_pilot_offline_sync.sql")
    assert "pilot_sync_devices" in sql
    assert "pilot_sync_operations" in sql
    assert "unique(org_id, operation_key)" in sql
    assert "expected_version integer" in sql
    assert "processing_started_at" in sql
    assert "status in ('PROCESSING','APPLIED','CONFLICT','REJECTED')" in sql
    assert "pilot.offline.use" in sql
    assert "revoke all on pilot_sync_devices, pilot_sync_operations from public" in sql


def test_sync_api_checks_the_permission_for_each_real_business_operation():
    api = read("apps/api/app/api/pilot_sync.py")
    assert '"DOSSIER_CREATE": "dossiers.create"' in api
    assert '"DOSSIER_UPDATE": "dossiers.update"' in api
    assert '"FOLLOWUP_DRAFT_SAVE": "pilot.followups.manage"' in api
    assert "assert_permission(" in api
    assert 'Depends(require_permission("pilot.offline.use"))' in api


def test_sync_repository_reuses_business_repositories_and_never_overwrites_a_conflict():
    repository = read("apps/api/app/db/pilot_sync_repository.py")
    assert "create_dossier(org_id, user_id, payload)" in repository
    assert "update_dossier(org_id, entity_id, user_id, update)" in repository
    assert "save_draft(org_id, user_id, payload)" in repository
    assert 'if code == "stale_dossier_version"' in repository
    assert 'status="CONFLICT"' in repository
    assert '"local": operation["payload"]' in repository
    assert '"server": current' in repository
    assert "interval '2 minutes'" in repository


def test_browser_offline_store_is_scoped_and_cleared_on_logout():
    store = read("apps/web/dashboard/services/pilot-offline.ts")
    providers = read("apps/web/dashboard/app-providers.tsx")
    assert "scope" in store
    assert "indexedDB" in store
    assert "synchronizePilotQueue" in store
    assert "clearPilotOfflineData" in store
    assert "void clearPilotOfflineData()" in providers
    assert "userId" in providers and "orgId" in providers


def test_offline_policy_keeps_ai_and_whatsapp_delivery_online_only():
    inbox = read("apps/web/dashboard/components/inbox/pilot-inbox-page.tsx")
    followups = read("apps/web/dashboard/components/followups/followups-page.tsx")
    service_worker = read("apps/web/dashboard/public/pilot-sw.js")
    assert "L’IA nécessite une connexion" in inbox
    assert "Reconnectez-vous pour envoyer ce message WhatsApp" in inbox
    assert 'operation_type:"FOLLOWUP_DRAFT_SAVE"' in followups
    assert "Reconnectez-vous pour envoyer cette relance WhatsApp" in followups
    assert '/_next/static/' in service_worker
    assert "/api/" not in service_worker
