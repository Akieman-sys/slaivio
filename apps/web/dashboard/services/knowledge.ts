import { api } from "@/services/api";

export type KnowledgeStatus="DRAFT"|"PENDING_REVIEW"|"APPROVED"|"PUBLISHED"|"NEEDS_REVIEW"|"EXPIRED"|"ARCHIVED";
export type KnowledgeEntry={id:string;reference:string;title:string;knowledge_type:string;category:string;content:string;structured_data:Record<string,unknown>;question_variants:string[];tags:string[];language:string;audiences:string[];ai_scope:string;source_type:string;source_entity_type?:string;source_entity_id?:string;status:KnowledgeStatus;confidence:number;sensitive:boolean;effective_at?:string;expires_at?:string;review_due_at?:string;owner_name?:string;workspace_id?:string;version:number;updated_by_name?:string;updated_at:string;usage_count?:number;versions?:Array<{id:string;version:number;change_reason?:string;created_by_name?:string;created_at:string}>;audit?:Array<Record<string,unknown>>};
export type KnowledgeStats={active:number;documents:number;faq:number;procedures:number;rules:number;needs_review:number;expired:number;ai_enabled:number;unpublished:number;ownerless:number;conflicts:number;unanswered:number;health:number};
export type KnowledgeFile={id:string;file_name:string;mime_type:string;size_bytes:number;scan_status:string;extraction_status:string;import_status:string;prompt_injection_detected:boolean;created_at:string};
export async function listKnowledge(params:Record<string,string|number|boolean|undefined>={}){return(await api.get<{items:KnowledgeEntry[];total:number}>("/knowledge",{params})).data}
export async function knowledgeStats(){return(await api.get<KnowledgeStats>("/knowledge/stats")).data}
export async function knowledgeDetail(id:string){return(await api.get<KnowledgeEntry>(`/knowledge/${id}`)).data}
export async function createKnowledge(body:Record<string,unknown>){return(await api.post<KnowledgeEntry>("/knowledge",body)).data}
export async function updateKnowledge(id:string,body:Record<string,unknown>){return(await api.patch<KnowledgeEntry>(`/knowledge/${id}`,body)).data}
export async function knowledgeAction(id:string,action:string,reason?:string){return(await api.post<KnowledgeEntry>(`/knowledge/${id}/${action}`,{reason})).data}
export async function uploadKnowledgeFile(file:File){const form=new FormData();form.append("file",file);return(await api.post<KnowledgeFile>("/knowledge/files",form)).data}
export async function listKnowledgeFiles(){return(await api.get<{items:KnowledgeFile[]}>("/knowledge/files")).data.items}
export async function testKnowledge(question:string,channel="PLAYGROUND",language="FR"){return(await api.post<{decision:string;answer:string;sources:Array<{id:string;reference:string;title:string;source_type:string;updated_at:string}>;log_id:string}>("/knowledge/playground",{question,channel,language})).data}
export async function knowledgeAnalytics(){return(await api.get<{stats:KnowledgeStats;decisions:Array<{decision:string;count:number}>;top:Array<{id:string;title:string;usage_count:number}>;unanswered:Array<{question:string;occurrences:number}>}>("/knowledge/analytics")).data}
