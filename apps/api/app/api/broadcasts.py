from typing import Any
from fastapi import APIRouter,Depends,HTTPException,Query
from pydantic import BaseModel,Field
from app.core.tenant_context import get_current_tenant
from app.core.permissions import require_permission
from app.db import broadcast_repository as repo
router=APIRouter(prefix='/broadcasts',tags=['broadcasts'])
def actor(t):return str(t.get('user_id') or '')
class Campaign(BaseModel):
 workspace_id:str|None=None;title:str=Field(min_length=2,max_length=180);message:str=Field(min_length=2,max_length=5000);campaign_type:str='INFORMATIONAL';objective:str='INFORM';channels:list[str]=['WHATSAPP'];audience_id:str|None=None;template_id:str|None=None;language_versions:dict[str,Any]={};media:list[Any]=[];variable_defaults:dict[str,Any]={};scheduled_at:str|None=None;timezone_mode:str='WORKSPACE'
class Audience(BaseModel):workspace_id:str|None=None;name:str;audience_type:str='DYNAMIC';filter_config:dict[str,Any]={}
class Mutation(BaseModel):action:str=Field(pattern='^(APPROVE|START|PAUSE|RESUME|CANCEL|ARCHIVE)$');expected_version:int=Field(ge=1)
class Template(BaseModel):workspace_id:str|None=None;name:str;channel:str='WHATSAPP';category:str='UTILITY';language:str='fr';subject:str|None=None;preheader:str|None=None;body:str;variables:list[str]=[];media_config:dict[str,Any]={};buttons:list[Any]=[];provider_template_name:str|None=None;provider_status:str='DRAFT'
class Consent(BaseModel):client_id:str|None=None;contact:str;channel:str='WHATSAPP';consent_status:str;source:str='MANUAL';evidence:dict[str,Any]={}
class TestSend(BaseModel):channel:str='WHATSAPP';recipient:str
class View(BaseModel):name:str;filters:dict[str,Any]={}
@router.get('',dependencies=[Depends(require_permission('broadcasts.read'))])
def index(q:str|None=None,status:str|None=None,channel:str|None=None,page:int=Query(1,ge=1),page_size:int=Query(40,ge=1,le=100),tenant=Depends(get_current_tenant)):return {'status':'ok',**repo.dashboard(tenant['org_id'],q,status,channel,page,page_size)}
@router.post('',dependencies=[Depends(require_permission('broadcasts.create'))])
def create(body:Campaign,tenant=Depends(get_current_tenant)):return {'status':'ok','campaign':repo.create_campaign(tenant['org_id'],actor(tenant),body.model_dump())}
@router.get('/resources',dependencies=[Depends(require_permission('broadcasts.read'))])
def resources(tenant=Depends(get_current_tenant)):return {'status':'ok',**repo.resources(tenant['org_id'])}
@router.post('/audiences',dependencies=[Depends(require_permission('broadcasts.audiences'))])
def audience(body:Audience,tenant=Depends(get_current_tenant)):return {'status':'ok','audience':repo.save_audience(tenant['org_id'],actor(tenant),body.model_dump())}
@router.post('/templates',dependencies=[Depends(require_permission('broadcasts.templates'))])
def template(body:Template,tenant=Depends(get_current_tenant)):return {'status':'ok','template':repo.save_template(tenant['org_id'],actor(tenant),body.model_dump())}
@router.post('/consents',dependencies=[Depends(require_permission('broadcasts.audiences'))])
def consent(body:Consent,tenant=Depends(get_current_tenant)):return {'status':'ok','consent':repo.consent(tenant['org_id'],body.model_dump())}
@router.patch('/settings',dependencies=[Depends(require_permission('broadcasts.send'))])
def settings(body:dict[str,Any],tenant=Depends(get_current_tenant)):return {'status':'ok','settings':repo.save_settings(tenant['org_id'],body)}
@router.post('/views',dependencies=[Depends(require_permission('broadcasts.create'))])
def view(body:View,tenant=Depends(get_current_tenant)):return {'status':'ok','view':repo.save_view(tenant['org_id'],actor(tenant),body.name,body.filters)}
@router.get('/analytics',dependencies=[Depends(require_permission('broadcasts.analytics'))])
def analytics(tenant=Depends(get_current_tenant)):return {'status':'ok','analytics':repo.analytics(tenant['org_id'])}
@router.get('/{campaign_id}',dependencies=[Depends(require_permission('broadcasts.read'))])
def detail(campaign_id:str,tenant=Depends(get_current_tenant)):
 x=repo.detail(tenant['org_id'],campaign_id)
 if not x:raise HTTPException(404,'campaign_not_found')
 return {'status':'ok','campaign':x}
@router.post('/{campaign_id}/snapshot',dependencies=[Depends(require_permission('broadcasts.audiences'))])
def snapshot(campaign_id:str,tenant=Depends(get_current_tenant)):
 x=repo.snapshot(tenant['org_id'],campaign_id,actor(tenant))
 if x is None:raise HTTPException(404,'campaign_not_found')
 return {'status':'ok','snapshot':x}
@router.post('/{campaign_id}/test',dependencies=[Depends(require_permission('broadcasts.send'))])
def test(campaign_id:str,body:TestSend,tenant=Depends(get_current_tenant)):
 x=repo.test_send(tenant['org_id'],campaign_id,actor(tenant),body.channel,body.recipient)
 if not x:raise HTTPException(404,'campaign_not_found')
 return {'status':'ok','test':x}
@router.get('/{campaign_id}/export',dependencies=[Depends(require_permission('broadcasts.export'))])
def export(campaign_id:str,tenant=Depends(get_current_tenant)):return {'status':'ok','items':repo.export_recipients(tenant['org_id'],campaign_id)}
@router.patch('/{campaign_id}',dependencies=[Depends(require_permission('broadcasts.send'))])
def mutate(campaign_id:str,body:Mutation,tenant=Depends(get_current_tenant)):
 x=repo.action(tenant['org_id'],campaign_id,actor(tenant),body.action,body.expected_version)
 if x=='precheck_failed':raise HTTPException(409,'campaign_precheck_failed')
 if x in ('approval_or_schedule','template_not_approved','audience_empty'):raise HTTPException(409,x)
 if not x:raise HTTPException(409,'campaign_was_modified')
 return {'status':'ok','campaign':x}
