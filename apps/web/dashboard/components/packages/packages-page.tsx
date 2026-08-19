"use client";

import axios from "axios";
import Image from "next/image";
import {
  AlertCircle,
  AlertTriangle,
  Barcode,
  Bell,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileText,
  History,
  Image as ImageIcon,
  MapPin,
  PackageCheck,
  PackageSearch,
  Ruler,
  Search,
  SlidersHorizontal,
  Truck,
  Upload,
  Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "@/services/api";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import {
  OperationButton,
  OperationMetric,
  OperationMetricGrid,
  OperationTab,
} from "@/components/ui/operation-controls";
import {
  OperationMetrics,
  OperationSearch,
  OperationToolbar,
} from "@/components/ui/operation-primitives";
import { EmptyState as SharedEmptyState, TableSkeleton } from "@/components/ui/page-state";
import {
  OperationPageHeader,
  OperationTabs,
} from "@/components/ui/operation-page-header";
import { listDossiers, type DossierRecord } from "@/services/dossiers";
import { getReferenceCatalog, type ReferenceItem } from "@/services/references";
import {
  addShipmentPackage,
  listShipments,
  removeShipmentPackage,
  type ExpeditionRecord,
} from "@/services/shipments";
import {
  createPackage,
  createPackageAnomaly,
  createPackageNotification,
  exportPackages,
  getPackage,
  getPackageStats,
  getPackageTimeline,
  importPackages,
  listPackages,
  resolvePackageAnomaly,
  updatePackage,
  movePackage,
  weighPackage,
  addPackageNote,
  updatePackageChecklist,
  uploadPackageDocument,
  getPackageDocumentDownload,
  archivePackage,
  restorePackage,
  listArchivedPackages,
  scanPackageLabel,
  uploadPackageMedia,
  getPackageMediaUrl,
  getPackageAnalytics,
  transitionPackageState,
  qualityControlPackage,
  compatiblePackageDepartures,
  addPackageDeliveryProof,
  type PackageAnalytics,
  type AnomalySeverity,
  type InventoryStatus,
  type PackageCondition,
  type PackagePayload,
  type PackageRecord,
  type PackageSource,
  type PackageStats,
  type PackageStatus,
  type PackageTimelineEvent,
  type PackageType,
  type PackageValidationStatus,
  type PaymentClearanceStatus,
} from "@/services/packages";

const statusLabels: Record<PackageStatus, string> = {
  CREATED: "Créé",
  RECEIVED_AT_ORIGIN: "Reçu origine",
  WAREHOUSE_PROCESSING: "Traitement entrepôt",
  READY_FOR_DISPATCH: "Prêt départ",
  IN_TRANSIT: "En transit",
  CUSTOMS: "Dédouanement",
  ARRIVED_DESTINATION: "Arrivé destination",
  READY_FOR_PICKUP: "Prêt retrait",
  DELIVERED: "Livré",
  BLOCKED: "Bloqué",
  ISSUE: "Anomalie",
  CANCELLED: "Annulé",
  PENDING_VALIDATION: "À valider",
  CONFIRMED: "Confirmé",
  RECEIVED: "Reçu",
  WAREHOUSED: "En entrepôt",
  READY_FOR_BATCH: "Prêt au groupage",
  BATCHED: "Groupé",
  SHIPPED: "Expédié",
  ARRIVED: "Arrivé",
  CLEARED: "Dédouané",
  RETURNED: "Retourné",
};

const statusStyles: Record<PackageStatus, string> = {
  CREATED: "bg-slate-100 text-slate-700 ring-slate-200",
  RECEIVED_AT_ORIGIN: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  WAREHOUSE_PROCESSING: "bg-teal-50 text-teal-700 ring-teal-100",
  READY_FOR_DISPATCH: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  IN_TRANSIT: "bg-blue-50 text-blue-700 ring-blue-100",
  CUSTOMS: "bg-orange-50 text-orange-700 ring-orange-100",
  ARRIVED_DESTINATION: "bg-purple-50 text-purple-700 ring-purple-100",
  READY_FOR_PICKUP: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  DELIVERED: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  BLOCKED: "bg-red-50 text-red-700 ring-red-100",
  ISSUE: "bg-red-50 text-red-700 ring-red-100",
  CANCELLED: "bg-gray-100 text-gray-700 ring-gray-200",
  PENDING_VALIDATION: "bg-amber-50 text-amber-700 ring-amber-100",
  CONFIRMED: "bg-sky-50 text-sky-700 ring-sky-100",
  RECEIVED: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  WAREHOUSED: "bg-teal-50 text-teal-700 ring-teal-100",
  READY_FOR_BATCH: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  BATCHED: "bg-violet-50 text-violet-700 ring-violet-100",
  SHIPPED: "bg-blue-50 text-blue-700 ring-blue-100",
  ARRIVED: "bg-purple-50 text-purple-700 ring-purple-100",
  CLEARED: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  RETURNED: "bg-rose-50 text-rose-700 ring-rose-100",
};

const conditionLabels: Record<PackageCondition, string> = {
  UNKNOWN: "Non vérifié",
  GOOD: "Bon état",
  DAMAGED: "Endommagé",
  FRAGILE: "Fragile",
  MISSING_INFO: "Infos manquantes",
  REPACK_REQUIRED: "Reconditionner",
};

const inventoryLabels: Record<InventoryStatus, string> = {
  NOT_STORED: "Non stocké",
  IN_STOCK: "En stock",
  RESERVED: "Réservé",
  GROUPED: "Groupé",
  DISPATCHED: "Expédié",
  RELEASED: "Libéré",
};

const paymentLabels: Record<PaymentClearanceStatus, string> = {
  UNKNOWN: "Non défini",
  PENDING: "À encaisser",
  PARTIAL: "Partiel",
  PAID: "Payé",
  CLEARED: "Soldé",
  OVERDUE: "En retard",
  BLOCKED: "Bloqué",
};

const validationLabels: Record<PackageValidationStatus, string> = {
  PENDING: "À vérifier",
  VALIDATED: "Validé",
  NEEDS_REVIEW: "À revoir",
  BLOCKED: "Bloqué",
  REJECTED: "Rejeté",
};

const packageTypeLabels: Record<PackageType, string> = {
  carton: "Carton",
  sac: "Sac",
  caisse: "Caisse",
  palette: "Palette",
  document: "Document",
  lot: "Lot",
  other: "Autre",
};

const sourceLabels: Record<PackageSource, string> = {
  manual: "Manuel",
  whatsapp: "WhatsApp",
  import: "Import",
  warehouse: "Entrepôt",
  api: "API",
  legacy: "Historique",
};

const emptyStats: PackageStats = {
  total: 0,
  received_today: 0,
  received: 0,
  waiting: 0,
  ready_for_dispatch: 0,
  in_stock: 0,
  in_transit: 0,
  issues: 0,
  delivered: 0,
  total_weight_kg: 0,
  total_volume_cbm: 0,
};

const views: Array<{
  key: string;
  label: string;
  status?: PackageStatus;
  inventory?: InventoryStatus;
}> = [
  { key: "all", label: "Tous" },
  { key: "expected", label: "Colis attendus" },
  { key: "unidentified", label: "Non identifiés" },
  { key: "pending", label: "À valider", status: "PENDING_VALIDATION" },
  { key: "received", label: "Reçus entrepôt", status: "RECEIVED_AT_ORIGIN" },
  { key: "review", label: "À vérifier" },
  { key: "stock", label: "En stock", inventory: "IN_STOCK" },
  { key: "ready", label: "Prêts à expédier", status: "READY_FOR_DISPATCH" },
  { key: "transit", label: "En transit", status: "IN_TRANSIT" },
  { key: "arrived", label: "Arrivés", status: "ARRIVED_DESTINATION" },
  { key: "pickup", label: "Prêts au retrait", status: "READY_FOR_PICKUP" },
  { key: "blocked", label: "Bloqués", status: "BLOCKED" },
  { key: "issues", label: "Anomalies" },
  { key: "delivered", label: "Livrés", status: "DELIVERED" },
  { key: "archived", label: "Archivés" },
];

const buttonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px] font-medium text-[#1f2328] shadow-sm transition hover:bg-[#f7f8fa]";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#12c76f] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0fb966]";
const iconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[#4f5b67] transition hover:border-[#d8dce2] hover:bg-[#f4f6f8]";
const pagerButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-md border border-[#cfd5dd] bg-white text-[#334155] shadow-sm disabled:opacity-40";

type Pagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};
type PackageFormMode = "create" | "edit";
type DetailTab =
  | "summary"
  | "dossier"
  | "measures"
  | "warehouse"
  | "shipment"
  | "payment"
  | "anomalies"
  | "documents"
  | "media"
  | "notes"
  | "notifications"
  | "history"
  | "settings";

export function PackagesPage() {
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [stats, setStats] = useState<PackageStats>(emptyStats);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    page_size: 30,
    total: 0,
    total_pages: 0,
  });
  const [selected, setSelected] = useState<PackageRecord | null>(null);
  const [timeline, setTimeline] = useState<PackageTimelineEvent[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>("summary");
  const [activeView, setActiveView] = useState("all");
  const [layoutMode, setLayoutMode] = useState<
    "table" | "kanban" | "analytics"
  >("table");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [analytics, setAnalytics] = useState<PackageAnalytics | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PackageStatus | "">("");
  const [condition, setCondition] = useState<PackageCondition | "">("");
  const [inventory, setInventory] = useState<InventoryStatus | "">("");
  const [payment, setPayment] = useState<PaymentClearanceStatus | "">("");
  const [validation, setValidation] = useState<PackageValidationStatus | "">(
    "",
  );
  const [packageType, setPackageType] = useState<PackageType | "">("");
  const [source, setSource] = useState<PackageSource | "">("");
  const [sort, setSort] = useState("updated_desc");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [fragileOnly, setFragileOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<PackageFormMode>("create");
  const [formPackage, setFormPackage] = useState<PackageRecord | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState<{
    created: number;
    skipped: number;
  } | null>(null);

  const currentView = views.find((view) => view.key === activeView) || views[0];
  const page = pagination.page || 1;

  useEffect(() => {
    const timeout = window.setTimeout(() => loadPackages(1), 220);
    return () => window.clearTimeout(timeout);
    // The listed filters intentionally define when the debounced request runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query,
    status,
    condition,
    inventory,
    payment,
    validation,
    packageType,
    source,
    sort,
    activeView,
    warehouseFilter,
    zoneFilter,
    countryFilter,
    cityFilter,
    categoryFilter,
    priorityFilter,
    fragileOnly,
  ]);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (!selected || activeTab !== "history") return;
    loadTimeline(selected.id);
  }, [selected, activeTab]);

  async function loadStats() {
    try {
      setStats(await getPackageStats());
    } catch {
      setStats(emptyStats);
    }
  }
  async function showAnalytics() {
    setLayoutMode("analytics");
    try {
      setAnalytics(await getPackageAnalytics());
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function loadPackages(nextPage = page) {
    setLoading(true);
    setError("");
    try {
      const response =
        activeView === "archived"
          ? await listArchivedPackages({
              q: query,
              page: nextPage,
              page_size: 30,
            })
          : await listPackages({
              q: query || undefined,
              status:
                currentView.key === "issues" || currentView.key === "review"
                  ? undefined
                  : currentView.status || status || undefined,
              condition: condition || undefined,
              inventory_status: currentView.inventory || inventory || undefined,
              payment_clearance_status: payment || undefined,
              validation_status:
                currentView.key === "review"
                  ? "NEEDS_REVIEW"
                  : validation || undefined,
              package_type: packageType || undefined,
              source: source || undefined,
              page: nextPage,
              page_size: 30,
              sort,
              warehouse: warehouseFilter || undefined,
              zone: zoneFilter || undefined,
              country: countryFilter || undefined,
              city: cityFilter || undefined,
              category: categoryFilter || undefined,
              priority: priorityFilter || undefined,
              fragile: fragileOnly || undefined,
            });
      const items =
        currentView.key === "issues"
          ? response.items.filter(
              (item) =>
                ["BLOCKED", "ISSUE"].includes(item.status) ||
                item.open_anomaly_count > 0,
            )
          : response.items;
      setPackages(items);
      setPagination(response.pagination);
      if (selected && !items.some((item) => item.id === selected.id))
        setSelected(null);
    } catch (err) {
      setError(apiErrorMessage(err));
      setPackages([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  async function selectPackage(item: PackageRecord) {
    setSelected(item);
    setActiveTab("summary");
    setTimeline([]);
    setDetailLoading(true);
    try {
      setSelected(await getPackage(item.id));
    } catch {
      setSelected(item);
    } finally {
      setDetailLoading(false);
    }
  }
  async function selectOrRestore(item: PackageRecord) {
    if (activeView !== "archived") {
      await selectPackage(item);
      return;
    }
    if (!window.confirm(`Restaurer ${item.package_reference || "ce colis"} ?`))
      return;
    try {
      await restorePackage(item.id);
      await Promise.all([loadStats(), loadPackages(page)]);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }
  async function transitionPackage(id: string, status: PackageStatus) {
    try {
      await updatePackage(id, { status });
      await Promise.all([loadStats(), loadPackages(page)]);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function loadTimeline(packageId: string) {
    setTimelineLoading(true);
    try {
      setTimeline(await getPackageTimeline(packageId));
    } catch {
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  }

  function openCreate() {
    setFormMode("create");
    setFormPackage(null);
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(item: PackageRecord) {
    setFormMode("edit");
    setFormPackage(item);
    setFormError("");
    setFormOpen(true);
  }

  async function submitPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    const payload: PackagePayload = {
      dossier_id: String(
        form.get("dossier_id") || formPackage?.dossier_id || "",
      ),
      tracking_id: clean(form.get("tracking_id")),
      status: String(form.get("status") || "CREATED") as PackageStatus,
      package_condition: String(
        form.get("package_condition") || "UNKNOWN",
      ) as PackageCondition,
      inventory_status: String(
        form.get("inventory_status") || "NOT_STORED",
      ) as InventoryStatus,
      payment_clearance_status: String(
        form.get("payment_clearance_status") || "UNKNOWN",
      ) as PaymentClearanceStatus,
      payment_status: String(
        form.get("payment_clearance_status") || "UNKNOWN",
      ) as PaymentClearanceStatus,
      validation_status: String(
        form.get("validation_status") || "PENDING",
      ) as PackageValidationStatus,
      source: String(form.get("source") || "manual") as PackageSource,
      package_type: String(form.get("package_type") || "carton") as PackageType,
      description: clean(form.get("description")),
      category: clean(form.get("category")),
      warehouse_name: clean(form.get("warehouse_name")),
      warehouse_zone: clean(form.get("warehouse_zone")),
      warehouse_rack: clean(form.get("warehouse_rack")),
      warehouse_location: clean(form.get("warehouse_location")),
      origin_country: clean(form.get("origin_country")),
      origin_city: clean(form.get("origin_city")),
      destination_country: clean(form.get("destination_country")),
      destination_city: clean(form.get("destination_city")),
      weight_kg: numberOrNull(form.get("weight_kg")),
      length_cm: numberOrNull(form.get("length_cm")),
      width_cm: numberOrNull(form.get("width_cm")),
      height_cm: numberOrNull(form.get("height_cm")),
      volume_cbm: numberOrNull(form.get("volume_cbm")),
      volumetric_weight_kg: numberOrNull(form.get("volumetric_weight_kg")),
      pieces_count: numberOrNull(form.get("pieces_count")),
      declared_value: numberOrNull(form.get("declared_value")),
      declared_currency: clean(form.get("declared_currency")),
      is_fragile: form.get("is_fragile") === "on",
      shipping_mode: clean(form.get("shipping_mode")),
      service_type: clean(form.get("shipping_mode")),
      shipment_reference: clean(form.get("shipment_reference")),
      fees_total: numberOrNull(form.get("fees_total")),
      fees_paid: numberOrNull(form.get("fees_paid")),
      currency: clean(form.get("currency")),
      barcode: clean(form.get("barcode")),
      qr_code_value: clean(form.get("qr_code_value")),
      public_tracking_enabled:
        formMode === "create"
          ? true
          : form.get("public_tracking_enabled") === "on",
      eta_at: clean(form.get("eta_at")),
      last_scan_location: clean(form.get("last_scan_location")),
      notes: clean(form.get("notes")),
      priority: String(form.get("priority") || "NORMAL") as
        "LOW" | "NORMAL" | "HIGH" | "URGENT",
      assigned_to: clean(form.get("assigned_to")),
      supplier_name: clean(form.get("supplier_name")),
    };
    if (!payload.dossier_id) {
      setSaving(false);
      setFormError("Sélectionnez un dossier réel avant de créer le colis.");
      return;
    }
    try {
      const saved =
        formMode === "edit" && formPackage
          ? await updatePackage(formPackage.id, payload)
          : await createPackage(payload);
      setSelected(saved);
      setFormOpen(false);
      setFormPackage(null);
      await Promise.all([
        loadStats(),
        loadPackages(formMode === "edit" ? page : 1),
      ]);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    try {
      const blob = await exportPackages({
        q: query || undefined,
        status: currentView.status || status || undefined,
        condition: condition || undefined,
        inventory_status: currentView.inventory || inventory || undefined,
        payment_clearance_status: payment || undefined,
        validation_status: validation || undefined,
        package_type: packageType || undefined,
        source: source || undefined,
        sort,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "slaivio-colis.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File) || !file.size) {
      setImportError("Sélectionnez un fichier CSV.");
      return;
    }
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const result = await importPackages(file);
      setImportResult({ created: result.created, skipped: result.skipped });
      await Promise.all([loadStats(), loadPackages(1)]);
    } catch (err) {
      setImportError(apiErrorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  const statCards = useMemo(
    () => [
      { label: "Reçus aujourd’hui", value: stats.received_today, tone: "blue" },
      { label: "En attente", value: stats.waiting, tone: "amber" },
      {
        label: "Prêts à expédier",
        value: stats.ready_for_dispatch,
        tone: "blue",
      },
      { label: "En transit", value: stats.in_transit, tone: "blue" },
      { label: "Livrés", value: stats.delivered, tone: "blue" },
      {
        label: "Poids total",
        value: `${Number(stats.total_weight_kg || 0).toLocaleString("fr-FR")} kg`,
        tone: "neutral",
      },
    ],
    [stats],
  );

  return (
    <div className="min-h-full bg-[#f7f7f6] text-[#1f2328]">
      <div className="overflow-hidden bg-white">
        <OperationPageHeader
          title="Colis"
          description="Réceptionnez, mesurez, stockez et suivez chaque colis réel. Chaque ligne reste liée à un dossier client pour garder une traçabilité complète."
          actions={
            <>
              <details className="relative">
                <summary className={`${buttonClass} cursor-pointer list-none`}>
                  Plus
                </summary>
                <div className="absolute right-0 z-30 mt-1 w-52 rounded-md bg-white p-1 shadow-[0_8px_30px_rgba(15,23,42,.14)] ring-1 ring-[#e8eaed]">
                  <button
                    onClick={() => setScanOpen(true)}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] hover:bg-[#f5f6f7]"
                  >
                    <Barcode size={14} />
                    Scanner un colis
                  </button>
                  <button
                    onClick={() =>
                      setLayoutMode(
                        layoutMode === "kanban" ? "table" : "kanban",
                      )
                    }
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] hover:bg-[#f5f6f7]"
                  >
                    {layoutMode === "kanban" ? "Vue tableau" : "Vue Kanban"}
                  </button>
                  <button
                    onClick={() =>
                      layoutMode === "analytics"
                        ? setLayoutMode("table")
                        : showAnalytics()
                    }
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] hover:bg-[#f5f6f7]"
                  >
                    {layoutMode === "analytics" ? "Vue tableau" : "Analytics"}
                  </button>
                </div>
              </details>
              <OperationButton onClick={() => setImportOpen(true)}>
                <Upload size={14} />
                Importer
              </OperationButton>
              <OperationButton onClick={handleExport}>
                <Download size={14} />
                Exporter
              </OperationButton>
              <OperationButton variant="primary" onClick={openCreate}>
                <span className="text-lg leading-none">+</span>
                Nouveau colis
              </OperationButton>
            </>
          }
        />

        <OperationMetrics>
          <OperationMetricGrid className="lg:grid-cols-6">
            {statCards.map((card) => (
              <OperationMetric
                key={card.label}
                label={card.label}
                value={typeof card.value === "number" ? card.value.toLocaleString("fr-FR") : card.value}
                tone={card.tone === "amber" ? "warning" : "default"}
              />
            ))}
          </OperationMetricGrid>
        </OperationMetrics>

        <OperationTabs>
          {views.slice(0, 5).map((view) => (
            <OperationTab
              key={view.key}
              onClick={() => setActiveView(view.key)}
              active={activeView === view.key}
            >
              {view.label}
            </OperationTab>
          ))}
          <select
            aria-label="Autres vues colis"
            value={
              views.slice(5).some((view) => view.key === activeView)
                ? activeView
                : ""
            }
            onChange={(event) => setActiveView(event.target.value)}
            className="ml-1 h-8 rounded-md bg-[#f3f4f5] px-2 text-[12px] text-[#59636e] outline-none"
          >
            <option value="">Plus</option>
            {views.slice(5).map((view) => (
              <option key={view.key} value={view.key}>
                {view.label}
              </option>
            ))}
          </select>
        </OperationTabs>

        <section className={selected ? "xl:pr-[380px]" : ""}>
          <OperationToolbar
            search={<OperationSearch value={query} onChange={setQuery} placeholder="Rechercher un colis…" />}
            filters={<OperationButton onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}><SlidersHorizontal size={15} />Filtres</OperationButton>}
          />
          {filtersOpen && (
            <div className="flex flex-col gap-2 border-y border-[#d8dce2] bg-[#fafbfc] px-5 py-3 xl:flex-row xl:items-center">
              <SelectFilter
                value={status}
                onChange={(value) => setStatus(value as PackageStatus | "")}
                label="Statut"
              >
                <option value="">Statut</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectFilter>
              <SelectFilter
                value={condition}
                onChange={(value) =>
                  setCondition(value as PackageCondition | "")
                }
                label="État"
              >
                <option value="">État colis</option>
                {Object.entries(conditionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectFilter>
              <SelectFilter
                value={inventory}
                onChange={(value) =>
                  setInventory(value as InventoryStatus | "")
                }
                label="Stock"
              >
                <option value="">Stock</option>
                {Object.entries(inventoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectFilter>
              <SelectFilter
                value={payment}
                onChange={(value) =>
                  setPayment(value as PaymentClearanceStatus | "")
                }
                label="Paiement"
              >
                <option value="">Paiement</option>
                {Object.entries(paymentLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectFilter>
              <SelectFilter
                value={validation}
                onChange={(value) =>
                  setValidation(value as PackageValidationStatus | "")
                }
                label="Validation"
              >
                <option value="">Validation</option>
                {Object.entries(validationLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectFilter>
              <SelectFilter
                value={packageType}
                onChange={(value) => setPackageType(value as PackageType | "")}
                label="Type"
              >
                <option value="">Type</option>
                {Object.entries(packageTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectFilter>
              <SelectFilter
                value={source}
                onChange={(value) => setSource(value as PackageSource | "")}
                label="Source"
              >
                <option value="">Source</option>
                {Object.entries(sourceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectFilter>
              <SelectFilter value={sort} onChange={setSort} label="Tri">
                <option value="updated_desc">Activité récente</option>
                <option value="created_desc">Créés récemment</option>
                <option value="created_asc">Créés anciennement</option>
                <option value="reference_asc">Référence A-Z</option>
                <option value="client_asc">Client A-Z</option>
                <option value="weight_desc">Poids élevé</option>
              </SelectFilter>
              <label className="hidden">
                <Search size={16} className="text-[#6b7280]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher..."
                  className="ml-2 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                />
              </label>
            </div>
          )}
          {filtersOpen && (
            <div className="grid gap-2 border-b border-[#d8dce2] bg-[#fafafa] px-5 py-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <input
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className={inputClass}
                placeholder="Entrepôt"
              />
              <input
                value={zoneFilter}
                onChange={(e) => setZoneFilter(e.target.value)}
                className={inputClass}
                placeholder="Zone"
              />
              <input
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className={inputClass}
                placeholder="Pays"
              />
              <input
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className={inputClass}
                placeholder="Ville"
              />
              <input
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={inputClass}
                placeholder="Catégorie"
              />
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className={inputClass}
              >
                <option value="">Priorité</option>
                <option value="LOW">Basse</option>
                <option value="NORMAL">Normale</option>
                <option value="HIGH">Haute</option>
                <option value="URGENT">Urgente</option>
              </select>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={fragileOnly}
                  onChange={(e) => setFragileOnly(e.target.checked)}
                />
                Fragiles uniquement
              </label>
            </div>
          )}

          {error && (
            <div className="m-4 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
              <AlertCircle size={17} className="mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {layoutMode === "table" && (
            <PackagesTable
              packages={packages}
              loading={loading}
              selectedId={selected?.id}
              onSelect={selectOrRestore}
            />
          )}
          {layoutMode === "kanban" && (
            <PackagesKanban
              packages={packages}
              loading={loading}
              onSelect={selectPackage}
              onMove={transitionPackage}
            />
          )}
          {layoutMode === "analytics" && (
            <PackagesAnalytics stats={stats} analytics={analytics} />
          )}

          <div className="flex flex-col gap-3 border-t border-[#d8dce2] px-5 py-3 text-[13px] text-[#5f6b76] sm:flex-row sm:items-center sm:justify-between">
            <span>
              {pagination.total === 0
                ? "0 colis"
                : `${(page - 1) * pagination.page_size + 1} - ${Math.min(page * pagination.page_size, pagination.total)} sur ${pagination.total} colis`}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => loadPackages(page - 1)}
                className={pagerButtonClass}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="rounded-md bg-[#166ee8] px-3 py-1.5 text-[13px] font-semibold text-white">
                {page}
              </span>
              <button
                disabled={page >= pagination.total_pages || loading}
                onClick={() => loadPackages(page + 1)}
                className={pagerButtonClass}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          {false && layoutMode !== "analytics" && (
            <section className="grid gap-3 border-t border-[#d8dce2] bg-[#fafbfc] px-5 py-4 sm:grid-cols-2 lg:grid-cols-6">
              {statCards.map((card) => (
                <div
                  key={card.label}
                  className={`min-h-[90px] rounded-md border p-4 ${metricCardClass(card.tone)}`}
                >
                  <p className="text-[13px] font-medium">{card.label}</p>
                  <p className="mt-3 text-[27px] font-normal leading-none tracking-[-0.04em]">
                    {card.value.toLocaleString("fr-FR")}
                  </p>
                </div>
              ))}
            </section>
          )}
        </section>
      </div>

      {selected && (
        <PackageDetails
          item={selected}
          loading={detailLoading}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          timeline={timeline}
          timelineLoading={timelineLoading}
          onClose={() => setSelected(null)}
          onEdit={() => openEdit(selected)}
          onUpdated={setSelected}
        />
      )}

      {formOpen && (
        <PackageFormModal
          mode={formMode}
          item={formPackage}
          saving={saving}
          error={formError}
          onClose={() => {
            setFormOpen(false);
            setFormPackage(null);
            setFormError("");
          }}
          onSubmit={submitPackage}
        />
      )}

      {importOpen && (
        <ImportPackagesModal
          importing={importing}
          error={importError}
          result={importResult}
          onClose={() => {
            setImportOpen(false);
            setImportError("");
            setImportResult(null);
          }}
          onSubmit={handleImport}
        />
      )}
      {scanOpen && (
        <PackageScannerModal
          onClose={() => setScanOpen(false)}
          onCreated={async (item) => {
            setScanOpen(false);
            await Promise.all([loadStats(), loadPackages(1)]);
            await selectPackage(item);
          }}
        />
      )}
    </div>
  );
}

function PackagesKanban({
  packages,
  loading,
  onSelect,
  onMove,
}: {
  packages: PackageRecord[];
  loading: boolean;
  onSelect: (item: PackageRecord) => void;
  onMove: (id: string, status: PackageStatus) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<PackageStatus | null>(null);
  const columns = [
    "CREATED",
    "RECEIVED_AT_ORIGIN",
    "WAREHOUSE_PROCESSING",
    "READY_FOR_DISPATCH",
    "IN_TRANSIT",
    "CUSTOMS",
    "ARRIVED_DESTINATION",
    "READY_FOR_PICKUP",
    "DELIVERED",
    "BLOCKED",
    "ISSUE",
    "CANCELLED",
  ] as const satisfies readonly PackageStatus[];
  const appearances: Record<
    (typeof columns)[number],
    { dot: string; surface: string }
  > = {
    CREATED: { dot: "bg-[#7b8490]", surface: "bg-[#f3f4f5]" },
    RECEIVED_AT_ORIGIN: { dot: "bg-[#5f6368]", surface: "bg-[#f1f1f0]" },
    WAREHOUSE_PROCESSING: { dot: "bg-[#6c63e8]", surface: "bg-[#f0efff]" },
    READY_FOR_DISPATCH: { dot: "bg-[#f59e0b]", surface: "bg-[#fff8e8]" },
    IN_TRANSIT: { dot: "bg-[#1688e8]", surface: "bg-[#eef7ff]" },
    CUSTOMS: { dot: "bg-[#d97706]", surface: "bg-[#fff7e6]" },
    ARRIVED_DESTINATION: { dot: "bg-[#0f9f82]", surface: "bg-[#eaf8f5]" },
    READY_FOR_PICKUP: { dot: "bg-[#8b5cf6]", surface: "bg-[#f5f0ff]" },
    DELIVERED: { dot: "bg-[#18b981]", surface: "bg-[#eaf9f3]" },
    BLOCKED: { dot: "bg-[#dc2626]", surface: "bg-[#fff0ed]" },
    ISSUE: { dot: "bg-[#e05252]", surface: "bg-[#fff3f1]" },
    CANCELLED: { dot: "bg-[#8a8f98]", surface: "bg-[#f1f2f3]" },
  };
  if (loading) return <LoadingLines />;
  return (
    <div className="min-h-[430px] overflow-x-auto bg-[#f7f7f6] px-4 py-3">
      <div className="flex min-w-max items-start gap-2.5">
        {columns.map((status) => {
          const items = packages.filter((item) => item.status === status);
          const isDropTarget = overStatus === status;
          return (
            <section
              key={status}
              aria-label={`${statusLabels[status]} : ${items.length} colis`}
              onDragEnter={(event) => {
                event.preventDefault();
                setOverStatus(status);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setOverStatus(status);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/package-id");
                const source = packages.find((item) => item.id === id);
                setDraggedId(null);
                setOverStatus(null);
                if (id && source?.status !== status) onMove(id, status);
              }}
              className={`w-[272px] shrink-0 overflow-hidden rounded-md border transition-colors ${isDropTarget ? "border-[#6c63e8] bg-[#f8f7ff]" : "border-[#d8dce2] bg-[#f3f4f5]"}`}
            >
              <header
                className={`flex h-11 items-center justify-between border-b border-[#d8dce2] px-3 ${appearances[status].surface}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-3.5 w-3.5 shrink-0 rounded-[4px] ${appearances[status].dot}`}
                  />
                  <h3 className="truncate text-[12px] font-semibold uppercase tracking-[0.02em] text-[#34383e]">
                    {statusLabels[status]}
                  </h3>
                </div>
                <span className="ml-2 min-w-6 rounded bg-white/80 px-1.5 py-0.5 text-center text-[11px] font-semibold text-[#5e6670]">
                  {items.length}
                </span>
              </header>
              <div
                className={`min-h-[365px] space-y-2 p-2 transition-colors ${isDropTarget ? "bg-[#f8f7ff]" : ""}`}
              >
                {items.map((item) => (
                  <button
                    draggable
                    type="button"
                    key={item.id}
                    aria-label={`Ouvrir le colis ${item.package_reference || item.id}`}
                    onDragStart={(event) => {
                      setDraggedId(item.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/package-id", item.id);
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setOverStatus(null);
                    }}
                    onClick={() => onSelect(item)}
                    className={`group w-full cursor-grab rounded-md border bg-white p-3 text-left transition active:cursor-grabbing ${draggedId === item.id ? "border-[#6c63e8] opacity-45" : "border-[#d8dce2] hover:border-[#aeb6c0] hover:shadow-[0_1px_3px_rgba(15,23,42,0.08)]"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <b className="truncate text-[13px] font-semibold text-[#20242a]">
                        {item.package_reference || "Colis sans référence"}
                      </b>
                      {item.open_anomaly_count > 0 && (
                        <span className="shrink-0 rounded bg-[#fff0ed] px-1.5 py-0.5 text-[10px] font-semibold text-[#c63d2f]">
                          {item.open_anomaly_count} alerte
                          {item.open_anomaly_count > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[12px] text-[#4f5965]">
                      {item.client_name || "Client non renseigné"}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#edf0f2] pt-2 text-[11px] text-[#687481]">
                      <span className="truncate">
                        {item.warehouse_zone ||
                          item.warehouse_name ||
                          "Sans emplacement"}
                      </span>
                      <span className="shrink-0 font-medium text-[#404851]">
                        {item.weight_kg ? `${item.weight_kg} kg` : "Poids —"}
                      </span>
                    </div>
                    {(item.is_fragile ||
                      item.priority === "URGENT" ||
                      item.priority === "HIGH") && (
                      <div className="mt-2 flex gap-1.5">
                        {item.is_fragile && (
                          <span className="rounded bg-[#fff7df] px-1.5 py-0.5 text-[10px] font-medium text-[#9a6500]">
                            Fragile
                          </span>
                        )}
                        {(item.priority === "URGENT" ||
                          item.priority === "HIGH") && (
                          <span className="rounded bg-[#fff0ed] px-1.5 py-0.5 text-[10px] font-medium text-[#b43d31]">
                            Prioritaire
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                ))}
                {items.length === 0 && (
                  <div
                    className={`flex h-24 items-center justify-center rounded-md border border-dashed text-[12px] ${isDropTarget ? "border-[#8d86ee] bg-white text-[#5149bd]" : "border-[#cfd4da] text-[#87919c]"}`}
                  >
                    {isDropTarget ? "Déposer le colis ici" : "Aucun colis"}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PackagesAnalytics({
  stats,
  analytics,
}: {
  stats: PackageStats;
  analytics: PackageAnalytics | null;
}) {
  const max = Math.max(stats.total, 1);
  const rows = [
    ["En attente", stats.waiting],
    ["Prêts à expédier", stats.ready_for_dispatch],
    ["En transit", stats.in_transit],
    ["Livrés", stats.delivered],
    ["Anomalies", stats.issues],
    ["Prioritaires", stats.priority_count || 0],
    ["Fragiles", stats.fragile_count || 0],
  ] as const;
  return (
    <div className="grid gap-4 bg-[#f7f7f6] p-5 lg:grid-cols-2">
      <Section title="Flux des colis">
        <div className="space-y-4">
          {rows.map(([label, value]) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-[13px]">
                <span>{label}</span>
                <b>{value}</b>
              </div>
              <div className="h-2 rounded bg-slate-100">
                <div
                  className="h-2 rounded bg-[#12c76f]"
                  style={{
                    width: `${Math.max(value ? 3 : 0, (value / max) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Performance">
        <div className="grid grid-cols-2 gap-3">
          <SmallMetric
            label="Stockage moyen"
            value={`${analytics?.summary.average_storage_days ?? 0} jours`}
          />
          <SmallMetric
            label="Avant expédition"
            value={`${analytics?.summary.average_before_dispatch_days ?? 0} jours`}
          />
          <SmallMetric
            label="Taux anomalies"
            value={`${analytics?.summary.anomaly_rate ?? 0} %`}
          />
          <SmallMetric label="Reçus aujourd’hui" value={stats.received_today} />
        </div>
      </Section>
      <Section title="Par entrepôt">
        <AnalyticsRows rows={analytics?.warehouses || []} />
      </Section>
      <Section title="Capacité">
        <div className="space-y-3">
          {(analytics?.capacity || []).map((row) => (
            <div key={row.label} className="text-[13px]">
              <div className="flex justify-between">
                <span>{row.label}</span>
                <b>
                  {row.occupied}/{row.capacity || "—"}
                </b>
              </div>
              <div className="mt-1 h-2 rounded bg-slate-100">
                <div
                  className="h-2 rounded bg-blue-500"
                  style={{
                    width: `${row.capacity ? Math.min(100, (row.occupied / row.capacity) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Fournisseurs">
        <AnalyticsRows rows={analytics?.suppliers || []} />
      </Section>
      <Section title="Destinations">
        <AnalyticsRows rows={analytics?.destinations || []} />
      </Section>
    </div>
  );
}

function AnalyticsRows({
  rows,
}: {
  rows: Array<{ label: string; count: number }>;
}) {
  return rows.length ? (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex justify-between border-b py-2 text-[13px]"
        >
          <span>{row.label || "Non renseigné"}</span>
          <b>{row.count}</b>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-[13px] text-slate-500">Aucune donnée.</p>
  );
}

function PackagesTable({
  packages,
  loading,
  selectedId,
  onSelect,
}: {
  packages: PackageRecord[];
  loading: boolean;
  selectedId?: string;
  onSelect: (item: PackageRecord) => void;
}) {
  if (loading) {
    return <TableSkeleton />;
  }
  if (packages.length === 0) {
    return <SharedEmptyState title="Aucun colis trouvé" description="Créez un colis depuis un dossier réel ou ajustez les filtres de cette vue." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[900px] w-full border-collapse text-left text-[13px]">
        <thead className="border-b border-[#d8dce2] bg-[#f7f8fa] font-medium text-[#5f6b76]">
          <tr>
            <th className="px-3 py-2">Colis</th>
            <th className="px-3 py-2">Dossier / Client</th>
            <th className="px-3 py-2 text-right">Poids</th>
            <th className="px-3 py-2">Origine → destination</th>
            <th className="px-3 py-2">Statut</th>
            <th className="px-3 py-2">Dernière mise à jour</th>
            <th className="w-10 px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf0f2]">
          {packages.map((item) => (
            <tr
              key={item.id}
              onClick={() => onSelect(item)}
              className={`cursor-pointer transition hover:bg-[#f6f8fb] ${selectedId === item.id ? "bg-[#edf2f8]" : ""}`}
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-3">
                  <PackageThumbnail item={item} />
                  <div>
                    <p className="font-medium text-[#1f2328]">
                      {item.package_reference ||
                        item.tracking_id ||
                        item.id.slice(0, 8)}
                    </p>
                    <p className="text-[12px] text-[#687584]">
                      {item.tracking_id ||
                        sourceLabels[item.source] ||
                        item.source}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2">
                <p className="text-[12px] text-[#687584]">
                  {item.dossier_reference || "-"}
                </p>
                <p className="font-medium text-[#1f2328]">
                  {item.client_name || "Client"}
                </p>
              </td>
              <td className="px-3 py-2 text-right text-[#334155]">
                {item.weight_kg ? `${item.weight_kg} kg` : "-"}
              </td>
              <td className="px-3 py-2 text-[#334155]">
                <p>
                  {item.origin_city || item.origin_country || "-"} →{" "}
                  {item.destination_city || item.destination_country || "-"}
                </p>
                <p className="text-[12px] text-[#687584]">
                  {item.origin_country || "-"} →{" "}
                  {item.destination_country || "-"}
                </p>
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={item.status} />
              </td>
              <td className="px-3 py-2 text-[#687584]">
                {formatDate(item.updated_at || item.created_at)}
              </td>
              <td className="px-3 py-2">
                <ChevronRight size={16} className="text-[#687584]" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PackageThumbnail({ item }: { item: PackageRecord }) {
  const media = item.media?.find((file) =>
    file.media_type?.startsWith("image"),
  );
  if (media?.media_url)
    return (
      <Image
        src={media.media_url}
        alt=""
        width={56}
        height={48}
        unoptimized
        className="h-12 w-14 shrink-0 rounded-md border border-[#d8dce2] object-cover"
      />
    );
  return (
    <span className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-[#cfd5dd] bg-[#f7f8f8] text-[#7b8794]">
      <ImageIcon size={17} />
      <small className="mt-0.5 text-[9px]">Photo manquante</small>
    </span>
  );
}

function PackageDetails({
  item,
  loading,
  activeTab,
  onTabChange,
  timeline,
  timelineLoading,
  onClose,
  onEdit,
  onUpdated,
}: {
  item: PackageRecord;
  loading: boolean;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  timeline: PackageTimelineEvent[];
  timelineLoading: boolean;
  onClose: () => void;
  onEdit: () => void;
  onUpdated: (item: PackageRecord) => void;
}) {
  const tabs: Array<{ key: DetailTab; label: string }> = [
    { key: "summary", label: "Résumé" },
    { key: "dossier", label: "Dossier" },
    { key: "measures", label: "Mesures" },
    { key: "warehouse", label: "Entrepôt" },
    { key: "shipment", label: "Expédition" },
    { key: "payment", label: "Paiement" },
    { key: "anomalies", label: "Anomalies" },
    { key: "documents", label: "Documents" },
    { key: "media", label: "Photos" },
    { key: "notes", label: "Notes" },
    { key: "notifications", label: "Notifications" },
    { key: "history", label: "Historique" },
    { key: "settings", label: "Paramètres" },
  ];

  async function refreshPackage(next: PackageRecord) {
    onUpdated(next);
  }

  return (
    <OperationDrawer
      open
      close={onClose}
      title={item.package_reference || item.tracking_id || "Colis"}
      description={`${item.client_name || "Client"} · ${item.dossier_reference || "Dossier non lié"}`}
      width="max-w-[680px]"
      headerActions={
        <button onClick={onEdit} className={iconButtonClass} aria-label="Modifier le colis" title="Modifier le colis">
          <Edit3 size={16} />
        </button>
      }
      headerMeta={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status} />
          <InventoryBadge status={item.inventory_status} />
          <ValidationBadge status={item.validation_status} />
          <PaymentBadge status={item.payment_clearance_status} />
          {loading && <span className="text-[12px] text-[#687584]">Actualisation…</span>}
        </div>
      }
      tabs={tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`h-8 whitespace-nowrap rounded-md px-3 text-[13px] font-medium ${activeTab === tab.key ? "bg-[#e9ecef] text-[#111827]" : "text-[#5f6b76] hover:bg-[#f4f6f8]"}`}
        >
          {tab.label}
        </button>
      ))}
      bodyClassName={loading ? "opacity-60" : undefined}
    >
            {activeTab === "summary" && (
              <SummaryTab item={item} onUpdated={refreshPackage} />
            )}
            {activeTab === "dossier" && <DossierTab item={item} />}
            {activeTab === "measures" && <MeasuresTab item={item} />}
            {activeTab === "warehouse" && (
              <WarehouseTab item={item} onUpdated={refreshPackage} />
            )}
            {activeTab === "shipment" && (
              <ShipmentTab item={item} onUpdated={refreshPackage} />
            )}
            {activeTab === "payment" && <PaymentTab item={item} />}
            {activeTab === "anomalies" && (
              <AnomaliesTab item={item} onUpdated={refreshPackage} />
            )}
            {activeTab === "documents" && (
              <DocumentsTab item={item} onUpdated={refreshPackage} />
            )}
            {activeTab === "media" && (
              <MediaTab item={item} onUpdated={refreshPackage} />
            )}
            {activeTab === "notes" && (
              <NotesTab item={item} onUpdated={refreshPackage} />
            )}
            {activeTab === "notifications" && (
              <NotificationsTab item={item} onUpdated={refreshPackage} />
            )}
            {activeTab === "history" && (
              <HistoryTab events={timeline} loading={timelineLoading} />
            )}
            {activeTab === "settings" && (
              <SettingsTab item={item} onArchived={onClose} />
            )}
    </OperationDrawer>
  );
}

function SummaryTab({
  item,
  onUpdated,
}: {
  item: PackageRecord;
  onUpdated: (item: PackageRecord) => void;
}) {
  return (
    <div className="space-y-5">
      <Section title="Résumé opérationnel">
        <div className="grid grid-cols-3 gap-3">
          <SmallMetric label="Réceptions" value={item.receipt_count} />
          <SmallMetric label="Photos" value={item.media_count} />
          <SmallMetric label="Événements" value={item.event_count} />
        </div>
      </Section>
      <Section title="Colis">
        <InfoRow
          icon={Barcode}
          label="Référence"
          value={item.package_reference || "-"}
        />
        <InfoRow
          icon={PackageSearch}
          label="Tracking ID"
          value={item.tracking_id || "-"}
        />
        <InfoRow
          icon={Box}
          label="Marchandise"
          value={item.description || item.category || "-"}
        />
        <InfoRow icon={Ruler} label="Mesures" value={formatMeasure(item)} />
      </Section>
      <Section title="Route & dates">
        <InfoRow icon={MapPin} label="Route" value={routeLabel(item)} />
        <InfoRow icon={Truck} label="Mode" value={item.shipping_mode || "-"} />
        <Field label="ETA" value={formatDate(item.eta_at)} />
        <Field
          label="Dernier scan"
          value={
            item.last_scan_location
              ? `${item.last_scan_location} · ${formatDate(item.last_scan_at)}`
              : "-"
          }
        />
      </Section>
      <Section title="Finance">
        <Field
          label="Montant facturé"
          value={formatMoney(item.fees_total, item.currency)}
        />
        <Field
          label="Montant payé"
          value={formatMoney(item.fees_paid, item.currency)}
        />
        <Field
          label="Statut paiement"
          value={
            paymentLabels[item.payment_clearance_status] ||
            item.payment_clearance_status
          }
        />
      </Section>
      <PhysicalLifecycle item={item} onUpdated={onUpdated} />
    </div>
  );
}

const lifecycle: Record<string, Array<[PackageStatus, string]>> = {
  CREATED: [
    ["PENDING_VALIDATION", "Soumettre à validation"],
    ["CONFIRMED", "Confirmer"],
  ],
  PENDING_VALIDATION: [
    ["CONFIRMED", "Confirmer"],
    ["BLOCKED", "Bloquer"],
  ],
  CONFIRMED: [["RECEIVED", "Marquer reçu"]],
  RECEIVED: [
    ["WAREHOUSED", "Mettre en entrepôt"],
    ["BLOCKED", "Bloquer"],
  ],
  RECEIVED_AT_ORIGIN: [["WAREHOUSED", "Mettre en entrepôt"]],
  WAREHOUSE_PROCESSING: [["WAREHOUSED", "Confirmer le stockage"]],
  WAREHOUSED: [
    ["READY_FOR_BATCH", "Prêt au groupage"],
    ["BLOCKED", "Bloquer"],
  ],
  READY_FOR_BATCH: [["BATCHED", "Ajouter au batch"]],
  READY_FOR_DISPATCH: [
    ["BATCHED", "Ajouter au batch"],
    ["SHIPPED", "Marquer expédié"],
  ],
  BATCHED: [["SHIPPED", "Marquer expédié"]],
  SHIPPED: [["IN_TRANSIT", "En transit"]],
  IN_TRANSIT: [
    ["ARRIVED", "Marquer arrivé"],
    ["BLOCKED", "Bloquer"],
  ],
  ARRIVED: [["CLEARED", "Dédouané"]],
  ARRIVED_DESTINATION: [
    ["CLEARED", "Dédouané"],
    ["READY_FOR_PICKUP", "Prêt au retrait"],
  ],
  CUSTOMS: [["CLEARED", "Dédouané"]],
  CLEARED: [["READY_FOR_PICKUP", "Prêt au retrait"]],
};
function PhysicalLifecycle({
  item,
  onUpdated,
}: {
  item: PackageRecord;
  onUpdated: (item: PackageRecord) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [departures, setDepartures] = useState<Array<Record<string, unknown>>>([]);
  async function move(next: PackageStatus) {
    setBusy(true);
    setError("");
    try {
      onUpdated(
        await transitionPackageState(
          item.id,
          next,
          item.row_version || 1,
          next === "BLOCKED"
            ? prompt("Motif du blocage") || undefined
            : undefined,
        ),
      );
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function quality(result: "COMPLIANT" | "REVIEW" | "NON_COMPLIANT") {
    setBusy(true);
    try {
      onUpdated(
        await qualityControlPackage(item.id, {
          packaging_intact: result === "COMPLIANT",
          label_readable: true,
          product_compliant: result === "COMPLIANT",
          quantity_compliant: result === "COMPLIANT",
          no_damage: result !== "NON_COMPLIANT",
          no_moisture: true,
          result,
          notes: prompt("Observation du contrôle qualité") || undefined,
        }),
      );
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function proof() {
    const recipient = prompt("Nom complet du réceptionnaire");
    if (!recipient) return;
    setBusy(true);
    try {
      onUpdated(
        await addPackageDeliveryProof(item.id, {
          recipient_name: recipient,
          otp_verified: window.confirm("OTP vérifié ?"),
        }),
      );
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function find() {
    try {
      setDepartures(await compatiblePackageDepartures(item.id));
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }
  return (
    <Section title="Cycle de vie physique">
      <div className="flex flex-wrap gap-2">
        {(lifecycle[item.status] || []).map(([s, l]) => (
          <button
            disabled={busy}
            key={s}
            onClick={() => move(s)}
            className={primaryButtonClass}
          >
            {l}
          </button>
        ))}
        <button
          disabled={busy}
          onClick={() => quality("COMPLIANT")}
          className={buttonClass}
        >
          Contrôle conforme
        </button>
        <button
          disabled={busy}
          onClick={() => quality("NON_COMPLIANT")}
          className={buttonClass}
        >
          Signaler non-conformité
        </button>
        <button disabled={busy} onClick={find} className={buttonClass}>
          Départs compatibles
        </button>
        {item.status === "READY_FOR_PICKUP" && (
          <button
            disabled={busy}
            onClick={proof}
            className={primaryButtonClass}
          >
            Preuve de retrait
          </button>
        )}
      </div>
      {departures.length > 0 && (
        <div className="mt-3 space-y-2">
          {departures.map((d, i) => (
            <div key={String(d.id || i)} className="border-t pt-2 text-[12px]">
              <b>{String(d.departure_code || "Départ")}</b> ·{" "}
              {String(d.route_name || "")} ·{" "}
              {formatDate(String(d.scheduled_at || ""))}
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </Section>
  );
}

function MeasuresTab({ item }: { item: PackageRecord }) {
  return (
    <div className="space-y-5">
      <Section title="Mesures physiques">
        <div className="grid grid-cols-2 gap-3">
          <SmallMetric
            label="Poids réel"
            value={item.weight_kg ? `${item.weight_kg} kg` : "-"}
          />
          <SmallMetric
            label="Poids volumétrique"
            value={
              item.volumetric_weight_kg
                ? `${item.volumetric_weight_kg} kg`
                : "-"
            }
          />
          <SmallMetric
            label="Volume"
            value={item.volume_cbm ? `${item.volume_cbm} m³` : "-"}
          />
          <SmallMetric label="Pièces" value={item.pieces_count || 1} />
        </div>
      </Section>
      <Section title="Dimensions & valeur">
        <Field label="Dimensions" value={dimensionsLabel(item)} />
        <Field
          label="Type colis"
          value={packageTypeLabels[item.package_type] || item.package_type}
        />
        <Field label="Catégorie" value={item.category || "-"} />
        <Field
          label="Valeur déclarée"
          value={formatMoney(
            item.declared_value,
            item.declared_currency || item.currency,
          )}
        />
        <Field label="Fragile" value={item.is_fragile ? "Oui" : "Non"} />
      </Section>
      <Section title="Contrôle">
        <Field
          label="Validation"
          value={
            validationLabels[item.validation_status] || item.validation_status
          }
        />
        <Field
          label="État colis"
          value={
            conditionLabels[item.package_condition] || item.package_condition
          }
        />
        <Field label="Notes internes" value={item.notes || "-"} />
      </Section>
    </div>
  );
}

function DossierTab({ item }: { item: PackageRecord }) {
  return (
    <div className="space-y-5">
      <Section title="Dossier lié">
        <InfoRow
          icon={FileText}
          label="Référence dossier"
          value={item.dossier_reference || "-"}
        />
        <Field label="Type" value={item.dossier_case_type || "-"} />
        <Field label="Statut dossier" value={item.dossier_status || "-"} />
      </Section>
      <Section title="Client">
        <Field label="Nom" value={item.client_name || "-"} />
        <Field label="Téléphone" value={item.client_phone || "-"} />
        <Field label="Email" value={item.client_email || "-"} />
      </Section>
    </div>
  );
}

function WarehouseTab({
  item,
  onUpdated,
}: {
  item: PackageRecord;
  onUpdated: (item: PackageRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function move(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(event.currentTarget);
    try {
      onUpdated(
        await movePackage(item.id, {
          to_warehouse: String(f.get("warehouse") || ""),
          to_zone: clean(f.get("zone")),
          to_aisle: clean(f.get("aisle")),
          to_shelf: clean(f.get("shelf")),
          to_position: clean(f.get("position")),
          reason: clean(f.get("reason")),
        }),
      );
      event.currentTarget.reset();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function weigh(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(event.currentTarget);
    try {
      onUpdated(
        await weighPackage(item.id, {
          weight_kg: Number(f.get("weight")),
          source: "MANUAL",
          device_reference: clean(f.get("device")),
          notes: clean(f.get("notes")),
        }),
      );
      event.currentTarget.reset();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function checklist(id: string, next: string) {
    setBusy(true);
    try {
      onUpdated(await updatePackageChecklist(item.id, id, next));
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Section title="Emplacement actuel">
        <InfoRow
          icon={Warehouse}
          label="Entrepôt"
          value={item.warehouse_name || "-"}
        />
        <Field label="Zone" value={item.warehouse_zone || "-"} />
        <Field label="Rack" value={item.warehouse_rack || "-"} />
        <Field label="Emplacement" value={item.warehouse_location || "-"} />
        <Field
          label="Statut stock"
          value={
            inventoryLabels[item.inventory_status] || item.inventory_status
          }
        />
      </Section>
      <Section title="Réception">
        <Field
          label="Date réception"
          value={formatDate(item.received_at || item.received_at_origin_at)}
        />
        <Field
          label="Dernier scan"
          value={
            item.last_scan_location
              ? `${item.last_scan_location} · ${formatDate(item.last_scan_at)}`
              : "-"
          }
        />
        <Field
          label="Source"
          value={sourceLabels[item.source] || item.source}
        />
      </Section>
      <Section title="Déplacer le colis">
        <form onSubmit={move} className="grid grid-cols-2 gap-2">
          <input
            required
            name="warehouse"
            className={inputClass}
            placeholder="Entrepôt"
          />
          <input name="zone" className={inputClass} placeholder="Zone" />
          <input name="aisle" className={inputClass} placeholder="Allée" />
          <input name="shelf" className={inputClass} placeholder="Étagère" />
          <input
            name="position"
            className={inputClass}
            placeholder="Position"
          />
          <input name="reason" className={inputClass} placeholder="Motif" />
          <button disabled={busy} className={primaryButtonClass}>
            Déplacer
          </button>
        </form>
      </Section>
      <Section title="Peser">
        <form onSubmit={weigh} className="grid grid-cols-2 gap-2">
          <input
            required
            min="0"
            step="0.001"
            type="number"
            name="weight"
            className={inputClass}
            placeholder="Poids kg"
          />
          <input
            name="device"
            className={inputClass}
            placeholder="Balance / appareil"
          />
          <input
            name="notes"
            className={`${inputClass} col-span-2`}
            placeholder="Observation"
          />
          <button disabled={busy} className={primaryButtonClass}>
            Enregistrer la pesée
          </button>
        </form>
      </Section>
      <Section title="Checklist opérationnelle">
        <div className="space-y-2">
          {(item.checklist || []).map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-3 rounded border p-3"
            >
              <input
                type="checkbox"
                checked={c.status === "COMPLETED"}
                disabled={busy}
                onChange={(e) =>
                  checklist(c.id, e.target.checked ? "COMPLETED" : "PENDING")
                }
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </Section>
      <Section title="Historique des déplacements">
        {(item.movements || []).length ? (
          <div className="space-y-2">
            {item.movements!.map((m) => (
              <div key={m.id} className="rounded border p-3 text-[13px]">
                <b>
                  {[
                    m.to_warehouse,
                    m.to_zone,
                    m.to_aisle,
                    m.to_shelf,
                    m.to_position,
                  ]
                    .filter(Boolean)
                    .join(" / ")}
                </b>
                <p className="text-slate-500">
                  {m.reason || "Déplacement entrepôt"} ·{" "}
                  {formatDate(m.created_at)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-slate-500">
            Aucun déplacement enregistré.
          </p>
        )}
      </Section>
      {error && <p className="text-[13px] text-red-600">{error}</p>}
    </div>
  );
}

function ShipmentTab({
  item,
  onUpdated,
}: {
  item: PackageRecord;
  onUpdated: (item: PackageRecord) => void;
}) {
  const [shipments, setShipments] = useState<ExpeditionRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    listShipments({ page_size: 100, sort: "updated_desc" })
      .then((r) => setShipments(r.items))
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);
  async function attach(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const id = String(new FormData(e.currentTarget).get("shipment_id") || "");
    if (!id) return;
    setBusy(true);
    try {
      await addShipmentPackage(id, item.id);
      onUpdated(await getPackage(item.id));
    } catch (x) {
      setError(apiErrorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  async function detach() {
    if (
      !item.shipment_id ||
      !window.confirm("Dissocier ce colis de l’expédition ?")
    )
      return;
    setBusy(true);
    try {
      await removeShipmentPackage(
        item.shipment_id,
        item.id,
        "Dissociation depuis la fiche colis",
      );
      onUpdated(await getPackage(item.id));
    } catch (x) {
      setError(apiErrorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Section title="Expédition liée">
        <InfoRow
          icon={Truck}
          label="Référence expédition"
          value={item.shipment_reference || "-"}
        />
        <Field
          label="Service"
          value={item.service_type || item.shipping_mode || "-"}
        />
        <Field label="Route" value={routeLabel(item)} />
        <Field label="ETA" value={formatDate(item.eta_at)} />
      </Section>
      <Section title="Dates opérationnelles">
        <Field label="Départ" value={formatDate(item.dispatched_at)} />
        <Field
          label="Arrivée / livraison"
          value={formatDate(item.delivered_at)}
        />
        <Field
          label="Tracking public"
          value={item.public_tracking_enabled ? "Activé" : "Désactivé"}
        />
      </Section>
      <Section title="Affectation">
        <form onSubmit={attach} className="space-y-2">
          <select
            required
            name="shipment_id"
            className={inputClass}
            defaultValue={item.shipment_id || ""}
          >
            <option value="">Sélectionner une expédition</option>
            {shipments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.expedition_reference} · {s.origin_city || "?"} →{" "}
                {s.destination_city || "?"} · {s.status}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button disabled={busy} className={primaryButtonClass}>
              Associer
            </button>
            {item.shipment_id && (
              <button
                type="button"
                disabled={busy}
                onClick={detach}
                className={buttonClass}
              >
                Dissocier
              </button>
            )}
          </div>
        </form>
        {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      </Section>
    </div>
  );
}

function PaymentTab({ item }: { item: PackageRecord }) {
  const remaining = Number(item.fees_total || 0) - Number(item.fees_paid || 0);
  return (
    <div className="space-y-5">
      <Section title="Paiement colis">
        <div className="grid grid-cols-3 gap-3">
          <SmallMetric
            label="Facturé"
            value={formatMoney(item.fees_total, item.currency)}
          />
          <SmallMetric
            label="Payé"
            value={formatMoney(item.fees_paid, item.currency)}
          />
          <SmallMetric
            label="Reste"
            value={formatMoney(Math.max(remaining, 0), item.currency)}
          />
        </div>
      </Section>
      <Section title="Statut">
        <Field
          label="Paiement"
          value={
            paymentLabels[item.payment_clearance_status] ||
            item.payment_clearance_status
          }
        />
        <Field label="Devise" value={item.currency || "-"} />
      </Section>
    </div>
  );
}

function AnomaliesTab({
  item,
  onUpdated,
}: {
  item: PackageRecord;
  onUpdated: (item: PackageRecord) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const anomalies = item.anomalies || [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const updated = await createPackageAnomaly(item.id, {
        anomaly_type: String(form.get("anomaly_type") || "OTHER"),
        severity: String(form.get("severity") || "MEDIUM") as AnomalySeverity,
        title: String(form.get("title") || ""),
        description: clean(form.get("description")),
      });
      onUpdated(updated);
      event.currentTarget.reset();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function resolve(anomalyId: string) {
    setSaving(true);
    try {
      onUpdated(
        await resolvePackageAnomaly(
          item.id,
          anomalyId,
          "Résolu depuis la fiche colis.",
        ),
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Section title="Signaler une anomalie">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              name="title"
              label="Titre"
              placeholder="Poids incohérent, colis abîmé..."
            />
            <label className="block">
              <FormLabel>Sévérité</FormLabel>
              <select
                name="severity"
                defaultValue="MEDIUM"
                className={inputClass}
              >
                <option value="LOW">Faible</option>
                <option value="MEDIUM">Moyenne</option>
                <option value="HIGH">Haute</option>
                <option value="CRITICAL">Critique</option>
              </select>
            </label>
          </div>
          <TextInput
            name="anomaly_type"
            label="Type"
            placeholder="WEIGHT, DAMAGE, MISSING_INFO..."
          />
          <label className="block">
            <FormLabel>Description</FormLabel>
            <textarea
              name="description"
              className={`${inputClass} h-24 py-2`}
            />
          </label>
          {error && <p className="text-[13px] text-red-600">{error}</p>}
          <button disabled={saving} className={buttonClass}>
            <AlertTriangle size={15} />
            {saving ? "Enregistrement..." : "Créer l’anomalie"}
          </button>
        </form>
      </Section>
      <Section title="Anomalies">
        {anomalies.length === 0 ? (
          <EmptyState
            title="Aucune anomalie"
            text="Ce colis ne présente aucun blocage ou incident ouvert."
          />
        ) : (
          <div className="space-y-2">
            {anomalies.map((anomaly) => (
              <div
                key={anomaly.id}
                className="rounded-md border border-[#d8dce2] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{anomaly.title}</p>
                    <p className="mt-1 text-[13px] text-[#687584]">
                      {anomaly.severity} · {anomaly.status} ·{" "}
                      {formatDate(anomaly.detected_at)}
                    </p>
                  </div>
                  {anomaly.status !== "RESOLVED" && (
                    <button
                      disabled={saving}
                      onClick={() => resolve(anomaly.id)}
                      className={buttonClass}
                    >
                      <CheckCircle2 size={15} />
                      Résoudre
                    </button>
                  )}
                </div>
                {anomaly.description && (
                  <p className="mt-2 text-[13px] leading-5 text-[#4b5563]">
                    {anomaly.description}
                  </p>
                )}
                {anomaly.resolution_notes && (
                  <p className="mt-2 text-[13px] leading-5 text-emerald-700">
                    {anomaly.resolution_notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function MediaTab({
  item,
  onUpdated,
}: {
  item: PackageRecord;
  onUpdated: (item: PackageRecord) => void;
}) {
  const media = item.media || [];
  const [error, setError] = useState("");
  async function view(id: string, url: string) {
    if (url !== "PRIVATE") {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      window.open(
        await getPackageMediaUrl(item.id, id),
        "_blank",
        "noopener,noreferrer",
      );
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }
  return (
    <div className="space-y-5">
      <AddMediaForm item={item} onUpdated={onUpdated} />
      {media.length === 0 ? (
        <EmptyState
          title="Aucune photo"
          text="Les photos de réception, étiquettes et preuves liées à ce colis seront visibles ici."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {media.map((file) => (
            <button
              key={file.id}
              onClick={() => view(file.id, file.media_url)}
              className="rounded-md border border-[#d8dce2] p-3 text-left transition hover:bg-[#f7f8fa]"
            >
              <div className="flex h-28 items-center justify-center rounded-md bg-[#f1f3f5] text-[#64748b]">
                <ImageIcon size={28} />
              </div>
              <p className="mt-3 truncate text-[13px] font-medium">
                {file.caption ||
                  file.file_name ||
                  file.media_type ||
                  "Média colis"}
              </p>
              <p className="text-[11px] uppercase text-slate-500">
                {file.category || "Réception"}
              </p>
              <p className="mt-1 text-[12px] text-[#687584]">
                {formatDate(file.created_at)}
              </p>
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-[13px] text-red-600">{error}</p>}
    </div>
  );
}

function AddMediaForm({
  item,
  onUpdated,
}: {
  item: PackageRecord;
  onUpdated: (item: PackageRecord) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const file = form.get("file");
      if (!(file instanceof File) || !file.size)
        throw new Error("Sélectionnez un fichier.");
      onUpdated(
        await uploadPackageMedia(
          item.id,
          file,
          String(form.get("category") || "RECEPTION"),
          clean(form.get("caption")) || undefined,
        ),
      );
      event.currentTarget.reset();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Section title="Ajouter un média">
      <form onSubmit={submit} className="space-y-3">
        <input
          required
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,audio/mpeg,audio/mp4,audio/ogg"
          capture="environment"
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-3">
          <label>
            <FormLabel>Catégorie</FormLabel>
            <select name="category" className={inputClass}>
              <option value="BEFORE_RECEPTION">Avant réception</option>
              <option value="RECEPTION">Réception</option>
              <option value="QUALITY_CONTROL">Contrôle qualité</option>
              <option value="LOADING">Chargement</option>
              <option value="UNLOADING">Déchargement</option>
            </select>
          </label>
          <TextInput name="caption" label="Légende" />
        </div>
        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <button disabled={saving} className={buttonClass}>
          <Upload size={15} />
          {saving ? "Ajout..." : "Ajouter le média"}
        </button>
      </form>
    </Section>
  );
}

function DocumentsTab({
  item,
  onUpdated,
}: {
  item: PackageRecord;
  onUpdated: (item: PackageRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("Sélectionnez un fichier.");
      setBusy(false);
      return;
    }
    try {
      await uploadPackageDocument(
        item.id,
        file,
        String(f.get("type") || "OTHER"),
        clean(f.get("notes")) || undefined,
      );
      onUpdated(await getPackage(item.id));
      e.currentTarget.reset();
    } catch (x) {
      setError(apiErrorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  async function download(id: string) {
    try {
      window.open(
        await getPackageDocumentDownload(item.id, id),
        "_blank",
        "noopener,noreferrer",
      );
    } catch (x) {
      setError(apiErrorMessage(x));
    }
  }
  return (
    <div className="space-y-5">
      <Section title="Téléverser un document">
        <form onSubmit={submit} className="space-y-2">
          <input
            required
            type="file"
            name="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className={inputClass}
          />
          <select name="type" className={inputClass}>
            <option value="SUPPLIER_INVOICE">Facture fournisseur</option>
            <option value="RECEIPT">Bon de réception</option>
            <option value="CUSTOMS">Déclaration douanière</option>
            <option value="INSURANCE">Assurance</option>
            <option value="LABEL">Étiquette</option>
            <option value="OTHER">Autre</option>
          </select>
          <input
            name="notes"
            className={inputClass}
            placeholder="Observation"
          />
          <button disabled={busy} className={primaryButtonClass}>
            {busy ? "Téléversement…" : "Téléverser"}
          </button>
        </form>
      </Section>
      <Section title="Documents">
        {(item.documents || []).length ? (
          <div className="space-y-2">
            {item.documents!.map((d) => (
              <button
                key={d.id}
                onClick={() => download(d.id)}
                className="flex w-full justify-between rounded border p-3 text-left text-[13px]"
              >
                <span>
                  <b>{d.file_name}</b>
                  <small className="block text-slate-500">
                    {d.document_type} · {Math.ceil(d.size_bytes / 1024)} Ko
                  </small>
                </span>
                <Download size={16} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Aucun document"
            text="Ajoutez les pièces liées à ce colis."
          />
        )}
      </Section>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

function NotesTab({
  item,
  onUpdated,
}: {
  item: PackageRecord;
  onUpdated: (item: PackageRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      onUpdated(await addPackageNote(item.id, String(f.get("body") || "")));
      e.currentTarget.reset();
    } catch (x) {
      setError(apiErrorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Section title="Nouvelle note">
        <form onSubmit={submit} className="space-y-2">
          <textarea
            required
            minLength={1}
            maxLength={4000}
            name="body"
            className="min-h-24 w-full rounded-md border p-3 text-[13px]"
            placeholder="Note privée pour l’équipe…"
          />
          <button disabled={busy} className={primaryButtonClass}>
            Ajouter la note
          </button>
        </form>
      </Section>
      <Section title="Notes internes">
        {(item.notes_items || []).length ? (
          <div className="space-y-2">
            {item.notes_items!.map((n) => (
              <article key={n.id} className="rounded border p-3 text-[13px]">
                <p>{n.body}</p>
                <small className="mt-2 block text-slate-500">
                  {n.author_id} · {formatDate(n.created_at)}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Aucune note"
            text="Les notes privées apparaîtront ici."
          />
        )}
      </Section>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

function SettingsTab({
  item,
  onArchived,
}: {
  item: PackageRecord;
  onArchived: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function archive() {
    if (!window.confirm(`Archiver ${item.package_reference || "ce colis"} ?`))
      return;
    setBusy(true);
    try {
      await archivePackage(item.id);
      onArchived();
    } catch (x) {
      setError(apiErrorMessage(x));
      setBusy(false);
    }
  }
  function printLabel() {
    const popup = window.open("", "_blank", "width=520,height=680");
    if (!popup) return;
    const safe = (value: unknown) =>
      String(value ?? "-").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c] || c,
      );
    popup.document.write(
      `<html><head><title>${safe(item.package_reference || "Colis")}</title><style>body{font-family:Arial;padding:28px}.label{border:3px solid #111;padding:24px}h1{font-size:32px}.code{font-family:monospace;font-size:22px;letter-spacing:3px;border:1px solid;padding:16px;text-align:center}</style></head><body><div class="label"><h1>${safe(item.package_reference || "COLIS")}</h1><p><b>Client:</b> ${safe(item.client_name)}</p><p><b>Dossier:</b> ${safe(item.dossier_reference)}</p><p><b>Destination:</b> ${safe(item.destination_city)}, ${safe(item.destination_country)}</p><p><b>Poids:</b> ${safe(item.weight_kg)} kg</p><div class="code">${safe(item.barcode || item.tracking_id || item.package_reference)}</div></div><script>window.print();<\/script></body></html>`,
    );
    popup.document.close();
  }
  return (
    <div className="space-y-5">
      <Section title="Identité">
        <Field label="Parcel ID" value={item.package_reference || "-"} />
        <Field label="Tracking fournisseur" value={item.tracking_id || "-"} />
        <Field label="Code-barres" value={item.barcode || "-"} />
        <Field label="QR" value={item.qr_code_value || "-"} />
        <button onClick={printLabel} className={buttonClass}>
          Imprimer l’étiquette
        </button>
      </Section>
      <section className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h3 className="font-semibold text-red-800">Zone sensible</h3>
        <p className="my-2 text-[13px] text-red-700">
          L’archivage retire le colis des opérations courantes sans effacer son
          historique.
        </p>
        <button
          disabled={busy}
          onClick={archive}
          className="rounded bg-red-700 px-3 py-2 text-[13px] font-semibold text-white"
        >
          Archiver le colis
        </button>
        {error && <p className="mt-2 text-red-700">{error}</p>}
      </section>
    </div>
  );
}

function NotificationsTab({
  item,
  onUpdated,
}: {
  item: PackageRecord;
  onUpdated: (item: PackageRecord) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const notifications = item.notifications || [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const updated = await createPackageNotification(item.id, {
        channel: String(form.get("channel") || "whatsapp") as "whatsapp",
        notification_type: String(
          form.get("notification_type") || "PACKAGE_UPDATE",
        ),
        recipient: clean(form.get("recipient")),
        message: String(form.get("message") || ""),
      });
      onUpdated(updated);
      event.currentTarget.reset();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Section title="Préparer une notification">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <FormLabel>Canal</FormLabel>
              <select
                name="channel"
                defaultValue="whatsapp"
                className={inputClass}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="internal">Interne</option>
              </select>
            </label>
            <TextInput
              name="notification_type"
              label="Type"
              defaultValue="PACKAGE_UPDATE"
            />
          </div>
          <TextInput
            name="recipient"
            label="Destinataire"
            defaultValue={item.client_phone || item.client_email || ""}
          />
          <label className="block">
            <FormLabel>Message</FormLabel>
            <textarea
              name="message"
              className={`${inputClass} h-28 py-2`}
              defaultValue={`Bonjour, votre colis ${item.package_reference || ""} est actuellement : ${statusLabels[item.status] || item.status}.`}
            />
          </label>
          {error && <p className="text-[13px] text-red-600">{error}</p>}
          <button disabled={saving} className={buttonClass}>
            <Bell size={15} />
            {saving ? "Préparation..." : "Enregistrer la notification"}
          </button>
        </form>
      </Section>
      <Section title="Notifications">
        {notifications.length === 0 ? (
          <EmptyState
            title="Aucune notification"
            text="Les messages préparés ou envoyés pour ce colis apparaîtront ici."
          />
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="rounded-md border border-[#d8dce2] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">
                    {notification.channel} · {notification.notification_type}
                  </p>
                  <span className="text-[12px] text-[#687584]">
                    {notification.status}
                  </span>
                </div>
                <p className="mt-2 text-[13px] leading-5 text-[#4b5563]">
                  {notification.message}
                </p>
                <p className="mt-2 text-[12px] text-[#687584]">
                  {formatDate(notification.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function HistoryTab({
  events,
  loading,
}: {
  events: PackageTimelineEvent[];
  loading: boolean;
}) {
  if (loading) return <LoadingLines />;
  if (events.length === 0)
    return (
      <EmptyState
        title="Aucun historique"
        text="Les scans, réceptions, changements de statut et événements opérationnels du colis apparaîtront ici."
      />
    );
  return (
    <div className="space-y-1">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex gap-3 border-b border-[#eef0f3] py-3 last:border-0"
        >
          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#f1f3f5] text-[#334155]">
            <TimelineIcon type={event.type} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-[#1f2328]">{event.title}</p>
              <span className="shrink-0 text-[12px] text-[#687584]">
                {formatDate(event.occurred_at)}
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-5 text-[#5f6b76]">
              {event.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PackageFormModal({
  mode,
  item,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  mode: PackageFormMode;
  item: PackageRecord | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [dossiers, setDossiers] = useState<DossierRecord[]>([]);
  const [warehouses, setWarehouses] = useState<ReferenceItem[]>([]);
  const [loadingDossiers, setLoadingDossiers] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      listDossiers({ page_size: 100, sort: "updated_desc" }),
      getReferenceCatalog(),
    ])
      .then(([response, references]) => {
        if (active) {
          setDossiers(response.items);
          setWarehouses(references.warehouses);
        }
      })
      .catch(() => {
        if (active) setDossiers([]);
      })
      .finally(() => {
        if (active) setLoadingDossiers(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedDossierMissing =
    item?.dossier_id &&
    !dossiers.some((dossier) => dossier.id === item.dossier_id);

  return (
    <OperationDrawer
      open
      title={mode === "edit" ? "Modifier le colis" : "Nouveau colis"}
      description="Un colis doit être attaché à un dossier existant pour conserver la traçabilité client."
      close={onClose}
      width="max-w-[760px]"
    >
        <form
          onSubmit={onSubmit}
          className="grid gap-5"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <FormSection title="Lien dossier">
              <label className="block">
                <FormLabel>Dossier réel</FormLabel>
                <select
                  name="dossier_id"
                  defaultValue={item?.dossier_id || ""}
                  disabled={mode === "edit"}
                  className={inputClass}
                  required
                >
                  <option value="">
                    {loadingDossiers
                      ? "Chargement des dossiers..."
                      : "Sélectionner un dossier"}
                  </option>
                  {selectedDossierMissing && (
                    <option value={item.dossier_id || ""}>
                      {item.dossier_reference || item.dossier_id}
                    </option>
                  )}
                  {dossiers.map((dossier) => (
                    <option key={dossier.id} value={dossier.id}>
                      {dossier.dossier_reference} ·{" "}
                      {dossier.client_name ||
                        dossier.client_full_name ||
                        "Client"}{" "}
                      · {routeLabelFromDossier(dossier)}
                    </option>
                  ))}
                </select>
              </label>
              <TextInput
                name="tracking_id"
                label="Tracking du fournisseur (facultatif)"
                defaultValue={item?.tracking_id || ""}
                placeholder="Ex. numéro Alibaba, DHL ou fournisseur"
              />
              {mode === "edit" && (
                <>
                  <TextInput
                    name="barcode"
                    label="Code-barres interne"
                    defaultValue={item?.barcode || ""}
                  />
                  <TextInput
                    name="qr_code_value"
                    label="QR code interne"
                    defaultValue={item?.qr_code_value || ""}
                  />
                </>
              )}
            </FormSection>

            {mode === "edit" && (
              <FormSection title="Suivi opérationnel">
                <SelectInput
                  name="source"
                  label="Source"
                  defaultValue={item?.source || "manual"}
                  options={sourceLabels}
                />
                <SelectInput
                  name="package_type"
                  label="Type colis"
                  defaultValue={item?.package_type || "carton"}
                  options={packageTypeLabels}
                />
                <SelectInput
                  name="status"
                  label="Statut"
                  defaultValue={item?.status || "CREATED"}
                  options={statusLabels}
                />
                <SelectInput
                  name="validation_status"
                  label="Validation"
                  defaultValue={item?.validation_status || "PENDING"}
                  options={validationLabels}
                />
                <SelectInput
                  name="package_condition"
                  label="État colis"
                  defaultValue={item?.package_condition || "UNKNOWN"}
                  options={conditionLabels}
                />
                <SelectInput
                  name="inventory_status"
                  label="Stock"
                  defaultValue={item?.inventory_status || "NOT_STORED"}
                  options={inventoryLabels}
                />
                <SelectInput
                  name="payment_clearance_status"
                  label="Paiement"
                  defaultValue={item?.payment_clearance_status || "UNKNOWN"}
                  options={paymentLabels}
                />
              </FormSection>
            )}

            {mode === "edit" && (
              <FormSection title="Informations héritées du dossier">
                <TextInput
                  name="origin_country"
                  label="Pays origine"
                  defaultValue={item?.origin_country || ""}
                />
                <TextInput
                  name="origin_city"
                  label="Ville origine"
                  defaultValue={item?.origin_city || ""}
                />
                <TextInput
                  name="destination_country"
                  label="Pays destination"
                  defaultValue={item?.destination_country || ""}
                />
                <TextInput
                  name="destination_city"
                  label="Ville destination"
                  defaultValue={item?.destination_city || ""}
                />
                <TextInput
                  name="shipping_mode"
                  label="Mode d’expédition"
                  defaultValue={item?.shipping_mode || ""}
                  placeholder="Air Cargo, Sea Freight..."
                />
                <TextInput
                  name="shipment_reference"
                  label="Expédition liée"
                  defaultValue={item?.shipment_reference || ""}
                  placeholder="EXP-2026-00324"
                />
                <TextInput
                  name="eta_at"
                  label="ETA"
                  defaultValue={toDatetimeLocal(item?.eta_at)}
                  type="datetime-local"
                />
              </FormSection>
            )}

            <FormSection title="Marchandise & mesures">
              {mode === "create" && (
                <SelectInput
                  name="package_type"
                  label="Type d’emballage"
                  defaultValue={item?.package_type || "carton"}
                  options={packageTypeLabels}
                />
              )}
              <TextInput
                name="description"
                label="Description"
                defaultValue={item?.description || ""}
                placeholder="Électronique, textile..."
              />
              <TextInput
                name="category"
                label="Catégorie"
                defaultValue={item?.category || ""}
              />
              <TextInput
                name="weight_kg"
                label="Poids kg"
                defaultValue={valueOrEmpty(item?.weight_kg)}
                type="number"
                step="0.01"
              />
              <TextInput
                name="volumetric_weight_kg"
                label="Poids volumétrique kg"
                defaultValue={valueOrEmpty(item?.volumetric_weight_kg)}
                type="number"
                step="0.01"
              />
              <TextInput
                name="length_cm"
                label="Longueur cm"
                defaultValue={valueOrEmpty(item?.length_cm)}
                type="number"
                step="0.01"
              />
              <TextInput
                name="width_cm"
                label="Largeur cm"
                defaultValue={valueOrEmpty(item?.width_cm)}
                type="number"
                step="0.01"
              />
              <TextInput
                name="height_cm"
                label="Hauteur cm"
                defaultValue={valueOrEmpty(item?.height_cm)}
                type="number"
                step="0.01"
              />
              <TextInput
                name="volume_cbm"
                label="Volume m³"
                defaultValue={valueOrEmpty(item?.volume_cbm)}
                type="number"
                step="0.001"
              />
              <TextInput
                name="pieces_count"
                label="Nombre de pièces"
                defaultValue={valueOrEmpty(item?.pieces_count || 1)}
                type="number"
                step="1"
              />
              <TextInput
                name="declared_value"
                label="Valeur déclarée"
                defaultValue={valueOrEmpty(item?.declared_value)}
                type="number"
                step="0.01"
              />
              <TextInput
                name="declared_currency"
                label="Devise valeur"
                defaultValue={item?.declared_currency || item?.currency || ""}
              />
              <TextInput
                name="last_scan_location"
                label="Dernière localisation scan"
                defaultValue={item?.last_scan_location || ""}
              />
              <label className="mt-2 flex items-center gap-2 text-[13px] text-[#334155]">
                <input
                  name="is_fragile"
                  type="checkbox"
                  defaultChecked={item?.is_fragile ?? false}
                  className="rounded border-[#c9d0d8]"
                />
                Colis fragile
              </label>
            </FormSection>

            <FormSection title="Entrepôt">
              <label>
                <FormLabel>Priorité</FormLabel>
                <select
                  name="priority"
                  defaultValue={item?.priority || "NORMAL"}
                  className={inputClass}
                >
                  <option value="LOW">Basse</option>
                  <option value="NORMAL">Normale</option>
                  <option value="HIGH">Haute</option>
                  <option value="URGENT">Urgente</option>
                </select>
              </label>
              <TextInput
                name="assigned_to"
                label="Responsable"
                defaultValue={item?.assigned_to || ""}
              />
              <TextInput
                name="supplier_name"
                label="Fournisseur"
                defaultValue={item?.supplier_name || ""}
              />
              <label>
                <FormLabel>Entrepôt de réception</FormLabel>
                <select
                  name="warehouse_name"
                  defaultValue={item?.warehouse_name || ""}
                  className={inputClass}
                >
                  <option value="">Choisir un entrepôt configuré</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.label}>
                      {warehouse.label}
                    </option>
                  ))}
                </select>
              </label>
              <TextInput
                name="warehouse_zone"
                label="Zone"
                defaultValue={item?.warehouse_zone || ""}
              />
              <TextInput
                name="warehouse_rack"
                label="Rack"
                defaultValue={item?.warehouse_rack || ""}
              />
              <TextInput
                name="warehouse_location"
                label="Emplacement"
                defaultValue={item?.warehouse_location || ""}
              />
            </FormSection>

            {mode === "edit" && (
              <FormSection title="Informations financières">
                <TextInput
                  name="fees_total"
                  label="Montant total"
                  defaultValue={valueOrEmpty(item?.fees_total)}
                  type="number"
                  step="0.01"
                />
                <TextInput
                  name="fees_paid"
                  label="Montant payé"
                  defaultValue={valueOrEmpty(item?.fees_paid)}
                  type="number"
                  step="0.01"
                />
                <TextInput
                  name="currency"
                  label="Devise"
                  defaultValue={item?.currency || ""}
                  placeholder="USD, CDF..."
                />
                <label className="mt-2 flex items-center gap-2 text-[13px] text-[#334155]">
                  <input
                    name="public_tracking_enabled"
                    type="checkbox"
                    defaultChecked={item?.public_tracking_enabled ?? true}
                    className="rounded border-[#c9d0d8]"
                  />
                  Tracking public activé
                </label>
                <label className="block">
                  <FormLabel>Notes internes</FormLabel>
                  <textarea
                    name="notes"
                    defaultValue={item?.notes || ""}
                    className={`${inputClass} h-24 py-2`}
                  />
                </label>
              </FormSection>
            )}
          </div>

          {error && (
            <div className="mx-5 mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[#d8dce2] px-5 py-4">
            <OperationButton type="button" onClick={onClose}>
              Annuler
            </OperationButton>
            <OperationButton
              type="submit"
              variant="primary"
              disabled={saving}
            >
              {saving
                ? "Enregistrement..."
                : mode === "edit"
                  ? "Enregistrer"
                  : "Créer le colis"}
            </OperationButton>
          </div>
        </form>
    </OperationDrawer>
  );
}

function PackageScannerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (item: PackageRecord) => void;
}) {
  const [dossiers, setDossiers] = useState<DossierRecord[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof scanPackageLabel>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    listDossiers({ page_size: 100, sort: "updated_desc" })
      .then((r) => setDossiers(r.items))
      .catch(() => setDossiers([]));
  }, []);
  async function analyse() {
    if (!file) {
      setError("Prenez ou sélectionnez une photo.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setResult(await scanPackageLabel(file));
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const item = await createPackage({
        dossier_id: String(f.get("dossier_id")),
        source: "warehouse",
        tracking_id: clean(f.get("tracking_id")),
        description: clean(f.get("description")),
        weight_kg: numberOrNull(f.get("weight_kg")),
        length_cm: numberOrNull(f.get("length_cm")),
        width_cm: numberOrNull(f.get("width_cm")),
        height_cm: numberOrNull(f.get("height_cm")),
        status: "RECEIVED_AT_ORIGIN",
        inventory_status: "IN_STOCK",
      });
      onCreated(item);
    } catch (x) {
      setError(apiErrorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <OperationDrawer
      open
      title="Scanner une étiquette"
      description="La photo est analysée puis validée par un opérateur avant création."
      close={onClose}
      width="max-w-2xl"
    >
        {!result ? (
          <div className="space-y-3">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className={inputClass}
            />
            {file && (
              <p className="text-[13px]">
                {file.name} · {Math.ceil(file.size / 1024)} Ko
              </p>
            )}
            <button
              onClick={analyse}
              disabled={busy}
              className={primaryButtonClass}
            >
              {busy ? "Analyse OCR…" : "Analyser l’étiquette"}
            </button>
          </div>
        ) : (
          <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
            <label className="md:col-span-2">
              <FormLabel>Dossier</FormLabel>
              <select required name="dossier_id" className={inputClass}>
                <option value="">Sélectionner le dossier</option>
                {dossiers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.dossier_reference} ·{" "}
                    {d.client_name || d.client_full_name}
                  </option>
                ))}
              </select>
            </label>
            <TextInput
              name="tracking_id"
              label="Tracking fournisseur"
              defaultValue={result.fields.tracking_id || ""}
            />
            <TextInput
              name="weight_kg"
              label="Poids kg"
              type="number"
              step="0.001"
              defaultValue={valueOrEmpty(result.fields.weight_kg)}
            />
            <TextInput
              name="length_cm"
              label="Longueur cm"
              type="number"
              step="0.1"
              defaultValue={valueOrEmpty(result.fields.length_cm)}
            />
            <TextInput
              name="width_cm"
              label="Largeur cm"
              type="number"
              step="0.1"
              defaultValue={valueOrEmpty(result.fields.width_cm)}
            />
            <TextInput
              name="height_cm"
              label="Hauteur cm"
              type="number"
              step="0.1"
              defaultValue={valueOrEmpty(result.fields.height_cm)}
            />
            <TextInput name="description" label="Description" />
            <div className="md:col-span-2 rounded bg-amber-50 p-3 text-[12px] text-amber-800">
              Confiance OCR :{" "}
              {result.confidence == null
                ? "non fournie"
                : `${Math.round(result.confidence * 100)} %`}
              . Vérifiez chaque valeur avant de créer.
            </div>
            <details className="md:col-span-2 text-[12px]">
              <summary>Texte OCR brut</summary>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">
                {result.raw_text}
              </pre>
            </details>
            <div className="md:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResult(null)}
                className={buttonClass}
              >
                Reprendre
              </button>
              <button disabled={busy} className={primaryButtonClass}>
                Valider et créer
              </button>
            </div>
          </form>
        )}
        {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
    </OperationDrawer>
  );
}

function ImportPackagesModal({
  importing,
  error,
  result,
  onClose,
  onSubmit,
}: {
  importing: boolean;
  error: string;
  result: { created: number; skipped: number } | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <OperationDrawer
      open
      title="Importer des colis"
      description="CSV accepté : dossier, référence, type, description, mesures et entrepôt."
      close={onClose}
      width="max-w-[620px]"
    >
        <form onSubmit={onSubmit} className="grid gap-4">
          <label className="block rounded-md border border-dashed border-[#cfd5dd] bg-[#fbfcfd] p-5">
            <FormLabel>Fichier CSV</FormLabel>
            <input
              name="file"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-2 w-full text-[13px]"
            />
          </label>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
              {error}
            </div>
          )}
          {result && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800">
              Import terminé : {result.created} colis créés, {result.skipped}{" "}
              lignes ignorées.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={buttonClass}>
              Fermer
            </button>
            <button
              type="submit"
              disabled={importing}
              className={primaryButtonClass}
            >
              {importing ? "Import..." : "Importer le CSV"}
            </button>
          </div>
        </form>
    </OperationDrawer>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-[#d8dce2] bg-white">
      <h3 className="border-b border-[#eef0f3] px-4 py-3 text-[13px] font-semibold text-[#1f2328]">
        {title}
      </h3>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-md border border-[#d8dce2] p-4">
      <h3 className="text-[13px] font-semibold text-[#1f2328]">{title}</h3>
      {children}
    </section>
  );
}

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[12px] font-medium text-[#5f6b76]">
      {children}
    </span>
  );
}

function TextInput({
  name,
  label,
  defaultValue,
  placeholder,
  type = "text",
  step,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <FormLabel>{label}</FormLabel>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        type={type}
        step={step}
        className={inputClass}
      />
    </label>
  );
}

function SelectInput({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: Record<string, string>;
}) {
  return (
    <label className="block">
      <FormLabel>{label}</FormLabel>
      <select name={name} defaultValue={defaultValue} className={inputClass}>
        {Object.entries(options).map(([value, labelText]) => (
          <option key={value} value={value}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function SelectFilter({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="relative inline-flex h-8 min-w-[118px] items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full appearance-none rounded-md border border-[#cfd5dd] bg-white px-3 pr-8 text-[13px] font-medium text-[#1f2328] shadow-sm outline-none transition hover:bg-[#f7f8fa] focus:border-[#2f7df6]"
      >
        {children}
      </select>
      <ChevronRight
        size={14}
        className="pointer-events-none absolute right-2 rotate-90 text-[#687584]"
      />
    </label>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={16} className="mt-0.5 text-[#556171]" />
      <Field label={label} value={value} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-[#687584]">{label}</p>
      <p className="mt-0.5 break-words text-[13px] leading-5 text-[#1f2328]">
        {value}
      </p>
    </div>
  );
}

function SmallMetric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[#d8dce2] bg-[#fbfcfd] p-3">
      <p className="text-[12px] text-[#687584]">{label}</p>
      <p className="mt-1 text-[18px] font-semibold tracking-[-0.03em]">
        {value}
      </p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-md border border-dashed border-[#d8dce2] px-6 text-center">
      <h3 className="text-[16px] font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-[13px] leading-6 text-[#687584]">
        {text}
      </p>
    </div>
  );
}

function LoadingLines() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-14 animate-pulse rounded-md bg-[#eef1f5]"
        />
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: PackageStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[12px] font-medium ring-1 ${statusStyles[status] || statusStyles.CREATED}`}
    >
      {statusLabels[status] || status}
    </span>
  );
}

function InventoryBadge({ status }: { status: InventoryStatus }) {
  const tone =
    status === "IN_STOCK"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : status === "DISPATCHED"
        ? "bg-blue-50 text-blue-700 ring-blue-100"
        : "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[12px] font-medium ring-1 ${tone}`}
    >
      {inventoryLabels[status] || status}
    </span>
  );
}

function ValidationBadge({ status }: { status: PackageValidationStatus }) {
  const tone =
    status === "VALIDATED"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : status === "BLOCKED" || status === "REJECTED"
        ? "bg-red-50 text-red-700 ring-red-100"
        : status === "NEEDS_REVIEW"
          ? "bg-amber-50 text-amber-800 ring-amber-100"
          : "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[12px] font-medium ring-1 ${tone}`}
    >
      {validationLabels[status] || status}
    </span>
  );
}

function PaymentBadge({ status }: { status: PaymentClearanceStatus }) {
  const tone =
    status === "CLEARED" || status === "PAID"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : status === "BLOCKED" || status === "OVERDUE"
        ? "bg-red-50 text-red-700 ring-red-100"
        : "bg-amber-50 text-amber-800 ring-amber-100";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[12px] font-medium ring-1 ${tone}`}
    >
      {paymentLabels[status] || status}
    </span>
  );
}

function TimelineIcon({ type }: { type: string }) {
  if (type === "receipt") return <Warehouse size={15} />;
  if (type === "event") return <History size={15} />;
  return <PackageCheck size={15} />;
}

function metricCardClass(tone: string) {
  if (tone === "amber") return "border-[#f0d398] bg-[#fff6db] text-[#b45f00]";
  if (tone === "neutral") return "border-[#d8dce2] bg-[#f7f8fa] text-[#2f343b]";
  return "border-[#c7d6ef] bg-[#eef3fb] text-[#0f55b8]";
}

function routeLabel(item: PackageRecord) {
  const origin = [item.origin_city, item.origin_country]
    .filter(Boolean)
    .join(", ");
  const destination = [item.destination_city, item.destination_country]
    .filter(Boolean)
    .join(", ");
  if (!origin && !destination) return "-";
  return `${origin || "Origine"} → ${destination || "Destination"}`;
}

function dimensionsLabel(item: PackageRecord) {
  if (!item.length_cm && !item.width_cm && !item.height_cm) return "-";
  return `${item.length_cm || "-"} x ${item.width_cm || "-"} x ${item.height_cm || "-"} cm`;
}

function routeLabelFromDossier(item: DossierRecord) {
  const origin = [item.origin_city, item.origin_country]
    .filter(Boolean)
    .join(", ");
  const destination = [item.destination_city, item.destination_country]
    .filter(Boolean)
    .join(", ");
  if (!origin && !destination) return "Route non renseignée";
  return `${origin || "Origine"} → ${destination || "Destination"}`;
}

function formatMeasure(item: PackageRecord) {
  const weight = item.weight_kg ? `${item.weight_kg} kg` : "-";
  const volume = item.volume_cbm ? `${item.volume_cbm} m³` : "-";
  return `${weight} / ${volume}`;
}

function formatMoney(value?: number | null, currency?: string | null) {
  if (value === null || value === undefined) return "-";
  return `${Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${currency || "$"}`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function clean(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

function numberOrNull(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function valueOrEmpty(value?: number | null) {
  return value === null || value === undefined ? "" : String(value);
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function apiErrorMessage(error: unknown) {
  if (!API_BASE_URL) {
    return "API injoignable. Configurez NEXT_PUBLIC_API_URL ou NEXT_PUBLIC_API_BASE_URL côté frontend.";
  }
  if (!axios.isAxiosError(error)) return "Erreur inattendue.";
  if (!error.response)
    return "API injoignable. Vérifiez l’URL du backend et l’état du service.";
  if (error.response.status === 401)
    return "Session expirée ou token Clerk manquant.";
  if (error.response.status === 403)
    return "Vous n’avez pas accès à cette organisation.";
  if (error.response.status === 404) return "Ressource introuvable.";
  if (error.response.status === 422)
    return "Données invalides. Vérifiez les champs obligatoires.";
  return `Erreur API (${error.response.status}).`;
}

const inputClass =
  "h-9 w-full rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px] text-[#1f2328] shadow-sm outline-none transition placeholder:text-[#98a2b3] focus:border-[#2f7df6]";
