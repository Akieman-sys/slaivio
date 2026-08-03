from pathlib import Path

from fastapi.routing import APIRoute

from app.api.tracking import router
from app.organizations.services.provisioning_service import TRACKING_ROLE_PERMISSIONS


EXPECTED={
 ("/tracking","GET"):"tracking.read",("/tracking/stats","GET"):"tracking.read",("/tracking/timeline","GET"):"tracking.read",
 ("/tracking/analytics","GET"):"tracking.read",("/tracking/alerts","GET"):"tracking.read",("/tracking/alerts/detect","POST"):"tracking.alerts",
 ("/tracking/views","GET"):"tracking.read",("/tracking/views","POST"):"tracking.update",("/tracking/export","GET"):"tracking.export",
 ("/tracking/notifications/bulk","POST"):"tracking.notify",("/tracking/{tracking_id}","GET"):"tracking.read",
 ("/tracking/{tracking_id}/events","POST"):"tracking.update",("/tracking/{tracking_id}/eta","PATCH"):"tracking.update",
 ("/tracking/{tracking_id}/assignment","PATCH"):"tracking.update",("/tracking/{tracking_id}/alerts","POST"):"tracking.alerts",
 ("/tracking/{tracking_id}/alerts/{alert_id}/resolve","PATCH"):"tracking.alerts",("/tracking/{tracking_id}/alerts/{alert_id}","PATCH"):"tracking.alerts",
 ("/tracking/{tracking_id}/notes","POST"):"tracking.update",("/tracking/{tracking_id}/documents","POST"):"tracking.update",
 ("/tracking/{tracking_id}/documents/upload","POST"):"tracking.update",("/tracking/{tracking_id}/documents/{document_id}/view","GET"):"tracking.read",
 ("/tracking/{tracking_id}/notifications","POST"):"tracking.notify",("/tracking/{tracking_id}/public-token","POST"):"tracking.public",
 ("/tracking/{tracking_id}/public-token","DELETE"):"tracking.public",("/tracking/{tracking_id}","DELETE"):"tracking.update",
}

def permission(call):
    for cell in call.__closure__ or ():
        value=cell.cell_contents
        if isinstance(value,str) and value.startswith("tracking."):return value
    return None

def test_every_private_tracking_route_has_exact_permission():
    actual={}
    for route in router.routes:
        if not isinstance(route,APIRoute) or route.path.startswith("/public/"):continue
        for method in route.methods or set():
            permissions={value for dependency in route.dependant.dependencies if (value:=permission(dependency.call))}
            assert len(permissions)==1,(route.path,method,permissions)
            actual[(route.path,method)]=permissions.pop()
    assert actual==EXPECTED

def test_tracking_default_roles_are_least_privilege():
    assert set(TRACKING_ROLE_PERMISSIONS["OWNER"])=={"tracking.read","tracking.update","tracking.alerts","tracking.notify","tracking.export","tracking.public"}
    assert TRACKING_ROLE_PERMISSIONS["MANAGER"]==TRACKING_ROLE_PERMISSIONS["OWNER"]
    assert "tracking.public" not in TRACKING_ROLE_PERMISSIONS["OPERATOR"]
    assert "tracking.update" not in TRACKING_ROLE_PERMISSIONS["SUPPORT"]
    assert TRACKING_ROLE_PERMISSIONS["FINANCE"]==("tracking.read","tracking.export")

def test_tracking_migration_contains_tenant_and_concurrency_guards():
    sql=(Path(__file__).parents[3]/"infra/sql/042_tracking_control_tower.sql").read_text(encoding="utf-8").lower()
    assert "org_id" in sql
    assert "idempotency_key" in sql
    assert "tracking_alert_history" in sql
    assert "tracking_audit_log" in sql
    assert "revoke all" in sql
