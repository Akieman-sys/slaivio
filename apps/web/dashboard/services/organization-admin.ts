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
export async function savePilotNumbering(type:"CLIENT"|"DOSSIER",prefix_format:string,expected_version:number){return(await api.patch(`/organization/admin/pilot/numbering/${type}`,{prefix_format,expected_version})).data}
export async function requestDataOperation(payload:Record<string,unknown>){return(await api.post('/organization/admin/data-requests',payload)).data}
export async function createApiKey(payload:Record<string,unknown>){return(await api.post('/organization/admin/api-keys',payload)).data}
export async function revokeApiKey(id:string){return(await api.delete(`/organization/admin/api-keys/${id}`)).data}
export type AgencyWhatsappNumber={id:string;display_phone_number?:string;verified_name?:string;role?:string;status?:string};
export async function listAgencyWhatsappNumbers(){return(await api.get<{numbers:AgencyWhatsappNumber[]}>('/whatsapp/numbers')).data.numbers}

export type PilotSettingsData={
 organization:{id:string;organization_name:string;legal_name?:string|null;country?:string|null;city?:string|null;address?:string|null;phone?:string|null;email?:string|null;website?:string|null;logo_url?:string|null;row_version:number};
 responsible?:{id:string;member_display_name?:string|null;member_email?:string|null;role_code:string;status:string;last_seen_at?:string|null}|null;
 numbering:Array<{document_type:"CLIENT"|"DOSSIER";prefix_format:string;next_number:number;row_version:number;updated_at:string}>;
 whatsapp_numbers:Array<{id:string;provider:"META"|"WAZZAP"|"QR_LINKED_DEVICE";display_phone_number?:string|null;verified_name?:string|null;connection_status:string;quality_rating?:string|null;is_default:boolean;last_sync_at?:string|null}>;
 whatsapp_configuration:{provider:"META"|"WAZZAP"|"QR_LINKED_DEVICE"|"MOCK";activation_available:boolean;qr_linked_device_available:boolean;suggested_phone_number?:string|null;suggested_verified_name?:string|null;webhook_url?:string|null};
 ai:{pilot_response_mode:"SUGGESTION_ONLY"|"CONTROLLED_AUTO"|"PAUSED";pilot_require_published_knowledge:boolean;updated_at:string};
 knowledge:{default_language:"FR"|"EN";pilot_default_review_days:number;pilot_row_version:number;published_count:number;draft_count:number;whatsapp_ready_count:number};
};
export async function getPilotSettings(){return(await api.get<PilotSettingsData>('/organization/admin/pilot')).data}
export async function selectPilotWhatsappNumber(number_id:string){return(await api.patch('/organization/admin/pilot/whatsapp-number',{number_id})).data}
export async function activatePilotWazzap(payload:{phone_number:string;verified_name?:string;default_language?:string;default_timezone?:string}){return(await api.post('/organization/admin/pilot/wazzap/activate',payload)).data}
export type PilotQRConnection={connection_id?:string;id?:string;status:"CREATED"|"QR_READY"|"CONNECTING"|"CONNECTED"|"DISCONNECTED"|"LOGGED_OUT"|"FAILED"|"REVOKED";qr_data_url?:string|null;qr_expires_at?:string|null;display_phone_number?:string|null;verified_name?:string|null;last_error?:string|null;gateway_reachable?:boolean};
export async function startPilotWhatsappQR(terms_accepted:boolean){return(await api.post<{connection:PilotQRConnection}>('/organization/admin/pilot/whatsapp-qr/start',{terms_accepted})).data.connection}
export async function getPilotWhatsappQRStatus(){return(await api.get<{connection:PilotQRConnection|null}>('/organization/admin/pilot/whatsapp-qr/status')).data.connection}
export async function disconnectPilotWhatsappQR(connection_id:string){return(await api.post(`/organization/admin/pilot/whatsapp-qr/${connection_id}/disconnect`)).data}
export async function savePilotKnowledgeDefaults(payload:{default_language:"FR"|"EN";default_review_days:number;expected_version:number}){return(await api.patch('/organization/admin/pilot/knowledge',payload)).data}

export type PilotReadinessCheck={key:string;label:string;status:"READY"|"WARNING"|"ACTION_REQUIRED";description:string;action_label:string;href:string};
export type PilotReadiness={status:"READY"|"ACTION_REQUIRED";score:number;ready_count:number;total_count:number;action_required_count:number;warning_count:number;checks:PilotReadinessCheck[]};
export async function getPilotReadiness(){return(await api.get<{readiness:PilotReadiness}>('/organization/admin/pilot/readiness')).data.readiness}
export async function recordPilotReadinessReview(){return(await api.post('/organization/admin/pilot/readiness/reviews')).data.review}
