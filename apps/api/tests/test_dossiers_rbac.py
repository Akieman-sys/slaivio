from fastapi.routing import APIRoute
from pathlib import Path

from app.api.dossiers import router
from app.organizations.services.provisioning_service import DOSSIER_ROLE_PERMISSIONS


EXPECTED_ROUTE_PERMISSIONS = {
    ("/dossiers", "GET"): "dossiers.read",
    ("/dossiers", "POST"): "dossiers.create",
    ("/dossiers/stats", "GET"): "dossiers.read",
    ("/dossiers/alerts", "GET"): "dossiers.read",
    ("/dossiers/alerts/{alert_id}/acknowledge", "PATCH"): "dossiers.update",
    ("/dossiers/export", "GET"): "dossiers.export",
    ("/dossiers/archived", "GET"): "dossiers.archive",
    ("/dossiers/{dossier_id}", "GET"): "dossiers.read",
    ("/dossiers/{dossier_id}", "PATCH"): "dossiers.update",
    ("/dossiers/{dossier_id}", "DELETE"): "dossiers.archive",
    ("/dossiers/{dossier_id}/restore", "POST"): "dossiers.archive",
    ("/dossiers/{dossier_id}/timeline", "GET"): "dossiers.read",
    ("/dossiers/{dossier_id}/documents", "GET"): "dossiers.read",
    ("/dossiers/{dossier_id}/documents", "POST"): "dossiers.update",
    ("/dossiers/{dossier_id}/documents/{document_id}/download", "GET"): "dossiers.read",
    ("/dossiers/{dossier_id}/checklist", "GET"): "dossiers.read",
    ("/dossiers/{dossier_id}/checklist/{item_id}", "PATCH"): "dossiers.update",
    ("/dossiers/collaboration/members", "GET"): "dossiers.read",
    ("/dossiers/{dossier_id}/collaboration", "PATCH"): "dossiers.update",
    ("/dossiers/{dossier_id}/notes", "GET"): "dossiers.read",
    ("/dossiers/{dossier_id}/notes", "POST"): "dossiers.update",
    ("/dossiers/{dossier_id}/notes/{note_id}", "PATCH"): "dossiers.update",
    ("/dossiers/{dossier_id}/notes/{note_id}", "DELETE"): "dossiers.update",
}


def _permission_from_dependency(call) -> str | None:
    for cell in call.__closure__ or ():
        value = cell.cell_contents
        if isinstance(value, str) and value.startswith("dossiers."):
            return value
    return None


def test_every_dossier_route_declares_the_expected_permission():
    actual = {}
    for route in router.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in route.methods or set():
            permissions = {
                permission
                for dependency in route.dependant.dependencies
                if (permission := _permission_from_dependency(dependency.call))
            }
            if permissions:
                assert len(permissions) == 1
                actual[(route.path, method)] = permissions.pop()

    assert actual == EXPECTED_ROUTE_PERMISSIONS


def test_dossier_default_roles_follow_least_privilege():
    assert "dossiers.export" in DOSSIER_ROLE_PERMISSIONS["OWNER"]
    assert "dossiers.archive" in DOSSIER_ROLE_PERMISSIONS["OWNER"]
    assert "dossiers.archive" in DOSSIER_ROLE_PERMISSIONS["MANAGER"]
    assert "dossiers.archive" not in DOSSIER_ROLE_PERMISSIONS["OPERATOR"]
    assert "dossiers.export" in DOSSIER_ROLE_PERMISSIONS["MANAGER"]
    assert "dossiers.export" not in DOSSIER_ROLE_PERMISSIONS["OPERATOR"]
    assert DOSSIER_ROLE_PERMISSIONS["WAREHOUSE"] == ("dossiers.read",)
    assert DOSSIER_ROLE_PERMISSIONS["FINANCE"] == ("dossiers.read",)
    assert "dossiers.update" not in DOSSIER_ROLE_PERMISSIONS["SUPPORT"]


def test_dossier_rbac_migration_repairs_existing_organizations():
    migration = Path(__file__).parents[3] / "infra/sql/033_dossiers_rbac.sql"
    sql = " ".join(migration.read_text(encoding="utf-8").lower().split())
    assert "dossiers.export" in sql
    assert "role_permissions" in sql
    assert "system_role" not in sql
    assert "on conflict do nothing" in sql
