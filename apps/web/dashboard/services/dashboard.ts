import { api } from "@/services/api";

export type HomeResource = {
  key: string;
  name: string;
  description: string;
  href: string;
  tone: string;
  is_starred: boolean;
  last_opened_at?: string | null;
  count: number | null;
  label: string;
  state: "ready" | "empty" | "unavailable";
};

export type HomeNotification = {
  id: string;
  title: string;
  message: string;
  event_type: string;
  priority: string;
  is_read: boolean;
  created_at: string;
};

export type DashboardHome = {
  status: "ok" | "no_workspace";
  workspace: { org_id?: string | null; name: string; country?: string | null; city?: string | null };
  manager: { name: string; email: string; initials: string };
  resources: HomeResource[];
  attention_items: HomeAttentionItem[];
  notifications: HomeNotification[];
  unread_count: number;
  whatsapp: { configured: boolean; status: string; phone?: string | null };
  pilot: PilotHome;
};

export type PilotHomeStats = {
  active_dossiers: number;
  active_clients: number;
  attention_dossiers: number;
  attention_clients: number;
  waiting_conversations: number;
  pending_followups: number;
};

export type PilotDossierSummary = {
  id: string;
  title: string;
  reference: string;
  client_count?: number;
  attention_clients?: number;
  reason?: string | null;
  updated_at: string;
  href: string;
};

export type PilotClientSummary = {
  id: string;
  client_reference: string;
  name: string;
  dossier_title: string;
  dossier_reference?: string | null;
  created_at: string;
  href: string;
};

export type PilotActivity = {
  id: string;
  kind: string;
  label: string;
  detail: string;
  occurred_at: string;
  href: string;
};

export type PilotHome = {
  stats: PilotHomeStats;
  attention_dossiers: PilotDossierSummary[];
  recent_dossiers: PilotDossierSummary[];
  recent_clients: PilotClientSummary[];
  recent_activity: PilotActivity[];
};

export type HomeAttentionItem = {
  id: string;
  kind: "dossier" | "shipment" | "followup" | "payment";
  title: string;
  message: string;
  status: string;
  priority: "HIGH" | "NORMAL";
  created_at: string;
  href: string;
};

export type HomeSearchResult = {
  kind: "client" | "shipment" | "dossier";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export async function getDashboardHome(token?: string | null) {
  return (await api.get<DashboardHome>("/dashboard/home", token ? {
    headers: { Authorization: `Bearer ${token}` },
  } : undefined)).data;
}

export async function updateHomeResource(key: string, body: { is_starred?: boolean; opened?: boolean }) {
  return (await api.patch(`/dashboard/home/resources/${key}`, body)).data;
}

export async function searchDashboardHome(query: string, signal?: AbortSignal) {
  return (await api.get<{ results: HomeSearchResult[] }>("/dashboard/home/search", { params: { q: query }, signal })).data.results;
}

export async function markHomeNotificationRead(id: string) {
  return (await api.patch(`/manager/events/${id}/read`)).data;
}

export async function markAllHomeNotificationsRead() {
  return (await api.patch("/dashboard/home/notifications/read-all")).data;
}
