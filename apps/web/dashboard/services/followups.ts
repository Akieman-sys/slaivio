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
