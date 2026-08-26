import {api} from './api';
export type Followup={id:string;reference:string;client_name?:string;client_phone?:string;followup_type:string;subject_type:string;subject_reference?:string;reason?:string;channel:string;message:string;due_at:string;priority:string;responsible_name?:string;status:string;current_step:number;max_steps:number;attempt_count:number;amount_context?:number;currency?:string;row_version:number;attempts?:Array<Record<string,unknown>>;responses?:Array<Record<string,unknown>>;events?:Array<Record<string,unknown>>};
export type FollowupStats={due_today:number;overdue:number;waiting_response:number;responded:number;escalated:number;failed:number;completed_today:number;automatic:number;recovered_amount:number;response_rate:number};
export async function listFollowups(params:Record<string,unknown>={}){return(await api.get<{items:Followup[];stats:FollowupStats;pagination:{page:number;total:number;total_pages:number}}>('/followups',{params})).data}
export async function getFollowup(id:string){return(await api.get<{followup:Followup}>(`/followups/${id}`)).data.followup}
export async function createFollowup(payload:Record<string,unknown>){return(await api.post<{followup:Followup}>('/followups',payload)).data.followup}
export async function mutateFollowup(id:string,payload:Record<string,unknown>){return(await api.patch<{followup:Followup}>(`/followups/${id}`,payload)).data.followup}
export async function executeFollowup(id:string){return(await api.post(`/followups/${id}/execute`)).data}
export async function followupRules(){return(await api.get('/followups/rules')).data}
export async function saveFollowupRule(payload:Record<string,unknown>){return(await api.post('/followups/rules',payload)).data}
export async function saveFollowupSequence(payload:Record<string,unknown>){return(await api.post('/followups/sequences',payload)).data}
export async function detectFollowups(){return(await api.post('/followups/detect')).data}
export async function addFollowupNote(id:string,body:string){return(await api.post(`/followups/${id}/notes`,{body})).data}
export async function followupAnalytics(){return(await api.get('/followups/analytics')).data.analytics}
export async function recordPromise(id:string,due_at:string,note?:string){return(await api.post(`/followups/${id}/promise`,{due_at,note})).data}
export async function saveFollowupTemplate(payload:Record<string,unknown>){return(await api.post('/followups/templates',payload)).data}
export async function saveFollowupView(name:string,filters:Record<string,unknown>){return(await api.post('/followups/views',{name,filters})).data}
export async function bulkFollowups(ids:string[],action:string){return(await api.post('/followups/bulk',{ids,action})).data}
export async function updateFollowupSettings(payload:Record<string,unknown>){return(await api.patch('/followups/settings',payload)).data}

export type PilotFollowupStatus="DRAFT"|"CONFIRMED"|"QUEUED"|"COMPLETED"|"PARTIAL_FAILED"|"CANCELLED";
export type PilotFollowupBatch={
 id:string;title:string;message:string;status:PilotFollowupStatus;row_version:number;
 selected_client_ids:string[];selected_dossier_ids:string[];excluded_client_ids:string[];
 recipient_count:number;sent_count:number;failed_count:number;response_count:number;
 created_at:string;updated_at:string;confirmed_at?:string|null;queued_at?:string|null;
 recipients?:PilotFollowupRecipient[];events?:Array<Record<string,unknown>>;
};
export type PilotFollowupRecipient={id:string;client_id:string;dossier_id?:string|null;client_name_snapshot:string;client_reference_snapshot?:string|null;dossier_reference_snapshot?:string|null;phone_snapshot:string;rendered_message:string;delivery_status:string;error_message?:string|null};
export type PilotFollowupOption={id:string;display_name?:string;client_reference?:string;phone?:string;title?:string;reference?:string;client_count?:number;reachable_count?:number};
export type PilotFollowupPreview={recipient_count:number;skipped_count:number;recipients:Array<Record<string,string>>;skipped:Array<Record<string,string>>};
export type PilotSavedMessage={id:string;name:string;body:string};
export async function listPilotFollowups(params:Record<string,unknown>={}){return(await api.get<{items:PilotFollowupBatch[];stats:Record<string,number>;templates:PilotSavedMessage[]}>('/followups/pilot',{params})).data}
export async function pilotFollowupOptions(q?:string){return(await api.get<{clients:PilotFollowupOption[];dossiers:PilotFollowupOption[]}>('/followups/pilot/options',{params:{q:q||undefined}})).data}
export async function previewPilotFollowup(payload:{client_ids:string[];dossier_ids:string[];excluded_client_ids:string[]}){return(await api.post<PilotFollowupPreview>('/followups/pilot/preview',payload)).data}
export async function createPilotFollowup(payload:Record<string,unknown>){return(await api.post<{batch:PilotFollowupBatch}>('/followups/pilot/drafts',payload)).data.batch}
export async function confirmPilotFollowup(id:string,expected_version:number){return(await api.post<{batch:PilotFollowupBatch}>(`/followups/pilot/${id}/confirm`,{expected_version})).data.batch}
export async function sendPilotFollowup(id:string){return(await api.post<{result:{queued:number;failed:number}}>(`/followups/pilot/${id}/send`)).data.result}
export async function getPilotFollowup(id:string){return(await api.get<{batch:PilotFollowupBatch}>(`/followups/pilot/${id}`)).data.batch}
export async function savePilotFollowupMessage(name:string,body:string){return(await api.post<{message:PilotSavedMessage}>('/followups/pilot/saved-messages',{name,body})).data.message}
export async function suggestPilotFollowupMessage(purpose:string,current_message?:string){return(await api.post<{message:string;generated:boolean}>('/followups/pilot/suggest-message',{purpose,current_message})).data}
