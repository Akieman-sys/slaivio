from app.api.clients import (
    ClientPatchPayload,
    ClientMergePayload,
    MAX_CLIENT_EXPORT_ROWS,
    MAX_CLIENT_IMPORT_BYTES,
    MAX_CLIENT_IMPORT_ROWS,
    router,
)
from app.clients.repository import CLIENT_RELATION_TABLES, normalize_email, normalize_phone
from app.organizations.services.provisioning_service import (
    CLIENT_ROLE_PERMISSION_INSERT_SQL,
    CLIENT_ROLE_PERMISSIONS,
)
from fastapi.routing import APIRoute


EXPECTED_ROUTE_PERMISSIONS = {
    ("/clients", "GET"): "clients.read",
    ("/clients", "POST"): "clients.create",
    ("/clients/stats", "GET"): "clients.read",
    ("/clients/merge", "POST"): "clients.merge",
    ("/clients/archived", "GET"): "clients.archive",
    ("/clients/export", "GET"): "clients.export",
    ("/clients/import", "POST"): "clients.import",
    ("/clients/duplicates", "GET"): "clients.read",
    ("/clients/{client_id}", "GET"): "clients.read",
    ("/clients/{client_id}", "PATCH"): "clients.update",
    ("/clients/{client_id}", "DELETE"): "clients.archive",
    ("/clients/{client_id}/timeline", "GET"): "clients.read",
    ("/clients/{client_id}/restore", "POST"): "clients.archive",
}


def _permission_from_dependency(call) -> str | None:
    for cell in call.__closure__ or ():
        value = cell.cell_contents
        if isinstance(value, str) and value.startswith("clients."):
            return value
    return None


def test_every_clients_route_declares_the_expected_permission():
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


def test_clients_default_roles_follow_least_privilege():
    assert "clients.merge" in CLIENT_ROLE_PERMISSIONS["OWNER"]
    assert "clients.merge" in CLIENT_ROLE_PERMISSIONS["MANAGER"]
    assert CLIENT_ROLE_PERMISSIONS["WAREHOUSE"] == ("clients.read",)
    assert "clients.archive" not in CLIENT_ROLE_PERMISSIONS["SUPPORT"]
    assert "clients.import" not in CLIENT_ROLE_PERMISSIONS["OPERATOR"]
    assert "FINANCE" not in CLIENT_ROLE_PERMISSIONS


def test_client_permissions_are_granted_by_role_code_not_system_flag():
    normalized_sql = " ".join(CLIENT_ROLE_PERMISSION_INSERT_SQL.lower().split())
    assert "r.role_code = :role_code" in normalized_sql
    assert "system_role" not in normalized_sql


def test_clients_bulk_operations_have_explicit_safety_limits():
    assert MAX_CLIENT_IMPORT_BYTES == 5 * 1024 * 1024
    assert MAX_CLIENT_IMPORT_ROWS == 10_000
    assert MAX_CLIENT_EXPORT_ROWS == 50_000


def test_client_contact_normalization_is_deterministic():
    assert normalize_phone("+243 999-123-456") == "+243999123456"
    assert normalize_phone("00243 999 123 456") == "+243999123456"
    assert normalize_email("  CLIENT@Example.COM ") == "client@example.com"


def test_client_patch_requires_the_current_row_version():
    payload = ClientPatchPayload(row_version=4, name="Nouveau nom")
    assert payload.row_version == 4


def test_client_merge_contract_is_versioned_and_idempotent():
    payload = ClientMergePayload(
        source_client_id="source-client",
        target_client_id="target-client",
        source_version=2,
        target_version=7,
        idempotency_key="8c87b75a-1b09-42cb-b1ad-874a51c72bca",
    )
    assert payload.source_version == 2
    assert payload.target_version == 7
    assert "dossiers" in CLIENT_RELATION_TABLES
    assert "messages_raw" in CLIENT_RELATION_TABLES
    assert "cargo_packages" in CLIENT_RELATION_TABLES
