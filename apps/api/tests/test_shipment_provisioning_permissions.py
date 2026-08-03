from pathlib import Path

from app.organizations.services.provisioning_service import SHIPMENT_ROLE_PERMISSIONS


def test_owner_and_manager_receive_full_shipment_access():
    expected = {"shipments.read", "shipments.create", "shipments.update", "shipments.confirm_arrival"}
    assert set(SHIPMENT_ROLE_PERMISSIONS["OWNER"]) == expected
    assert set(SHIPMENT_ROLE_PERMISSIONS["MANAGER"]) == expected
    assert SHIPMENT_ROLE_PERMISSIONS["SUPPORT"] == ("shipments.read",)


def test_shipment_permission_repair_is_idempotent():
    migration = Path(__file__).parents[3] / "infra/sql/038_repair_shipment_role_permissions.sql"
    sql = " ".join(migration.read_text(encoding="utf-8").lower().split())
    assert "shipments.read" in sql
    assert "on conflict do nothing" in sql
