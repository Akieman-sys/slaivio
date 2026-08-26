from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_readiness_migration_is_tenant_scoped_and_auditable():
    sql = read("infra/sql/102_pilot_readiness_reviews.sql")
    assert "pilot_readiness_reviews" in sql
    assert "org_id text not null references organizations(id)" in sql
    assert "checks jsonb not null" in sql
    assert "pilot.readiness.read" in sql
    assert "pilot.readiness.review" in sql
    assert "revoke all on pilot_readiness_reviews from public" in sql


def test_readiness_is_computed_from_real_pilot_sources():
    repository = read("apps/api/app/organization_admin/pilot_repository.py")
    for source in (
        "organization_memberships",
        "document_numbering_settings",
        "organization_whatsapp_numbers",
        "ai_settings",
        "knowledge_entries",
        "pilot_sync_operations",
        "pilot_followup_recipients",
    ):
        assert source in repository
    assert '"ACTION_REQUIRED"' in repository
    assert '"WARNING"' in repository
    assert "record_readiness_review" in repository


def test_readiness_api_is_permission_protected():
    api = read("apps/api/app/api/organization_admin.py")
    assert "@router.get('/pilot/readiness'" in api
    assert "require_permission('pilot.readiness.read')" in api
    assert "@router.post('/pilot/readiness/reviews'" in api
    assert "require_permission('pilot.readiness.review')" in api


def test_dashboard_exposes_human_readable_readiness_actions():
    component = read("apps/web/dashboard/components/dashboard/pilot-readiness.tsx")
    dashboard = read("apps/web/dashboard/components/dashboard/dashboard-overview.tsx")
    assert "PilotReadinessPanel" in dashboard
    assert "Préparation à la mise en service" in component
    assert "Voir les vérifications" in component
    assert "Enregistrer la vérification" in component
    for technical_term in ("UUID", "pilot_sync_operations", "ACTION_REQUIRED"):
        assert technical_term not in component
