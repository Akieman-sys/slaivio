from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field
from app.core.platform_permissions import require_platform_permission
from app.platform_admin import repository as repo
router=APIRouter(prefix='/platform/admin',tags=['platform-admin']);ALLOWED={'platform.admin.read','platform.agencies.manage','platform.billing.manage','platform.support.manage','platform.audit.read','platform.permissions.manage','quarantine.read','quarantine.resolve','quarantine.replay'}
def uid(m):return str(m.get('user_id')or m.get('id'))
class AgencyStatus(BaseModel):status:str;reason:str=Field(min_length=5,max_length=500);expected_version:int
class Subscription(BaseModel):plan_code:str;status:str;reason:str=Field(min_length=5,max_length=500);expected_version:int
class Note(BaseModel):note:str=Field(min_length=2,max_length=5000)
class Reply(BaseModel):message:str=Field(min_length=2,max_length=10000);status:str='IN_PROGRESS';expected_version:int
class Grant(BaseModel):user_id:str;permissions:list[str]
@router.get('/access')
def access(manager=Depends(require_platform_permission('platform.admin.read'))):return {'allowed':True,'user_id':uid(manager)}
@router.get('/overview')
def overview(_=Depends(require_platform_permission('platform.admin.read'))):return {'status':'ok','metrics':repo.overview()}
@router.get('/agencies')
def agencies(q:str|None=None,status:str|None=None,_=Depends(require_platform_permission('platform.admin.read'))):return {'items':repo.agencies(q,status)}
@router.get('/agencies/{org_id}')
def agency(org_id:str,_=Depends(require_platform_permission('platform.admin.read'))):
 row=repo.agency(org_id)
 if not row:raise HTTPException(404,'agency_not_found')
 return row
@router.patch('/agencies/{org_id}/status')
def agency_status(org_id:str,body:AgencyStatus,manager=Depends(require_platform_permission('platform.agencies.manage'))):
 if body.status not in {'ACTIVE','SUSPENDED','CLOSED'}:raise HTTPException(422,'invalid_agency_status')
 row=repo.update_agency(org_id,uid(manager),body.status,body.reason,body.expected_version)
 if row=='missing':raise HTTPException(404,'agency_not_found')
 if row=='conflict':raise HTTPException(409,'agency_was_modified')
 return {'organization':row}
@router.patch('/agencies/{org_id}/subscription')
def subscription(org_id:str,body:Subscription,manager=Depends(require_platform_permission('platform.billing.manage'))):
 if body.status not in {'TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED'}:raise HTTPException(422,'invalid_subscription_status')
 row=repo.subscription(org_id,uid(manager),body.plan_code,body.status,body.reason,body.expected_version)
 if row in {'missing','plan'}:raise HTTPException(404,row)
 if row=='conflict':raise HTTPException(409,'subscription_was_modified')
 return {'subscription':row}
@router.post('/agencies/{org_id}/notes')
def note(org_id:str,body:Note,manager=Depends(require_platform_permission('platform.agencies.manage'))):return {'note':repo.add_note(org_id,uid(manager),body.note)}
@router.get('/tickets')
def tickets(status:str|None=None,priority:str|None=None,_=Depends(require_platform_permission('platform.support.manage'))):return {'items':repo.tickets(status,priority)}
@router.post('/tickets/{ticket_id}/reply')
def reply(ticket_id:str,body:Reply,manager=Depends(require_platform_permission('platform.support.manage'))):
 if body.status not in {'IN_PROGRESS','WAITING_CUSTOMER','RESOLVED'}:raise HTTPException(422,'invalid_ticket_status')
 row=repo.support_reply(ticket_id,uid(manager),str(manager.get('name')or manager.get('email')or'Slaivio Support'),body.message,body.status,body.expected_version)
 if row=='missing':raise HTTPException(404,'ticket_not_found')
 if row=='conflict':raise HTTPException(409,'ticket_was_modified')
 return {'message':row}
@router.get('/audit')
def audit(_=Depends(require_platform_permission('platform.audit.read'))):return {'items':repo.audit()}
@router.get('/operators')
def operators(_=Depends(require_platform_permission('platform.permissions.manage'))):return {'items':repo.operators()}
@router.put('/operators')
def grant(body:Grant,manager=Depends(require_platform_permission('platform.permissions.manage'))):
 if not body.permissions or any(p not in ALLOWED for p in body.permissions):raise HTTPException(422,'invalid_platform_permissions')
 return {'permissions':repo.grant(uid(manager),body.user_id,body.permissions)}
