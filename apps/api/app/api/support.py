from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter,Depends,File,Form,HTTPException,UploadFile
from pydantic import BaseModel,Field
from app.core.auth import get_current_manager
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.services.dossier_document_storage import upload_private_document,create_document_download_url
from app.support import repository as repo
router=APIRouter(prefix='/support',tags=['support']);BUCKET='support-attachments';MIMES={'application/pdf','image/jpeg','image/png','image/webp','text/plain'}
def actor(m):
    return str(m.get('user_id') or m.get('id'))

def name(m):
    return str(m.get('name') or m.get('email') or 'Utilisateur')
class Ticket(BaseModel):subject:str=Field(min_length=5,max_length=160);description:str=Field(min_length=10,max_length=10000);category:str;priority:str='NORMAL'
class Message(BaseModel):message:str=Field(min_length=2,max_length=10000)
class Transition(BaseModel):expected_version:int=Field(ge=1)
@router.get('/articles',dependencies=[Depends(require_permission('support.read'))])
def articles(q:str|None=None,category:str|None=None):return {'status':'ok','articles':repo.articles(q,category)}
@router.get('/tickets',dependencies=[Depends(require_permission('support.read'))])
def tickets(status:str|None=None,q:str|None=None,tenant=Depends(get_current_tenant)):return {'status':'ok','tickets':repo.list_tickets(tenant['org_id'],status,q)}
@router.post('/tickets',dependencies=[Depends(require_permission('support.create'))])
def create(body:Ticket,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
 if body.priority not in {'LOW','NORMAL','HIGH','URGENT'}:raise HTTPException(422,'invalid_priority')
 return {'status':'ok','ticket':repo.create_ticket(tenant['org_id'],actor(manager),name(manager),manager.get('email'),body.model_dump())}
@router.get('/tickets/{ticket_id}',dependencies=[Depends(require_permission('support.read'))])
def detail(ticket_id:str,tenant=Depends(get_current_tenant)):
 row=repo.get_ticket(tenant['org_id'],ticket_id)
 if not row:raise HTTPException(404,'ticket_not_found')
 return {'status':'ok',**row}
@router.post('/tickets/{ticket_id}/messages',dependencies=[Depends(require_permission('support.create'))])
def message(ticket_id:str,body:Message,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
 row=repo.add_message(tenant['org_id'],ticket_id,actor(manager),name(manager),body.message)
 if row=='closed':raise HTTPException(409,'ticket_is_closed')
 if not row:raise HTTPException(404,'ticket_not_found')
 return {'status':'ok','message':row}
@router.post('/tickets/{ticket_id}/transition/{action}',dependencies=[Depends(require_permission('support.close'))])
def transition(ticket_id:str,action:str,body:Transition,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
 if action not in {'close','reopen'}:raise HTTPException(422,'invalid_transition')
 row=repo.transition(tenant['org_id'],ticket_id,actor(manager),action,body.expected_version)
 if not row:raise HTTPException(409,'ticket_was_modified')
 return {'status':'ok','ticket':row}
@router.post('/tickets/{ticket_id}/attachments',dependencies=[Depends(require_permission('support.create'))])
async def attachment(ticket_id:str,message_id:str|None=Form(None),file:UploadFile=File(...),tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
 if not repo.get_ticket(tenant['org_id'],ticket_id):raise HTTPException(404,'ticket_not_found')
 data=await file.read();mime=file.content_type or''
 if mime not in MIMES or not data or len(data)>10*1024*1024:raise HTTPException(422,'invalid_support_attachment')
 path=f"{tenant['org_id']}/{ticket_id}/{uuid4().hex}{Path(file.filename or 'file').suffix.lower()}";upload_private_document(path,data,mime,BUCKET)
 return {'status':'ok','attachment':repo.add_attachment(tenant['org_id'],ticket_id,message_id,actor(manager),path,file.filename or'file',mime,len(data))}
@router.get('/tickets/{ticket_id}/attachments/{attachment_id}',dependencies=[Depends(require_permission('support.read'))])
def download(ticket_id:str,attachment_id:str,tenant=Depends(get_current_tenant)):
 detail=repo.get_ticket(tenant['org_id'],ticket_id);item=next((x for x in(detail or{}).get('attachments',[]) if str(x['id'])==attachment_id),None)
 if not item:raise HTTPException(404,'attachment_not_found')
 return {'url':create_document_download_url(item['object_path'],300,BUCKET)}
