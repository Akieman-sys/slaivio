from datetime import datetime
from fastapi import APIRouter,Depends,Response
from pydantic import BaseModel,Field
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.departures import repository as repo
router=APIRouter(prefix='/departures',tags=['departures'])
def aid(t):return str(t.get('user_id') or 'system')
def aname(t):return str(t.get('actor_name') or "Membre de l'agence")
class Create(BaseModel):shipping_service_id:str;departure_code:str|None=None;scheduled_at:datetime;cutoff_at:datetime|None=None;estimated_arrival_at:datetime|None=None;capacity_weight_kg:float|None=Field(default=None,gt=0);capacity_cbm:float|None=Field(default=None,gt=0);capacity_packages:int|None=Field(default=None,gt=0);carrier_name:str|None=None;transport_reference:str|None=None;timezone:str='UTC';responsible_name:str|None=None;warehouse_id:str|None=None;destination_office:str|None=None;published:bool=False;notes:str|None=None
class Allocate(BaseModel):shipment_id:str;weight_kg:float=Field(ge=0);volume_cbm:float=Field(ge=0);idempotency_key:str=Field(min_length=8)
class Transition(BaseModel):status:str;expected_version:int=Field(ge=1);reason:str|None=None
class Patch(BaseModel):scheduled_at:datetime|None=None;cutoff_at:datetime|None=None;estimated_arrival_at:datetime|None=None;capacity_weight_kg:float|None=None;capacity_cbm:float|None=None;capacity_packages:int|None=None;carrier_name:str|None=None;transport_reference:str|None=None;responsible_name:str|None=None;published:bool|None=None;notes:str|None=None;expected_version:int
class Checklist(BaseModel):key:str;completed:bool;expected_version:int
class PackageAllocation(BaseModel):package_id:str;idempotency_key:str=Field(min_length=8);override_capacity:bool=False
class Template(BaseModel):template_name:str;shipping_service_id:str;timezone:str='UTC';capacity_weight_kg:float|None=None;capacity_cbm:float|None=None;capacity_packages:int|None=None;checklist:dict={}
class Recurrence(BaseModel):template_id:str|None=None;shipping_service_id:str;frequency:str;weekdays:list[int]=[];local_time:str;timezone:str='UTC';cutoff_hours:int=24;horizon_days:int=60
@router.get('')
def index(start:datetime|None=None,end:datetime|None=None,status:str|None=None,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.read'))):return {'items':repo.listing(tenant['org_id'],start,end,status)}
@router.get('/stats')
def stats(tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.read'))):return repo.stats(tenant['org_id'])
@router.get('/{departure_id}')
def detail(departure_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.read'))):return repo.detail(tenant['org_id'],departure_id)
@router.patch('/{departure_id}')
def patch(departure_id:str,body:Patch,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.manage'))):return repo.update(tenant['org_id'],departure_id,aid(tenant),aname(tenant),body.model_dump(exclude_none=True))
@router.patch('/{departure_id}/checklist')
def checklist(departure_id:str,body:Checklist,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.checklist'))):return repo.checklist(tenant['org_id'],departure_id,aid(tenant),aname(tenant),body.model_dump())
@router.get('/{departure_id}/compatible-packages')
def compatible(departure_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.read'))):return {'items':repo.compatible_packages(tenant['org_id'],departure_id)}
@router.post('/{departure_id}/packages')
def add_package(departure_id:str,body:PackageAllocation,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.allocate'))):return repo.allocate_package(tenant['org_id'],departure_id,aid(tenant),aname(tenant),body.model_dump())
@router.delete('/{departure_id}/packages/{package_id}')
def remove_package(departure_id:str,package_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.allocate'))):return repo.remove_package(tenant['org_id'],departure_id,package_id,aid(tenant),aname(tenant))
@router.get('/{departure_id}/manifest.csv')
def manifest(departure_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.export'))):return Response(repo.manifest(tenant['org_id'],departure_id),media_type='text/csv',headers={'Content-Disposition':f'attachment; filename=departure-{departure_id}.csv'})
@router.get('/analytics/overview')
def analytics(tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.read'))):return repo.analytics(tenant['org_id'])
@router.get('/configuration/templates')
def templates(tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.read'))):return {'items':repo.templates(tenant['org_id'])}
@router.post('/configuration/templates')
def create_template(body:Template,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.templates'))):return repo.create_template(tenant['org_id'],aid(tenant),body.model_dump())
@router.get('/configuration/recurrences')
def recurrences(tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.read'))):return {'items':repo.recurrences(tenant['org_id'])}
@router.post('/configuration/recurrences')
def create_recurrence(body:Recurrence,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.templates'))):return repo.create_recurrence(tenant['org_id'],aid(tenant),body.model_dump())
@router.post('')
def create(body:Create,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.manage'))):return repo.create(tenant['org_id'],aid(tenant),aname(tenant),body.model_dump())
@router.post('/{departure_id}/allocations')
def allocate(departure_id:str,body:Allocate,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.allocate'))):return repo.allocate(tenant['org_id'],departure_id,aid(tenant),aname(tenant),body.model_dump())
@router.post('/{departure_id}/transition')
def transition(departure_id:str,body:Transition,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.dispatch'))):return repo.transition(tenant['org_id'],departure_id,aid(tenant),aname(tenant),body.status,body.expected_version,body.reason)
