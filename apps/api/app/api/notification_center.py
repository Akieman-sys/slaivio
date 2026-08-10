from fastapi import APIRouter,Depends,HTTPException,Query
from pydantic import BaseModel,Field
from app.core.auth import get_current_manager
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.notification_center import repository as repo
from app.services.notification_retry_service import retry_notification
router=APIRouter(prefix='/notification-center',tags=['notification-center'])
def uid(m):return str(m.get('user_id') or m.get('id'))
class Action(BaseModel):action:str;minutes:int|None=Field(default=None,ge=5,le=10080)
class Preference(BaseModel):category:str;in_app:bool=True;email:bool=False;whatsapp:bool=False;quiet_hours_start:str|None=None;quiet_hours_end:str|None=None;digest_frequency:str='IMMEDIATE'
@router.get('',dependencies=[Depends(require_permission('notifications.read'))])
def listing(status:str|None=None,category:str|None=None,priority:str|None=None,source:str|None=None,q:str|None=None,page:int=Query(1,ge=1),page_size:int=Query(50,ge=1,le=100),tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
 return {'status':'ok',**repo.list_center(tenant['org_id'],uid(manager),status,category,priority,source,q,page,page_size)}
@router.patch('/{source}/{notification_id}',dependencies=[Depends(require_permission('notifications.manage'))])
def change(source:str,notification_id:str,body:Action,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
 source=source.upper();
 if source not in {'IN_APP','DELIVERY'} or body.action not in {'read','unread','archive','restore','snooze'}:raise HTTPException(422,'invalid_notification_action')
 row=repo.state(tenant['org_id'],uid(manager),source,notification_id,body.action,body.minutes)
 if not row:raise HTTPException(404,'notification_not_found')
 return {'status':'ok','state':row}
@router.post('/read-all',dependencies=[Depends(require_permission('notifications.manage'))])
def all_read(tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):return {'status':'ok','updated':repo.read_all(tenant['org_id'],uid(manager))}
@router.get('/preferences',dependencies=[Depends(require_permission('notifications.read'))])
def get_preferences(tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):return {'status':'ok','preferences':repo.preferences(tenant['org_id'],uid(manager))}
@router.put('/preferences',dependencies=[Depends(require_permission('notifications.manage'))])
def put_preferences(body:Preference,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
 if body.digest_frequency not in {'IMMEDIATE','DAILY','WEEKLY','OFF'}:raise HTTPException(422,'invalid_digest_frequency')
 return {'status':'ok','preference':repo.save_preference(tenant['org_id'],uid(manager),body.model_dump())}
@router.post('/delivery/{notification_id}/retry',dependencies=[Depends(require_permission('notifications.delivery.manage'))])
def retry(notification_id:str,tenant=Depends(get_current_tenant)):
 result=retry_notification(tenant['org_id'],notification_id)
 if result.get('status')=='error':raise HTTPException(409,result.get('message'))
 return result
