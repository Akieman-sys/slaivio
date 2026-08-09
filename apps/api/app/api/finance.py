from datetime import date,datetime,timezone
from fastapi import APIRouter,Depends,Query,Response
from pydantic import BaseModel,Field,field_validator
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.finance import repository as repo

router=APIRouter(prefix="/finance",tags=["finance"])
def actor(t):return str(t.get("user_id") or "system")
def name(t):return str(t.get("actor_name") or "Membre de l'agence")
class Line(BaseModel):
 description:str=Field(min_length=1,max_length=500);quantity:float=Field(gt=0);unit_price:float=Field(ge=0);discount_rate:float=Field(default=0,ge=0,le=100);tax_rate:float=Field(default=0,ge=0,le=100);metadata:dict={}
class DocumentCreate(BaseModel):
 document_type:str;client_id:str;dossier_id:str|None=None;source_document_id:str|None=None;currency:str=Field(min_length=3,max_length=3);due_date:date|None=None;notes:str|None=None;terms:str|None=None;lines:list[Line]=Field(min_length=1,max_length=200)
 @field_validator('document_type')
 @classmethod
 def kind(cls,v):
  if v not in {'QUOTE','INVOICE','CREDIT_NOTE'}:raise ValueError('invalid_document_type')
  return v
 @field_validator('currency')
 @classmethod
 def currency_code(cls,v):return v.upper()
class Version(BaseModel):expected_version:int=Field(ge=1)
class Void(Version):reason:str=Field(min_length=4,max_length=500)
class Payment(BaseModel):amount:float=Field(gt=0);currency:str=Field(min_length=3,max_length=3);method:str=Field(min_length=2,max_length=50);reference:str|None=None;paid_at:datetime=Field(default_factory=lambda:datetime.now(timezone.utc));idempotency_key:str=Field(min_length=8,max_length=160)

@router.get("")
def index(q:str|None=None,status:str|None=None,document_type:str|None=None,page:int=Query(1,ge=1),page_size:int=Query(50,ge=1,le=100),tenant=Depends(get_current_tenant),_=Depends(require_permission("finance.read"))):return repo.list_documents(tenant['org_id'],q,status,document_type,page,page_size)
@router.get("/stats")
def stats(tenant=Depends(get_current_tenant),_=Depends(require_permission("finance.read"))):return repo.stats(tenant['org_id'])
@router.get("/export")
def export(tenant=Depends(get_current_tenant),_=Depends(require_permission("finance.export"))):return Response(repo.export(tenant['org_id']),media_type="text/csv; charset=utf-8",headers={"Content-Disposition":"attachment; filename=slaivio-facturation.csv"})
@router.post("")
def create(body:DocumentCreate,tenant=Depends(get_current_tenant),_=Depends(require_permission("finance.create"))):return repo.create(tenant['org_id'],actor(tenant),name(tenant),body.model_dump())
@router.get("/{document_id}")
def detail(document_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("finance.read"))):return repo.detail(tenant['org_id'],document_id)
@router.post("/{document_id}/issue")
def issue(document_id:str,body:Version,tenant=Depends(get_current_tenant),_=Depends(require_permission("finance.issue"))):return repo.issue(tenant['org_id'],document_id,actor(tenant),name(tenant),body.expected_version)
@router.post("/{document_id}/payments")
def payment(document_id:str,body:Payment,tenant=Depends(get_current_tenant),_=Depends(require_permission("finance.payments"))):return repo.pay(tenant['org_id'],document_id,actor(tenant),name(tenant),body.model_dump())
@router.post("/{document_id}/void")
def void(document_id:str,body:Void,tenant=Depends(get_current_tenant),_=Depends(require_permission("finance.void"))):return repo.void(tenant['org_id'],document_id,actor(tenant),name(tenant),body.expected_version,body.reason)
