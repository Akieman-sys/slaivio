import hashlib
from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter,Depends,File,Form,HTTPException,Query,Response,UploadFile
from pydantic import BaseModel,Field
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.pickups import repository as repo
from app.core.config import settings
from app.services.dossier_document_storage import create_document_download_url,upload_private_document

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
@router.get("/analytics")
def pickup_analytics(tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.read"))):return repo.analytics(tenant["org_id"])
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
@router.post("/reminders/run")
def run_reminders(min_days:int=Query(default=3,ge=1,le=365),tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.notify"))):return repo.reminders(tenant["org_id"],actor(tenant),name(tenant),min_days)
@router.get("/{pickup_id}/receipt")
def receipt(pickup_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.read"))):return Response(repo.receipt_html(tenant["org_id"],pickup_id),media_type="text/html; charset=utf-8")
@router.post("/{pickup_id}/proofs")
async def proof_upload(pickup_id:str,file:UploadFile=File(...),proof_type:str=Form(default="PHOTO"),notes:str|None=Form(default=None),tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.release"))):
 allowed={"image/jpeg","image/png","image/webp"}
 if file.content_type not in allowed:raise HTTPException(415,"unsupported_pickup_proof_type")
 content=await file.read(settings.dossier_document_max_bytes+1)
 if not content or len(content)>settings.dossier_document_max_bytes:raise HTTPException(413,"pickup_proof_too_large")
 safe=Path(file.filename or "proof").name;path=f"{tenant['org_id']}/{pickup_id}/{uuid4().hex}-{safe}"
 try:upload_private_document(path,content,file.content_type,"pickup-proofs")
 except RuntimeError as exc:raise HTTPException(503,str(exc)) from exc
 return repo.add_proof_file(tenant["org_id"],pickup_id,actor(tenant),name(tenant),{"t":proof_type[:30].upper(),"path":path,"file":safe,"mime":file.content_type,"size":len(content),"checksum":hashlib.sha256(content).hexdigest(),"notes":notes[:500] if notes else None})
@router.get("/{pickup_id}/proofs/{proof_id}")
def proof_view(pickup_id:str,proof_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("pickups.read"))):
 proof=repo.get_proof(tenant["org_id"],pickup_id,proof_id)
 if not proof:raise HTTPException(404,"pickup_proof_not_found")
 try:url=create_document_download_url(proof["object_path"],bucket_name="pickup-proofs")
 except RuntimeError as exc:raise HTTPException(503,str(exc)) from exc
 return {"url":url,"expires_in":300}
