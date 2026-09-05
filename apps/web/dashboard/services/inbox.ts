import { api } from "@/services/api";

export type InboxView = "all" | "groups" | "private" | "unread" | "attention" | "ai";
export type InboxAIMode = "SUGGESTION_ONLY" | "CONTROLLED_AUTO" | "PAUSED";
export type InboxAISettings = {
  enabled: boolean;
  pilot_response_mode: InboxAIMode;
  auto_reply_min_confidence: number;
  pilot_require_published_knowledge: boolean;
  updated_at: string;
};
export type InboxAISuggestion = {
  status: "ok";
  mode: InboxAIMode;
  response_text: string;
  confidence: number;
  risk_level: "SAFE" | "REVIEW" | "SENSITIVE";
  reason: string;
  eligible_for_auto: boolean;
  draft: { id: string; draft_text: string };
  sources: Array<{ id: string; title: string; updated_at?: string | null }>;
};
export type StoredInboxAIDraft = {
  id: string;
  source_message_id?: string | null;
  draft_text: string;
  status: "DRAFT" | "USED";
  intent?: string | null;
  decision?: string | null;
  confidence?: number | null;
  risk_level: "SAFE" | "REVIEW" | "SENSITIVE";
  review_reason?: string | null;
  source_ids: string[];
  source_titles: string[];
  created_at: string;
};
export type InboxConversation = {
  phone: string;
  is_group: boolean;
  conversation_name?: string | null;
  participant_count: number;
  last_sender_phone?: string | null;
  last_sender_name?: string | null;
  last_message_at: string;
  last_inbound_at?: string | null;
  last_message?: string | null;
  last_direction: "inbound" | "outbound";
  message_count: number;
  conversation_status: "OPEN" | "CLOSED";
  unread_count: number;
  requires_attention: boolean;
  waiting_since?: string | null;
  row_version?: number | null;
  client_id?: string | null;
  client_reference?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  dossier_id?: string | null;
  dossier_reference?: string | null;
  dossier_title?: string | null;
  can_reply: boolean;
  ai_mode_override?: "CONTROLLED_AUTO" | "PAUSED" | null;
  effective_ai_mode: InboxAIMode;
};

export type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound";
  text_body?: string | null;
  message_type?: string | null;
  send_status?: string | null;
  error_message?: string | null;
  provider_message_id?: string | null;
  created_at: string;
  received_at?: string | null;
  sender_phone?: string | null;
  sender_name?: string | null;
  sender_jid?: string | null;
  conversation_jid?: string | null;
  is_group?: boolean;
  media_url?: string | null;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  media_size_bytes?: number | null;
};

export type InboxClient = {
  id: string;
  client_reference: string;
  display_name?: string | null;
  phone?: string | null;
  email?: string | null;
  customer_type?: string | null;
};

export type InboxDossier = {
  id: string;
  dossier_reference: string;
  title?: string | null;
  last_updated_at: string;
  selected: boolean;
};

export type InboxAssignment = {
  client_id?: string | null;
  dossier_id?: string | null;
  status: "OPEN" | "CLOSED";
  unread_count: number;
  requires_attention: boolean;
  row_version: number;
  ai_mode_override?: "CONTROLLED_AUTO" | "PAUSED" | null;
};

export type InboxDetail = {
  phone: string;
  is_group: boolean;
  conversation_name?: string | null;
  participant_count: number;
  last_sender_phone?: string | null;
  last_sender_name?: string | null;
  client?: InboxClient | null;
  assignment?: InboxAssignment | null;
  dossiers: InboxDossier[];
  messages: InboxMessage[];
  has_older_messages: boolean;
};

export async function listInboxConversations(params: { view: InboxView; q?: string; page?: number }) {
  return (await api.get<{ conversations: InboxConversation[]; pagination: { page: number; page_size: number; total: number } }>("/inbox/conversations", { params })).data;
}

export async function getInboxConversation(phone: string, before?: string) {
  return (await api.get<InboxDetail>(`/inbox/conversations/${encodeURIComponent(phone)}/messages`, { params: { before } })).data;
}

export async function markInboxConversationRead(phone: string) {
  return (await api.post(`/inbox/conversations/${encodeURIComponent(phone)}/read`)).data;
}

export async function updateInboxContext(phone: string, payload: { client_id: string; dossier_id?: string | null; expected_version?: number | null }) {
  return (await api.patch(`/inbox/conversations/${encodeURIComponent(phone)}/context`, payload)).data;
}

export async function updateInboxState(phone: string, payload: { status: "OPEN" | "CLOSED"; requires_attention: boolean }) {
  return (await api.patch(`/inbox/conversations/${encodeURIComponent(phone)}/state`, payload)).data;
}

export async function updateInboxConversationAIMode(phone: string, mode: "INHERIT" | "CONTROLLED_AUTO" | "PAUSED") {
  return (await api.patch(`/inbox/conversations/${encodeURIComponent(phone)}/ai-mode`, { mode })).data;
}

export async function sendInboxReply(phone: string, message: string, draftId?: string) {
  return (await api.post<{ status: "ok" | "failed"; message?: InboxMessage; error?: string }>(`/inbox/conversations/${encodeURIComponent(phone)}/reply`, { message, draft_id: draftId, idempotency_key: crypto.randomUUID() })).data;
}

export async function getInboxAISettings() {
  return (await api.get<{ settings: InboxAISettings }>("/inbox/ai/settings")).data.settings;
}

export async function updateInboxAIMode(mode: InboxAIMode) {
  return (await api.patch<{ settings: InboxAISettings }>("/inbox/ai/settings", { mode })).data.settings;
}

export async function generateInboxAISuggestion(phone: string) {
  return (await api.post<InboxAISuggestion>(`/inbox/conversations/${encodeURIComponent(phone)}/ai-draft`, {})).data;
}

export async function listInboxAIDrafts(phone: string) {
  return (await api.get<{ drafts: StoredInboxAIDraft[] }>(`/inbox/conversations/${encodeURIComponent(phone)}/ai-drafts`)).data.drafts;
}

export async function summarizeInboxConversation(phone: string) {
  return (await api.post<{ status: "ok"; summary: string }>(`/inbox/conversations/${encodeURIComponent(phone)}/ai-summary`, {})).data;
}
