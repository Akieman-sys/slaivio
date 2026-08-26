import { api } from "@/services/api";

export type InboxView = "waiting" | "open" | "closed";
export type InboxConversation = {
  phone: string;
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
};

export type InboxDetail = {
  phone: string;
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

export async function sendInboxReply(phone: string, message: string) {
  return (await api.post<{ status: "ok" | "failed"; message?: InboxMessage; error?: string }>(`/inbox/conversations/${encodeURIComponent(phone)}/reply`, { message, idempotency_key: crypto.randomUUID() })).data;
}
