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
    expected_version:int=Field(ge=1); organization_name:str|None=None;legal_name:str|None=None;country:str|None=None;city:str|None=None;address:str|None=None;phone:str|None=None;email:str|None=None;website:str|None=None;registration_number:str|None=None;tax_number:str|None=None;logo_url:str|None=None
class SettingsUpdate(BaseModel):
    expected_version:int=Field(ge=1);timezone:str='UTC';currency_code:str='USD';country_code:str|None=None;language_code:str='fr';date_format:str='DD/MM/YYYY';weight_unit:str='kg';volume_unit:str='cbm';notification_email:str|None=None;settings:dict[str,Any]={};security:dict[str,Any]={}
class MemberUpdate(BaseModel): expected_version:int=Field(ge=1);role_code:str;status:str
class RoleSave(BaseModel): code:str=Field(pattern=r'^[A-Z][A-Z0-9_]{2,39}$');name:str=Field(min_length=2,max_length=80);description:str|None=None;permissions:list[str]

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
