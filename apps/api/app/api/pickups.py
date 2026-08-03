from fastapi import APIRouter,Depends,Query,Response
from pydantic import BaseModel,Field
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.pickups import repository as repo

router=APIRouter(prefix="/pickups",tags=["pickups"])
def actor(t):return str(t.get("user_id") or "system")
def name(t):return str(t.get("actor_name") or "Membre de l’agence")
class CreatePayload(BaseModel):package_ids:list[str]=Field(min_length=1,max_length=100);office_id:str|None=None;warehouse_id:str|None=None;assigned_to:str|None=None;assigned_name:str|None=None;notes:str|None=None
class VersionPayload(BaseModel):expected_version:int=Field(ge=1)
class OtpPayload(BaseModel):code:str=Field(pattern=r"^\d{6}$")
class IdentityPayload(BaseModel):recipient_type:str="CLIENT";authorized_person_name:str|None=None;authorized_person_phone:str|None=None;identity_type:str=Field(min_length=2,max_length=50);identity_reference:str=Field(min_length=4,max_length=120)
class PaymentPayload(BaseModel):payment_status:str;paid_amount:float=Field(ge=0)
class ReleasePayload(BaseModel):expected_version:int=Field(ge=1);signed_by:str=Field(min_length=2,max_length=160);signature_text:str|None=None;override_reason:str|None=None
class SettingsPayload(BaseModel):grace_days:int=Field(ge=0);daily_storage_fee:float=Field(ge=0);currency:str=Field(min_length=3,max_length=3);otp_ttl_minutes:int=Field(ge=2,le=120);max_otp_attempts:int=Field(ge=1,le=20);require_payment:bool=True;require_identity:bool=True;require_signature:bool=True

@router.get("")
def index(q:str|None=None,status:str|None=None,page:int=Query(default=1,ge=1),page_size:int=Query(default=50,ge=1,le=100),tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.read"))):return repo.queue(tenant["org_id"],q,status,page,page_size)
@router.get("/eligible-packages")
def eligible(q:str|None=None,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.create"))):return {"items":repo.eligible_packages(tenant["org_id"],q)}
@router.get("/stats")
def pickup_stats(tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.read"))):return repo.stats(tenant["org_id"])
@router.get("/settings")
def get_settings(tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.read"))):return repo.settings_for(tenant["org_id"])
@router.put("/settings")
def save_settings(body:SettingsPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.settings"))):return repo.update_settings(tenant["org_id"],actor(tenant),body.model_dump())
@router.get("/export")
def export(tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.export"))):return Response(repo.export(tenant["org_id"]),media_type="text/csv; charset=utf-8",headers={"Content-Disposition":"attachment; filename=slaivio-retraits.csv"})
@router.post("",status_code=201)
def create(body:CreatePayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.create"))):return repo.create(tenant["org_id"],actor(tenant),name(tenant),body.model_dump())
@router.get("/{pickup_id}")
def detail(pickup_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.read"))):return repo.detail(tenant["org_id"],pickup_id)
@router.post("/{pickup_id}/notify")
def notify(pickup_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.notify"))):return repo.notify(tenant["org_id"],pickup_id,actor(tenant),name(tenant))
@router.post("/{pickup_id}/check-in")
def check_in(pickup_id:str,body:VersionPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.verify"))):return repo.check_in(tenant["org_id"],pickup_id,actor(tenant),name(tenant),body.expected_version)
@router.post("/{pickup_id}/verify-otp")
def verify_otp(pickup_id:str,body:OtpPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.verify"))):return repo.verify_otp(tenant["org_id"],pickup_id,actor(tenant),name(tenant),body.code)
@router.post("/{pickup_id}/verify-identity")
def identity(pickup_id:str,body:IdentityPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.verify"))):return repo.verify_identity(tenant["org_id"],pickup_id,actor(tenant),name(tenant),body.model_dump())
@router.post("/{pickup_id}/verify-payment")
def payment(pickup_id:str,body:PaymentPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.verify"))):return repo.verify_payment(tenant["org_id"],pickup_id,actor(tenant),name(tenant),body.model_dump())
@router.post("/{pickup_id}/verify")
def verify(pickup_id:str,body:VersionPayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.verify"))):return repo.mark_verified(tenant["org_id"],pickup_id,actor(tenant),name(tenant),body.expected_version)
@router.post("/{pickup_id}/release")
def release(pickup_id:str,body:ReleasePayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.release"))):return repo.release(tenant["org_id"],pickup_id,actor(tenant),name(tenant),body.model_dump())
@router.post("/{pickup_id}/override-release")
def override_release(pickup_id:str,body:ReleasePayload,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.override"))):return repo.release(tenant["org_id"],pickup_id,actor(tenant),name(tenant),body.model_dump(),True)
