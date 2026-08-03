from pathlib import Path
from fastapi.routing import APIRoute

from app.organizations.services.provisioning_service import SHIPMENT_ROLE_PERMISSIONS
from app.api.shipments import router
from app.expeditions.repository import EXPEDITION_TRANSITIONS

EXPECTED_PERMISSIONS={
 ("/shipments","GET"):"shipments.read",("/shipments/stats","GET"):"shipments.read",("/shipments/analytics","GET"):"shipments.read",("/shipments/export","GET"):"shipments.read",("/shipments","POST"):"shipments.create",
 ("/shipments/{shipment_id}","GET"):"shipments.read",("/shipments/{shipment_id}","PATCH"):"shipments.update",("/shipments/{shipment_id}","DELETE"):"shipments.update",
 ("/shipments/{shipment_id}/timeline","GET"):"shipments.read",("/shipments/{shipment_id}/packages","POST"):"shipments.update",("/shipments/{shipment_id}/packages/{package_id}","DELETE"):"shipments.update",
 ("/shipments/{shipment_id}/checkpoints/{checkpoint_key}","PATCH"):"shipments.update",("/shipments/{shipment_id}/documents","POST"):"shipments.update",("/shipments/{shipment_id}/documents/upload","POST"):"shipments.update",("/shipments/{shipment_id}/documents/{document_id}/view","GET"):"shipments.read",
 ("/shipments/{shipment_id}/financial-lines","POST"):"shipments.update",("/shipments/{shipment_id}/anomalies","POST"):"shipments.update",("/shipments/{shipment_id}/anomalies/{anomaly_id}/resolve","PATCH"):"shipments.update",("/shipments/{shipment_id}/notifications","POST"):"shipments.update",("/shipments/notifications/bulk","POST"):"shipments.update",("/shipments/{shipment_id}/manifest","GET"):"shipments.read",("/shipments/{shipment_id}/notes","POST"):"shipments.update",
}

def _permission(call):
    for cell in call.__closure__ or ():
        value=cell.cell_contents
        if isinstance(value,str) and value.startswith("shipments."):return value
    return None

def test_every_shipment_route_is_permission_protected():
    actual={}
    for route in router.routes:
        if not isinstance(route,APIRoute):continue
        for method in route.methods or set():
            permissions={value for dependency in route.dependant.dependencies if (value:=_permission(dependency.call))}
            assert len(permissions)==1,(route.path,method,permissions)
            actual[(route.path,method)]=permissions.pop()
    assert actual==EXPECTED_PERMISSIONS


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

def test_shipment_hardening_migration_is_safe_and_audited():
    migration=Path(__file__).parents[3]/"infra/sql/043_shipments_production_hardening.sql"
    sql=" ".join(migration.read_text(encoding="utf-8").lower().split())
    assert "shipment_row_version" in sql
    assert "shipment_audit_log" in sql
    assert "if not exists" in sql
    assert "revoke all" in sql

def test_shipment_status_machine_blocks_lifecycle_shortcuts():
    assert "DELIVERED" not in EXPEDITION_TRANSITIONS["PREPARING"]
    assert "DISPATCHED" not in EXPEDITION_TRANSITIONS["DRAFT"]
    assert "DELIVERED" in EXPEDITION_TRANSITIONS["OUT_FOR_DELIVERY"]
    assert EXPEDITION_TRANSITIONS["ARCHIVED"]==set()
