from datetime import datetime,timezone
from fastapi import APIRouter,Depends
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
class Simulation(BaseModel):service_id:str;weight_kg:float|None=Field(default=None,ge=0);volume_cbm:float|None=Field(default=None,ge=0);declared_value:float|None=Field(default=0,ge=0)
@router.get("")
def index(tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.read"))):return repo.list_all(tenant['org_id'])
@router.post("/routes")
def route(body:RouteCreate,tenant=Depends(get_current_tenant),_=Depends(require_permission("routes.manage"))):return repo.create_route(tenant['org_id'],actor(tenant),name(tenant),body.model_dump())
@router.post("/services")
def service(body:ServiceCreate,tenant=Depends(get_current_tenant),_=Depends(require_permission("services.manage"))):return repo.create_service(tenant['org_id'],actor(tenant),name(tenant),body.model_dump())
@router.post("/services/{service_id}/prices")
def price(service_id:str,body:Component,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.manage"))):return repo.add_component(tenant['org_id'],actor(tenant),name(tenant),service_id,body.model_dump())
@router.post("/simulate")
def simulate(body:Simulation,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.simulate"))):return repo.simulate(tenant['org_id'],body.service_id,body.weight_kg,body.volume_cbm,body.declared_value)
