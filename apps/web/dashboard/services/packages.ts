import { api } from "@/services/api";

export type PackageStatus =
  | "CREATED"
  | "RECEIVED_AT_ORIGIN"
  | "WAREHOUSE_PROCESSING"
  | "READY_FOR_DISPATCH"
  | "IN_TRANSIT"
  | "CUSTOMS"
  | "ARRIVED_DESTINATION"
  | "READY_FOR_PICKUP"
  | "DELIVERED"
  | "BLOCKED"
  | "ISSUE"
  | "CANCELLED";

export type PackageCondition = "UNKNOWN" | "GOOD" | "DAMAGED" | "FRAGILE" | "MISSING_INFO" | "REPACK_REQUIRED";
export type InventoryStatus = "NOT_STORED" | "IN_STOCK" | "RESERVED" | "GROUPED" | "DISPATCHED" | "RELEASED";
export type PackageValidationStatus = "PENDING" | "VALIDATED" | "NEEDS_REVIEW" | "BLOCKED" | "REJECTED";
export type PaymentStatus = "UNKNOWN" | "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "BLOCKED" | "CLEARED";
export type PaymentClearanceStatus = PaymentStatus;
export type PackageType = "carton" | "sac" | "caisse" | "palette" | "document" | "lot" | "other";
export type PackageSource = "manual" | "whatsapp" | "import" | "warehouse" | "api" | "legacy";
export type AnomalySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AnomalyStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
export type NotificationChannel = "whatsapp" | "email" | "sms" | "internal";

export type PackageRecord = {
  id: string;
  org_id: string;
  client_id: string | null;
  dossier_id: string | null;
  shipment_id: string | null;
  package_reference: string | null;
  tracking_id: string | null;
  source: PackageSource;
  package_type: PackageType;
  description: string | null;
  category: string | null;
  status: PackageStatus;
  validation_status: PackageValidationStatus;
  payment_status: PaymentStatus;
  payment_clearance_status: PaymentClearanceStatus;
  package_condition: PackageCondition;
  inventory_status: InventoryStatus;
  warehouse_id: string | null;
  warehouse_name: string | null;
  warehouse_zone: string | null;
  warehouse_rack: string | null;
  warehouse_location: string | null;
  origin_country: string | null;
  origin_city: string | null;
  destination_country: string | null;
  destination_city: string | null;
  service_type: string | null;
  shipping_mode: string | null;
  shipment_reference: string | null;
  shipment_batch_id: string | null;
  manifest_id: string | null;
  public_tracking_enabled: boolean | null;
  eta_at: string | null;
  received_at: string | null;
  received_at_origin_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  weight_kg: number | null;
  volumetric_weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  volume_cbm: number | null;
  pieces_count: number;
  declared_value: number | null;
  declared_currency: string | null;
  is_fragile: boolean;
  notes: string | null;
  fees_total: number | null;
  fees_paid: number | null;
  currency: string | null;
  barcode: string | null;
  qr_code_value: string | null;
  last_scan_location: string | null;
  last_scan_at: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  dossier_reference: string | null;
  dossier_case_type: string | null;
  dossier_status: string | null;
  receipt_count: number;
  media_count: number;
  event_count: number;
  anomaly_count: number;
  open_anomaly_count: number;
  notification_count: number;
  created_at: string;
  updated_at: string | null;
  media?: PackageMedia[];
  events?: PackageLifecycleEvent[];
  anomalies?: PackageAnomaly[];
  notifications?: PackageNotification[];
};

export type PackageMedia = {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  uploaded_by_name: string | null;
  created_at: string;
};

export type PackageAnomaly = {
  id: string;
  anomaly_type: string;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  title: string;
  description: string | null;
  resolution_notes: string | null;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PackageNotification = {
  id: string;
  channel: NotificationChannel;
  notification_type: string;
  recipient: string | null;
  message: string;
  status: string;
  provider: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  created_at: string;
};

export type PackageLifecycleEvent = {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  previous_status: string | null;
  new_status: string | null;
  metadata: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

export type PackageTimelineEvent = {
  id: string;
  type: string;
  title: string;
  description: string;
  occurred_at: string;
  metadata: Record<string, unknown>;
};

export type PackageStats = {
  total: number;
  received: number;
  in_stock: number;
  in_transit: number;
  issues: number;
  delivered: number;
  total_weight_kg: number;
  total_volume_cbm: number;
  total_pieces?: number;
};

export type PackagePayload = {
  dossier_id: string;
  package_reference?: string | null;
  tracking_id?: string | null;
  source?: PackageSource;
  package_type?: PackageType;
  description?: string | null;
  category?: string | null;
  status?: PackageStatus;
  validation_status?: PackageValidationStatus;
  payment_status?: PaymentStatus;
  payment_clearance_status?: PaymentClearanceStatus;
  package_condition?: PackageCondition;
  inventory_status?: InventoryStatus;
  warehouse_name?: string | null;
  warehouse_zone?: string | null;
  warehouse_rack?: string | null;
  warehouse_location?: string | null;
  origin_country?: string | null;
  origin_city?: string | null;
  destination_country?: string | null;
  destination_city?: string | null;
  service_type?: string | null;
  shipping_mode?: string | null;
  shipment_reference?: string | null;
  public_tracking_enabled?: boolean;
  eta_at?: string | null;
  received_at?: string | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  weight_kg?: number | null;
  volumetric_weight_kg?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  volume_cbm?: number | null;
  pieces_count?: number | null;
  declared_value?: number | null;
  declared_currency?: string | null;
  is_fragile?: boolean;
  notes?: string | null;
  fees_total?: number | null;
  fees_paid?: number | null;
  currency?: string | null;
  barcode?: string | null;
  qr_code_value?: string | null;
  last_scan_location?: string | null;
};

export type PackagesResponse = {
  status: "ok";
  items: PackageRecord[];
  packages: PackageRecord[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

export async function listPackages(params: {
  q?: string;
  status?: PackageStatus | "";
  condition?: PackageCondition | "";
  inventory_status?: InventoryStatus | "";
  payment_clearance_status?: PaymentClearanceStatus | "";
  payment_status?: PaymentStatus | "";
  validation_status?: PackageValidationStatus | "";
  package_type?: PackageType | "";
  source?: PackageSource | "";
  dossier_id?: string;
  client_id?: string;
  page?: number;
  page_size?: number;
  sort?: string;
} = {}) {
  return (await api.get<PackagesResponse>("/packages", { params })).data;
}

export async function getPackage(id: string) {
  return (await api.get<{ status: "ok"; package: PackageRecord }>(`/packages/${id}`)).data.package;
}

export async function createPackage(payload: PackagePayload) {
  return (await api.post<{ status: "ok"; package: PackageRecord }>("/packages", payload)).data.package;
}

export async function updatePackage(id: string, payload: Partial<PackagePayload>) {
  return (await api.patch<{ status: "ok"; package: PackageRecord }>(`/packages/${id}`, payload)).data.package;
}

export async function getPackageStats() {
  return (await api.get<{ status: "ok"; stats: PackageStats }>("/packages/stats")).data.stats;
}

export async function getPackageTimeline(id: string) {
  return (await api.get<{ status: "ok"; items: PackageTimelineEvent[] }>(`/packages/${id}/timeline`)).data.items;
}

export async function exportPackages(params: {
  q?: string;
  status?: PackageStatus | "";
  condition?: PackageCondition | "";
  inventory_status?: InventoryStatus | "";
  payment_clearance_status?: PaymentClearanceStatus | "";
  payment_status?: PaymentStatus | "";
  validation_status?: PackageValidationStatus | "";
  package_type?: PackageType | "";
  source?: PackageSource | "";
  sort?: string;
} = {}) {
  return (
    await api.get<Blob>("/packages/export", {
      params,
      responseType: "blob",
    })
  ).data;
}

export async function importPackages(file: File) {
  const form = new FormData();
  form.append("file", file);
  return (await api.post<{ status: "ok"; result: { created: number; skipped: number; errors: Array<{ line: number; error: string }> } }>("/packages/import", form)).data.result;
}

export async function addPackageMedia(id: string, payload: { media_url: string; media_type?: string; caption?: string | null }) {
  return (await api.post<{ status: "ok"; package: PackageRecord }>(`/packages/${id}/media`, payload)).data.package;
}

export async function createPackageAnomaly(id: string, payload: { anomaly_type?: string; severity?: AnomalySeverity; title: string; description?: string | null }) {
  return (await api.post<{ status: "ok"; package: PackageRecord }>(`/packages/${id}/anomalies`, payload)).data.package;
}

export async function resolvePackageAnomaly(id: string, anomalyId: string, notes?: string | null) {
  return (await api.patch<{ status: "ok"; package: PackageRecord }>(`/packages/${id}/anomalies/${anomalyId}/resolve`, { notes })).data.package;
}

export async function createPackageNotification(id: string, payload: { channel?: NotificationChannel; notification_type?: string; recipient?: string | null; message: string }) {
  return (await api.post<{ status: "ok"; package: PackageRecord }>(`/packages/${id}/notifications`, payload)).data.package;
}
