import {api} from './api';
export type Member={id:string;member_display_name?:string;member_email?:string;role_code:string;role_name?:string;status:string;row_version:number;last_seen_at?:string};
export type Role={id:string;role_code:string;role_name:string;description?:string;system_role:boolean;permission_count:number;member_count:number};
export type Permission={id:string;permission_code:string;description?:string};
export type AdminData={organization:Record<string,unknown>&{row_version:number};settings:(Record<string,unknown>&{row_version:number})|null;members:Member[];invitations:Array<Record<string,unknown>>;roles:Role[];permissions:Permission[];audit:Array<Record<string,unknown>>};
export async function getAdmin(){return (await api.get<AdminData>('/organization/admin')).data}
export async function updateOrganization(payload:Record<string,unknown>){return (await api.patch('/organization/admin',payload)).data}
export async function updateSettings(payload:Record<string,unknown>){return (await api.patch('/organization/admin/settings',payload)).data}
export async function updateMember(id:string,payload:Record<string,unknown>){return (await api.patch(`/organization/admin/members/${id}`,payload)).data}
export async function saveRole(payload:Record<string,unknown>){return (await api.post('/organization/admin/roles',payload)).data}
export async function inviteMember(email:string,role_code:string){return (await api.post('/organization/invitations',{email,role_code})).data}
export async function revokeInvitation(id:string){return (await api.delete(`/organization/admin/invitations/${id}`)).data}
