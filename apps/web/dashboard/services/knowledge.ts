import { api } from "@/services/api";

export type KnowledgeStatus="DRAFT"|"PENDING_REVIEW"|"APPROVED"|"PUBLISHED"|"NEEDS_REVIEW"|"EXPIRED"|"ARCHIVED";
export type KnowledgeEntry={id:string;reference:string;title:string;knowledge_type:string;category:string;content:string;structured_data:Record<string,unknown>;question_variants:string[];tags:string[];language:string;audiences:string[];ai_scope:string;source_type:string;source_entity_type?:string;source_entity_id?:string;status:KnowledgeStatus;confidence:number;sensitive:boolean;effective_at?:string;expires_at?:string;review_due_at?:string;review_interval_days?:number;owner_name?:string;workspace_id?:string;version:number;translation_status?:string;translated_from_id?:string;updated_by_name?:string;updated_at:string;usage_count?:number;versions?:Array<{id:string;version:number;change_reason?:string;created_by_name?:string;created_at:string}>;relations?:Array<{id:string;entity_type:string;entity_id:string;relation_type:string}>;audit?:Array<Record<string,unknown>>};
export type KnowledgeStats={active:number;documents:number;faq:number;procedures:number;rules:number;needs_review:number;expired:number;ai_enabled:number;unpublished:number;ownerless:number;conflicts:number;unanswered:number;health:number};
export type KnowledgeFile={id:string;file_name:string;mime_type:string;size_bytes:number;scan_status:string;extraction_status:string;import_status:string;prompt_injection_detected:boolean;extracted_text?:string;confidence?:number;created_at:string};
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
export async function translateKnowledge(id:string,target_language:string){return(await api.post<KnowledgeEntry>(`/knowledge/${id}/translate`,{target_language})).data}
export async function embedKnowledge(id:string){return(await api.post<{embedded:number}>(`/knowledge/${id}/embed`)).data}
export async function getKnowledgeConflicts(){return(await api.get<{items:Array<Record<string,unknown>>}>("/knowledge/conflicts/all")).data.items}
export async function detectKnowledgeConflicts(){return(await api.post("/knowledge/conflicts/detect")).data}
export async function resolveKnowledgeConflict(id:string,resolution:string){return(await api.post(`/knowledge/conflicts/${id}/resolve`,{resolution,status:"RESOLVED"})).data}
export async function getKnowledgeSuggestions(){return(await api.get<{items:Array<Record<string,unknown>>}>("/knowledge/suggestions")).data.items}
export async function generateKnowledgeSuggestions(){return(await api.post("/knowledge/suggestions/generate")).data}
export async function getKnowledgeConnectors(){return(await api.get<{items:Array<Record<string,unknown>>}>("/knowledge/connectors")).data.items}
export async function createKnowledgeConnector(body:Record<string,unknown>){return(await api.post("/knowledge/connectors",body)).data}
export async function syncKnowledgeConnector(id:string){return(await api.post(`/knowledge/connectors/${id}/sync`)).data}
export async function getKnowledgeSettings(){return(await api.get<Record<string,unknown>>("/knowledge/settings")).data}
export async function updateKnowledgeSettings(body:Record<string,unknown>){return(await api.patch("/knowledge/settings",body)).data}
export async function importKnowledgeFile(id:string,body:Record<string,unknown>){return(await api.post<KnowledgeEntry>(`/knowledge/files/${id}/import`,body)).data}
export async function restoreKnowledgeVersion(id:string,version:number){return(await api.post<KnowledgeEntry>(`/knowledge/${id}/versions/${version}/restore`)).data}
export async function addKnowledgeRelation(id:string,body:Record<string,unknown>){return(await api.post(`/knowledge/${id}/relations`,body)).data}
export async function removeKnowledgeRelation(id:string,relationId:string){return(await api.delete(`/knowledge/${id}/relations/${relationId}`)).data}
export async function listKnowledgeViews(){return(await api.get<{items:Array<{id:string;name:string;filters:Record<string,unknown>}>}>("/knowledge/views")).data.items}
export async function saveKnowledgeView(name:string,filters:Record<string,unknown>){return(await api.post("/knowledge/views",{name,filters})).data}
export async function deleteKnowledgeView(id:string){return(await api.delete(`/knowledge/views/${id}`)).data}
export async function updateKnowledgeSuggestion(id:string,status:string,knowledge_id?:string){return(await api.patch(`/knowledge/suggestions/${id}`,{status,knowledge_id})).data}
export async function deleteKnowledgeConnector(id:string){return(await api.delete(`/knowledge/connectors/${id}`)).data}
export async function getKnowledgeLiveCatalog(){return(await api.get<Record<string,Array<Record<string,unknown>>>>("/knowledge/live/catalog")).data}
export async function submitKnowledgeFeedback(response_log_id:string,rating:string,comment?:string){return(await api.post("/knowledge/feedback",{response_log_id,rating,comment})).data}
