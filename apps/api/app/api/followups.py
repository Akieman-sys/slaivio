from typing import Any
from fastapi import APIRouter,Depends,HTTPException,Query
from pydantic import BaseModel,Field
from app.core.tenant_context import get_current_tenant
from app.core.permissions import require_permission
from app.db import followup_repository as repo

router=APIRouter(prefix='/followups',tags=['followups'])
def actor(t):return str(t.get('user_id') or '')
class FollowupCreate(BaseModel):
 workspace_id:str|None=None;client_id:str;dossier_id:str|None=None;followup_type:str;subject_type:str='CLIENT';subject_id:str|None=None;subject_reference:str|None=None;reason:str;channel:str='WHATSAPP';message:str=Field(min_length=2,max_length=2000);due_at:str;priority:str='NORMAL';responsible_id:str|None=None;responsible_name:str|None=None;amount_context:float|None=None;currency:str|None=None;consent_type:str='OPERATIONAL';condition_snapshot:dict[str,Any]={};idempotency_key:str|None=None
class Mutation(BaseModel):action:str=Field(pattern='^(PAUSE|RESUME|CANCEL|COMPLETE|ESCALATE|RESPOND)$');expected_version:int=Field(ge=1);due_at:str|None=None;reason:str|None=None;responsible_id:str|None=None;responsible_name:str|None=None
class SequenceStep(BaseModel):delay_minutes:int=Field(ge=0);channel:str;message_template:str;condition_config:dict[str,Any]={};action_type:str='SEND'
class SequenceSave(BaseModel):name:str;followup_type:str;exit_conditions:list[Any]=[];steps:list[SequenceStep]=Field(min_length=1,max_length=20)
class RuleSave(BaseModel):workspace_id:str|None=None;name:str;followup_type:str;trigger_type:str;trigger_config:dict[str,Any]={};condition_config:dict[str,Any]={};sequence_id:str|None=None;priority:str='NORMAL';responsible_team:str|None=None
class ResponseCreate(BaseModel):body:str=Field(min_length=1,max_length=4000);channel:str='WHATSAPP';message_id:str|None=None;classification:str|None=None;confidence:float|None=Field(None,ge=0,le=1);requires_review:bool=False
class NoteCreate(BaseModel):body:str=Field(min_length=1,max_length=4000)

@router.get('',dependencies=[Depends(require_permission('followups.read'))])
def index(q:str|None=None,status:str|None=None,followup_type:str|None=None,channel:str|None=None,priority:str|None=None,responsible_id:str|None=None,date_scope:str|None=None,page:int=Query(1,ge=1),page_size:int=Query(40,ge=1,le=100),tenant=Depends(get_current_tenant)):return {'status':'ok',**repo.followup_dashboard(tenant['org_id'],q=q,status=status,followup_type=followup_type,channel=channel,priority=priority,responsible_id=responsible_id,date_scope=date_scope,page=page,page_size=page_size)}
@router.post('',dependencies=[Depends(require_permission('followups.create'))])
def create(body:FollowupCreate,tenant=Depends(get_current_tenant)):return {'status':'ok','followup':repo.create_manual_followup(tenant['org_id'],actor(tenant),body.model_dump())}
@router.get('/rules',dependencies=[Depends(require_permission('followups.read'))])
def rules(tenant=Depends(get_current_tenant)):return {'status':'ok',**repo.rules_and_sequences(tenant['org_id'])}
@router.post('/rules',dependencies=[Depends(require_permission('followups.rules'))])
def rule_save(body:RuleSave,tenant=Depends(get_current_tenant)):return {'status':'ok','rule':repo.save_rule(tenant['org_id'],actor(tenant),body.model_dump())}
@router.post('/sequences',dependencies=[Depends(require_permission('followups.rules'))])
def sequence_save(body:SequenceSave,tenant=Depends(get_current_tenant)):return {'status':'ok','sequence':repo.save_sequence(tenant['org_id'],actor(tenant),body.model_dump())}
@router.get('/due',dependencies=[Depends(require_permission('followups.read'))])
def due(tenant=Depends(get_current_tenant)):
 data=repo.followup_dashboard(tenant['org_id'],status='DUE',page_size=100);return {'status':'ok','count':len(data['items']),'followups':data['items']}
@router.get('/analytics',dependencies=[Depends(require_permission('followups.analytics'))])
def analytics(tenant=Depends(get_current_tenant)):return {'status':'ok','analytics':repo.followup_analytics(tenant['org_id'])}
@router.post('/detect',dependencies=[Depends(require_permission('followups.rules'))])
def detect(tenant=Depends(get_current_tenant)):return {'status':'ok',**repo.detect_candidates(tenant['org_id'])}
@router.get('/{item_id}',dependencies=[Depends(require_permission('followups.read'))])
def detail(item_id:str,tenant=Depends(get_current_tenant)):
 item=repo.followup_detail(tenant['org_id'],item_id)
 if not item:raise HTTPException(404,'followup_not_found')
 return {'status':'ok','followup':item}
@router.patch('/{item_id}',dependencies=[Depends(require_permission('followups.update'))])
def mutate(item_id:str,body:Mutation,tenant=Depends(get_current_tenant)):
 item=repo.mutate_followup(tenant['org_id'],item_id,actor(tenant),body.action,body.expected_version,body.due_at,body.reason,body.responsible_id,body.responsible_name)
 if not item:raise HTTPException(409,'followup_was_modified_or_closed')
 return {'status':'ok','followup':item}
@router.post('/{item_id}/execute',dependencies=[Depends(require_permission('followups.execute'))])
def execute(item_id:str,tenant=Depends(get_current_tenant)):
 result=repo.queue_followup(tenant['org_id'],item_id,actor(tenant))
 if result=='missing':raise HTTPException(404,'followup_not_found')
 if result=='closed':raise HTTPException(409,'followup_not_sendable')
 if result=='recipient_missing':raise HTTPException(409,'client_recipient_not_found')
 return {'status':'ok','result':result}
@router.post('/{item_id}/responses',dependencies=[Depends(require_permission('followups.update'))])
def response(item_id:str,body:ResponseCreate,tenant=Depends(get_current_tenant)):
 result=repo.record_response(tenant['org_id'],item_id,actor(tenant),**body.model_dump())
 if not result:raise HTTPException(404,'followup_not_found')
 return {'status':'ok','response':result}
@router.post('/{item_id}/notes',dependencies=[Depends(require_permission('followups.update'))])
def note(item_id:str,body:NoteCreate,tenant=Depends(get_current_tenant)):return {'status':'ok','note':repo.add_note(tenant['org_id'],item_id,actor(tenant),body.body)}
