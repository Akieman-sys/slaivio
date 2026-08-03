import { api } from "@/services/api";

export type ExpeditionStatus =
  | "DRAFT"
  | "PREPARING"
  | "LOADING"
  | "READY_FOR_DEPARTURE"
  | "DISPATCHED"
  | "IN_TRANSIT"
  | "ARRIVED_DESTINATION"
  | "CUSTOMS_CLEARANCE"
  | "AVAILABLE_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "BLOCKED"
  | "CANCELLED"
  | "ARCHIVED";

export type ExpeditionMode = "AIR" | "SEA" | "ROAD" | "EXPRESS" | "GROUPAGE" | "OTHER";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CheckpointStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED" | "SKIPPED";

export type ExpeditionRecord = {
  id: string;
  org_id: string;
  expedition_reference: string;
  title: string | null;
  status: ExpeditionStatus;
  mode: ExpeditionMode;
  service_type: string | null;
  risk_level: RiskLevel;
  financial_status: string;
  origin_country: string | null;
  origin_city: string | null;
  origin_warehouse: string | null;
  destination_country: string | null;
  destination_city: string | null;
  destination_warehouse: string | null;
  route_label: string | null;
  carrier_name: string | null;
  flight_number: string | null;
  vessel_name: string | null;
  container_number: string | null;
  awb_number: string | null;
  bl_number: string | null;
  batch_reference: string | null;
  manifest_reference: string | null;
  owner_id: string | null;
  owner_name: string | null;
  planned_departure_at: string | null;
  departed_at: string | null;
  eta_at: string | null;
  arrived_at: string | null;
  delivered_at: string | null;
  is_delayed: boolean;
  delay_reason: string | null;
  last_location?: string | null;
  last_signal_at?: string | null;
  last_signal_source?: string | null;
  progress_percent?: number;
  public_tracking_enabled?: boolean;
  public_tracking_expires_at?: string | null;
  tracking_row_version?: number;
  shipment_row_version?: number;
  packages_count: number;
  clients_count: number;
  total_weight_kg: number;
  total_volume_cbm: number;
  declared_value_total: number;
  cost_total: number;
  billed_total: number;
  profit_total: number;
  currency: string;
  notes: string | null;
  open_anomalies: number;
  documents_count: number;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type ExpeditionPackage = {
  id: string;
  package_reference: string | null;
  tracking_id: string | null;
  description: string | null;
  status: string;
  payment_status: string;
  weight_kg: number | null;
  volume_cbm: number | null;
  declared_value: number | null;
  declared_currency: string | null;
  warehouse_name: string | null;
  origin_city: string | null;
  origin_country: string | null;
  destination_city: string | null;
  destination_country: string | null;
  client_name: string | null;
  client_phone: string | null;
  dossier_reference: string | null;
  added_at: string;
};

export type ExpeditionClient = {
  id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  packages_count: number;
  total_weight_kg: number;
  declared_value_total: number;
  unpaid_packages: number;
};

export type ExpeditionCheckpoint = {
  id: string;
  checkpoint_key: string;
  title: string;
  status: CheckpointStatus;
  position: number;
  planned_at: string | null;
  completed_at: string | null;
  location: string | null;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type ExpeditionEvent = {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  previous_status: string | null;
  new_status: string | null;
  metadata: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name: string | null;
  occurred_at: string;
  created_at: string;
};

export type ExpeditionDocument = {
  id: string;
  document_type: string;
  file_url: string;
  file_name: string | null;
  mime_type: string | null;
  visibility: string;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type ExpeditionFinancialLine = {
  id: string;
  line_type: string;
  category: string | null;
  description: string | null;
  amount: number;
  currency: string;
  direction: "COST" | "REVENUE";
  status: string;
  client_id: string | null;
  dossier_id: string | null;
  package_id: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type ExpeditionAnomaly = {
  id: string;
  anomaly_type: string;
  severity: RiskLevel;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
  title: string;
  description: string | null;
  resolution_notes: string | null;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assigned_to?: string | null;
  assigned_name?: string | null;
  history?: Array<{action:string;previous_status:string|null;new_status:string|null;comment:string|null;actor_id:string|null;created_at:string}>;
};

export type ExpeditionNote = {
  id: string;
  note: string;
  priority: string;
  visibility: string;
  created_by: string | null;
  created_at: string;
};

export type ExpeditionNotification = {
  id: string;
  channel: string;
  audience: string;
  recipient: string | null;
  notification_type: string;
  message: string;
  status: string;
  sent_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
};

export type ExpeditionDetail = ExpeditionRecord & {
  packages: ExpeditionPackage[];
  clients: ExpeditionClient[];
  checkpoints: ExpeditionCheckpoint[];
  documents: ExpeditionDocument[];
  financial_lines: ExpeditionFinancialLine[];
  anomalies: ExpeditionAnomaly[];
  notifications: ExpeditionNotification[];
  notes_list: ExpeditionNote[];
  events: ExpeditionEvent[];
};

export type ExpeditionPayload = Partial<{
  expected_version:number;
  expedition_reference: string;
  title: string;
  status: ExpeditionStatus;
  mode: ExpeditionMode;
  service_type: string;
  risk_level: RiskLevel;
  financial_status: string;
  origin_country: string;
  origin_city: string;
  origin_warehouse: string;
  destination_country: string;
  destination_city: string;
  destination_warehouse: string;
  route_label: string;
  carrier_name: string;
  flight_number: string;
  vessel_name: string;
  container_number: string;
  awb_number: string;
  bl_number: string;
  batch_reference: string;
  manifest_reference: string;
  owner_id: string;
  owner_name: string;
  planned_departure_at: string;
  departed_at: string;
  eta_at: string;
  arrived_at: string;
  delivered_at: string;
  is_delayed: boolean;
  delay_reason: string;
  currency: string;
  notes: string;
}>;

export type ExpeditionStats = {
  active: number;
  today: number;
  in_transit: number;
  arrivals_today: number;
  delayed: number;
  delivery_rate: number;
  total_weight_kg: number;
  total_volume_cbm: number;
};
export type ShipmentAnalytics={summary:{total:number;delivered:number;on_time:number;average_transit_hours:number|null;total_weight_kg:number;total_volume_cbm:number;profit_total:number};by_status:Array<{label:string;count:number}>;by_mode:Array<{label:string;count:number}>;by_route:Array<{label:string;count:number}>;delays_by_route:Array<{label:string;count:number}>;monthly_deliveries:Array<{label:string;count:number}>};

export type ShipmentsResponse = {
  status: "ok";
  items: ExpeditionRecord[];
  shipments: ExpeditionRecord[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

export async function listShipments(params: {
  q?: string;
  status?: ExpeditionStatus | "";
  mode?: ExpeditionMode | "";
  risk_level?: RiskLevel | "";
  origin_country?: string;
  destination_country?: string;
  page?: number;
  page_size?: number;
  sort?: string;
} = {}) {
  return (await api.get<ShipmentsResponse>("/shipments", { params })).data;
}

export async function getShipmentStats() {
  return (await api.get<{ status: "ok"; stats: ExpeditionStats }>("/shipments/stats")).data.stats;
}

export async function getShipment(id: string) {
  return (await api.get<{ status: "ok"; shipment: ExpeditionDetail }>(`/shipments/${id}`)).data.shipment;
}

export async function createShipment(payload: ExpeditionPayload) {
  return (await api.post<{ status: "ok"; shipment: ExpeditionDetail }>("/shipments", payload)).data.shipment;
}

export async function updateShipment(id: string, payload: ExpeditionPayload) {
  return (await api.patch<{ status: "ok"; shipment: ExpeditionDetail }>(`/shipments/${id}`, payload)).data.shipment;
}
export async function getShipmentAnalytics(){return (await api.get<{analytics:ShipmentAnalytics}>("/shipments/analytics")).data.analytics}
export async function archiveShipment(id:string,expectedVersion?:number){await api.delete(`/shipments/${id}`,{params:{expected_version:expectedVersion}})}

export async function exportShipments(params: {
  q?: string;
  status?: ExpeditionStatus | "";
  mode?: ExpeditionMode | "";
  risk_level?: RiskLevel | "";
  sort?: string;
} = {}) {
  return (
    await api.get<Blob>("/shipments/export", {
      params,
      responseType: "blob",
    })
  ).data;
}

export async function addShipmentPackage(id: string, packageId: string) {
  return (await api.post<{ status: "ok"; shipment: ExpeditionDetail }>(`/shipments/${id}/packages`, { package_id: packageId })).data.shipment;
}

export async function removeShipmentPackage(id: string, packageId: string, reason?: string) {
  return (await api.delete<{ status: "ok"; shipment: ExpeditionDetail }>(`/shipments/${id}/packages/${packageId}`, { params: { reason } })).data.shipment;
}

export async function updateShipmentCheckpoint(id: string, checkpointKey: string, payload: Partial<ExpeditionCheckpoint>) {
  return (await api.patch<{ status: "ok"; shipment: ExpeditionDetail }>(`/shipments/${id}/checkpoints/${checkpointKey}`, payload)).data.shipment;
}

export async function addShipmentDocument(id: string, payload: { document_type?: string; file_url: string; file_name?: string; mime_type?: string; visibility?: string; notes?: string }) {
  return (await api.post<{ status: "ok"; shipment: ExpeditionDetail }>(`/shipments/${id}/documents`, payload)).data.shipment;
}
export async function uploadShipmentDocument(id:string,file:File,documentType="DOCUMENT",notes?:string){const form=new FormData();form.append("file",file);form.append("document_type",documentType);if(notes)form.append("notes",notes);return (await api.post<{shipment:ExpeditionDetail}>(`/shipments/${id}/documents/upload`,form)).data.shipment}
export async function getShipmentDocumentUrl(id:string,documentId:string){return (await api.get<{url:string}>(`/shipments/${id}/documents/${documentId}/view`)).data.url}
export async function exportShipmentManifest(id:string){return (await api.get<Blob>(`/shipments/${id}/manifest`,{responseType:"blob"})).data}
export async function notifyShipmentsBulk(shipment_ids:string[],message:string,channel="whatsapp"){return (await api.post<{count:number}>("/shipments/notifications/bulk",{shipment_ids,message,channel,audience:"ALL_CLIENTS",notification_type:"EXPEDITION_UPDATE"})).data}

export async function addShipmentFinancialLine(id: string, payload: Partial<ExpeditionFinancialLine> & { amount: number }) {
  return (await api.post<{ status: "ok"; shipment: ExpeditionDetail }>(`/shipments/${id}/financial-lines`, payload)).data.shipment;
}

export async function createShipmentAnomaly(id: string, payload: { anomaly_type?: string; severity?: RiskLevel; title: string; description?: string }) {
  return (await api.post<{ status: "ok"; shipment: ExpeditionDetail }>(`/shipments/${id}/anomalies`, payload)).data.shipment;
}

export async function resolveShipmentAnomaly(id: string, anomalyId: string, notes?: string) {
  return (await api.patch<{ status: "ok"; shipment: ExpeditionDetail }>(`/shipments/${id}/anomalies/${anomalyId}/resolve`, { notes })).data.shipment;
}

export async function createShipmentNotification(id: string, payload: { channel?: string; audience?: string; recipient?: string; notification_type?: string; message: string }) {
  return (await api.post<{ status: "ok"; shipment: ExpeditionDetail }>(`/shipments/${id}/notifications`, payload)).data.shipment;
}

export async function addShipmentNote(id: string, payload: { note: string; priority?: string; visibility?: string }) {
  return (await api.post<{ status: "ok"; shipment: ExpeditionDetail }>(`/shipments/${id}/notes`, payload)).data.shipment;
}
