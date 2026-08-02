from pathlib import Path

from app.api.dossiers import router


def test_archive_routes_are_static_and_versioned():
    routes = {(route.path, method) for route in router.routes for method in route.methods}
    assert ("/dossiers/archived", "GET") in routes
    assert ("/dossiers/{dossier_id}", "DELETE") in routes
    assert ("/dossiers/{dossier_id}/restore", "POST") in routes


def test_archive_migration_enforces_audit_and_tenant_guards():
    migration = Path(__file__).parents[3] / "infra/sql/035_dossiers_archive_audit_tenant_guard.sql"
    sql = " ".join(migration.read_text(encoding="utf-8").lower().split())
    assert "dossiers.archive" in sql
    assert "prevent_archived_dossier_mutation" in sql
    assert "enforce_dossier_client_tenant" in sql
    assert "enforce_dossier_child_tenant" in sql
    assert "revoke all on audit_logs from public" in sql
