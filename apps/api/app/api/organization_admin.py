from typing import Any
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field
from app.core.auth import get_current_manager
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.organization_admin import repository as repo

router=APIRouter(prefix='/organization/admin',tags=['organization-admin'])
def actor(m):return m.get('user_id') or m.get('id')
class OrgUpdate(BaseModel):
    expected_version:int=Field(ge=1); organization_name:str|None=None;legal_name:str|None=None;country:str|None=None;city:str|None=None;address:str|None=None;phone:str|None=None;email:str|None=None;website:str|None=None;registration_number:str|None=None;tax_number:str|None=None;logo_url:str|None=None;organization_type:str|None=None;whatsapp:str|None=None;province:str|None=None;postal_code:str|None=None;registration_country:str|None=None;legal_address:str|None=None;logo_dark_url:str|None=None;primary_color:str|None=None;secondary_color:str|None=None;document_display_name:str|None=None;signature_url:str|None=None;stamp_url:str|None=None
class SettingsUpdate(BaseModel):
    expected_version:int=Field(ge=1);timezone:str='UTC';currency_code:str='USD';country_code:str|None=None;language_code:str='fr';date_format:str='DD/MM/YYYY';weight_unit:str='kg';volume_unit:str='cbm';notification_email:str|None=None;settings:dict[str,Any]={};security:dict[str,Any]={};time_format:str='24H';week_starts_on:int=Field(default=1,ge=0,le=6);dimension_unit:str='cm';distance_unit:str='km';data_retention_days:int=Field(default=1095,ge=30,le=3650);privacy:dict[str,Any]={}
class MemberUpdate(BaseModel): expected_version:int=Field(ge=1);role_code:str;status:str
class RoleSave(BaseModel): code:str=Field(pattern=r'^[A-Z][A-Z0-9_]{2,39}$');name:str=Field(min_length=2,max_length=80);description:str|None=None;permissions:list[str]
class WorkspaceSave(BaseModel):name:str=Field(min_length=2,max_length=100);code:str=Field(pattern=r'^[A-Za-z0-9_-]{2,20}$');country_code:str|None=None;currency_code:str='USD';timezone:str='UTC';language_code:str='fr'
class WorkspaceArchive(BaseModel):expected_version:int=Field(ge=1)
class LocationSave(BaseModel):workspace_id:str|None=None;name:str=Field(min_length=2,max_length=120);code:str=Field(pattern=r'^[A-Za-z0-9_-]{2,30}$');location_type:str;country:str;city:str;address:str|None=None;phone:str|None=None;whatsapp:str|None=None;email:str|None=None;manager_name:str|None=None;opening_hours:dict[str,Any]={};timezone:str='UTC';services:list[str]=[]
class IntegrationSave(BaseModel):provider:str=Field(pattern=r'^(WHATSAPP|GMAIL)$');account_label:str=Field(min_length=2,max_length=120);status:str=Field(pattern=r'^(DISCONNECTED|CONNECTING|CONNECTED|ERROR)$');granted_permissions:list[str]=[];configuration:dict[str,Any]={}
class NumberingSave(BaseModel):prefix_format:str=Field(min_length=3,max_length=100);expected_version:int=Field(ge=1)
class DataRequest(BaseModel):request_type:str=Field(pattern=r'^(EXPORT|ARCHIVE_WORKSPACE|DELETE_WORKSPACE|DELETE_ORGANIZATION)$');scope:dict[str,Any]={};confirmation:str|None=None
class ApiKeyCreate(BaseModel):name:str=Field(min_length=2,max_length=80);scopes:list[str]=Field(min_length=1,max_length=30);expires_at:str|None=None

@router.get('',dependencies=[Depends(require_permission('organization.read'))])
def get_admin(tenant=Depends(get_current_tenant)):return {'status':'ok',**repo.overview(tenant['org_id'])}
@router.patch('',dependencies=[Depends(require_permission('organization.manage'))])
def patch_org(body:OrgUpdate,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
    row=repo.update_org(tenant['org_id'],actor(manager),body.model_dump(exclude={'expected_version'}),body.expected_version)
    if not row:raise HTTPException(409,'organization_was_modified')
    return {'status':'ok','organization':row}
@router.patch('/settings',dependencies=[Depends(require_permission('settings.write'))])
def patch_settings(body:SettingsUpdate,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
    row=repo.save_settings(tenant['org_id'],actor(manager),body.model_dump(exclude={'expected_version'}),body.expected_version)
    if not row:raise HTTPException(409,'settings_were_modified')
    return {'status':'ok','settings':row}
@router.patch('/members/{member_id}',dependencies=[Depends(require_permission('team.manage'))])
def patch_member(member_id:str,body:MemberUpdate,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
    if body.status not in {'ACTIVE','SUSPENDED'}:raise HTTPException(422,'invalid_member_status')
    row=repo.update_member(tenant['org_id'],member_id,actor(manager),body.role_code,body.status,body.expected_version)
    if row=='last_owner':raise HTTPException(409,'organization_requires_an_active_owner')
    if row in {'missing','invalid_role'}:raise HTTPException(404,row)
    if row=='conflict':raise HTTPException(409,'membership_was_modified')
    return {'status':'ok','member':row}
@router.post('/roles',dependencies=[Depends(require_permission('roles.manage'))])
def post_role(body:RoleSave,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
    return {'status':'ok','role':repo.save_role(tenant['org_id'],actor(manager),{'code':body.code,'name':body.name,'description':body.description,'permissions':body.permissions})}
@router.delete('/invitations/{invitation_id}',dependencies=[Depends(require_permission('team.manage'))])
def delete_invitation(invitation_id:str,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
    row=repo.revoke_invitation(tenant['org_id'],invitation_id,actor(manager))
    if not row:raise HTTPException(404,'pending_invitation_not_found')
    return {'status':'ok','invitation':row}
@router.post('/workspaces',dependencies=[Depends(require_permission('workspaces.manage'))])
def post_workspace(body:WorkspaceSave,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):return {'status':'ok','workspace':repo.save_workspace(tenant['org_id'],actor(manager),body.model_dump())}
@router.post('/workspaces/{item_id}/archive',dependencies=[Depends(require_permission('workspaces.manage'))])
def post_workspace_archive(item_id:str,body:WorkspaceArchive,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
    row=repo.archive_workspace(tenant['org_id'],actor(manager),item_id,body.expected_version)
    if not row:raise HTTPException(409,'workspace_was_modified')
    return {'status':'ok','workspace':row}
@router.post('/locations',dependencies=[Depends(require_permission('locations.manage'))])
def post_location(body:LocationSave,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):return {'status':'ok','location':repo.save_location(tenant['org_id'],actor(manager),body.model_dump())}
@router.post('/integrations',dependencies=[Depends(require_permission('integrations.manage'))])
def post_integration(body:IntegrationSave,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):return {'status':'ok','integration':repo.save_integration(tenant['org_id'],actor(manager),body.model_dump())}
@router.patch('/numbering/{document_type}',dependencies=[Depends(require_permission('documents.settings'))])
def patch_numbering(document_type:str,body:NumberingSave,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
    row=repo.save_numbering(tenant['org_id'],actor(manager),document_type.upper(),body.prefix_format,body.expected_version)
    if not row:raise HTTPException(409,'numbering_was_modified')
    return {'status':'ok','numbering':row}
@router.post('/data-requests',dependencies=[Depends(require_permission('data.manage'))])
def post_data_request(body:DataRequest,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
    if body.request_type=='DELETE_ORGANIZATION':
        org=repo.overview(tenant['org_id'])['organization'] or {}
        expected=org.get('organization_name') or org.get('name')
        if not expected or body.confirmation!=expected:raise HTTPException(422,'organization_name_confirmation_required')
    return {'status':'ok','request':repo.request_data_operation(tenant['org_id'],actor(manager),body.request_type,body.scope)}
@router.post('/api-keys',dependencies=[Depends(require_permission('developers.manage'))])
def post_api_key(body:ApiKeyCreate,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):return {'status':'ok','api_key':repo.create_api_key(tenant['org_id'],actor(manager),body.name,body.scopes,body.expires_at)}
@router.delete('/api-keys/{item_id}',dependencies=[Depends(require_permission('developers.manage'))])
def delete_api_key(item_id:str,tenant=Depends(get_current_tenant),manager=Depends(get_current_manager)):
    row=repo.revoke_api_key(tenant['org_id'],actor(manager),item_id)
    if not row:raise HTTPException(404,'active_api_key_not_found')
    return {'status':'ok','api_key':row}
