from datetime import date,datetime,timezone
from fastapi import APIRouter,Depends,Query,Response
from pydantic import BaseModel,Field
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.service_catalog import repository as repo
router=APIRouter(prefix="/service-catalog",tags=["services"])
def actor(t):return str(t.get('user_id') or 'system')
def name(t):return str(t.get('actor_name') or "Membre de l'agence")
class ServiceCreate(BaseModel):
 service_code:str=Field(min_length=3,max_length=60);service_name:str=Field(min_length=3,max_length=160);description:str|None=None;workspace_id:str|None=None;category:str="TRANSPORT";service_type:str="TRANSPORT";shipping_mode:str="AIR";eta_min_days:int|None=Field(default=None,ge=0,le=365);eta_max_days:int|None=Field(default=None,ge=0,le=365);volumetric_divisor:float|None=Field(default=6000,gt=0);maximum_weight_kg:float|None=None;maximum_volume_cbm:float|None=None;currency_code:str="USD";priority:int=100;owner_id:str|None=None;owner_name:str|None=None;public_visible:bool=False;quote_only:bool=False;seasonal_from:date|None=None;seasonal_until:date|None=None;minimum_weight_kg:float|None=None;minimum_cbm:float|None=None;minimum_value:float|None=None;maximum_dimensions_cm:dict={};maximum_declared_value:float|None=None;cutoff_hours:int|None=None;sla_target_percent:float=90;workflow:list[str]=['REQUESTED','ACCEPTED','IN_PROGRESS','COMPLETED','CANCELLED'];public_description:str|None=None;metadata:dict={}
class ServiceUpdate(BaseModel):
 service_name:str|None=None;description:str|None=None;workspace_id:str|None=None;category:str|None=None;service_type:str|None=None;shipping_mode:str|None=None;eta_min_days:int|None=None;eta_max_days:int|None=None;volumetric_divisor:float|None=None;maximum_weight_kg:float|None=None;maximum_volume_cbm:float|None=None;currency_code:str|None=None;priority:int|None=None;availability:str|None=None;owner_id:str|None=None;owner_name:str|None=None;public_visible:bool|None=None;quote_only:bool|None=None;seasonal_from:date|None=None;seasonal_until:date|None=None;minimum_weight_kg:float|None=None;minimum_cbm:float|None=None;minimum_value:float|None=None;maximum_declared_value:float|None=None;cutoff_hours:int|None=None;sla_target_percent:float|None=None;public_description:str|None=None;change_reason:str|None=None
class Transition(BaseModel):status:str;reason:str|None=None
class Offering(BaseModel):route_id:str;workspace_id:str|None=None;origin_warehouse_id:str|None=None;destination_office_id:str|None=None;availability:str="AVAILABLE";eta_min_days:int|None=None;eta_max_days:int|None=None;cutoff_hours:int|None=None;capacity_weight_kg:float|None=None;capacity_cbm:float|None=None;effective_from:datetime=Field(default_factory=lambda:datetime.now(timezone.utc));effective_until:datetime|None=None;public_visible:bool=False;metadata:dict={}
class Option(BaseModel):option_service_id:str|None=None;option_code:str;name:str;description:str|None=None;mandatory:bool=False;dependency_stage:str|None=None;configuration:dict={}
class Document(BaseModel):route_id:str|None=None;document_type:str;mandatory:bool=True;conditions:dict={}
class Condition(BaseModel):goods_category:str;decision:str;required_documents:list[str]=[];handling_instructions:str|None=None
class Recommendation(BaseModel):origin_country:str|None=None;destination_country:str;shipping_mode:str|None=None;goods_category:str|None=None;weight_kg:float=Field(default=0,ge=0);volume_cbm:float=Field(default=0,ge=0);urgency:str|None=None;budget:float|None=None;workspace_id:str|None=None
@router.get("")
def index(q:str|None=None,status:str|None=None,category:str|None=None,mode:str|None=None,workspace_id:str|None=None,tenant=Depends(get_current_tenant),_=Depends(require_permission('services.read'))):return repo.listing(tenant['org_id'],q,status,category,mode,workspace_id)
@router.get("/stats")
def stats(tenant=Depends(get_current_tenant),_=Depends(require_permission('services.read'))):return repo.stats(tenant['org_id'])
@router.get("/catalog")
def catalog(tenant=Depends(get_current_tenant),_=Depends(require_permission('services.read'))):return repo.catalog(tenant['org_id'])
@router.post("")
def create(body:ServiceCreate,tenant=Depends(get_current_tenant),_=Depends(require_permission('services.create'))):return repo.create(tenant['org_id'],actor(tenant),name(tenant),body.model_dump())
@router.post("/recommend")
def recommend(body:Recommendation,tenant=Depends(get_current_tenant),_=Depends(require_permission('services.read'))):return repo.recommend(tenant['org_id'],body.model_dump())
@router.get("/analytics")
def analytics(tenant=Depends(get_current_tenant),_=Depends(require_permission('services.analytics'))):return repo.analytics(tenant['org_id'])
@router.post("/alerts/detect")
def alerts(tenant=Depends(get_current_tenant),_=Depends(require_permission('services.performance'))):return repo.detect_alerts(tenant['org_id'])
@router.get("/export.csv")
def export(tenant=Depends(get_current_tenant),_=Depends(require_permission('services.export'))):return Response(repo.export(tenant['org_id']),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':'attachment; filename=services.csv'})
@router.get("/{service_id}")
def detail(service_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission('services.read'))):return repo.detail(tenant['org_id'],service_id)
@router.patch("/{service_id}")
def update(service_id:str,body:ServiceUpdate,tenant=Depends(get_current_tenant),_=Depends(require_permission('services.update'))):return repo.update(tenant['org_id'],service_id,body.model_dump(exclude_none=True),actor(tenant),name(tenant))
@router.post("/{service_id}/transition")
def transition(service_id:str,body:Transition,tenant=Depends(get_current_tenant),_=Depends(require_permission('services.suspend'))):return repo.transition(tenant['org_id'],service_id,body.status,actor(tenant),name(tenant),body.reason)
@router.post("/{service_id}/duplicate")
def duplicate(service_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission('services.create'))):return repo.duplicate(tenant['org_id'],service_id,actor(tenant),name(tenant))
@router.post("/{service_id}/routes")
def route(service_id:str,body:Offering,tenant=Depends(get_current_tenant),_=Depends(require_permission('services.routes'))):return repo.child(tenant['org_id'],service_id,'route',body.model_dump(),actor(tenant),name(tenant))
@router.post("/{service_id}/options")
def option(service_id:str,body:Option,tenant=Depends(get_current_tenant),_=Depends(require_permission('services.bundles'))):return repo.child(tenant['org_id'],service_id,'option',body.model_dump(),actor(tenant),name(tenant))
@router.post("/{service_id}/documents")
def document(service_id:str,body:Document,tenant=Depends(get_current_tenant),_=Depends(require_permission('services.conditions'))):return repo.child(tenant['org_id'],service_id,'document',body.model_dump(),actor(tenant),name(tenant))
@router.post("/{service_id}/conditions")
def condition(service_id:str,body:Condition,tenant=Depends(get_current_tenant),_=Depends(require_permission('services.conditions'))):return repo.child(tenant['org_id'],service_id,'condition',body.model_dump(),actor(tenant),name(tenant))
