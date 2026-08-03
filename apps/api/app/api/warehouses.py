from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.warehouses import repository as repo

router=APIRouter(prefix="/warehouses",tags=["warehouses"])

class WarehousePayload(BaseModel):
 warehouse_code:str=Field(min_length=2,max_length=40);warehouse_name:str=Field(min_length=2,max_length=160);warehouse_type:str="STORAGE"
 country_code:str|None=None;city:str|None=None;address:str|None=None;contact_phone:str|None=None;contact_name:str|None=None
 manager_id:str|None=None;manager_name:str|None=None;timezone:str="UTC";capacity_packages:int|None=Field(default=None,ge=0);capacity_weight_kg:float|None=Field(default=None,ge=0);capacity_volume_cbm:float|None=Field(default=None,ge=0)
class WarehouseUpdate(BaseModel):
 expected_version:int=Field(ge=1);warehouse_name:str|None=None;warehouse_type:str|None=None;country_code:str|None=None;city:str|None=None;address:str|None=None;contact_phone:str|None=None;contact_name:str|None=None;manager_id:str|None=None;manager_name:str|None=None;timezone:str|None=None;capacity_packages:int|None=Field(default=None,ge=0);capacity_weight_kg:float|None=Field(default=None,ge=0);capacity_volume_cbm:float|None=Field(default=None,ge=0);active:bool|None=None
class SlotPayload(BaseModel):
 code:str=Field(min_length=1,max_length=80);zone:str|None=None;aisle:str|None=None;rack:str|None=None;shelf:str|None=None;position:str|None=None;capacity_packages:int|None=Field(default=None,ge=0);capacity_weight_kg:float|None=Field(default=None,ge=0);capacity_volume_cbm:float|None=Field(default=None,ge=0);status:str="AVAILABLE"
class MovePayload(BaseModel):
 package_id:str;zone:str|None=None;aisle:str|None=None;shelf:str|None=None;position:str|None=None;reason:str|None=None
class TransferPayload(BaseModel):
 source_warehouse_id:str;destination_warehouse_id:str;package_ids:list[str]=Field(min_length=1,max_length=500);notes:str|None=None
class TransitionPayload(BaseModel): expected_version:int=Field(ge=1)
class CountPayload(BaseModel): assigned_id:str|None=None;assigned_name:str|None=None;notes:str|None=None
class CompleteCountPayload(BaseModel): actual_packages:int=Field(ge=0);expected_version:int=Field(ge=1)
class AnomalyPayload(BaseModel):
 package_id:str|None=None;slot_id:str|None=None;anomaly_type:str;severity:str="MEDIUM";title:str;description:str|None=None;assigned_id:str|None=None;assigned_name:str|None=None
class ResolvePayload(BaseModel): resolution:str=Field(min_length=2);expected_version:int=Field(ge=1)

def actor(tenant):return tenant.get("user_id") or tenant.get("manager_id") or "system"

@router.get("")
def index(q:str|None=None,active:bool|None=None,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.read"))):return {"items":repo.list_warehouses(tenant["org_id"],q,active)}
@router.get("/stats")
def warehouse_stats(tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.read"))):return repo.stats(tenant["org_id"])
@router.get("/export")
def export(tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.export"))):return Response(repo.export_inventory(tenant["org_id"]),media_type="text/csv; charset=utf-8",headers={"Content-Disposition":"attachment; filename=slaivio-warehouse-inventory.csv"})
@router.post("")
def create(body:WarehousePayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.create"))):return repo.create_warehouse(tenant["org_id"],actor(tenant),body.model_dump())
@router.get("/{warehouse_id}")
def detail(warehouse_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.read"))):return repo.get_warehouse(tenant["org_id"],warehouse_id)
@router.patch("/{warehouse_id}")
def update(warehouse_id:str,body:WarehouseUpdate,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.update"))):data=body.model_dump(exclude={"expected_version"},exclude_unset=True);return repo.update_warehouse(tenant["org_id"],warehouse_id,actor(tenant),data,body.expected_version)
@router.post("/{warehouse_id}/slots")
def add_slot(warehouse_id:str,body:SlotPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.update"))):return repo.create_slot(tenant["org_id"],warehouse_id,actor(tenant),body.model_dump())
@router.post("/{warehouse_id}/moves")
def move(warehouse_id:str,body:MovePayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.move"))):data=body.model_dump(exclude={"package_id"});return repo.move_package(tenant["org_id"],warehouse_id,body.package_id,actor(tenant),data)
@router.post("/transfers")
def transfer(body:TransferPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.move"))):return repo.create_transfer(tenant["org_id"],actor(tenant),body.model_dump())
@router.post("/transfers/{transfer_id}/{action}")
def transfer_action(transfer_id:str,action:str,body:TransitionPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.move"))):return repo.transition_transfer(tenant["org_id"],transfer_id,actor(tenant),action,body.expected_version)
@router.post("/{warehouse_id}/counts")
def count(warehouse_id:str,body:CountPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.count"))):return repo.create_count(tenant["org_id"],warehouse_id,actor(tenant),body.model_dump())
@router.post("/counts/{count_id}/complete")
def complete(count_id:str,body:CompleteCountPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.count"))):return repo.complete_count(tenant["org_id"],count_id,actor(tenant),body.actual_packages,body.expected_version)
@router.post("/{warehouse_id}/anomalies")
def anomaly(warehouse_id:str,body:AnomalyPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.alerts"))):return repo.create_anomaly(tenant["org_id"],warehouse_id,actor(tenant),body.model_dump())
@router.post("/anomalies/{anomaly_id}/resolve")
def resolve(anomaly_id:str,body:ResolvePayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.alerts"))):return repo.resolve_anomaly(tenant["org_id"],anomaly_id,actor(tenant),body.resolution,body.expected_version)
