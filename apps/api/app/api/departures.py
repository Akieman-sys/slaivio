from datetime import datetime
from fastapi import APIRouter,Depends
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
@router.get('')
def index(start:datetime|None=None,end:datetime|None=None,status:str|None=None,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.read'))):return {'items':repo.listing(tenant['org_id'],start,end,status)}
@router.get('/stats')
def stats(tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.read'))):return repo.stats(tenant['org_id'])
@router.get('/{departure_id}')
def detail(departure_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.read'))):return repo.detail(tenant['org_id'],departure_id)
@router.post('')
def create(body:Create,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.manage'))):return repo.create(tenant['org_id'],aid(tenant),aname(tenant),body.model_dump())
@router.post('/{departure_id}/allocations')
def allocate(departure_id:str,body:Allocate,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.allocate'))):return repo.allocate(tenant['org_id'],departure_id,aid(tenant),aname(tenant),body.model_dump())
@router.post('/{departure_id}/transition')
def transition(departure_id:str,body:Transition,tenant=Depends(get_current_tenant),_=Depends(require_permission('departures.dispatch'))):return repo.transition(tenant['org_id'],departure_id,aid(tenant),aname(tenant),body.status,body.expected_version,body.reason)
