from datetime import datetime
from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field

from app.batch_center import repository as repo
from app.core.permissions import require_permission
from app.permissions.services.permission_service import assert_permission
from app.core.tenant_context import get_current_tenant

router = APIRouter(prefix="/batch-center", tags=["batch-groupage"])

def actor(t): return str(t.get("user_id") or "system")
def actor_name(t): return str(t.get("actor_name") or "Membre de l'agence")

class BatchCreate(BaseModel):
    batch_code: str | None = None
    batch_type: str = "AIR_GROUPAGE"
    workspace_id: str | None = None
    route_id: str
    shipping_service_id: str
    origin_warehouse_id: str | None = None
    destination_office_id: str | None = None
    departure_id: str | None = None
    responsible_id: str | None = None
    responsible_name: str | None = None
    cutoff_at: datetime | None = None
    planned_departure_at: datetime | None = None
    capacity_weight_kg: float | None = Field(default=None, gt=0)
    capacity_cbm: float | None = Field(default=None, gt=0)
    capacity_packages: int | None = Field(default=None, gt=0)
    capacity_value: float | None = Field(default=None, gt=0)
    near_capacity_percent: float = Field(default=85, ge=1, le=100)
    notes: str | None = None

class Packages(BaseModel):
    package_ids: list[str] = Field(min_length=1, max_length=500)
    override: bool = False

class RemovePackage(BaseModel): reason: str = Field(min_length=2, max_length=500)
class Transition(BaseModel):
    status: str
    reason: str | None = None
    expected_version: int | None = None
class Scan(BaseModel): value: str = Field(min_length=2, max_length=200)
class Checklist(BaseModel):
    compatibility: bool | None = None
    weight_verified: bool | None = None
    cbm_verified: bool | None = None
    no_blocked_packages: bool | None = None
    documents_ready: bool | None = None
    payments_compliant: bool | None = None
    capacity_compliant: bool | None = None
    manager_approved: bool | None = None

@router.get("")
def index(q: str | None = None, status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100), tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.read"))):
    return repo.dashboard(tenant["org_id"], q, status, page, page_size)

@router.post("")
def create(body: BatchCreate, tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.create"))):
    return repo.create(tenant["org_id"], tenant, body.model_dump())

@router.get("/analytics")
def analytics(tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.analytics"))):
    return repo.analytics(tenant["org_id"])

@router.get("/export.csv")
def export(tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.export"))):
    return Response(repo.export_csv(tenant["org_id"]), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=batchs-groupages.csv"})

@router.get("/automation/suggestions")
def suggestions(tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.read"))):
    return repo.suggestions(tenant["org_id"])

@router.post("/automation/detect-alerts")
def alerts(tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.manage"))):
    return repo.detect_alerts(tenant["org_id"])

@router.get("/{batch_id}")
def detail(batch_id: str, tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.read"))):
    return repo.detail(tenant["org_id"], batch_id)

@router.get("/{batch_id}/compatible")
def compatible(batch_id: str, q: str | None = None, tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.read"))):
    return {"items": repo.compatible(tenant["org_id"], batch_id, q)}

@router.post("/{batch_id}/packages")
def add_packages(batch_id: str, body: Packages, tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.add"))):
    if body.override:
        assert_permission(user_id=actor(tenant), org_id=tenant["org_id"], permission_code="batches.override")
    return repo.add_packages(tenant["org_id"], batch_id, body.package_ids, tenant, body.override)

@router.delete("/{batch_id}/packages/{package_id}")
def remove_package(batch_id: str, package_id: str, body: RemovePackage, tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.remove"))):
    return repo.remove_package(tenant["org_id"], batch_id, package_id, tenant, body.reason)

@router.patch("/{batch_id}/checklist")
def checklist(batch_id: str, body: Checklist, tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.validate"))):
    return repo.checklist(tenant["org_id"], batch_id, body.model_dump(exclude_none=True), tenant)

@router.post("/{batch_id}/transition")
def transition(batch_id: str, body: Transition, tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.validate"))):
    return repo.transition(tenant["org_id"], batch_id, body.status, tenant, body.reason, body.expected_version)

@router.post("/{batch_id}/scan")
def scan(batch_id: str, body: Scan, tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.add"))):
    return repo.scan(tenant["org_id"], batch_id, body.value, tenant)

@router.post("/{batch_id}/convert")
def convert(batch_id: str, tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.convert"))):
    return repo.convert(tenant["org_id"], batch_id, tenant)

@router.get("/{batch_id}/manifest.csv")
def manifest(batch_id: str, tenant=Depends(get_current_tenant), _=Depends(require_permission("batches.export"))):
    return Response(repo.manifest_csv(tenant["org_id"], batch_id), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f"attachment; filename=manifest-{batch_id}.csv"})
