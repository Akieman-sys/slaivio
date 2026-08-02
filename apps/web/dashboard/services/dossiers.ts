import { api } from "@/services/api";

export type DossierStatus =
  | "LEAD"
  | "DRAFT"
  | "QUOTED"
  | "WAITING_PACKAGES"
  | "IN_WAREHOUSE"
  | "READY_TO_SHIP"
  | "IN_TRANSIT"
  | "ARRIVED"
  | "CUSTOMS"
  | "READY_FOR_DELIVERY"
  | "DELIVERED"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED";

export type DossierCaseType = "UNKNOWN" | "IMPORT" | "EXPORT" | "PURCHASE" | "QUOTE" | "PERSONAL_EFFECTS" | "COMMERCIAL_CARGO";
export type DossierIntakeStatus = "PARTIAL" | "COMPLETE" | "WAITING_CLIENT" | "WAITING_PACKAGE";
export type DossierValidationStatus = "PENDING" | "VALIDATED" | "REJECTED" | "NEEDS_REVIEW";
export type DossierPaymentStatus = "PENDING" | "WAITING" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";

export type DossierRecord = {
  id: string;
  org_id: string;
  client_id: string;
  dossier_reference: string;
  client_name: string | null;
  client_phone?: string | null;
  client_whatsapp_phone?: string | null;
  client_email?: string | null;
  client_country?: string | null;
  client_city?: string | null;
  case_type: DossierCaseType;
  status_global: DossierStatus;
  intake_status: DossierIntakeStatus;
  validation_status: DossierValidationStatus;
  primary_channel: string | null;
  origin_country: string | null;
  origin_city: string | null;
  destination_country: string | null;
  destination_city: string | null;
  goods_type: string | null;
  estimated_weight_kg: number | null;
  estimated_volume_cbm: number | null;
  shipping_mode: string | null;
  tracking_id: string | null;
  quoted_total: number | null;
  quoted_currency: string | null;
  pricing_status: string | null;
  final_total: number | null;
  final_currency: string | null;
  payment_status: DossierPaymentStatus;
  client_full_name: string | null;
  supplier_payment_amount: number | null;
  supplier_payment_currency: string | null;
  message_count: number;
  event_count: number;
  shipment_count: number;
  created_at: string;
  updated_at: string | null;
  row_version: number;
  messages?: DossierMessage[];
  events?: DossierEvent[];
  notifications?: DossierNotification[];
  shipments?: DossierShipment[];
};

export type DossierStats = {
  total: number;
  active: number;
  leads: number;
  quoted: number;
  waiting_packages: number;
  in_transit: number;
  delivered: number;
  payment_pending: number;
  total_value: number;
};

export type DossierPayload = Partial<Omit<DossierRecord, "id" | "org_id" | "dossier_reference" | "message_count" | "event_count" | "shipment_count" | "created_at" | "updated_at" | "messages" | "events" | "notifications" | "shipments">> & {
  client_id: string;
  row_version?: number;
};

export type DossierTimelineEvent = {
  id: string;
  type: string;
  title: string;
  description: string;
  occurred_at: string;
  metadata: Record<string, unknown>;
};

export type DossierMessage = {
  id: string;
  sender_phone: string | null;
  message_text: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
};

export type DossierEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type DossierNotification = {
  id: string;
  channel: string | null;
  recipient_phone: string | null;
  notification_type: string | null;
  message: string | null;
  status: string | null;
  provider: string | null;
  created_at: string;
  sent_at: string | null;
  failed_at: string | null;
  error_message: string | null;
};

export type DossierShipment = {
  id: string;
  tracking_id: string | null;
  status: string | null;
  origin_country: string | null;
  origin_city: string | null;
  destination_country: string | null;
  destination_city: string | null;
  total_weight_kg: number | null;
  total_volume_cbm: number | null;
  created_at: string;
  updated_at: string | null;
};

export type DossiersResponse = {
  status: "ok";
  items: DossierRecord[];
  dossiers: DossierRecord[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

export async function listDossiers(params: {
  q?: string;
  status_global?: DossierStatus | "";
  case_type?: DossierCaseType | "";
  intake_status?: DossierIntakeStatus | "";
  validation_status?: DossierValidationStatus | "";
  payment_status?: DossierPaymentStatus | "";
  client_id?: string;
  page?: number;
  page_size?: number;
  sort?: string;
} = {}) {
  return (await api.get<DossiersResponse>("/dossiers", { params })).data;
}

export async function getDossier(id: string) {
  return (await api.get<{ status: "ok"; dossier: DossierRecord }>(`/dossiers/${id}`)).data.dossier;
}

export async function createDossier(payload: DossierPayload) {
  return (await api.post<{ status: "ok"; dossier: DossierRecord }>("/dossiers", payload)).data.dossier;
}

export async function updateDossier(id: string, payload: Partial<DossierPayload>) {
  return (await api.patch<{ status: "ok"; dossier: DossierRecord }>(`/dossiers/${id}`, payload)).data.dossier;
}

export async function getDossierStats() {
  return (await api.get<{ status: "ok"; stats: DossierStats }>("/dossiers/stats")).data.stats;
}

export async function getDossierTimeline(id: string) {
  return (await api.get<{ status: "ok"; items: DossierTimelineEvent[] }>(`/dossiers/${id}/timeline`)).data.items;
}

export async function exportDossiers(params: {
  q?: string;
  status_global?: DossierStatus | "";
  case_type?: DossierCaseType | "";
  intake_status?: DossierIntakeStatus | "";
  validation_status?: DossierValidationStatus | "";
  payment_status?: DossierPaymentStatus | "";
  sort?: string;
} = {}) {
  return (
    await api.get<Blob>("/dossiers/export", {
      params,
      responseType: "blob",
    })
  ).data;
}
