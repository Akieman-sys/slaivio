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
export type DossierPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

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
  priority: DossierPriority;
  assigned_to: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  due_at: string | null;
  message_count: number;
  event_count: number;
  shipment_count: number;
  created_at: string;
  updated_at: string | null;
  row_version: number;
  archived_at: string | null;
  archived_by: string | null;
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

export type DossierDocument = {
  id: string; document_type: string; file_name: string; mime_type: string;
  size_bytes: number; checksum_sha256: string; verification_status: string;
  notes: string | null; uploaded_by: string; created_at: string;
};

export type DossierChecklistItem = {
  id: string; code: string; label: string; required: boolean;
  status: "PENDING" | "COMPLETED" | "NOT_APPLICABLE";
  completed_at: string | null; completed_by: string | null; row_version: number;
};

export type DossierMember = { user_id: string; role_code: string; display_name: string; email: string | null };
export type DossierInternalNote = {
  id: string; body: string; author_id: string; edited_at: string | null;
  row_version: number; created_at: string; updated_at: string;
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

export async function listArchivedDossiers(params: { q?: string; page?: number; page_size?: number } = {}) {
  return (await api.get<DossiersResponse>("/dossiers/archived", { params })).data;
}

export async function archiveDossier(id: string, rowVersion: number) {
  await api.delete(`/dossiers/${id}`, { params: { row_version: rowVersion } });
}

export async function restoreDossier(id: string, rowVersion: number) {
  return (await api.post<{ status: "ok"; dossier: DossierRecord }>(
    `/dossiers/${id}/restore`, null, { params: { row_version: rowVersion } },
  )).data.dossier;
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

export async function listDossierDocuments(id: string) {
  return (await api.get<{ items: DossierDocument[] }>(`/dossiers/${id}/documents`)).data.items;
}

export async function uploadDossierDocument(id: string, file: File, documentType: string, notes?: string) {
  const form = new FormData();
  form.append("file", file); form.append("document_type", documentType);
  if (notes) form.append("notes", notes);
  return (await api.post(`/dossiers/${id}/documents`, form)).data.document as DossierDocument;
}

export async function downloadDossierDocument(id: string, documentId: string) {
  return (await api.get<{ url: string }>(`/dossiers/${id}/documents/${documentId}/download`)).data.url;
}

export async function listDossierChecklist(id: string) {
  return (await api.get<{ items: DossierChecklistItem[] }>(`/dossiers/${id}/checklist`)).data.items;
}

export async function updateDossierChecklistItem(id: string, item: DossierChecklistItem, status: DossierChecklistItem["status"]) {
  return (await api.patch(`/dossiers/${id}/checklist/${item.id}`, { status, row_version: item.row_version })).data.item as DossierChecklistItem;
}

export async function listDossierMembers() {
  return (await api.get<{ items: DossierMember[] }>("/dossiers/collaboration/members")).data.items;
}

export async function updateDossierCollaboration(id: string, payload: { row_version: number; priority: DossierPriority; assigned_to: string | null; due_at: string | null }) {
  return (await api.patch<{ dossier: DossierRecord }>(`/dossiers/${id}/collaboration`, payload)).data.dossier;
}

export async function listDossierNotes(id: string) {
  return (await api.get<{ items: DossierInternalNote[] }>(`/dossiers/${id}/notes`)).data.items;
}

export async function createDossierNote(id: string, body: string) {
  return (await api.post<{ note: DossierInternalNote }>(`/dossiers/${id}/notes`, { body })).data.note;
}

export async function updateDossierNote(id: string, note: DossierInternalNote, body: string) {
  return (await api.patch<{ note: DossierInternalNote }>(`/dossiers/${id}/notes/${note.id}`, { body, row_version: note.row_version })).data.note;
}

export async function deleteDossierNote(id: string, note: DossierInternalNote) {
  await api.delete(`/dossiers/${id}/notes/${note.id}`, { params: { row_version: note.row_version } });
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
