from datetime import datetime,timezone
from fastapi import APIRouter,Depends,Query,Response
from pydantic import BaseModel,Field,field_validator
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.routes_services import repository as repo
router=APIRouter(prefix="/route-catalog",tags=["routes-services"])
def actor(t):return str(t.get('user_id') or 'system')
def name(t):return str(t.get('actor_name') or "Membre de l'agence")
class RouteCreate(BaseModel):route_code:str=Field(min_length=3,max_length=50);route_name:str=Field(min_length=3,max_length=160);origin_country:str;origin_city:str|None=None;destination_country:str;destination_city:str|None=None;transport_mode:str;eta_min_days:int=Field(ge=0,le=365);eta_max_days:int=Field(ge=0,le=365);timezone:str|None=None;metadata:dict={}
class ServiceCreate(BaseModel):route_id:str;service_code:str=Field(min_length=3,max_length=50);service_name:str=Field(min_length=3,max_length=160);shipping_mode:str;service_type:str="STANDARD";eta_min_days:int=Field(ge=0,le=365);eta_max_days:int=Field(ge=0,le=365);volumetric_divisor:float|None=Field(default=6000,gt=0);minimum_charge_minor:int=Field(default=0,ge=0);maximum_weight_kg:float|None=Field(default=None,gt=0);maximum_volume_cbm:float|None=Field(default=None,gt=0);currency_code:str=Field(default="USD",min_length=3,max_length=3);priority:int=100;metadata:dict={}
class Component(BaseModel):component_code:str;component_name:str;calculation_type:str;amount_minor:int|None=Field(default=None,ge=0);percentage:float|None=Field(default=None,ge=0,le=100);currency_code:str=Field(default="USD",min_length=3,max_length=3);priority:int=100;min_quantity:float|None=None;max_quantity:float|None=None;effective_from:datetime=Field(default_factory=lambda:datetime.now(timezone.utc));effective_until:datetime|None=None;metadata:dict={}
class Simulation(BaseModel):service_id:str;weight_kg:float|None=Field(default=None,ge=0);volume_cbm:float|None=Field(default=None,ge=0);declared_value:float|None=Field(default=0,ge=0);client_id:str|None=None;goods_category:str|None=None
class Stop(BaseModel):position:int=Field(ge=1);country_code:str|None=None;city:str|None=None;location_name:str;stop_type:str="HUB";planned_duration_hours:int=Field(default=0,ge=0)
class Departure(BaseModel):weekday:int=Field(ge=1,le=7);cutoff_time:str|None=None;departure_time:str|None=None;capacity_weight_kg:float|None=None;capacity_cbm:float|None=None
class Policy(BaseModel):goods_category:str;decision:str;required_documents:list[str]=[];handling_instructions:str|None=None
class Adjustment(BaseModel):adjustment_code:str;adjustment_name:str;adjustment_type:str;amount_minor:int|None=None;percentage:float|None=None;client_id:str|None=None;goods_category:str|None=None;min_weight_kg:float|None=None;effective_from:datetime=Field(default_factory=lambda:datetime.now(timezone.utc));effective_until:datetime|None=None;priority:int=100
class RouteUpdate(BaseModel):
 row_version:int=Field(ge=1);route_name:str|None=None;description:str|None=None;workspace_id:str|None=None;owner_id:str|None=None;owner_name:str|None=None;status:str|None=None;direction:str|None=None
 origin_country:str|None=None;origin_city:str|None=None;origin_warehouse_id:str|None=None;origin_hub:str|None=None;destination_country:str|None=None;destination_city:str|None=None;destination_office_id:str|None=None;destination_hub:str|None=None
 transport_mode:str|None=None;eta_min_days:int|None=Field(default=None,ge=0,le=365);eta_max_days:int|None=Field(default=None,ge=0,le=365);announced_eta_days:float|None=None;processing_days:float|None=None;customs_days:float|None=None;final_delivery_days:float|None=None
 weekly_capacity_kg:float|None=None;weekly_capacity_cbm:float|None=None;departure_capacity_kg:float|None=None;departure_capacity_cbm:float|None=None;availability:str|None=None;public_visible:bool|None=None;default_route:bool|None=None;alternative_route_id:str|None=None;minimum_weight_kg:float|None=None;maximum_weight_kg:float|None=None;minimum_cbm:float|None=None;maximum_declared_value:float|None=None;change_reason:str|None=None
class Leg(BaseModel):position:int=Field(ge=1);origin_country:str|None=None;origin_city:str|None=None;origin_hub:str|None=None;destination_country:str|None=None;destination_city:str|None=None;destination_hub:str|None=None;transport_mode:str;planned_duration_hours:int=Field(default=0,ge=0);carrier_name:str|None=None;metadata:dict={}
class Carrier(BaseModel):carrier_name:str;carrier_type:str;priority:int=100;airline_code:str|None=None;shipping_line:str|None=None;flight_number:str|None=None;vessel:str|None=None;voyage:str|None=None;truck_type:str|None=None;border_crossings:list[str]=[];awb_rules:str|None=None;bl_settings:str|None=None
class Restriction(BaseModel):goods_category:str;decision:str;conditions:str|None=None;required_documents:list[str]=[];max_weight_kg:float|None=None;max_volume_cbm:float|None=None;max_declared_value:float|None=None
class Suspension(BaseModel):reason_code:str;reason:str;estimated_end_at:datetime|None=None
class RouteEngine(BaseModel):origin_country:str|None=None;origin_city:str|None=None;destination_country:str;destination_city:str|None=None;transport_mode:str|None=None;goods_category:str|None=None;weight_kg:float|None=Field(default=None,ge=0);volume_cbm:float|None=Field(default=None,ge=0);urgency:str|None=None;workspace_id:str|None=None
class RouteView(BaseModel):name:str=Field(min_length=2,max_length=80);filters:dict={}
@router.get("")
def index(tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.read"))):return repo.list_all(tenant['org_id'])
@router.post("/routes")
def route(body:RouteCreate,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.manage"))):return repo.create_route(tenant['org_id'],actor(tenant),name(tenant),body.model_dump())
@router.post("/services")
def service(body:ServiceCreate,tenant=Depends(get_current_tenant),_=Depends(require_permission("services.manage"))):return repo.create_service(tenant['org_id'],actor(tenant),name(tenant),body.model_dump())
@router.post("/services/{service_id}/prices")
def price(service_id:str,body:Component,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.manage"))):return repo.add_component(tenant['org_id'],actor(tenant),name(tenant),service_id,body.model_dump())
@router.get("/services/{service_id}/configuration")
def configuration(service_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.read"))):return repo.service_configuration(tenant['org_id'],service_id)
@router.post("/services/{service_id}/stops")
def stop(service_id:str,body:Stop,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.manage"))):return repo.configure(tenant['org_id'],actor(tenant),name(tenant),service_id,'stop',body.model_dump())
@router.post("/services/{service_id}/departures")
def departure(service_id:str,body:Departure,tenant=Depends(get_current_tenant),_=Depends(require_permission("services.manage"))):return repo.configure(tenant['org_id'],actor(tenant),name(tenant),service_id,'departure',body.model_dump())
@router.post("/services/{service_id}/policies")
def policy(service_id:str,body:Policy,tenant=Depends(get_current_tenant),_=Depends(require_permission("services.manage"))):return repo.configure(tenant['org_id'],actor(tenant),name(tenant),service_id,'policy',body.model_dump())
@router.post("/services/{service_id}/adjustments")
def adjustment(service_id:str,body:Adjustment,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.manage"))):return repo.configure(tenant['org_id'],actor(tenant),name(tenant),service_id,'adjustment',body.model_dump())
@router.post("/simulate")
def simulate(body:Simulation,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.simulate"))):return repo.simulate(tenant['org_id'],body.service_id,body.weight_kg,body.volume_cbm,body.declared_value,body.client_id,body.goods_category,actor(tenant))

@router.get("/routes/intelligence")
def routes_intelligence(q:str|None=None,status:str|None=None,transport_mode:str|None=None,workspace_id:str|None=None,limit:int=Query(100,ge=1,le=500),offset:int=Query(0,ge=0),tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.read"))):return repo.route_listing(tenant['org_id'],q,status,transport_mode,workspace_id,limit,offset)
@router.get("/routes/stats")
def route_stats(tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.read"))):return repo.route_stats(tenant['org_id'])
@router.get("/routes/analytics")
def route_analytics(tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.analytics"))):return repo.route_analytics(tenant['org_id'])
@router.post("/routes/engine")
def route_engine(body:RouteEngine,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.read"))):return repo.route_engine(tenant['org_id'],body.model_dump())
@router.get("/routes/compare")
def compare(ids:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.read"))):return {"items":repo.compare_routes(tenant['org_id'],[x for x in ids.split(',') if x][:4])}
@router.get("/routes/views")
def route_views(tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.read"))):return {"items":repo.route_views(tenant['org_id'],actor(tenant))}
@router.post("/routes/views")
def route_view_create(body:RouteView,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.read"))):return repo.save_route_view(tenant['org_id'],actor(tenant),body.name,body.filters)
@router.get("/routes/export.csv")
def route_export(tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.export"))):return Response(repo.export_routes(tenant['org_id']),media_type="text/csv",headers={"Content-Disposition":"attachment; filename=routes.csv"})
@router.get("/routes/{route_id}")
def route_detail(route_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.read"))):return repo.route_detail(tenant['org_id'],route_id)
@router.patch("/routes/{route_id}")
def route_update(route_id:str,body:RouteUpdate,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.update"))):return repo.update_route(tenant['org_id'],route_id,actor(tenant),name(tenant),body.model_dump(exclude_none=True))
@router.post("/routes/{route_id}/duplicate")
def route_duplicate(route_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.create"))):return repo.duplicate_route(tenant['org_id'],route_id,actor(tenant),name(tenant))
@router.post("/routes/{route_id}/suspend")
def route_suspend(route_id:str,body:Suspension,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.suspend"))):return repo.suspend_route(tenant['org_id'],route_id,actor(tenant),name(tenant),body.model_dump())
@router.post("/routes/{route_id}/reactivate")
def route_reactivate(route_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.suspend"))):return repo.reactivate_route(tenant['org_id'],route_id,actor(tenant),name(tenant))
@router.post("/routes/{route_id}/legs")
def route_leg(route_id:str,body:Leg,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.update"))):return repo.upsert_route_child(tenant['org_id'],route_id,'leg',body.model_dump(),actor(tenant),name(tenant))
@router.post("/routes/{route_id}/carriers")
def route_carrier(route_id:str,body:Carrier,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.carriers"))):return repo.upsert_route_child(tenant['org_id'],route_id,'carrier',body.model_dump(),actor(tenant),name(tenant))
@router.post("/routes/{route_id}/restrictions")
def route_restriction(route_id:str,body:Restriction,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.restrictions"))):return repo.upsert_route_child(tenant['org_id'],route_id,'restriction',body.model_dump(),actor(tenant),name(tenant))
