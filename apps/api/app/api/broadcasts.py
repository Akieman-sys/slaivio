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
@router.get('',dependencies=[Depends(require_permission('broadcasts.read'))])
def index(q:str|None=None,status:str|None=None,channel:str|None=None,page:int=Query(1,ge=1),page_size:int=Query(40,ge=1,le=100),tenant=Depends(get_current_tenant)):return {'status':'ok',**repo.dashboard(tenant['org_id'],q,status,channel,page,page_size)}
@router.post('',dependencies=[Depends(require_permission('broadcasts.create'))])
def create(body:Campaign,tenant=Depends(get_current_tenant)):return {'status':'ok','campaign':repo.create_campaign(tenant['org_id'],actor(tenant),body.model_dump())}
@router.get('/resources',dependencies=[Depends(require_permission('broadcasts.read'))])
def resources(tenant=Depends(get_current_tenant)):return {'status':'ok',**repo.resources(tenant['org_id'])}
@router.post('/audiences',dependencies=[Depends(require_permission('broadcasts.audiences'))])
def audience(body:Audience,tenant=Depends(get_current_tenant)):return {'status':'ok','audience':repo.save_audience(tenant['org_id'],actor(tenant),body.model_dump())}
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
@router.patch('/{campaign_id}',dependencies=[Depends(require_permission('broadcasts.send'))])
def mutate(campaign_id:str,body:Mutation,tenant=Depends(get_current_tenant)):
 x=repo.action(tenant['org_id'],campaign_id,actor(tenant),body.action,body.expected_version)
 if x=='precheck_failed':raise HTTPException(409,'campaign_precheck_failed')
 if not x:raise HTTPException(409,'campaign_was_modified')
 return {'status':'ok','campaign':x}
