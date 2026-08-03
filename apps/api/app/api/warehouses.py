from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.warehouses import repository as repo
from app.warehouses import operations as ops
from app.packages.repository import weigh_package,update_package

router=APIRouter(prefix="/warehouses",tags=["warehouses"])

class WarehousePayload(BaseModel):
 warehouse_code:str=Field(min_length=2,max_length=40);warehouse_name:str=Field(min_length=2,max_length=160);warehouse_type:str="STORAGE"
 country_code:str|None=None;city:str|None=None;address:str|None=None;contact_phone:str|None=None;contact_name:str|None=None;contact_email:str|None=None;latitude:float|None=Field(default=None,ge=-90,le=90);longitude:float|None=Field(default=None,ge=-180,le=180);opening_hours:dict=Field(default_factory=dict)
 manager_id:str|None=None;manager_name:str|None=None;timezone:str="UTC";capacity_packages:int|None=Field(default=None,ge=0);capacity_weight_kg:float|None=Field(default=None,ge=0);capacity_volume_cbm:float|None=Field(default=None,ge=0)
class WarehouseUpdate(BaseModel):
 expected_version:int=Field(ge=1);warehouse_name:str|None=None;warehouse_type:str|None=None;country_code:str|None=None;city:str|None=None;address:str|None=None;contact_phone:str|None=None;contact_name:str|None=None;contact_email:str|None=None;latitude:float|None=Field(default=None,ge=-90,le=90);longitude:float|None=Field(default=None,ge=-180,le=180);opening_hours:dict|None=None;manager_id:str|None=None;manager_name:str|None=None;timezone:str|None=None;capacity_packages:int|None=Field(default=None,ge=0);capacity_weight_kg:float|None=Field(default=None,ge=0);capacity_volume_cbm:float|None=Field(default=None,ge=0);active:bool|None=None
class SlotPayload(BaseModel):
 code:str=Field(min_length=1,max_length=80);zone:str|None=None;zone_type:str="GENERAL";aisle:str|None=None;rack:str|None=None;shelf:str|None=None;position:str|None=None;responsible_id:str|None=None;responsible_name:str|None=None;capacity_packages:int|None=Field(default=None,ge=0);capacity_weight_kg:float|None=Field(default=None,ge=0);capacity_volume_cbm:float|None=Field(default=None,ge=0);status:str="AVAILABLE"
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
class IntakePayload(BaseModel):
 supplier_name:str|None=None;supplier_phone:str|None=None;shipping_mark:str|None=None;supplier_tracking:str|None=None;order_reference:str|None=None;recipient_name:str|None=None;recipient_phone:str|None=None;destination_country:str|None=None;destination_city:str|None=None;description:str|None=None;declared_weight_kg:float|None=Field(default=None,ge=0);measured_weight_kg:float|None=Field(default=None,ge=0);length_cm:float|None=Field(default=None,ge=0);width_cm:float|None=Field(default=None,ge=0);height_cm:float|None=Field(default=None,ge=0);condition:str="UNKNOWN";notes:str|None=None;source:str="MANUAL";idempotency_key:str|None=None
class LinkIntakePayload(BaseModel): package_id:str;expected_version:int=Field(ge=1)
class QualityPayload(BaseModel):
 intake_id:str;damaged:bool=False;torn:bool=False;wet:bool=False;broken:bool=False;missing_items:bool=False;packaging_ok:bool=True;weight_verified:bool=False;dimensions_verified:bool=False;label_verified:bool=False;photos_taken:bool=False;comments:str|None=None
class ScanSessionPayload(BaseModel): scan_type:str="RECEIPT"
class ScanItemPayload(BaseModel): value:str=Field(min_length=1,max_length=220);location:str|None=None
class GroupPayload(BaseModel):
 group_type:str;destination_country:str|None=None;destination_city:str|None=None;container_number:str|None=None;notes:str|None=None;package_ids:list[str]=Field(min_length=1,max_length=1000)
class WmsWeightPayload(BaseModel): weight_kg:float=Field(gt=0);source:str="MANUAL";device_reference:str|None=None;notes:str|None=None
class WmsDimensionsPayload(BaseModel): length_cm:float=Field(gt=0);width_cm:float=Field(gt=0);height_cm:float=Field(gt=0)

def actor(tenant):return tenant.get("user_id") or tenant.get("manager_id") or "system"
def actor_name(tenant):return tenant.get("actor_name") or "Membre de l’agence"

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

@router.get("/{warehouse_id}/dashboard")
def wms_dashboard(warehouse_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.read"))):return ops.dashboard(tenant["org_id"],warehouse_id)
@router.get("/{warehouse_id}/intakes")
def intakes(warehouse_id:str,q:str|None=None,status:str|None=None,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.read"))):return {"items":ops.list_intakes(tenant["org_id"],warehouse_id,q,status)}
@router.post("/{warehouse_id}/intakes",status_code=201)
def receive_intake(warehouse_id:str,body:IntakePayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.receive"))):return ops.receive(tenant["org_id"],warehouse_id,actor(tenant),actor_name(tenant),body.model_dump())
@router.post("/intakes/{intake_id}/link")
def link_intake(intake_id:str,body:LinkIntakePayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.receive"))):return ops.link_intake(tenant["org_id"],intake_id,body.package_id,actor(tenant),body.expected_version)
@router.post("/{warehouse_id}/quality-checks")
def quality(warehouse_id:str,body:QualityPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.quality"))):return ops.quality_check(tenant["org_id"],warehouse_id,actor(tenant),actor_name(tenant),body.model_dump())
@router.post("/{warehouse_id}/scan-sessions",status_code=201)
def scan_start(warehouse_id:str,body:ScanSessionPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.receive"))):return ops.start_scan(tenant["org_id"],warehouse_id,actor(tenant),actor_name(tenant),body.scan_type)
@router.post("/scan-sessions/{session_id}/items")
def scan_item(session_id:str,body:ScanItemPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.receive"))):return ops.scan(tenant["org_id"],session_id,actor(tenant),body.value,body.location)
@router.get("/{warehouse_id}/groups")
def groups(warehouse_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.read"))):return {"items":ops.list_groups(tenant["org_id"],warehouse_id)}
@router.post("/{warehouse_id}/groups",status_code=201)
def group_create(warehouse_id:str,body:GroupPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.group"))):return ops.create_group(tenant["org_id"],warehouse_id,actor(tenant),actor_name(tenant),body.model_dump())
@router.post("/groups/{group_id}/{action}")
def group_action(group_id:str,action:str,body:TransitionPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.group"))):return ops.transition_group(tenant["org_id"],group_id,actor(tenant),action,body.expected_version)
@router.get("/groups/{group_id}/packing-list")
def packing_list(group_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.print"))):return Response(ops.packing_list(tenant["org_id"],group_id),media_type="text/csv; charset=utf-8",headers={"Content-Disposition":f"attachment; filename=packing-list-{group_id}.csv"})
@router.post("/{warehouse_id}/alerts/detect")
def alert_detection(warehouse_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.alerts"))):return ops.detect_alerts(tenant["org_id"],warehouse_id,actor(tenant))
@router.post("/packages/{package_id}/weigh")
def wms_weigh(package_id:str,body:WmsWeightPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.weigh"))):
 package=weigh_package(tenant["org_id"],package_id,actor(tenant),body.model_dump())
 if not package: from fastapi import HTTPException;raise HTTPException(404,"package_not_found")
 return package
@router.patch("/packages/{package_id}/dimensions")
def wms_dimensions(package_id:str,body:WmsDimensionsPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("warehouses.weigh"))):
 package=update_package(tenant["org_id"],package_id,actor(tenant),body.model_dump())
 if not package: from fastapi import HTTPException;raise HTTPException(404,"package_not_found")
 return package
