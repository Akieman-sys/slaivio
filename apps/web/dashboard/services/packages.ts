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
  | "CANCELLED"
  | "PENDING_VALIDATION"|"CONFIRMED"|"RECEIVED"|"WAREHOUSED"|"READY_FOR_BATCH"|"BATCHED"|"SHIPPED"|"ARRIVED"|"CLEARED"|"RETURNED";

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
  warehouse_aisle?: string|null; warehouse_shelf?:string|null; warehouse_position?:string|null;
  priority?: "LOW"|"NORMAL"|"HIGH"|"URGENT"; assigned_to?:string|null; supplier_name?:string|null; row_version?:number;
  supplier_tracking?:string|null; shipping_mark?:string|null; order_number?:string|null; external_reference?:string|null;
  subcategory?:string|null; goods_classification?:string|null; declared_weight_kg?:number|null; chargeable_weight_kg?:number|null;
  receiving_mode?:string|null; received_by?:string|null; route_id?:string|null; shipping_service_id?:string|null; pricing_snapshot?:Record<string,unknown>;
  expected_at?:string|null; expectation_status?:string|null; return_status?:string|null; return_reason?:string|null;
  delivered_to_name?:string|null; delivery_otp_verified?:boolean;
  label_ocr_snapshot?:Record<string,unknown>; label_source_language?:string|null;
  label_translation_language?:string|null; label_scanned_at?:string|null;
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
  movements?: PackageMovement[];
  weight_measurements?: PackageWeightMeasurement[];
  notes_items?: PackageNote[];
  documents?: PackageDocument[];
  checklist?: PackageChecklistItem[];
  quality_controls?:Array<Record<string,unknown>>;
  operational_alerts?:Array<Record<string,unknown>>;
};

export type PackageMovement = { id:string; from_warehouse:string|null; from_zone:string|null; from_aisle:string|null; from_shelf:string|null; from_position:string|null; to_warehouse:string|null; to_zone:string|null; to_aisle:string|null; to_shelf:string|null; to_position:string|null; reason:string|null; moved_by:string; created_at:string };
export type PackageWeightMeasurement = { id:string; weight_kg:number; source:string; device_reference:string|null; notes:string|null; measured_by:string; created_at:string };
export type PackageNote = { id:string; body:string; author_id:string; created_at:string; updated_at:string };
export type PackageDocument = { id:string; document_type:string; file_name:string; mime_type:string; size_bytes:number; notes:string|null; uploaded_by:string; created_at:string };
export type PackageChecklistItem = { id:string; code:string; label:string; status:"PENDING"|"COMPLETED"|"NOT_APPLICABLE"; sort_order:number; completed_at:string|null; completed_by:string|null };

export type PackageMedia = {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  object_path?:string|null; file_name?:string|null; mime_type?:string|null; size_bytes?:number|null; category?:string;
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
  received_today: number;
  received: number;
  waiting: number;
  ready_for_dispatch: number;
  in_stock: number;
  in_transit: number;
  issues: number;
  delivered: number;
  total_weight_kg: number;
  total_volume_cbm: number;
  total_pieces?: number;
  priority_count?:number; fragile_count?:number;
  arrived?:number; ready_for_pickup?:number; total_declared_value?:number; average_processing_hours?:number|null;
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
  warehouse_id?: string | null;
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
  priority?:"LOW"|"NORMAL"|"HIGH"|"URGENT";assigned_to?:string|null;supplier_name?:string|null;
  supplier_tracking?:string|null;shipping_mark?:string|null;order_number?:string|null;external_reference?:string|null;
  subcategory?:string|null;goods_classification?:string|null;declared_weight_kg?:number|null;receiving_mode?:string|null;
  route_id?:string|null;shipping_service_id?:string|null;expected_at?:string|null;
  label_ocr_snapshot?:Record<string,unknown>;label_source_language?:string|null;label_translation_language?:string|null;
};

export type PackageLabelDossierMatch={id:string;reference:string|null;status:string|null;origin_country:string|null;origin_city:string|null;destination_country:string|null;destination_city:string|null;service:string|null;package_count:number};
export type PackageLabelMatch={
  score:number;reasons:string[];
  client:{id:string;name:string|null;phone:string|null;email:string|null;country:string|null};
  expectation:{id:string;dossier_id:string|null;supplier_tracking:string|null;shipping_mark:string|null;order_number:string|null;description:string|null;expected_at:string|null}|null;
  dossiers:PackageLabelDossierMatch[];
};
export type PackageLabelFields={
  carrier:string|null;supplier_tracking:string|null;tracking_id:string|null;order_number:string|null;shipping_mark:string|null;
  recipient_name:string|null;recipient_phone:string|null;phone:string|null;destination_country:string|null;destination_city:string|null;
  service_type:string|null;warehouse_reference:string|null;supplier_name:string|null;supplier_phone:string|null;shipped_at:string|null;
  description:string|null;category:string|null;subcategory:string|null;goods_classification:string|null;pieces_count:number|null;
  weight_kg:number|null;length_cm:number|null;width_cm:number|null;height_cm:number|null;
  product_lines:Array<{reference?:string|null;description?:string|null;color?:string|null;size?:string|null;quantity?:number|null}>;
  handwritten_annotations:Array<{value?:string|null;meaning?:string|null}>;
};
export type PackageLabelAnalysis={
  raw_text:string;translated_text:string;detected_language:string;target_language:string;confidence:number|null;
  fields:PackageLabelFields;field_confidences:Record<string,number>;evidence:Record<string,string>;
  ambiguities:string[];ignored_text:string[];barcode_value:string|null;
  matching:{duplicate_package:{id:string;package_reference:string|null;tracking_id:string|null;supplier_tracking:string|null;status:string|null}|null;matches:PackageLabelMatch[];automatic_match:PackageLabelMatch|null;requires_client_selection:boolean};
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
  warehouse?:string;country?:string;city?:string;shipment_id?:string;batch_id?:string;zone?:string;responsible?:string;category?:string;priority?:string;fragile?:boolean;received_from?:string;received_to?:string;min_declared_value?:number;max_declared_value?:number;
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

export async function movePackage(id:string,payload:{to_warehouse:string;to_zone?:string|null;to_aisle?:string|null;to_shelf?:string|null;to_position?:string|null;reason?:string|null}) {
  return (await api.post<{package:PackageRecord}>(`/packages/${id}/move`,payload)).data.package;
}
export async function weighPackage(id:string,payload:{weight_kg:number;source?:string;device_reference?:string|null;notes?:string|null}) {
  return (await api.post<{package:PackageRecord}>(`/packages/${id}/weigh`,payload)).data.package;
}
export async function addPackageNote(id:string,body:string) {
  return (await api.post<{package:PackageRecord}>(`/packages/${id}/notes`,{body})).data.package;
}
export async function updatePackageChecklist(id:string,itemId:string,status:string) {
  return (await api.patch<{package:PackageRecord}>(`/packages/${id}/checklist/${itemId}`,{status})).data.package;
}
export async function uploadPackageDocument(id:string,file:File,documentType="OTHER",notes?:string) {
  const form=new FormData(); form.append("file",file); form.append("document_type",documentType); if(notes) form.append("notes",notes);
  return (await api.post<{document:PackageDocument}>(`/packages/${id}/documents`,form)).data.document;
}
export async function getPackageDocumentDownload(id:string,documentId:string) {
  return (await api.get<{url:string}>(`/packages/${id}/documents/${documentId}/download`)).data.url;
}
export async function archivePackage(id:string) { await api.delete(`/packages/${id}`); }
export async function restorePackage(id:string){await api.post(`/packages/${id}/restore`)}
export async function listArchivedPackages(params:{q?:string;page?:number;page_size?:number}={}){return (await api.get<PackagesResponse>("/packages/archived",{params})).data}
export async function detectPackageBarcode(file:File):Promise<string|null>{
  type Detection={rawValue?:string};
  type DetectorInstance={detect:(source:ImageBitmap)=>Promise<Detection[]>};
  type DetectorConstructor=new(options?:{formats?:string[]})=>DetectorInstance;
  const Detector=(window as unknown as {BarcodeDetector?:DetectorConstructor}).BarcodeDetector;
  if(!Detector || typeof createImageBitmap!=="function") return null;
  let bitmap:ImageBitmap|undefined;
  try{
    bitmap=await createImageBitmap(file);
    const detector=new Detector({formats:["code_128","code_39","qr_code","itf","ean_13","ean_8"]});
    const codes=await detector.detect(bitmap);
    return codes.map((item)=>item.rawValue?.trim()).find(Boolean) || null;
  }catch{return null;}finally{bitmap?.close();}
}
export async function scanPackageLabel(file:File,language:"fr"|"en"="fr",barcodeValue?:string|null){
  const form=new FormData();form.append("file",file);form.append("language",language);if(barcodeValue)form.append("barcode_value",barcodeValue);
  return (await api.post<{result:PackageLabelAnalysis;requires_human_review:boolean}>("/packages/scan/ocr",form)).data.result;
}
export async function uploadPackageMedia(id:string,file:File,category:string,caption?:string){const form=new FormData();form.append("file",file);form.append("category",category);if(caption)form.append("caption",caption);return (await api.post<{package:PackageRecord}>(`/packages/${id}/media/upload`,form)).data.package}
export async function getPackageMediaUrl(id:string,mediaId:string){return (await api.get<{url:string}>(`/packages/${id}/media/${mediaId}/view`)).data.url}
export async function getPackageLabel(id:string,kind:"barcode"|"qr"){return (await api.get<Blob>(`/packages/${id}/label/${kind}`,{responseType:"blob"})).data}
export type PackageAnalytics={summary:{average_storage_days:number|null;average_before_dispatch_days:number|null;anomaly_rate:number|null};daily:Array<{day:string;count:number;weight_kg:number}>;warehouses:Array<{label:string;count:number;weight_kg:number;volume_cbm:number}>;suppliers:Array<{label:string;count:number}>;destinations:Array<{label:string;count:number}>;capacity:Array<{label:string;occupied:number;capacity:number}>};
export async function getPackageAnalytics(){return (await api.get<{analytics:PackageAnalytics}>("/packages/analytics")).data.analytics}
export async function transitionPackageState(id:string,new_status:string,expected_version:number,reason?:string){return(await api.post<{package:PackageRecord}>(`/packages/${id}/transition`,{new_status,expected_version,reason})).data.package}
export async function qualityControlPackage(id:string,payload:Record<string,unknown>){return(await api.post<{package:PackageRecord}>(`/packages/${id}/quality-control`,payload)).data.package}
export async function pricePackage(id:string,service_id:string){return(await api.post<{package:PackageRecord}>(`/packages/${id}/pricing`,{service_id})).data.package}
export async function compatiblePackageDepartures(id:string){return(await api.get<{items:Array<Record<string,unknown>>}>(`/packages/${id}/compatible-departures`)).data.items}
export async function listExpectedPackages(status?:string){return(await api.get<{items:Array<Record<string,unknown>>}>("/packages/expected",{params:{status}})).data.items}
export async function createExpectedPackage(payload:Record<string,unknown>){return(await api.post("/packages/expected",payload)).data}
export async function addPackageDeliveryProof(id:string,payload:Record<string,unknown>){return(await api.post<{package:PackageRecord}>(`/packages/${id}/delivery-proof`,payload)).data.package}
export async function detectPackageAlerts(){return(await api.post<{created:number}>("/packages/alerts/detect")).data}
export async function listPackageAlerts(status?:string){return(await api.get<{items:Array<Record<string,unknown>>}>("/packages/alerts",{params:{status}})).data.items}
export async function resolvePackageAlert(id:string,resolution:string){return(await api.patch(`/packages/alerts/${id}`,{resolution})).data}
export async function listPackageViews(){return(await api.get<{items:Array<{id:string;name:string;filters:Record<string,unknown>}>}>("/packages/views")).data.items}
export async function savePackageView(name:string,filters:Record<string,unknown>){return(await api.post("/packages/views",{name,filters})).data}
export async function deletePackageView(id:string){return(await api.delete(`/packages/views/${id}`)).data}
export async function bulkPackageOperation(operation_type:string,package_ids:string[],payload:Record<string,unknown>={}){return(await api.post("/packages/bulk",{idempotency_key:crypto.randomUUID(),operation_type,package_ids,payload})).data}
