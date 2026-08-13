import {api} from './api';
export type Member={id:string;member_display_name?:string;member_email?:string;role_code:string;role_name?:string;status:string;row_version:number;last_seen_at?:string};
export type Role={id:string;role_code:string;role_name:string;description?:string;system_role:boolean;permission_count:number;member_count:number};
export type Permission={id:string;permission_code:string;description?:string};
export type AdminData={organization:Record<string,unknown>&{row_version:number};settings:(Record<string,unknown>&{row_version:number})|null;members:Member[];invitations:Array<Record<string,unknown>>;roles:Role[];permissions:Permission[];audit:Array<Record<string,unknown>>;workspaces:Array<Record<string,unknown>>;locations:Array<Record<string,unknown>>;integrations:Array<Record<string,unknown>>;numbering:Array<Record<string,unknown>>;billing:Record<string,unknown>|null;data_requests:Array<Record<string,unknown>>;api_keys:Array<Record<string,unknown>>};
export async function getAdmin(){return (await api.get<AdminData>('/organization/admin')).data}
export async function updateOrganization(payload:Record<string,unknown>){return (await api.patch('/organization/admin',payload)).data}
export async function updateSettings(payload:Record<string,unknown>){return (await api.patch('/organization/admin/settings',payload)).data}
export async function updateMember(id:string,payload:Record<string,unknown>){return (await api.patch(`/organization/admin/members/${id}`,payload)).data}
export async function saveRole(payload:Record<string,unknown>){return (await api.post('/organization/admin/roles',payload)).data}
export async function inviteMember(email:string,role_code:string){return (await api.post('/organization/invitations',{email,role_code})).data}
export async function revokeInvitation(id:string){return (await api.delete(`/organization/admin/invitations/${id}`)).data}
export async function saveWorkspace(payload:Record<string,unknown>){return(await api.post('/organization/admin/workspaces',payload)).data}
export async function archiveWorkspace(id:string,expected_version:number){return(await api.post(`/organization/admin/workspaces/${id}/archive`,{expected_version})).data}
export async function saveLocation(payload:Record<string,unknown>){return(await api.post('/organization/admin/locations',payload)).data}
export async function saveIntegration(payload:Record<string,unknown>){return(await api.post('/organization/admin/integrations',payload)).data}
export async function saveNumbering(type:string,prefix_format:string,expected_version:number){return(await api.patch(`/organization/admin/numbering/${type}`,{prefix_format,expected_version})).data}
export async function requestDataOperation(payload:Record<string,unknown>){return(await api.post('/organization/admin/data-requests',payload)).data}
export async function createApiKey(payload:Record<string,unknown>){return(await api.post('/organization/admin/api-keys',payload)).data}
export async function revokeApiKey(id:string){return(await api.delete(`/organization/admin/api-keys/${id}`)).data}
