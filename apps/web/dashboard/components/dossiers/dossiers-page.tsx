"use client";

import axios from "axios";
import {
  AlertCircle,
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  History,
  MessageCircle,
  Bell,
  Package,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Upload,
  Trash2,
  Truck,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { API_BASE_URL } from "@/services/api";
import {
  OperationPageHeader,
  OperationTabs,
} from "@/components/ui/operation-page-header";
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
import { PermissionGuard } from "@/components/permissions/permission-guard";
import { listClients, type ClientRecord } from "@/services/clients";
import {
  getReferenceCatalog,
  type ReferenceCatalog,
} from "@/services/references";
import {
  archiveDossier,
  createDossier,
  exportDossiers,
  getDossier,
  getDossierStats,
  getDossierTimeline,
  downloadDossierDocument,
  listDossierChecklist,
  listDossierDocuments,
  listDossiers,
  listDossierAlerts,
  listArchivedDossiers,
  restoreDossier,
  updateDossierChecklistItem,
  uploadDossierDocument,
  updateDossier,
  createDossierNote,
  deleteDossierNote,
  listDossierMembers,
  listDossierNotes,
  updateDossierCollaboration,
  updateDossierNote,
  type DossierCaseType,
  type DossierChecklistItem,
  type DossierDocument,
  type DossierInternalNote,
  type DossierOperationalAlert,
  type DossierMember,
  type DossierPriority,
  type DossierIntakeStatus,
  type DossierPaymentStatus,
  type DossierPayload,
  type DossierRecord,
  type DossierStats,
  type DossierStatus,
  type DossierTimelineEvent,
  type DossierValidationStatus,
} from "@/services/dossiers";

const statusLabels: Record<DossierStatus, string> = {
  LEAD: "Lead",
  DRAFT: "Brouillon",
  QUOTED: "Devis envoyé",
  WAITING_PACKAGES: "Attente colis",
  IN_WAREHOUSE: "En entrepôt",
  READY_TO_SHIP: "Prêt à expédier",
  IN_TRANSIT: "En transit",
  ARRIVED: "Arrivé",
  CUSTOMS: "Dédouanement",
  READY_FOR_DELIVERY: "Prêt livraison",
  DELIVERED: "Livré",
  COMPLETED: "Terminé",
  CLOSED: "Clôturé",
  CANCELLED: "Annulé",
};

const initialStatusLabels: Partial<Record<DossierStatus, string>> = {
  LEAD: statusLabels.LEAD,
  DRAFT: statusLabels.DRAFT,
};

const statusStyles: Record<DossierStatus, string> = {
  LEAD: "bg-blue-50 text-blue-700 ring-blue-100",
  DRAFT: "bg-slate-100 text-slate-700 ring-slate-200",
  QUOTED: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  WAITING_PACKAGES: "bg-amber-50 text-amber-800 ring-amber-100",
  IN_WAREHOUSE: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  READY_TO_SHIP: "bg-teal-50 text-teal-700 ring-teal-100",
  IN_TRANSIT: "bg-blue-50 text-blue-700 ring-blue-100",
  ARRIVED: "bg-purple-50 text-purple-700 ring-purple-100",
  CUSTOMS: "bg-orange-50 text-orange-700 ring-orange-100",
  READY_FOR_DELIVERY: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  DELIVERED: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  CLOSED: "bg-gray-100 text-gray-700 ring-gray-200",
  CANCELLED: "bg-red-50 text-red-700 ring-red-100",
};

const caseTypeLabels: Record<DossierCaseType, string> = {
  UNKNOWN: "Non défini",
  IMPORT: "Import",
  EXPORT: "Export",
  PURCHASE: "Achat",
  QUOTE: "Devis",
  PERSONAL_EFFECTS: "Effets personnels",
  COMMERCIAL_CARGO: "Cargo commercial",
};

const intakeLabels: Record<DossierIntakeStatus, string> = {
  PARTIAL: "Incomplet",
  COMPLETE: "Complet",
  WAITING_CLIENT: "Attente client",
  WAITING_PACKAGE: "Attente colis",
};

const validationLabels: Record<DossierValidationStatus, string> = {
  PENDING: "À valider",
  VALIDATED: "Validé",
  REJECTED: "Rejeté",
  NEEDS_REVIEW: "À revoir",
};

const paymentLabels: Record<DossierPaymentStatus, string> = {
  PENDING: "En attente",
  WAITING: "À payer",
  PARTIAL: "Partiel",
  PAID: "Payé",
  OVERDUE: "En retard",
  CANCELLED: "Annulé",
};

const emptyStats: DossierStats = {
  total: 0,
  active: 0,
  leads: 0,
  quoted: 0,
  waiting_packages: 0,
  in_transit: 0,
  delivered: 0,
  payment_pending: 0,
  total_value: 0,
};

const views: Array<{
  key: string;
  label: string;
  status?: DossierStatus;
  archived?: boolean;
}> = [
  { key: "all", label: "Tous" },
  { key: "quoted", label: "Devis", status: "QUOTED" },
  { key: "waiting", label: "En attente du colis", status: "WAITING_PACKAGES" },
  { key: "active", label: "Avec colis" },
  { key: "archived", label: "Archivés", archived: true },
];

const buttonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px] font-medium text-[#1f2328] shadow-sm transition hover:bg-[#f7f8fa]";
const pagerButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-md border border-[#cfd5dd] bg-white text-[#334155] shadow-sm disabled:opacity-40";

type Pagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};
type DossierFormMode = "create" | "edit";
type DetailTab =
  | "summary"
  | "collaboration"
  | "client"
  | "shipments"
  | "documents"
  | "checklist"
  | "messages"
  | "notifications"
  | "history";

export function DossiersPage() {
  const [dossiers, setDossiers] = useState<DossierRecord[]>([]);
  const [stats, setStats] = useState<DossierStats>(emptyStats);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    page_size: 30,
    total: 0,
    total_pages: 0,
  });
  const [selected, setSelected] = useState<DossierRecord | null>(null);
  const [timeline, setTimeline] = useState<DossierTimelineEvent[]>([]);
  const [documents, setDocuments] = useState<DossierDocument[]>([]);
  const [checklist, setChecklist] = useState<DossierChecklistItem[]>([]);
  const [members, setMembers] = useState<DossierMember[]>([]);
  const [notes, setNotes] = useState<DossierInternalNote[]>([]);
  const [alerts, setAlerts] = useState<DossierOperationalAlert[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>("summary");
  const [activeView, setActiveView] = useState("all");
  const [query, setQuery] = useState("");
  const [caseType, setCaseType] = useState<DossierCaseType | "">("");
  const [status, setStatus] = useState<DossierStatus | "">("");
  const [validation, setValidation] = useState<DossierValidationStatus | "">(
    "",
  );
  const [payment, setPayment] = useState<DossierPaymentStatus | "">("");
  const [sort, setSort] = useState("updated_desc");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formMode, setFormMode] = useState<DossierFormMode>("create");
  const [formDossier, setFormDossier] = useState<DossierRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [dossierAction, setDossierAction] = useState<
    "archive" | "restore" | null
  >(null);

  const currentView = views.find((view) => view.key === activeView) || views[0];
  const page = pagination.page || 1;

  useEffect(() => {
    const timeout = window.setTimeout(() => loadDossiers(1), 220);
    return () => window.clearTimeout(timeout);
    // The listed filters intentionally define when the debounced request runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseType, status, validation, payment, sort, activeView]);

  useEffect(() => {
    Promise.all([loadStats(), loadAlerts()]);
  }, []);

  async function loadAlerts() {
    try {
      setAlerts(await listDossierAlerts());
    } catch {
      setAlerts([]);
    }
  }

  useEffect(() => {
    if (!selected || activeTab !== "history") return;
    loadTimeline(selected.id);
  }, [selected, activeTab]);

  useEffect(() => {
    if (!selected) return;
    if (activeTab === "documents")
      listDossierDocuments(selected.id)
        .then(setDocuments)
        .catch(() => setDocuments([]));
    if (activeTab === "checklist")
      listDossierChecklist(selected.id)
        .then(setChecklist)
        .catch(() => setChecklist([]));
    if (activeTab === "collaboration")
      Promise.all([listDossierMembers(), listDossierNotes(selected.id)])
        .then(([nextMembers, nextNotes]) => {
          setMembers(nextMembers);
          setNotes(nextNotes);
        })
        .catch(() => {
          setMembers([]);
          setNotes([]);
        });
  }, [selected, activeTab]);

  async function loadStats() {
    try {
      setStats(await getDossierStats());
    } catch {
      setStats(emptyStats);
    }
  }

  async function loadDossiers(nextPage = page) {
    setLoading(true);
    setError("");
    try {
      const response = currentView.archived
        ? await listArchivedDossiers({
            q: query || undefined,
            page: nextPage,
            page_size: 30,
          })
        : await listDossiers({
            q: query || undefined,
            status_global:
              currentView.key === "active"
                ? undefined
                : currentView.status || status || undefined,
            case_type: caseType || undefined,
            validation_status: validation || undefined,
            payment_status: payment || undefined,
            page: nextPage,
            page_size: 30,
            sort,
          });
      const items =
        currentView.key === "active"
          ? response.items.filter(
              (item) =>
                !["COMPLETED", "CLOSED", "CANCELLED"].includes(
                  item.status_global,
                ),
            )
          : response.items;
      setDossiers(items);
      setPagination(response.pagination);
      if (selected && !items.some((item) => item.id === selected.id))
        setSelected(null);
    } catch (err) {
      setError(apiErrorMessage(err));
      setDossiers([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  async function selectDossier(dossier: DossierRecord) {
    setSelected(dossier);
    setActiveTab("summary");
    setTimeline([]);
    setDetailLoading(true);
    try {
      setSelected(await getDossier(dossier.id));
    } catch {
      setSelected(dossier);
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadTimeline(dossierId: string) {
    setTimelineLoading(true);
    try {
      setTimeline(await getDossierTimeline(dossierId));
    } catch {
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  }

  function openCreate() {
    setFormMode("create");
    setFormDossier(null);
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(dossier: DossierRecord) {
    setFormMode("edit");
    setFormDossier(dossier);
    setFormError("");
    setFormOpen(true);
  }

  async function submitDossier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    const payload: DossierPayload = {
      client_id: String(form.get("client_id") || ""),
      route_id: clean(form.get("route_id")),
      shipping_service_id: clean(form.get("shipping_service_id")),
      origin_warehouse_id: clean(form.get("origin_warehouse_id")),
      destination_office_id: clean(form.get("destination_office_id")),
      case_type: String(form.get("case_type") || "UNKNOWN") as DossierCaseType,
      status_global: String(
        form.get("status_global") || "LEAD",
      ) as DossierStatus,
      intake_status: String(
        form.get("intake_status") || "PARTIAL",
      ) as DossierIntakeStatus,
      validation_status: String(
        form.get("validation_status") || "PENDING",
      ) as DossierValidationStatus,
      primary_channel: clean(form.get("primary_channel")) || "manual",
      origin_country: clean(form.get("origin_country")),
      origin_city: clean(form.get("origin_city")),
      destination_country: clean(form.get("destination_country")),
      destination_city: clean(form.get("destination_city")),
      goods_type: clean(form.get("goods_type")),
      estimated_weight_kg: numberOrNull(form.get("estimated_weight_kg")),
      estimated_volume_cbm: numberOrNull(form.get("estimated_volume_cbm")),
      shipping_mode: clean(form.get("shipping_mode")),
      tracking_id: clean(form.get("tracking_id")),
      quoted_total: numberOrNull(form.get("quoted_total")),
      quoted_currency: clean(form.get("quoted_currency")),
      pricing_status: clean(form.get("pricing_status")),
      final_total: numberOrNull(form.get("final_total")),
      final_currency: clean(form.get("final_currency")),
      payment_status: String(
        form.get("payment_status") || "PENDING",
      ) as DossierPaymentStatus,
      client_full_name: clean(form.get("client_full_name")),
      supplier_payment_amount: numberOrNull(
        form.get("supplier_payment_amount"),
      ),
      supplier_payment_currency: clean(form.get("supplier_payment_currency")),
      row_version: formDossier?.row_version,
    };
    if (!payload.client_id) {
      setSaving(false);
      setFormError("Sélectionnez un client réel avant de créer le dossier.");
      return;
    }
    try {
      const saved =
        formMode === "edit" && formDossier
          ? await updateDossier(formDossier.id, payload)
          : await createDossier(payload);
      setSelected(saved);
      setFormOpen(false);
      setFormDossier(null);
      await Promise.all([
        loadStats(),
        loadDossiers(formMode === "edit" ? page : 1),
      ]);
      await loadAlerts();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    try {
      const blob = await exportDossiers({
        q: query || undefined,
        status_global: currentView.status || status || undefined,
        case_type: caseType || undefined,
        validation_status: validation || undefined,
        payment_status: payment || undefined,
        sort,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "slaivio-dossiers.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleArchive() {
    if (
      !selected ||
      dossierAction ||
      !window.confirm(`Archiver ${selected.dossier_reference} ?`)
    )
      return;
    setDossierAction("archive");
    try {
      await archiveDossier(selected.id, selected.row_version);
      setSelected(null);
      await Promise.all([loadStats(), loadDossiers(page)]);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setDossierAction(null);
    }
  }

  async function handleRestore() {
    if (!selected || dossierAction) return;
    setDossierAction("restore");
    try {
      await restoreDossier(selected.id, selected.row_version);
      setSelected(null);
      await Promise.all([loadStats(), loadDossiers(page)]);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setDossierAction(null);
    }
  }

  const statCards = useMemo(
    () => [
      { label: "Dossiers total", value: stats.total, tone: "blue" },
      { label: "Actifs", value: stats.active, tone: "blue" },
      { label: "Attente colis", value: stats.waiting_packages, tone: "amber" },
      { label: "En transit", value: stats.in_transit, tone: "blue" },
      {
        label: "Paiements à suivre",
        value: stats.payment_pending,
        tone: "amber",
      },
    ],
    [stats],
  );

  return (
    <div className="min-h-full bg-[#f7f7f6] text-[#1f2328]">
      <div className="overflow-hidden bg-white">
        <OperationPageHeader
          title="Dossiers cargo"
          description="Chaque demande client devient un dossier traçable : route, colis, devis, paiement, messages et expéditions liés."
          actions={
            <>
              <details className="relative">
                <summary className={`${buttonClass} cursor-pointer list-none`}>
                  Plus
                </summary>
                <div className="absolute right-0 z-30 mt-1 w-56 rounded-md bg-white p-1 shadow-[0_8px_30px_rgba(15,23,42,.14)] ring-1 ring-[#e8eaed]">
                  <button className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-[13px] hover:bg-[#f5f6f7]">
                    <span className="flex items-center gap-2">
                      <Bell size={14} />
                      Alertes du module
                    </span>
                    {alerts.length > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                        {alerts.length}
                      </span>
                    )}
                  </button>
                </div>
              </details>
              <PermissionGuard permission="dossiers.export">
                <OperationButton onClick={handleExport}>
                  <Download size={14} />
                  Exporter
                </OperationButton>
              </PermissionGuard>
              <PermissionGuard permission="dossiers.create">
                <OperationButton variant="primary" onClick={openCreate}>
                  <span className="text-lg leading-none">+</span>
                  Nouveau dossier
                </OperationButton>
              </PermissionGuard>
            </>
          }
        />

        <OperationMetrics>
          <OperationMetricGrid className="lg:grid-cols-5">
            {statCards.map((card) => (
              <OperationMetric
                key={card.label}
                label={card.label}
                value={card.value.toLocaleString("fr-FR")}
                tone={card.tone === "amber" ? "warning" : "default"}
              />
            ))}
          </OperationMetricGrid>
        </OperationMetrics>

        <OperationTabs>
          {views.map((view) => (
            <OperationTab
              key={view.key}
              onClick={() => setActiveView(view.key)}
              active={activeView === view.key}
            >
              {view.label}
            </OperationTab>
          ))}
        </OperationTabs>

        <section>
          <OperationToolbar
            search={<OperationSearch value={query} onChange={setQuery} placeholder="Rechercher un dossier…" />}
            filters={<OperationButton onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}><SlidersHorizontal size={15} />Filtres</OperationButton>}
          />
          {filtersOpen && (
            <div className="flex flex-col gap-2 border-y border-[#d8dce2] bg-[#fafbfc] px-5 py-3 xl:flex-row xl:items-center">
              <SelectFilter
                value={caseType}
                onChange={(value) => setCaseType(value as DossierCaseType | "")}
                label="Type"
              >
                <option value="">Type</option>
                {Object.entries(caseTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectFilter>
              <SelectFilter
                value={status}
                onChange={(value) => setStatus(value as DossierStatus | "")}
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
                value={validation}
                onChange={(value) =>
                  setValidation(value as DossierValidationStatus | "")
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
                value={payment}
                onChange={(value) =>
                  setPayment(value as DossierPaymentStatus | "")
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
              <SelectFilter value={sort} onChange={setSort} label="Tri">
                <option value="updated_desc">Activité récente</option>
                <option value="created_desc">Créés récemment</option>
                <option value="created_asc">Créés anciennement</option>
                <option value="reference_asc">Référence A-Z</option>
                <option value="client_asc">Client A-Z</option>
                <option value="amount_desc">Montant élevé</option>
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

          {error && (
            <div className="m-4 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
              <AlertCircle size={17} className="mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <DossiersTable
            dossiers={dossiers}
            loading={loading}
            selectedId={selected?.id}
            onSelect={selectDossier}
          />

          <div className="flex flex-col gap-3 border-t border-[#d8dce2] px-5 py-3 text-[13px] text-[#5f6b76] sm:flex-row sm:items-center sm:justify-between">
            <span>
              {pagination.total === 0
                ? "0 dossier"
                : `${(page - 1) * pagination.page_size + 1} - ${Math.min(page * pagination.page_size, pagination.total)} sur ${pagination.total} dossier(s)`}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => loadDossiers(page - 1)}
                className={pagerButtonClass}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="rounded-md bg-[#166ee8] px-3 py-1.5 text-[13px] font-semibold text-white">
                {page}
              </span>
              <button
                disabled={page >= pagination.total_pages || loading}
                onClick={() => loadDossiers(page + 1)}
                className={pagerButtonClass}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <section className="hidden">
            {statCards.map((card) => (
              <div
                key={card.label}
                className={`min-h-[90px] rounded-md border p-4 ${metricCardClass(card.tone)}`}
              >
                <p className="text-[13px] font-medium">{card.label}</p>
                <p className="mt-3 text-[30px] font-normal leading-none tracking-[-0.04em]">
                  {card.value.toLocaleString("fr-FR")}
                </p>
              </div>
            ))}
          </section>
        </section>
      </div>

      {selected && (
        <DossierDetails
          dossier={selected}
          loading={detailLoading}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          timeline={timeline}
          timelineLoading={timelineLoading}
          onClose={() => setSelected(null)}
          onEdit={() => openEdit(selected)}
          archived={Boolean(currentView.archived)}
          action={dossierAction}
          onArchive={handleArchive}
          onRestore={handleRestore}
          documents={documents}
          checklist={checklist}
          members={members}
          notes={notes}
          onUpload={async (file, type, notes) => {
            await uploadDossierDocument(selected.id, file, type, notes);
            setDocuments(await listDossierDocuments(selected.id));
          }}
          onDownload={async (documentId) => {
            window.open(
              await downloadDossierDocument(selected.id, documentId),
              "_blank",
              "noopener,noreferrer",
            );
          }}
          onChecklist={async (item, nextStatus) => {
            const updated = await updateDossierChecklistItem(
              selected.id,
              item,
              nextStatus,
            );
            setChecklist((items) =>
              items.map((current) =>
                current.id === updated.id ? updated : current,
              ),
            );
            await loadAlerts();
          }}
          onCollaboration={async (priority, assignedTo, dueAt) => {
            const updated = await updateDossierCollaboration(selected.id, {
              row_version: selected.row_version,
              priority,
              assigned_to: assignedTo,
              due_at: dueAt,
            });
            setSelected(updated);
            setDossiers((items) =>
              items.map((item) => (item.id === updated.id ? updated : item)),
            );
            await loadAlerts();
          }}
          onCreateNote={async (body) => {
            await createDossierNote(selected.id, body);
            setNotes(await listDossierNotes(selected.id));
          }}
          onUpdateNote={async (note, body) => {
            await updateDossierNote(selected.id, note, body);
            setNotes(await listDossierNotes(selected.id));
          }}
          onDeleteNote={async (note) => {
            await deleteDossierNote(selected.id, note);
            setNotes(await listDossierNotes(selected.id));
          }}
        />
      )}

      {formOpen && (
        <DossierFormModal
          mode={formMode}
          dossier={formDossier}
          saving={saving}
          error={formError}
          onClose={() => {
            setFormOpen(false);
            setFormDossier(null);
            setFormError("");
          }}
          onSubmit={submitDossier}
        />
      )}
    </div>
  );
}

function DossiersTable({
  dossiers,
  loading,
  selectedId,
  onSelect,
}: {
  dossiers: DossierRecord[];
  loading: boolean;
  selectedId?: string;
  onSelect: (dossier: DossierRecord) => void;
}) {
  if (loading) {
    return <TableSkeleton />;
  }
  if (dossiers.length === 0) {
    return <SharedEmptyState title="Aucun dossier trouvé" description="Créez un dossier à partir d’un client réel ou ajustez les filtres de cette vue." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[920px] w-full border-collapse text-left text-[13px]">
        <thead className="border-b border-[#d8dce2] bg-[#f7f8fa] font-medium text-[#5f6b76]">
          <tr>
            <th className="w-10 px-4 py-2">
              <input
                type="checkbox"
                className="rounded border-[#c9d0d8]"
                aria-label="Sélectionner tous les dossiers"
              />
            </th>
            <th className="px-3 py-2">Dossier</th>
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Route</th>
            <th className="px-3 py-2">Statut</th>
            <th className="px-3 py-2">Paiement</th>
            <th className="px-3 py-2 text-right">Colis</th>
            <th className="px-3 py-2 text-right">Expéditions</th>
            <th className="px-3 py-2">Mise à jour</th>
            <th className="w-10 px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf0f2]">
          {dossiers.map((dossier) => (
            <tr
              key={dossier.id}
              onClick={() => onSelect(dossier)}
              className={`cursor-pointer transition hover:bg-[#f6f8fb] ${selectedId === dossier.id ? "bg-[#edf2f8]" : ""}`}
            >
              <td
                className="px-4 py-2"
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  className="rounded border-[#c9d0d8]"
                  aria-label={`Sélectionner ${dossier.dossier_reference}`}
                />
              </td>
              <td className="px-3 py-2">
                <p className="font-medium text-[#1f2328]">
                  {dossier.dossier_reference}
                </p>
                <p className="text-[12px] text-[#687584]">
                  {caseTypeLabels[dossier.case_type] || dossier.case_type}
                </p>
              </td>
              <td className="px-3 py-2">
                <p className="font-medium text-[#1f2328]">
                  {dossier.client_name || dossier.client_full_name || "Client"}
                </p>
                <p className="text-[12px] text-[#687584]">
                  {dossier.client_phone || dossier.client_email || "-"}
                </p>
              </td>
              <td className="px-3 py-2 text-[#334155]">
                {routeLabel(dossier)}
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={dossier.status_global} />
              </td>
              <td className="px-3 py-2">
                <PaymentBadge status={dossier.payment_status} />
              </td>
              <td className="px-3 py-2 text-right font-medium">
                {dossier.package_count}
              </td>
              <td className="px-3 py-2 text-right font-medium">
                {dossier.shipment_count}
              </td>
              <td className="px-3 py-2 text-[#687584]">
                {formatDate(dossier.updated_at || dossier.created_at)}
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

function DossierDetails({
  dossier,
  loading,
  activeTab,
  onTabChange,
  timeline,
  timelineLoading,
  onClose,
  onEdit,
  archived,
  action,
  onArchive,
  onRestore,
  documents,
  checklist,
  members,
  notes,
  onUpload,
  onDownload,
  onChecklist,
  onCollaboration,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: {
  dossier: DossierRecord;
  loading: boolean;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  timeline: DossierTimelineEvent[];
  timelineLoading: boolean;
  onClose: () => void;
  onEdit: () => void;
  archived: boolean;
  action: "archive" | "restore" | null;
  onArchive: () => void;
  onRestore: () => void;
  documents: DossierDocument[];
  checklist: DossierChecklistItem[];
  members: DossierMember[];
  notes: DossierInternalNote[];
  onUpload: (file: File, type: string, notes?: string) => Promise<void>;
  onDownload: (documentId: string) => Promise<void>;
  onChecklist: (
    item: DossierChecklistItem,
    status: DossierChecklistItem["status"],
  ) => Promise<void>;
  onCollaboration: (
    priority: DossierPriority,
    assignedTo: string | null,
    dueAt: string | null,
  ) => Promise<void>;
  onCreateNote: (body: string) => Promise<void>;
  onUpdateNote: (note: DossierInternalNote, body: string) => Promise<void>;
  onDeleteNote: (note: DossierInternalNote) => Promise<void>;
}) {
  const tabs: Array<{ key: DetailTab; label: string }> = [
    { key: "summary", label: "Résumé" },
    { key: "collaboration", label: "Collaboration" },
    { key: "client", label: "Client" },
    { key: "shipments", label: "Colis & expéditions" },
    { key: "documents", label: "Documents" },
    { key: "checklist", label: "Checklist" },
    { key: "messages", label: "Messages" },
    { key: "notifications", label: "Notifications" },
    { key: "history", label: "Historique" },
  ];

  return (
    <OperationDrawer
      open
      close={onClose}
      width="max-w-[720px]"
      title={dossier.dossier_reference}
      description="Dossier cargo"
      headerActions={
        <>
              {!archived && (
                <PermissionGuard permission="dossiers.update">
                  <button onClick={onEdit} className={buttonClass}>
                    <Edit3 size={15} />
                    Modifier
                  </button>
                </PermissionGuard>
              )}
              <PermissionGuard permission="dossiers.archive">
                {archived ? (
                  <button
                    onClick={onRestore}
                    disabled={action !== null}
                    className={buttonClass}
                  >
                    <RotateCcw size={15} />
                    {action === "restore" ? "Restauration…" : "Restaurer"}
                  </button>
                ) : (
                  <button
                    onClick={onArchive}
                    disabled={action !== null}
                    className={buttonClass}
                  >
                    <Archive size={15} />
                    {action === "archive" ? "Archivage…" : "Archiver"}
                  </button>
                )}
              </PermissionGuard>
        </>
      }
      headerMeta={<><StatusBadge status={dossier.status_global} /><PaymentBadge status={dossier.payment_status} />{loading && <span className="text-[12px] text-[#687584]">Actualisation…</span>}</>}
      tabs={
        <>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`h-8 whitespace-nowrap rounded-md px-3 text-[13px] font-medium ${activeTab === tab.key ? "bg-[#e9ecef] text-[#111827]" : "text-[#4f5b67] hover:bg-[#f1f3f5]"}`}
            >
              {tab.label}
            </button>
          ))}
        </>
      }
    >
          {activeTab === "summary" && <SummaryTab dossier={dossier} />}
          {activeTab === "collaboration" && (
            <CollaborationTab
              dossier={dossier}
              members={members}
              notes={notes}
              onSave={onCollaboration}
              onCreateNote={onCreateNote}
              onUpdateNote={onUpdateNote}
              onDeleteNote={onDeleteNote}
            />
          )}
          {activeTab === "client" && <ClientTab dossier={dossier} />}
          {activeTab === "shipments" && <ShipmentsTab dossier={dossier} />}
          {activeTab === "documents" && (
            <DocumentsTab
              documents={documents}
              onUpload={onUpload}
              onDownload={onDownload}
            />
          )}
          {activeTab === "checklist" && (
            <ChecklistTab items={checklist} onChange={onChecklist} />
          )}
          {activeTab === "messages" && <MessagesTab dossier={dossier} />}
          {activeTab === "notifications" && (
            <NotificationsTab dossier={dossier} />
          )}
          {activeTab === "history" && (
            <HistoryTab events={timeline} loading={timelineLoading} />
          )}
    </OperationDrawer>
  );
}

function CollaborationTab({
  dossier,
  members,
  notes,
  onSave,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: {
  dossier: DossierRecord;
  members: DossierMember[];
  notes: DossierInternalNote[];
  onSave: (
    priority: DossierPriority,
    assignedTo: string | null,
    dueAt: string | null,
  ) => Promise<void>;
  onCreateNote: (body: string) => Promise<void>;
  onUpdateNote: (note: DossierInternalNote, body: string) => Promise<void>;
  onDeleteNote: (note: DossierInternalNote) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function saveTracking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const rawDue = String(form.get("due_at") || "");
      await onSave(
        String(form.get("priority")) as DossierPriority,
        String(form.get("assigned_to") || "") || null,
        rawDue ? new Date(rawDue).toISOString() : null,
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const body = String(new FormData(formElement).get("body") || "").trim();
    if (!body) return;
    setSaving(true);
    setError("");
    try {
      await onCreateNote(body);
      formElement.reset();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-5">
      <PermissionGuard permission="dossiers.update">
        <form
          onSubmit={saveTracking}
          className="rounded-md border border-[#d8dce2] p-4"
        >
          <h3 className="text-[14px] font-semibold">Pilotage du dossier</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-[12px] text-[#617083]">
              Priorité
              <select
                name="priority"
                defaultValue={dossier.priority || "NORMAL"}
                className="mt-1 h-9 w-full rounded-md border px-2 text-[13px]"
              >
                <option value="LOW">Basse</option>
                <option value="NORMAL">Normale</option>
                <option value="HIGH">Haute</option>
                <option value="URGENT">Urgente</option>
              </select>
            </label>
            <label className="text-[12px] text-[#617083]">
              Responsable
              <select
                name="assigned_to"
                defaultValue={dossier.assigned_to || ""}
                className="mt-1 h-9 w-full rounded-md border px-2 text-[13px]"
              >
                <option value="">Non assigné</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.display_name} ({member.role_code})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-[#617083]">
              Échéance
              <input
                name="due_at"
                type="datetime-local"
                defaultValue={toLocalInput(dossier.due_at)}
                className="mt-1 h-9 w-full rounded-md border px-2 text-[13px]"
              />
            </label>
          </div>
          <button disabled={saving} className={`${buttonClass} mt-3`}>
            {saving ? "Enregistrement…" : "Enregistrer le pilotage"}
          </button>
        </form>
      </PermissionGuard>
      <PermissionGuard permission="dossiers.update">
        <form
          onSubmit={addNote}
          className="rounded-md border border-[#d8dce2] p-4"
        >
          <h3 className="text-[14px] font-semibold">
            Ajouter une note interne
          </h3>
          <textarea
            name="body"
            required
            maxLength={4000}
            rows={3}
            placeholder="Information visible uniquement par l'équipe de l'agence…"
            className="mt-3 w-full rounded-md border p-3 text-[13px]"
          />
          <button disabled={saving} className={`${buttonClass} mt-2`}>
            Ajouter la note
          </button>
        </form>
      </PermissionGuard>
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-[12px] text-red-700">
          {error}
        </p>
      )}
      <div className="space-y-3">
        {notes.length === 0 ? (
          <EmptyState
            title="Aucune note interne"
            text="Centralisez ici les consignes et décisions de l'équipe."
          />
        ) : (
          notes.map((note) => (
            <InternalNoteCard
              key={note.id}
              note={note}
              onUpdate={onUpdateNote}
              onDelete={onDeleteNote}
            />
          ))
        )}
      </div>
    </div>
  );
}

function InternalNoteCard({
  note,
  onUpdate,
  onDelete,
}: {
  note: DossierInternalNote;
  onUpdate: (note: DossierInternalNote, body: string) => Promise<void>;
  onDelete: (note: DossierInternalNote) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  return (
    <article className="rounded-md border border-[#d8dce2] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-[#344054]">
            {note.author_id}
          </p>
          <p className="text-[11px] text-[#687584]">
            {formatDate(note.created_at)}
            {note.edited_at ? " · modifiée" : ""}
          </p>
        </div>
        <PermissionGuard permission="dossiers.update">
          <div className="flex gap-1">
            <button
              onClick={() => setEditing(!editing)}
              className="p-1.5 text-[#617083]"
              aria-label="Modifier"
            >
              <Edit3 size={14} />
            </button>
            <button
              onClick={() => onDelete(note)}
              className="p-1.5 text-red-600"
              aria-label="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </PermissionGuard>
      </div>
      {editing ? (
        <div className="mt-3">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={4000}
            rows={3}
            className="w-full rounded-md border p-3 text-[13px]"
          />
          <button
            onClick={async () => {
              await onUpdate(note, body);
              setEditing(false);
            }}
            className={`${buttonClass} mt-2`}
          >
            Enregistrer
          </button>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-[#344054]">
          {note.body}
        </p>
      )}
    </article>
  );
}

function SummaryTab({ dossier }: { dossier: DossierRecord }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SmallMetric
          icon={Package}
          label="Colis"
          value={dossier.package_count}
        />
        <SmallMetric
          icon={Truck}
          label="Expéditions"
          value={dossier.shipment_count}
        />
        <SmallMetric
          icon={MessageCircle}
          label="Messages"
          value={dossier.message_count}
        />
        <SmallMetric
          icon={History}
          label="Événements"
          value={dossier.event_count}
        />
      </div>
      <InfoPanel title="Opération">
        <InfoRow
          label="Client"
          value={dossier.client_name || dossier.client_full_name || "-"}
        />
        <InfoRow label="Route" value={routeLabel(dossier)} />
        <InfoRow label="Marchandise" value={dossier.goods_type || "-"} />
        <InfoRow
          label="Poids estimé"
          value={
            dossier.estimated_weight_kg
              ? `${dossier.estimated_weight_kg} kg`
              : "-"
          }
        />
        <InfoRow
          label="Volume estimé"
          value={
            dossier.estimated_volume_cbm
              ? `${dossier.estimated_volume_cbm} CBM`
              : "-"
          }
        />
        <InfoRow label="Mode" value={dossier.shipping_mode || "-"} />
      </InfoPanel>
      <InfoPanel title="Finance">
        <InfoRow
          label="Devis"
          value={formatMoney(dossier.quoted_total, dossier.quoted_currency)}
        />
        <InfoRow
          label="Montant final"
          value={formatMoney(dossier.final_total, dossier.final_currency)}
        />
        <InfoRow
          label="Paiement"
          value={
            paymentLabels[dossier.payment_status] || dossier.payment_status
          }
        />
        <InfoRow
          label="Paiement fournisseur"
          value={formatMoney(
            dossier.supplier_payment_amount,
            dossier.supplier_payment_currency,
          )}
        />
      </InfoPanel>
    </div>
  );
}

function ClientTab({ dossier }: { dossier: DossierRecord }) {
  return (
    <InfoPanel title="Client lié">
      <InfoRow
        label="Nom"
        value={dossier.client_name || dossier.client_full_name || "-"}
      />
      <InfoRow
        label="Téléphone"
        value={dossier.client_phone || dossier.client_whatsapp_phone || "-"}
      />
      <InfoRow label="Email" value={dossier.client_email || "-"} />
      <InfoRow
        label="Localisation"
        value={
          [dossier.client_city, dossier.client_country]
            .filter(Boolean)
            .join(", ") || "-"
        }
      />
    </InfoPanel>
  );
}

function ShipmentsTab({ dossier }: { dossier: DossierRecord }) {
  const shipments = dossier.shipments || [];
  if (shipments.length === 0)
    return (
      <EmptyState
        title="Aucune expédition liée"
        text="Les colis et expéditions associés apparaîtront ici dès que le module logistique les attachera à ce dossier."
      />
    );
  return (
    <div className="space-y-3">
      {shipments.map((shipment) => (
        <div
          key={shipment.id}
          className="rounded-md border border-[#d8dce2] bg-white p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">
              {shipment.tracking_id || "Expédition"}
            </p>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[12px] font-medium text-blue-700">
              {shipment.status || "Statut inconnu"}
            </span>
          </div>
          <p className="mt-2 text-[13px] text-[#617083]">
            {[
              shipment.origin_city || shipment.origin_country,
              shipment.destination_city || shipment.destination_country,
            ]
              .filter(Boolean)
              .join(" → ") || "Route non renseignée"}
          </p>
        </div>
      ))}
    </div>
  );
}

function DocumentsTab({
  documents,
  onUpload,
  onDownload,
}: {
  documents: DossierDocument[];
  onUpload: (file: File, type: string, notes?: string) => Promise<void>;
  onDownload: (id: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setUploadError("Choisissez d’abord un fichier PDF ou une image.");
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setUploadError("");
    try {
      await onUpload(
        selectedFile,
        String(form.get("type") || "OTHER"),
        String(form.get("notes") || "") || undefined,
      );
      formElement.reset();
      setSelectedFile(null);
    } catch (error) {
      setUploadError(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-4">
      <PermissionGuard permission="dossiers.update">
        <form
          onSubmit={submit}
          noValidate
          className="rounded-md border border-[#d8dce2] p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <input
                ref={fileInputRef}
                name="file"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] || null);
                  setUploadError("");
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`${buttonClass} w-full`}
              >
                <Upload size={15} />
                Choisir un fichier
              </button>
              <p className="mt-2 truncate text-[12px] text-[#4f5b67]">
                {selectedFile ? selectedFile.name : "Aucun fichier sélectionné"}
              </p>
            </div>
            <select
              name="type"
              className="h-9 rounded-md border px-2 text-[13px]"
            >
              <option value="IDENTITY">Identité</option>
              <option value="INVOICE">Facture</option>
              <option value="CUSTOMS">Douane</option>
              <option value="OTHER">Autre</option>
            </select>
          </div>
          <input
            name="notes"
            maxLength={500}
            placeholder="Note interne facultative"
            className="mt-3 h-9 w-full rounded-md border px-3 text-[13px]"
          />
          {uploadError && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {uploadError}
            </p>
          )}
          <button
            type="submit"
            disabled={saving || !selectedFile}
            className={`${buttonClass} mt-3 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Upload size={15} />
            {saving ? "Envoi…" : "Téléverser"}
          </button>
          <p className="mt-2 text-[11px] text-[#687584]">
            PDF ou image, 10 Mo maximum. Stockage privé.
          </p>
        </form>
      </PermissionGuard>
      {documents.length === 0 ? (
        <EmptyState
          title="Aucun document"
          text="Ajoutez les pièces nécessaires au traitement réel du dossier."
        />
      ) : (
        documents.map((doc) => (
          <button
            key={doc.id}
            onClick={() => onDownload(doc.id)}
            className="flex w-full items-center justify-between rounded-md border p-3 text-left text-[13px]"
          >
            <span>
              <strong>{doc.file_name}</strong>
              <br />
              <small>
                {doc.document_type} · {(doc.size_bytes / 1024).toFixed(0)} Ko
              </small>
            </span>
            <Download size={16} />
          </button>
        ))
      )}
    </div>
  );
}

function ChecklistTab({
  items,
  onChange,
}: {
  items: DossierChecklistItem[];
  onChange: (
    item: DossierChecklistItem,
    status: DossierChecklistItem["status"],
  ) => Promise<void>;
}) {
  if (!items.length)
    return (
      <EmptyState
        title="Checklist indisponible"
        text="La checklist sera créée par la migration pour chaque dossier."
      />
    );
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <label
          key={item.id}
          className="flex items-center gap-3 rounded-md border p-3 text-[13px]"
        >
          <input
            type="checkbox"
            checked={item.status === "COMPLETED"}
            onChange={(event) =>
              onChange(item, event.target.checked ? "COMPLETED" : "PENDING")
            }
          />
          <span
            className={
              item.status === "COMPLETED" ? "line-through text-[#687584]" : ""
            }
          >
            {item.label}
            {item.required ? " *" : ""}
          </span>
        </label>
      ))}
    </div>
  );
}

function MessagesTab({ dossier }: { dossier: DossierRecord }) {
  const messages = dossier.messages || [];
  if (messages.length === 0)
    return (
      <EmptyState
        title="Aucun message"
        text="Les échanges WhatsApp ou emails liés à ce dossier seront visibles ici."
      />
    );
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className="rounded-md border border-[#d8dce2] bg-white p-4"
        >
          <p className="text-[13px] font-medium">
            {message.sender_phone || "Client"}
          </p>
          <p className="mt-2 text-[13px] leading-6 text-[#344054]">
            {message.message_text || "Message sans contenu texte"}
          </p>
          <p className="mt-2 text-[12px] text-[#687584]">
            {formatDate(message.created_at)}
          </p>
        </div>
      ))}
    </div>
  );
}

function NotificationsTab({ dossier }: { dossier: DossierRecord }) {
  const notifications = dossier.notifications || [];
  if (notifications.length === 0)
    return (
      <EmptyState
        title="Aucune notification"
        text="Les notifications automatiques envoyées au client apparaîtront ici."
      />
    );
  return (
    <div className="space-y-3">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="rounded-md border border-[#d8dce2] bg-white p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium">
              {notification.notification_type ||
                notification.channel ||
                "Notification"}
            </p>
            <span className="text-[12px] text-[#687584]">
              {notification.status || "-"}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-6 text-[#344054]">
            {notification.message || "Message non renseigné"}
          </p>
        </div>
      ))}
    </div>
  );
}

function HistoryTab({
  events,
  loading,
}: {
  events: DossierTimelineEvent[];
  loading: boolean;
}) {
  if (loading)
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-16 animate-pulse rounded-md bg-[#eef1f5]"
          />
        ))}
      </div>
    );
  if (events.length === 0)
    return (
      <EmptyState
        title="Aucun historique"
        text="L’historique sera alimenté par les actions, messages, expéditions et notifications liés à ce dossier."
      />
    );
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div
          key={event.id}
          className="rounded-md border border-[#d8dce2] bg-white p-4"
        >
          <p className="text-[13px] font-semibold">{event.title}</p>
          <p className="mt-1 text-[13px] leading-6 text-[#617083]">
            {event.description}
          </p>
          <p className="mt-2 text-[12px] text-[#687584]">
            {formatDate(event.occurred_at)}
          </p>
        </div>
      ))}
    </div>
  );
}

function DossierFormModal({
  mode,
  dossier,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  mode: DossierFormMode;
  dossier: DossierRecord | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [clientLoading, setClientLoading] = useState(false);
  const [references, setReferences] = useState<ReferenceCatalog | null>(null);
  const [routeId, setRouteId] = useState(dossier?.route_id || "");

  useEffect(() => {
    let active = true;
    setClientLoading(true);
    listClients({
      q: clientQuery || undefined,
      page_size: 50,
      sort: "name_asc",
    })
      .then((response) => {
        if (active) setClients(response.items);
      })
      .catch(() => {
        if (active) setClients([]);
      })
      .finally(() => {
        if (active) setClientLoading(false);
      });
    return () => {
      active = false;
    };
  }, [clientQuery]);

  useEffect(() => {
    getReferenceCatalog()
      .then(setReferences)
      .catch(() => setReferences(null));
  }, []);

  const routeServices = (references?.services || []).filter(
    (service) => !routeId || service.route_id === routeId,
  );

  return (
    <OperationDrawer
      open
      title={mode === "edit" ? "Modifier le dossier" : "Nouveau dossier"}
      description="Un dossier doit toujours être relié à un client réel de l’agence."
      close={onClose}
      width="max-w-4xl"
    >
        <form
          onSubmit={onSubmit}
        >
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
              {error}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2">
              <FormLabel>Client</FormLabel>
              <input
                value={clientQuery}
                onChange={(event) => setClientQuery(event.target.value)}
                placeholder="Filtrer les clients..."
                className="mb-2 h-9 w-full rounded-md border border-[#cfd5dd] px-3 text-[13px] outline-none focus:border-[#2f7df6]"
              />
              <select
                name="client_id"
                defaultValue={dossier?.client_id || ""}
                className="h-9 w-full rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px] outline-none focus:border-[#2f7df6]"
                required
              >
                <option value="">
                  {clientLoading ? "Chargement..." : "Sélectionner un client"}
                </option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.display_name ||
                      client.name ||
                      client.company_name ||
                      client.phone ||
                      client.email}
                  </option>
                ))}
                {dossier?.client_id &&
                  !clients.some(
                    (client) => client.id === dossier.client_id,
                  ) && (
                    <option value={dossier.client_id}>
                      {dossier.client_name ||
                        dossier.client_full_name ||
                        "Client actuel"}
                    </option>
                  )}
              </select>
            </label>
            <SelectField
              name="case_type"
              label="Type"
              defaultValue={dossier?.case_type || "UNKNOWN"}
              options={caseTypeLabels}
            />
            <SelectField
              name="status_global"
              label="Statut"
              defaultValue={dossier?.status_global || "LEAD"}
              options={mode === "create" ? initialStatusLabels : statusLabels}
            />
            <SelectField
              name="intake_status"
              label="Collecte infos"
              defaultValue={dossier?.intake_status || "PARTIAL"}
              options={intakeLabels}
            />
            <SelectField
              name="validation_status"
              label="Validation"
              defaultValue={dossier?.validation_status || "PENDING"}
              options={validationLabels}
            />
            <label>
              <FormLabel>Route</FormLabel>
              <select
                name="route_id"
                value={routeId}
                onChange={(event) => setRouteId(event.target.value)}
                className="h-9 w-full rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px]"
                required
              >
                <option value="">Sélectionner une route configurée</option>
                {references?.routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.label}
                    {route.secondary ? ` — ${route.secondary}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <FormLabel>Service</FormLabel>
              <select
                name="shipping_service_id"
                defaultValue={dossier?.shipping_service_id || ""}
                className="h-9 w-full rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px]"
                required
              >
                <option value="">Sélectionner un service compatible</option>
                {routeServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.label}
                    {service.secondary ? ` — ${service.secondary}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <FormLabel>Entrepôt d’origine</FormLabel>
              <select
                name="origin_warehouse_id"
                defaultValue={dossier?.origin_warehouse_id || ""}
                className="h-9 w-full rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px]"
              >
                <option value="">Selon la route / non défini</option>
                {references?.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.label}
                    {warehouse.secondary ? ` — ${warehouse.secondary}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <FormLabel>Bureau de destination</FormLabel>
              <select
                name="destination_office_id"
                defaultValue={dossier?.destination_office_id || ""}
                className="h-9 w-full rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px]"
              >
                <option value="">Selon la route / non défini</option>
                {references?.offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.label}
                    {office.secondary ? ` — ${office.secondary}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <InputField
              name="goods_type"
              label="Marchandise"
              defaultValue={dossier?.goods_type}
            />
            <InputField
              name="shipping_mode"
              label="Mode d’expédition"
              defaultValue={dossier?.shipping_mode}
            />
            <InputField
              name="estimated_weight_kg"
              label="Poids estimé kg"
              type="number"
              step="0.01"
              defaultValue={dossier?.estimated_weight_kg}
            />
            <InputField
              name="estimated_volume_cbm"
              label="Volume estimé CBM"
              type="number"
              step="0.001"
              defaultValue={dossier?.estimated_volume_cbm}
            />
            <InputField
              name="tracking_id"
              label="Référence / tracking"
              defaultValue={dossier?.tracking_id}
            />
            <InputField
              name="primary_channel"
              label="Canal principal"
              defaultValue={dossier?.primary_channel || "manual"}
            />
            <InputField
              name="quoted_total"
              label="Montant devis"
              type="number"
              step="0.01"
              defaultValue={dossier?.quoted_total}
            />
            <InputField
              name="quoted_currency"
              label="Devise devis"
              defaultValue={dossier?.quoted_currency || "USD"}
            />
            <InputField
              name="final_total"
              label="Montant final"
              type="number"
              step="0.01"
              defaultValue={dossier?.final_total}
            />
            <InputField
              name="final_currency"
              label="Devise finale"
              defaultValue={
                dossier?.final_currency || dossier?.quoted_currency || "USD"
              }
            />
            <SelectField
              name="payment_status"
              label="Paiement"
              defaultValue={dossier?.payment_status || "PENDING"}
              options={paymentLabels}
            />
            <InputField
              name="pricing_status"
              label="Statut tarification"
              defaultValue={dossier?.pricing_status}
            />
          </div>
          <div className="mt-6 flex justify-end gap-2 border-t border-[#edf0f2] pt-4">
            <OperationButton type="button" onClick={onClose}>
              Annuler
            </OperationButton>
            <OperationButton type="submit" variant="primary" disabled={saving}>
              {saving
                ? "Enregistrement..."
                : mode === "edit"
                  ? "Enregistrer"
                  : "Créer le dossier"}
            </OperationButton>
          </div>
        </form>
    </OperationDrawer>
  );
}

function SmallMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-[#d8dce2] bg-white p-4">
      <div className="flex items-center gap-2 text-[13px] text-[#617083]">
        <Icon size={16} />
        {label}
      </div>
      <p className="mt-2 text-[24px] font-semibold">
        {value.toLocaleString("fr-FR")}
      </p>
    </div>
  );
}

function InfoPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-[#d8dce2] bg-white">
      <h3 className="border-b border-[#edf0f2] px-4 py-3 text-[14px] font-semibold">
        {title}
      </h3>
      <div className="divide-y divide-[#edf0f2]">{children}</div>
    </section>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 px-4 py-3 text-[13px]">
      <span className="text-[#617083]">{label}</span>
      <span className="font-medium text-[#1f2328]">{value || "-"}</span>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-md border border-dashed border-[#d8dce2] px-6 text-center">
      <h3 className="text-[16px] font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-[13px] leading-6 text-[#617083]">
        {text}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: DossierStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[12px] font-medium ring-1 ${statusStyles[status] || "bg-gray-100 text-gray-700 ring-gray-200"}`}
    >
      {statusLabels[status] || status}
    </span>
  );
}

function PaymentBadge({ status }: { status: DossierPaymentStatus }) {
  const tone =
    status === "PAID"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : status === "OVERDUE"
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
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-md border border-[#cfd5dd] bg-white px-3 pr-8 text-[13px] text-[#1f2328] shadow-sm outline-none focus:border-[#2f7df6]"
      >
        {children}
      </select>
    </label>
  );
}

function SelectField<T extends string>({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: T;
  options: Partial<Record<T, string>>;
}) {
  return (
    <label>
      <FormLabel>{label}</FormLabel>
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-9 w-full rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px] outline-none focus:border-[#2f7df6]"
      >
        {Object.entries(options).map(([value, label]) => (
          <option key={value} value={value}>
            {String(label)}
          </option>
        ))}
      </select>
    </label>
  );
}

function InputField({
  name,
  label,
  defaultValue,
  type = "text",
  step,
}: {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  type?: string;
  step?: string;
}) {
  return (
    <label>
      <FormLabel>{label}</FormLabel>
      <input
        name={name}
        type={type}
        step={step}
        defaultValue={defaultValue ?? ""}
        className="h-9 w-full rounded-md border border-[#cfd5dd] px-3 text-[13px] outline-none focus:border-[#2f7df6]"
      />
    </label>
  );
}

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[12px] font-medium text-[#4f5b67]">
      {children}
    </span>
  );
}

function metricCardClass(tone: string) {
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "neutral") return "border-[#d8dce2] bg-[#f7f8fa] text-[#1f2328]";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function routeLabel(dossier: DossierRecord) {
  const origin = [dossier.origin_city, dossier.origin_country]
    .filter(Boolean)
    .join(", ");
  const destination = [dossier.destination_city, dossier.destination_country]
    .filter(Boolean)
    .join(", ");
  return [origin, destination].filter(Boolean).join(" → ") || "-";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatMoney(value?: number | null, currency?: string | null) {
  if (value === null || value === undefined) return "-";
  return `${Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${currency || ""}`.trim();
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function clean(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text || undefined;
}

function numberOrNull(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function apiErrorMessage(error: unknown) {
  if (!API_BASE_URL) {
    return "API non configurée. Ajoutez NEXT_PUBLIC_API_BASE_URL côté frontend.";
  }
  if (!axios.isAxiosError(error)) return "Erreur inattendue.";
  if (!error.response)
    return "API injoignable. Vérifiez l’URL backend et le service déployé.";
  if (error.response.status === 401)
    return "Session expirée ou non authentifiée.";
  if (error.response.status === 403)
    return "Vous n’avez pas accès à cette organisation.";
  if (error.response.status === 404) return "Ressource introuvable.";
  const detail = error.response.data?.detail;
  if (detail === "stale_dossier_version")
    return "Ce dossier a été modifié par un autre membre. Fermez le formulaire, rechargez la fiche puis réessayez.";
  if (detail === "invalid_dossier_status_transition")
    return "Ce changement de statut n’est pas autorisé depuis l’état actuel du dossier.";
  if (detail === "dossier_intake_incomplete")
    return "La collecte des informations doit être complète avant de préparer l’expédition.";
  if (detail === "dossier_not_validated")
    return "Le dossier doit être validé avant de préparer l’expédition.";
  if (detail === "dossier_route_incomplete")
    return "Renseignez les pays d’origine et de destination ainsi que le mode d’expédition.";
  if (detail === "quoted_currency_required")
    return "La devise du devis est obligatoire lorsqu’un montant est renseigné.";
  if (detail === "final_currency_required")
    return "La devise finale est obligatoire lorsqu’un montant final est renseigné.";
  if (detail === "supplier_payment_currency_required")
    return "La devise fournisseur est obligatoire lorsqu’un paiement fournisseur est renseigné.";
  if (detail === "unsupported_document_type")
    return "Format non accepté. Utilisez un PDF, JPEG, PNG ou WebP.";
  if (detail === "document_too_large")
    return "Le fichier dépasse la limite autorisée de 10 Mo.";
  if (detail === "document_storage_not_configured")
    return "Le stockage documentaire n’est pas encore configuré sur le backend.";
  if (detail === "document_storage_upload_failed")
    return "Supabase Storage a refusé le téléversement. Réessayez ou vérifiez la configuration du bucket.";
  if (error.response.status === 409)
    return "Conflit détecté. Rechargez le dossier avant de réessayer.";
  return `Erreur API (${error.response.status}).`;
}
