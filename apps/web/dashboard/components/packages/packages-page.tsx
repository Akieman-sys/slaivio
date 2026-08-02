"use client";

import axios from "axios";
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
  Link as LinkIcon,
  MapPin,
  MoreHorizontal,
  PackageCheck,
  PackageSearch,
  Ruler,
  Search,
  Truck,
  Upload,
  Warehouse,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "@/services/api";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { listDossiers, type DossierRecord } from "@/services/dossiers";
import {
  addPackageMedia,
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
  received: 0,
  in_stock: 0,
  in_transit: 0,
  issues: 0,
  delivered: 0,
  total_weight_kg: 0,
  total_volume_cbm: 0,
};

const views: Array<{ key: string; label: string; status?: PackageStatus; inventory?: InventoryStatus }> = [
  { key: "all", label: "Tous" },
  { key: "received", label: "Reçus entrepôt", status: "RECEIVED_AT_ORIGIN" },
  { key: "review", label: "À vérifier" },
  { key: "stock", label: "En stock", inventory: "IN_STOCK" },
  { key: "ready", label: "Prêts à expédier", status: "READY_FOR_DISPATCH" },
  { key: "transit", label: "En transit", status: "IN_TRANSIT" },
  { key: "arrived", label: "Arrivés", status: "ARRIVED_DESTINATION" },
  { key: "issues", label: "Anomalies" },
  { key: "delivered", label: "Livrés", status: "DELIVERED" },
];

const buttonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px] font-medium text-[#1f2328] shadow-sm transition hover:bg-[#f7f8fa]";
const primaryButtonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#12c76f] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0fb966]";
const iconButtonClass = "inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[#4f5b67] transition hover:border-[#d8dce2] hover:bg-[#f4f6f8]";
const pagerButtonClass = "flex h-8 w-8 items-center justify-center rounded-md border border-[#cfd5dd] bg-white text-[#334155] shadow-sm disabled:opacity-40";

type Pagination = { page: number; page_size: number; total: number; total_pages: number };
type PackageFormMode = "create" | "edit";
type DetailTab = "summary" | "dossier" | "measures" | "warehouse" | "shipment" | "payment" | "anomalies" | "media" | "notifications" | "history";

export function PackagesPage() {
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [stats, setStats] = useState<PackageStats>(emptyStats);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: 30, total: 0, total_pages: 0 });
  const [selected, setSelected] = useState<PackageRecord | null>(null);
  const [timeline, setTimeline] = useState<PackageTimelineEvent[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>("summary");
  const [activeView, setActiveView] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PackageStatus | "">("");
  const [condition, setCondition] = useState<PackageCondition | "">("");
  const [inventory, setInventory] = useState<InventoryStatus | "">("");
  const [payment, setPayment] = useState<PaymentClearanceStatus | "">("");
  const [validation, setValidation] = useState<PackageValidationStatus | "">("");
  const [packageType, setPackageType] = useState<PackageType | "">("");
  const [source, setSource] = useState<PackageSource | "">("");
  const [sort, setSort] = useState("updated_desc");
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
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);

  const currentView = views.find((view) => view.key === activeView) || views[0];
  const page = pagination.page || 1;

  useEffect(() => {
    const timeout = window.setTimeout(() => loadPackages(1), 220);
    return () => window.clearTimeout(timeout);
    // The listed filters intentionally define when the debounced request runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, condition, inventory, payment, validation, packageType, source, sort, activeView]);

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

  async function loadPackages(nextPage = page) {
    setLoading(true);
    setError("");
    try {
      const response = await listPackages({
        q: query || undefined,
        status: currentView.key === "issues" || currentView.key === "review" ? undefined : currentView.status || status || undefined,
        condition: condition || undefined,
        inventory_status: currentView.inventory || inventory || undefined,
        payment_clearance_status: payment || undefined,
        validation_status: currentView.key === "review" ? "NEEDS_REVIEW" : validation || undefined,
        package_type: packageType || undefined,
        source: source || undefined,
        page: nextPage,
        page_size: 30,
        sort,
      });
      const items = currentView.key === "issues"
        ? response.items.filter((item) => ["BLOCKED", "ISSUE"].includes(item.status) || item.open_anomaly_count > 0)
        : response.items;
      setPackages(items);
      setPagination(response.pagination);
      if (selected && !items.some((item) => item.id === selected.id)) setSelected(null);
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
      dossier_id: String(form.get("dossier_id") || formPackage?.dossier_id || ""),
      tracking_id: clean(form.get("tracking_id")),
      status: String(form.get("status") || "CREATED") as PackageStatus,
      package_condition: String(form.get("package_condition") || "UNKNOWN") as PackageCondition,
      inventory_status: String(form.get("inventory_status") || "NOT_STORED") as InventoryStatus,
      payment_clearance_status: String(form.get("payment_clearance_status") || "UNKNOWN") as PaymentClearanceStatus,
      payment_status: String(form.get("payment_clearance_status") || "UNKNOWN") as PaymentClearanceStatus,
      validation_status: String(form.get("validation_status") || "PENDING") as PackageValidationStatus,
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
      public_tracking_enabled: form.get("public_tracking_enabled") === "on",
      eta_at: clean(form.get("eta_at")),
      last_scan_location: clean(form.get("last_scan_location")),
      notes: clean(form.get("notes")),
    };
    if (!payload.dossier_id) {
      setSaving(false);
      setFormError("Sélectionnez un dossier réel avant de créer le colis.");
      return;
    }
    try {
      const saved = formMode === "edit" && formPackage
        ? await updatePackage(formPackage.id, payload)
        : await createPackage(payload);
      setSelected(saved);
      setFormOpen(false);
      setFormPackage(null);
      await Promise.all([loadStats(), loadPackages(formMode === "edit" ? page : 1)]);
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

  const statCards = useMemo(() => [
    { label: "Colis total", value: stats.total, tone: "blue" },
    { label: "Reçus", value: stats.received, tone: "blue" },
    { label: "En stock", value: stats.in_stock, tone: "blue" },
    { label: "En transit", value: stats.in_transit, tone: "blue" },
    { label: "Anomalies", value: stats.issues, tone: "amber" },
    { label: "Poids total", value: `${Number(stats.total_weight_kg || 0).toLocaleString("fr-FR")} kg`, tone: "neutral" },
  ], [stats]);

  return (
    <div className="min-h-full bg-[#f5f6f8] px-4 py-4 text-[#1f2328] md:px-6">
      <div className="mx-auto max-w-[1520px] overflow-hidden rounded-[10px] border border-[#d8dce2] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.10)]">
        <OperationPageHeader title="Colis" description="Réceptionnez, mesurez, stockez et suivez chaque colis réel. Chaque ligne reste liée à un dossier client pour garder une traçabilité complète."
          actions={<>
              <button onClick={() => setImportOpen(true)} className={buttonClass}>
                <Upload size={16} />
                Importer
              </button>
              <button onClick={handleExport} className={buttonClass}>
                <Download size={16} />
                Exporter
              </button>
              <button onClick={openCreate} className={primaryButtonClass}>
                <span className="text-lg leading-none">+</span>
                Nouveau colis
              </button>
            </>}
          tabs={<>
            {views.map((view) => (
              <button
                key={view.key}
                onClick={() => setActiveView(view.key)}
                className={`h-8 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition ${
                  activeView === view.key ? "bg-[#e9ecef] text-[#111827]" : "text-[#4f5b67] hover:bg-[#f1f3f5]"
                }`}
              >
                {view.label}
              </button>
            ))}
          </>}
        />

        <section className="grid gap-3 border-b border-[#d8dce2] px-5 py-4 sm:grid-cols-2 lg:grid-cols-6">
          {statCards.map((card) => (
            <div key={card.label} className={`min-h-[102px] rounded-md border p-4 ${metricCardClass(card.tone)}`}>
              <div className="flex items-start justify-between gap-4">
                <p className="text-[14px] font-medium leading-5">{card.label}</p>
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-black/10 bg-white/80 text-[16px] leading-none text-[#4b5563] shadow-sm">↗</span>
              </div>
              <p className="mt-3 text-[34px] font-normal leading-none tracking-[-0.04em]">{card.value.toLocaleString("fr-FR")}</p>
            </div>
          ))}
        </section>

        <section>
          <div className="flex flex-col gap-2 border-b border-[#d8dce2] px-5 py-3 xl:flex-row xl:items-center">
            <SelectFilter value={status} onChange={(value) => setStatus(value as PackageStatus | "")} label="Statut">
              <option value="">Statut</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectFilter>
            <SelectFilter value={condition} onChange={(value) => setCondition(value as PackageCondition | "")} label="État">
              <option value="">État colis</option>
              {Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectFilter>
            <SelectFilter value={inventory} onChange={(value) => setInventory(value as InventoryStatus | "")} label="Stock">
              <option value="">Stock</option>
              {Object.entries(inventoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectFilter>
            <SelectFilter value={payment} onChange={(value) => setPayment(value as PaymentClearanceStatus | "")} label="Paiement">
              <option value="">Paiement</option>
              {Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectFilter>
            <SelectFilter value={validation} onChange={(value) => setValidation(value as PackageValidationStatus | "")} label="Validation">
              <option value="">Validation</option>
              {Object.entries(validationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectFilter>
            <SelectFilter value={packageType} onChange={(value) => setPackageType(value as PackageType | "")} label="Type">
              <option value="">Type</option>
              {Object.entries(packageTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectFilter>
            <SelectFilter value={source} onChange={(value) => setSource(value as PackageSource | "")} label="Source">
              <option value="">Source</option>
              {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectFilter>
            <SelectFilter value={sort} onChange={setSort} label="Tri">
              <option value="updated_desc">Activité récente</option>
              <option value="created_desc">Créés récemment</option>
              <option value="created_asc">Créés anciennement</option>
              <option value="reference_asc">Référence A-Z</option>
              <option value="client_asc">Client A-Z</option>
              <option value="weight_desc">Poids élevé</option>
            </SelectFilter>
            <label className="ml-auto flex h-8 min-w-0 items-center rounded-md border border-[#cfd5dd] bg-white px-2 shadow-sm focus-within:border-[#2f7df6] xl:w-[330px]">
              <Search size={16} className="text-[#6b7280]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher..."
                className="ml-2 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              />
            </label>
          </div>

          {error && (
            <div className="m-4 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
              <AlertCircle size={17} className="mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <PackagesTable packages={packages} loading={loading} selectedId={selected?.id} onSelect={selectPackage} />

          <div className="flex flex-col gap-3 border-t border-[#d8dce2] px-5 py-3 text-[13px] text-[#5f6b76] sm:flex-row sm:items-center sm:justify-between">
            <span>{pagination.total === 0 ? "0 colis" : `${(page - 1) * pagination.page_size + 1} - ${Math.min(page * pagination.page_size, pagination.total)} sur ${pagination.total} colis`}</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1 || loading} onClick={() => loadPackages(page - 1)} className={pagerButtonClass}>
                <ChevronLeft size={16} />
              </button>
              <span className="rounded-md bg-[#166ee8] px-3 py-1.5 text-[13px] font-semibold text-white">{page}</span>
              <button disabled={page >= pagination.total_pages || loading} onClick={() => loadPackages(page + 1)} className={pagerButtonClass}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
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
    </div>
  );
}

function PackagesTable({ packages, loading, selectedId, onSelect }: {
  packages: PackageRecord[];
  loading: boolean;
  selectedId?: string;
  onSelect: (item: PackageRecord) => void;
}) {
  if (loading) {
    return <div className="space-y-1 p-4">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-11 animate-pulse rounded-md bg-[#eef1f5]" />)}</div>;
  }
  if (packages.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
        <h2 className="text-[18px] font-semibold">Aucun colis trouvé</h2>
        <p className="mt-2 max-w-md text-[13px] leading-6 text-[#617083]">
          Créez un colis depuis un dossier réel. Les réceptions, scans, photos et événements apparaîtront ici dès qu’ils seront enregistrés.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1320px] w-full border-collapse text-left text-[13px]">
        <thead className="border-b border-[#d8dce2] bg-[#f7f8fa] font-medium text-[#5f6b76]">
          <tr>
            <th className="w-10 px-4 py-2"><input type="checkbox" className="rounded border-[#c9d0d8]" aria-label="Sélectionner tous les colis" /></th>
            <th className="px-3 py-2">Colis</th>
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Dossier</th>
            <th className="px-3 py-2">Route</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Marchandise</th>
            <th className="px-3 py-2 text-right">Poids / CBM</th>
            <th className="px-3 py-2">Entrepôt</th>
            <th className="px-3 py-2">Statut</th>
            <th className="px-3 py-2">Validation</th>
            <th className="px-3 py-2">Paiement</th>
            <th className="px-3 py-2">Expédition</th>
            <th className="px-3 py-2">Mise à jour</th>
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
              <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>
                <input type="checkbox" className="rounded border-[#c9d0d8]" aria-label={`Sélectionner ${item.package_reference || item.id}`} />
              </td>
              <td className="px-3 py-2">
                <p className="font-medium text-[#1f2328]">{item.package_reference || item.tracking_id || item.id.slice(0, 8)}</p>
                <p className="text-[12px] text-[#687584]">{item.tracking_id || sourceLabels[item.source] || item.source}</p>
              </td>
              <td className="px-3 py-2">
                <p className="font-medium text-[#1f2328]">{item.client_name || "Client"}</p>
                <p className="text-[12px] text-[#687584]">{item.client_phone || item.client_email || "-"}</p>
              </td>
              <td className="px-3 py-2 text-[#334155]">{item.dossier_reference || "-"}</td>
              <td className="px-3 py-2 text-[#334155]">{routeLabel(item)}</td>
              <td className="px-3 py-2 text-[#334155]">{packageTypeLabels[item.package_type] || item.package_type}</td>
              <td className="px-3 py-2 text-[#334155]">
                <p>{item.description || item.category || "-"}</p>
                <p className="text-[12px] text-[#687584]">{item.is_fragile ? "Fragile" : conditionLabels[item.package_condition] || item.package_condition}</p>
              </td>
              <td className="px-3 py-2 text-right text-[#334155]">{formatMeasure(item)}</td>
              <td className="px-3 py-2">
                <p className="text-[#334155]">{item.warehouse_name || inventoryLabels[item.inventory_status] || "-"}</p>
                <p className="text-[12px] text-[#687584]">{warehouseLocationLabel(item)}</p>
              </td>
              <td className="px-3 py-2"><StatusBadge status={item.status} /></td>
              <td className="px-3 py-2"><ValidationBadge status={item.validation_status} /></td>
              <td className="px-3 py-2"><PaymentBadge status={item.payment_clearance_status} /></td>
              <td className="px-3 py-2 text-[#334155]">{item.shipment_reference || "-"}</td>
              <td className="px-3 py-2 text-[#687584]">{formatDate(item.updated_at || item.created_at)}</td>
              <td className="px-3 py-2"><MoreHorizontal size={16} className="text-[#687584]" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [item.id]);

  function close() {
    setVisible(false);
    window.setTimeout(onClose, 180);
  }

  const tabs: Array<{ key: DetailTab; label: string }> = [
    { key: "summary", label: "Résumé" },
    { key: "dossier", label: "Dossier" },
    { key: "measures", label: "Mesures" },
    { key: "warehouse", label: "Entrepôt" },
    { key: "shipment", label: "Expédition" },
    { key: "payment", label: "Paiement" },
    { key: "anomalies", label: "Anomalies" },
    { key: "media", label: "Photos" },
    { key: "notifications", label: "Notifications" },
    { key: "history", label: "Historique" },
  ];

  async function refreshPackage(next: PackageRecord) {
    onUpdated(next);
  }

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Fermer la fiche colis" onClick={close} className={`absolute inset-0 bg-slate-950/20 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`} />
      <aside className={`absolute right-0 top-0 h-full w-full max-w-[600px] border-l border-[#cfd5dd] bg-white shadow-[-18px_0_42px_rgba(15,23,42,0.16)] transition-transform duration-200 ease-out ${visible ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex h-full flex-col">
          <div className="border-b border-[#d8dce2] px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-[#687584]">Fiche colis</p>
                <h2 className="mt-1 truncate text-[22px] font-semibold tracking-[-0.02em]">{item.package_reference || item.tracking_id || "Colis"}</h2>
                <p className="mt-1 text-[13px] text-[#687584]">{item.client_name || "Client"} · {item.dossier_reference || "Dossier non lié"}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={onEdit} className={iconButtonClass} aria-label="Modifier le colis"><Edit3 size={16} /></button>
                <button onClick={close} className={iconButtonClass} aria-label="Fermer"><X size={17} /></button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge status={item.status} />
              <InventoryBadge status={item.inventory_status} />
              <ValidationBadge status={item.validation_status} />
              <PaymentBadge status={item.payment_clearance_status} />
              {loading && <span className="text-[12px] text-[#687584]">Actualisation…</span>}
            </div>
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-[#d8dce2] px-4 py-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`h-8 whitespace-nowrap rounded-md px-3 text-[13px] font-medium ${
                  activeTab === tab.key ? "bg-[#e9ecef] text-[#111827]" : "text-[#5f6b76] hover:bg-[#f4f6f8]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={`flex-1 overflow-y-auto p-5 ${loading ? "opacity-60" : ""}`}>
            {activeTab === "summary" && <SummaryTab item={item} />}
            {activeTab === "dossier" && <DossierTab item={item} />}
            {activeTab === "measures" && <MeasuresTab item={item} />}
            {activeTab === "warehouse" && <WarehouseTab item={item} />}
            {activeTab === "shipment" && <ShipmentTab item={item} />}
            {activeTab === "payment" && <PaymentTab item={item} />}
            {activeTab === "anomalies" && <AnomaliesTab item={item} onUpdated={refreshPackage} />}
            {activeTab === "media" && <MediaTab item={item} />}
            {activeTab === "notifications" && <NotificationsTab item={item} onUpdated={refreshPackage} />}
            {activeTab === "history" && <HistoryTab events={timeline} loading={timelineLoading} />}
          </div>
        </div>
      </aside>
    </div>
  );
}

function SummaryTab({ item }: { item: PackageRecord }) {
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
        <InfoRow icon={Barcode} label="Référence" value={item.package_reference || "-"} />
        <InfoRow icon={PackageSearch} label="Tracking ID" value={item.tracking_id || "-"} />
        <InfoRow icon={Box} label="Marchandise" value={item.description || item.category || "-"} />
        <InfoRow icon={Ruler} label="Mesures" value={formatMeasure(item)} />
      </Section>
      <Section title="Route & dates">
        <InfoRow icon={MapPin} label="Route" value={routeLabel(item)} />
        <InfoRow icon={Truck} label="Mode" value={item.shipping_mode || "-"} />
        <Field label="ETA" value={formatDate(item.eta_at)} />
        <Field label="Dernier scan" value={item.last_scan_location ? `${item.last_scan_location} · ${formatDate(item.last_scan_at)}` : "-"} />
      </Section>
      <Section title="Finance">
        <Field label="Montant facturé" value={formatMoney(item.fees_total, item.currency)} />
        <Field label="Montant payé" value={formatMoney(item.fees_paid, item.currency)} />
        <Field label="Statut paiement" value={paymentLabels[item.payment_clearance_status] || item.payment_clearance_status} />
      </Section>
    </div>
  );
}

function MeasuresTab({ item }: { item: PackageRecord }) {
  return (
    <div className="space-y-5">
      <Section title="Mesures physiques">
        <div className="grid grid-cols-2 gap-3">
          <SmallMetric label="Poids réel" value={item.weight_kg ? `${item.weight_kg} kg` : "-"} />
          <SmallMetric label="Poids volumétrique" value={item.volumetric_weight_kg ? `${item.volumetric_weight_kg} kg` : "-"} />
          <SmallMetric label="Volume" value={item.volume_cbm ? `${item.volume_cbm} m³` : "-"} />
          <SmallMetric label="Pièces" value={item.pieces_count || 1} />
        </div>
      </Section>
      <Section title="Dimensions & valeur">
        <Field label="Dimensions" value={dimensionsLabel(item)} />
        <Field label="Type colis" value={packageTypeLabels[item.package_type] || item.package_type} />
        <Field label="Catégorie" value={item.category || "-"} />
        <Field label="Valeur déclarée" value={formatMoney(item.declared_value, item.declared_currency || item.currency)} />
        <Field label="Fragile" value={item.is_fragile ? "Oui" : "Non"} />
      </Section>
      <Section title="Contrôle">
        <Field label="Validation" value={validationLabels[item.validation_status] || item.validation_status} />
        <Field label="État colis" value={conditionLabels[item.package_condition] || item.package_condition} />
        <Field label="Notes internes" value={item.notes || "-"} />
      </Section>
    </div>
  );
}

function DossierTab({ item }: { item: PackageRecord }) {
  return (
    <div className="space-y-5">
      <Section title="Dossier lié">
        <InfoRow icon={FileText} label="Référence dossier" value={item.dossier_reference || "-"} />
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

function WarehouseTab({ item }: { item: PackageRecord }) {
  return (
    <div className="space-y-5">
      <Section title="Emplacement actuel">
        <InfoRow icon={Warehouse} label="Entrepôt" value={item.warehouse_name || "-"} />
        <Field label="Zone" value={item.warehouse_zone || "-"} />
        <Field label="Rack" value={item.warehouse_rack || "-"} />
        <Field label="Emplacement" value={item.warehouse_location || "-"} />
        <Field label="Statut stock" value={inventoryLabels[item.inventory_status] || item.inventory_status} />
      </Section>
      <Section title="Réception">
        <Field label="Date réception" value={formatDate(item.received_at || item.received_at_origin_at)} />
        <Field label="Dernier scan" value={item.last_scan_location ? `${item.last_scan_location} · ${formatDate(item.last_scan_at)}` : "-"} />
        <Field label="Source" value={sourceLabels[item.source] || item.source} />
      </Section>
    </div>
  );
}

function ShipmentTab({ item }: { item: PackageRecord }) {
  return (
    <div className="space-y-5">
      <Section title="Expédition liée">
        <InfoRow icon={Truck} label="Référence expédition" value={item.shipment_reference || "-"} />
        <Field label="Service" value={item.service_type || item.shipping_mode || "-"} />
        <Field label="Route" value={routeLabel(item)} />
        <Field label="ETA" value={formatDate(item.eta_at)} />
      </Section>
      <Section title="Dates opérationnelles">
        <Field label="Départ" value={formatDate(item.dispatched_at)} />
        <Field label="Arrivée / livraison" value={formatDate(item.delivered_at)} />
        <Field label="Tracking public" value={item.public_tracking_enabled ? "Activé" : "Désactivé"} />
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
          <SmallMetric label="Facturé" value={formatMoney(item.fees_total, item.currency)} />
          <SmallMetric label="Payé" value={formatMoney(item.fees_paid, item.currency)} />
          <SmallMetric label="Reste" value={formatMoney(Math.max(remaining, 0), item.currency)} />
        </div>
      </Section>
      <Section title="Statut">
        <Field label="Paiement" value={paymentLabels[item.payment_clearance_status] || item.payment_clearance_status} />
        <Field label="Devise" value={item.currency || "-"} />
      </Section>
    </div>
  );
}

function AnomaliesTab({ item, onUpdated }: { item: PackageRecord; onUpdated: (item: PackageRecord) => void }) {
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
      onUpdated(await resolvePackageAnomaly(item.id, anomalyId, "Résolu depuis la fiche colis."));
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
            <TextInput name="title" label="Titre" placeholder="Poids incohérent, colis abîmé..." />
            <label className="block">
              <FormLabel>Sévérité</FormLabel>
              <select name="severity" defaultValue="MEDIUM" className={inputClass}>
                <option value="LOW">Faible</option>
                <option value="MEDIUM">Moyenne</option>
                <option value="HIGH">Haute</option>
                <option value="CRITICAL">Critique</option>
              </select>
            </label>
          </div>
          <TextInput name="anomaly_type" label="Type" placeholder="WEIGHT, DAMAGE, MISSING_INFO..." />
          <label className="block">
            <FormLabel>Description</FormLabel>
            <textarea name="description" className={`${inputClass} h-24 py-2`} />
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
          <EmptyState title="Aucune anomalie" text="Ce colis ne présente aucun blocage ou incident ouvert." />
        ) : (
          <div className="space-y-2">
            {anomalies.map((anomaly) => (
              <div key={anomaly.id} className="rounded-md border border-[#d8dce2] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{anomaly.title}</p>
                    <p className="mt-1 text-[13px] text-[#687584]">{anomaly.severity} · {anomaly.status} · {formatDate(anomaly.detected_at)}</p>
                  </div>
                  {anomaly.status !== "RESOLVED" && (
                    <button disabled={saving} onClick={() => resolve(anomaly.id)} className={buttonClass}>
                      <CheckCircle2 size={15} />
                      Résoudre
                    </button>
                  )}
                </div>
                {anomaly.description && <p className="mt-2 text-[13px] leading-5 text-[#4b5563]">{anomaly.description}</p>}
                {anomaly.resolution_notes && <p className="mt-2 text-[13px] leading-5 text-emerald-700">{anomaly.resolution_notes}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function MediaTab({ item }: { item: PackageRecord }) {
  const media = item.media || [];
  return (
    <div className="space-y-5">
      <AddMediaForm item={item} />
      {media.length === 0 ? (
        <EmptyState title="Aucune photo" text="Les photos de réception, étiquettes et preuves liées à ce colis seront visibles ici." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {media.map((file) => (
            <a key={file.id} href={file.media_url || "#"} target="_blank" rel="noreferrer" className="rounded-md border border-[#d8dce2] p-3 transition hover:bg-[#f7f8fa]">
              <div className="flex h-28 items-center justify-center rounded-md bg-[#f1f3f5] text-[#64748b]">
                <ImageIcon size={28} />
              </div>
              <p className="mt-3 truncate text-[13px] font-medium">{file.caption || file.media_type || "Média colis"}</p>
              <p className="mt-1 text-[12px] text-[#687584]">{formatDate(file.created_at)}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function AddMediaForm({ item }: { item: PackageRecord }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await addPackageMedia(item.id, {
        media_url: String(form.get("media_url") || ""),
        media_type: String(form.get("media_type") || "IMAGE"),
        caption: clean(form.get("caption")),
      });
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
        <TextInput name="media_url" label="URL du média" placeholder="https://..." />
        <div className="grid grid-cols-2 gap-3">
          <TextInput name="media_type" label="Type" defaultValue="IMAGE" />
          <TextInput name="caption" label="Légende" />
        </div>
        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <button disabled={saving} className={buttonClass}>
          <LinkIcon size={15} />
          {saving ? "Ajout..." : "Ajouter le média"}
        </button>
      </form>
    </Section>
  );
}

function NotificationsTab({ item, onUpdated }: { item: PackageRecord; onUpdated: (item: PackageRecord) => void }) {
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
        notification_type: String(form.get("notification_type") || "PACKAGE_UPDATE"),
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
              <select name="channel" defaultValue="whatsapp" className={inputClass}>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="internal">Interne</option>
              </select>
            </label>
            <TextInput name="notification_type" label="Type" defaultValue="PACKAGE_UPDATE" />
          </div>
          <TextInput name="recipient" label="Destinataire" defaultValue={item.client_phone || item.client_email || ""} />
          <label className="block">
            <FormLabel>Message</FormLabel>
            <textarea name="message" className={`${inputClass} h-28 py-2`} defaultValue={`Bonjour, votre colis ${item.package_reference || ""} est actuellement : ${statusLabels[item.status] || item.status}.`} />
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
          <EmptyState title="Aucune notification" text="Les messages préparés ou envoyés pour ce colis apparaîtront ici." />
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => (
              <div key={notification.id} className="rounded-md border border-[#d8dce2] p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{notification.channel} · {notification.notification_type}</p>
                  <span className="text-[12px] text-[#687584]">{notification.status}</span>
                </div>
                <p className="mt-2 text-[13px] leading-5 text-[#4b5563]">{notification.message}</p>
                <p className="mt-2 text-[12px] text-[#687584]">{formatDate(notification.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function HistoryTab({ events, loading }: { events: PackageTimelineEvent[]; loading: boolean }) {
  if (loading) return <LoadingLines />;
  if (events.length === 0) return <EmptyState title="Aucun historique" text="Les scans, réceptions, changements de statut et événements opérationnels du colis apparaîtront ici." />;
  return (
    <div className="space-y-1">
      {events.map((event) => (
        <div key={event.id} className="flex gap-3 border-b border-[#eef0f3] py-3 last:border-0">
          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#f1f3f5] text-[#334155]">
            <TimelineIcon type={event.type} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-[#1f2328]">{event.title}</p>
              <span className="shrink-0 text-[12px] text-[#687584]">{formatDate(event.occurred_at)}</span>
            </div>
            <p className="mt-1 text-[13px] leading-5 text-[#5f6b76]">{event.description}</p>
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
  const [loadingDossiers, setLoadingDossiers] = useState(true);

  useEffect(() => {
    let active = true;
    listDossiers({ page_size: 100, sort: "updated_desc" })
      .then((response) => {
        if (active) setDossiers(response.items);
      })
      .catch(() => {
        if (active) setDossiers([]);
      })
      .finally(() => {
        if (active) setLoadingDossiers(false);
      });
    return () => { active = false; };
  }, []);

  const selectedDossierMissing = item?.dossier_id && !dossiers.some((dossier) => dossier.id === item.dossier_id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-8">
      <div className="max-h-full w-full max-w-[860px] overflow-hidden rounded-xl border border-[#cfd5dd] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#d8dce2] px-5 py-4">
          <div>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{mode === "edit" ? "Modifier le colis" : "Nouveau colis"}</h2>
            <p className="mt-1 text-[13px] text-[#687584]">Un colis doit être attaché à un dossier existant pour conserver la traçabilité client.</p>
          </div>
          <button onClick={onClose} className={iconButtonClass} aria-label="Fermer"><X size={17} /></button>
        </div>

        <form onSubmit={onSubmit} className="max-h-[calc(100dvh-150px)] overflow-y-auto">
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <FormSection title="Lien dossier">
              <label className="block">
                <FormLabel>Dossier réel</FormLabel>
                <select name="dossier_id" defaultValue={item?.dossier_id || ""} disabled={mode === "edit"} className={inputClass} required>
                  <option value="">{loadingDossiers ? "Chargement des dossiers..." : "Sélectionner un dossier"}</option>
                  {selectedDossierMissing && <option value={item.dossier_id || ""}>{item.dossier_reference || item.dossier_id}</option>}
                  {dossiers.map((dossier) => (
                    <option key={dossier.id} value={dossier.id}>
                      {dossier.dossier_reference} · {dossier.client_name || dossier.client_full_name || "Client"} · {routeLabelFromDossier(dossier)}
                    </option>
                  ))}
                </select>
              </label>
              <TextInput name="tracking_id" label="Référence / tracking" defaultValue={item?.tracking_id || ""} placeholder="Généré automatiquement si vide" />
              <TextInput name="barcode" label="Code-barres" defaultValue={item?.barcode || ""} />
              <TextInput name="qr_code_value" label="QR code" defaultValue={item?.qr_code_value || ""} />
            </FormSection>

            <FormSection title="Statuts">
              <SelectInput name="source" label="Source" defaultValue={item?.source || "manual"} options={sourceLabels} />
              <SelectInput name="package_type" label="Type colis" defaultValue={item?.package_type || "carton"} options={packageTypeLabels} />
              <SelectInput name="status" label="Statut" defaultValue={item?.status || "CREATED"} options={statusLabels} />
              <SelectInput name="validation_status" label="Validation" defaultValue={item?.validation_status || "PENDING"} options={validationLabels} />
              <SelectInput name="package_condition" label="État colis" defaultValue={item?.package_condition || "UNKNOWN"} options={conditionLabels} />
              <SelectInput name="inventory_status" label="Stock" defaultValue={item?.inventory_status || "NOT_STORED"} options={inventoryLabels} />
              <SelectInput name="payment_clearance_status" label="Paiement" defaultValue={item?.payment_clearance_status || "UNKNOWN"} options={paymentLabels} />
            </FormSection>

            <FormSection title="Route">
              <TextInput name="origin_country" label="Pays origine" defaultValue={item?.origin_country || ""} />
              <TextInput name="origin_city" label="Ville origine" defaultValue={item?.origin_city || ""} />
              <TextInput name="destination_country" label="Pays destination" defaultValue={item?.destination_country || ""} />
              <TextInput name="destination_city" label="Ville destination" defaultValue={item?.destination_city || ""} />
              <TextInput name="shipping_mode" label="Mode d’expédition" defaultValue={item?.shipping_mode || ""} placeholder="Air Cargo, Sea Freight..." />
              <TextInput name="shipment_reference" label="Expédition liée" defaultValue={item?.shipment_reference || ""} placeholder="EXP-2026-00324" />
              <TextInput name="eta_at" label="ETA" defaultValue={toDatetimeLocal(item?.eta_at)} type="datetime-local" />
            </FormSection>

            <FormSection title="Marchandise & mesures">
              <TextInput name="description" label="Description" defaultValue={item?.description || ""} placeholder="Électronique, textile..." />
              <TextInput name="category" label="Catégorie" defaultValue={item?.category || ""} />
              <TextInput name="weight_kg" label="Poids kg" defaultValue={valueOrEmpty(item?.weight_kg)} type="number" step="0.01" />
              <TextInput name="volumetric_weight_kg" label="Poids volumétrique kg" defaultValue={valueOrEmpty(item?.volumetric_weight_kg)} type="number" step="0.01" />
              <TextInput name="length_cm" label="Longueur cm" defaultValue={valueOrEmpty(item?.length_cm)} type="number" step="0.01" />
              <TextInput name="width_cm" label="Largeur cm" defaultValue={valueOrEmpty(item?.width_cm)} type="number" step="0.01" />
              <TextInput name="height_cm" label="Hauteur cm" defaultValue={valueOrEmpty(item?.height_cm)} type="number" step="0.01" />
              <TextInput name="volume_cbm" label="Volume m³" defaultValue={valueOrEmpty(item?.volume_cbm)} type="number" step="0.001" />
              <TextInput name="pieces_count" label="Nombre de pièces" defaultValue={valueOrEmpty(item?.pieces_count || 1)} type="number" step="1" />
              <TextInput name="declared_value" label="Valeur déclarée" defaultValue={valueOrEmpty(item?.declared_value)} type="number" step="0.01" />
              <TextInput name="declared_currency" label="Devise valeur" defaultValue={item?.declared_currency || item?.currency || ""} />
              <TextInput name="last_scan_location" label="Dernière localisation scan" defaultValue={item?.last_scan_location || ""} />
              <label className="mt-2 flex items-center gap-2 text-[13px] text-[#334155]">
                <input name="is_fragile" type="checkbox" defaultChecked={item?.is_fragile ?? false} className="rounded border-[#c9d0d8]" />
                Colis fragile
              </label>
            </FormSection>

            <FormSection title="Entrepôt">
              <TextInput name="warehouse_name" label="Entrepôt" defaultValue={item?.warehouse_name || ""} />
              <TextInput name="warehouse_zone" label="Zone" defaultValue={item?.warehouse_zone || ""} />
              <TextInput name="warehouse_rack" label="Rack" defaultValue={item?.warehouse_rack || ""} />
              <TextInput name="warehouse_location" label="Emplacement" defaultValue={item?.warehouse_location || ""} />
            </FormSection>

            <FormSection title="Finance">
              <TextInput name="fees_total" label="Montant total" defaultValue={valueOrEmpty(item?.fees_total)} type="number" step="0.01" />
              <TextInput name="fees_paid" label="Montant payé" defaultValue={valueOrEmpty(item?.fees_paid)} type="number" step="0.01" />
              <TextInput name="currency" label="Devise" defaultValue={item?.currency || ""} placeholder="USD, CDF..." />
              <label className="mt-2 flex items-center gap-2 text-[13px] text-[#334155]">
                <input name="public_tracking_enabled" type="checkbox" defaultChecked={item?.public_tracking_enabled ?? true} className="rounded border-[#c9d0d8]" />
                Tracking public activé
              </label>
              <label className="block">
                <FormLabel>Notes internes</FormLabel>
                <textarea name="notes" defaultValue={item?.notes || ""} className={`${inputClass} h-24 py-2`} />
              </label>
            </FormSection>
          </div>

          {error && (
            <div className="mx-5 mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[#d8dce2] px-5 py-4">
            <button type="button" onClick={onClose} className={buttonClass}>Annuler</button>
            <button type="submit" disabled={saving} className={primaryButtonClass}>
              {saving ? "Enregistrement..." : mode === "edit" ? "Enregistrer" : "Créer le colis"}
            </button>
          </div>
        </form>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-8">
      <div className="w-full max-w-[620px] overflow-hidden rounded-xl border border-[#cfd5dd] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#d8dce2] px-5 py-4">
          <div>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Importer des colis</h2>
            <p className="mt-1 text-[13px] leading-5 text-[#687584]">
              CSV accepté. Colonnes recommandées : dossier_reference, package_reference, package_type, description, weight_kg, length_cm, width_cm, height_cm, warehouse_name.
            </p>
          </div>
          <button onClick={onClose} className={iconButtonClass} aria-label="Fermer"><X size={17} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <label className="block rounded-md border border-dashed border-[#cfd5dd] bg-[#fbfcfd] p-5">
            <FormLabel>Fichier CSV</FormLabel>
            <input name="file" type="file" accept=".csv,text/csv" className="mt-2 w-full text-[13px]" />
          </label>
          {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</div>}
          {result && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800">
              Import terminé : {result.created} colis créés, {result.skipped} lignes ignorées.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={buttonClass}>Fermer</button>
            <button type="submit" disabled={importing} className={primaryButtonClass}>
              {importing ? "Import..." : "Importer le CSV"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-[#d8dce2] bg-white">
      <h3 className="border-b border-[#eef0f3] px-4 py-3 text-[13px] font-semibold text-[#1f2328]">{title}</h3>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-md border border-[#d8dce2] p-4">
      <h3 className="text-[13px] font-semibold text-[#1f2328]">{title}</h3>
      {children}
    </section>
  );
}

function FormLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[12px] font-medium text-[#5f6b76]">{children}</span>;
}

function TextInput({ name, label, defaultValue, placeholder, type = "text", step }: {
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
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} type={type} step={step} className={inputClass} />
    </label>
  );
}

function SelectInput({ name, label, defaultValue, options }: {
  name: string;
  label: string;
  defaultValue: string;
  options: Record<string, string>;
}) {
  return (
    <label className="block">
      <FormLabel>{label}</FormLabel>
      <select name={name} defaultValue={defaultValue} className={inputClass}>
        {Object.entries(options).map(([value, labelText]) => <option key={value} value={value}>{labelText}</option>)}
      </select>
    </label>
  );
}

function SelectFilter({ value, onChange, label, children }: { value: string; onChange: (value: string) => void; label: string; children: React.ReactNode }) {
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
      <ChevronRight size={14} className="pointer-events-none absolute right-2 rotate-90 text-[#687584]" />
    </label>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
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
      <p className="mt-0.5 break-words text-[13px] leading-5 text-[#1f2328]">{value}</p>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[#d8dce2] bg-[#fbfcfd] p-3">
      <p className="text-[12px] text-[#687584]">{label}</p>
      <p className="mt-1 text-[18px] font-semibold tracking-[-0.03em]">{value}</p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-md border border-dashed border-[#d8dce2] px-6 text-center">
      <h3 className="text-[16px] font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-[13px] leading-6 text-[#687584]">{text}</p>
    </div>
  );
}

function LoadingLines() {
  return <div className="space-y-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-md bg-[#eef1f5]" />)}</div>;
}

function StatusBadge({ status }: { status: PackageStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-[12px] font-medium ring-1 ${statusStyles[status] || statusStyles.CREATED}`}>{statusLabels[status] || status}</span>;
}

function InventoryBadge({ status }: { status: InventoryStatus }) {
  const tone = status === "IN_STOCK" ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : status === "DISPATCHED" ? "bg-blue-50 text-blue-700 ring-blue-100" : "bg-slate-100 text-slate-700 ring-slate-200";
  return <span className={`inline-flex rounded-full px-2 py-1 text-[12px] font-medium ring-1 ${tone}`}>{inventoryLabels[status] || status}</span>;
}

function ValidationBadge({ status }: { status: PackageValidationStatus }) {
  const tone = status === "VALIDATED"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
    : status === "BLOCKED" || status === "REJECTED"
      ? "bg-red-50 text-red-700 ring-red-100"
      : status === "NEEDS_REVIEW"
        ? "bg-amber-50 text-amber-800 ring-amber-100"
        : "bg-slate-100 text-slate-700 ring-slate-200";
  return <span className={`inline-flex rounded-full px-2 py-1 text-[12px] font-medium ring-1 ${tone}`}>{validationLabels[status] || status}</span>;
}

function PaymentBadge({ status }: { status: PaymentClearanceStatus }) {
  const tone = status === "CLEARED" || status === "PAID" ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : status === "BLOCKED" || status === "OVERDUE" ? "bg-red-50 text-red-700 ring-red-100" : "bg-amber-50 text-amber-800 ring-amber-100";
  return <span className={`inline-flex rounded-full px-2 py-1 text-[12px] font-medium ring-1 ${tone}`}>{paymentLabels[status] || status}</span>;
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
  const origin = [item.origin_city, item.origin_country].filter(Boolean).join(", ");
  const destination = [item.destination_city, item.destination_country].filter(Boolean).join(", ");
  if (!origin && !destination) return "-";
  return `${origin || "Origine"} → ${destination || "Destination"}`;
}

function warehouseLocationLabel(item: PackageRecord) {
  const parts = [item.warehouse_zone, item.warehouse_rack, item.warehouse_location].filter(Boolean);
  return parts.length ? parts.join(" · ") : inventoryLabels[item.inventory_status] || "-";
}

function dimensionsLabel(item: PackageRecord) {
  if (!item.length_cm && !item.width_cm && !item.height_cm) return "-";
  return `${item.length_cm || "-"} x ${item.width_cm || "-"} x ${item.height_cm || "-"} cm`;
}

function routeLabelFromDossier(item: DossierRecord) {
  const origin = [item.origin_city, item.origin_country].filter(Boolean).join(", ");
  const destination = [item.destination_city, item.destination_country].filter(Boolean).join(", ");
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
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
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
  if (!error.response) return "API injoignable. Vérifiez l’URL du backend et l’état du service.";
  if (error.response.status === 401) return "Session expirée ou token Clerk manquant.";
  if (error.response.status === 403) return "Vous n’avez pas accès à cette organisation.";
  if (error.response.status === 404) return "Ressource introuvable.";
  if (error.response.status === 422) return "Données invalides. Vérifiez les champs obligatoires.";
  return `Erreur API (${error.response.status}).`;
}

const inputClass = "h-9 w-full rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px] text-[#1f2328] shadow-sm outline-none transition placeholder:text-[#98a2b3] focus:border-[#2f7df6]";
