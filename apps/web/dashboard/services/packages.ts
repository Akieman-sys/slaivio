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
export type PaymentClearanceStatus = "UNKNOWN" | "PENDING" | "PARTIAL" | "CLEARED" | "BLOCKED";

export type PackageRecord = {
  id: string;
  org_id: string;
  client_id: string | null;
  dossier_id: string | null;
  package_reference: string | null;
  tracking_id: string | null;
  status: PackageStatus;
  package_condition: PackageCondition;
  inventory_status: InventoryStatus;
  payment_clearance_status: PaymentClearanceStatus;
  current_warehouse_id: string | null;
  storage_location_id: string | null;
  last_scan_location: string | null;
  last_scan_at: string | null;
  barcode: string | null;
  qr_code_value: string | null;
  public_tracking_enabled: boolean | null;
  eta_at: string | null;
  received_at_origin_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  origin_country: string | null;
  origin_city: string | null;
  destination_country: string | null;
  destination_city: string | null;
  goods_type: string | null;
  weight_kg: number | null;
  volume_cbm: number | null;
  shipping_mode: string | null;
  fees_total: number | null;
  fees_paid: number | null;
  currency: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  dossier_reference: string | null;
  dossier_case_type: string | null;
  dossier_status: string | null;
  receipt_count: number;
  media_count: number;
  event_count: number;
  created_at: string;
  updated_at: string | null;
  receipts?: WarehouseReceipt[];
  media?: PackageMedia[];
  events?: PackageLifecycleEvent[];
};

export type WarehouseReceipt = {
  id: string;
  receipt_code: string | null;
  warehouse_id: string | null;
  received_by_name: string | null;
  supplier_name: string | null;
  supplier_phone: string | null;
  package_label: string | null;
  package_condition: PackageCondition | string | null;
  measured_weight_kg: number | null;
  measured_volume_cbm: number | null;
  notes: string | null;
  received_at: string | null;
  created_at: string;
};

export type PackageMedia = {
  id: string;
  media_url: string | null;
  media_type: string | null;
  caption: string | null;
  uploaded_by_name: string | null;
  created_at: string;
};

export type PackageLifecycleEvent = {
  id: string;
  previous_status: string | null;
  new_status: string | null;
  event_type: string | null;
  event_source: string | null;
  event_message: string | null;
  metadata: Record<string, unknown> | null;
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
};

export type PackagePayload = {
  dossier_id: string;
  tracking_id?: string | null;
  status?: PackageStatus;
  package_condition?: PackageCondition;
  inventory_status?: InventoryStatus;
  payment_clearance_status?: PaymentClearanceStatus;
  origin_country?: string | null;
  origin_city?: string | null;
  destination_country?: string | null;
  destination_city?: string | null;
  goods_type?: string | null;
  weight_kg?: number | null;
  volume_cbm?: number | null;
  actual_weight_kg?: number | null;
  actual_volume_cbm?: number | null;
  shipping_mode?: string | null;
  fees_total?: number | null;
  fees_paid?: number | null;
  currency?: string | null;
  barcode?: string | null;
  qr_code_value?: string | null;
  public_tracking_enabled?: boolean;
  eta_at?: string | null;
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
  sort?: string;
} = {}) {
  return (
    await api.get<Blob>("/packages/export", {
      params,
      responseType: "blob",
    })
  ).data;
}
