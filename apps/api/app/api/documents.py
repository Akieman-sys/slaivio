import hashlib
from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter,Depends,File,Form,HTTPException,UploadFile
from pydantic import BaseModel
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.documents import repository as repo
from app.services.dossier_document_storage import upload_private_document,create_document_download_url
router=APIRouter(prefix='/documents',tags=['documents']);BUCKET='compliance-documents';MIMES={'application/pdf','image/jpeg','image/png','image/webp'}
def aid(t):return str(t.get('user_id')or'system')
def an(t):return str(t.get('actor_name')or"Membre de l'agence")
class Review(BaseModel):status:str;reason:str|None=None
class Requirement(BaseModel):requirement_code:str;document_type:str;shipping_service_id:str|None=None;origin_country:str|None=None;destination_country:str|None=None;goods_category:str|None=None;entity_type:str='SHIPMENT';mandatory:bool=True;validity_days:int|None=None;priority:int=100
@router.get('')
def index(q:str|None=None,status:str|None=None,entity_type:str|None=None,tenant=Depends(get_current_tenant),_=Depends(require_permission('documents.read'))):return{'items':repo.listing(tenant['org_id'],q,status,entity_type)}
@router.post('')
async def upload(document_code:str=Form(...),document_type:str=Form(...),title:str=Form(...),entity_type:str=Form(...),entity_id:str=Form(...),issued_at:str|None=Form(None),expires_at:str|None=Form(None),issuer:str|None=Form(None),file:UploadFile=File(...),tenant=Depends(get_current_tenant),_=Depends(require_permission('documents.upload'))):
 data=await file.read();mime=file.content_type or''
 if mime not in MIMES or not data or len(data)>20*1024*1024:raise HTTPException(422,'invalid_document_file')
 path=f"{tenant['org_id']}/{entity_type.lower()}/{entity_id}/{uuid4().hex}{Path(file.filename or'file').suffix.lower()}";upload_private_document(path,data,mime,BUCKET)
 return repo.add(tenant['org_id'],aid(tenant),an(tenant),{'document_code':document_code,'document_type':document_type,'title':title,'entity_type':entity_type,'entity_id':entity_id,'object_path':path,'file_name':file.filename or'file','mime_type':mime,'size_bytes':len(data),'checksum_sha256':hashlib.sha256(data).hexdigest(),'issued_at':issued_at or None,'expires_at':expires_at or None,'issuer':issuer,'metadata':{}})
@router.get('/{document_id}/download')
def download(document_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission('documents.read'))):
 items=repo.listing(tenant['org_id']);doc=next((x for x in items if str(x['id'])==document_id),None)
 if not doc:raise HTTPException(404,'document_not_found')
 return{'url':create_document_download_url(doc['object_path'],300,BUCKET)}
@router.post('/{document_id}/review')
def review(document_id:str,body:Review,tenant=Depends(get_current_tenant),_=Depends(require_permission('documents.review'))):
 if body.status not in('VALID','REJECTED'):raise HTTPException(422,'invalid_review_status')
 if body.status=='REJECTED'and not body.reason:raise HTTPException(422,'rejection_reason_required')
 return repo.review(tenant['org_id'],document_id,aid(tenant),an(tenant),body.status,body.reason)
@router.post('/expiry/refresh')
def expiry(tenant=Depends(get_current_tenant),_=Depends(require_permission('documents.manage'))):return{'updated':repo.expire(tenant['org_id'])}
@router.get('/requirements/all')
def requirements(tenant=Depends(get_current_tenant),_=Depends(require_permission('documents.read'))):return{'items':repo.requirements(tenant['org_id'])}
@router.put('/requirements')
def requirement(body:Requirement,tenant=Depends(get_current_tenant),_=Depends(require_permission('documents.manage'))):return repo.save_requirement(tenant['org_id'],body.model_dump())
@router.post('/check/{entity_type}/{entity_id}')
def check(entity_type:str,entity_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission('documents.review'))):return repo.check(tenant['org_id'],entity_type,entity_id,aid(tenant))
