"use client";

import axios from "axios";
import {
  AlertCircle,
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Edit3,
  FileText,
  History,
  Import,
  Mail,
  MessageCircle,
  Package,
  Phone,
  Search,
  SlidersHorizontal,
  RotateCcw,
  ShieldAlert,
  Truck,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  OperationTabMenu,
} from "@/components/ui/operation-controls";
import {
  OperationMetrics,
  OperationSearch,
  OperationToolbar,
} from "@/components/ui/operation-primitives";
import { EmptyState as SharedEmptyState, TableSkeleton } from "@/components/ui/page-state";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import { usePermissions } from "@/components/permissions/permission-provider";
import {
  createClient,
  deleteClient,
  exportClients,
  findClientDuplicates,
  getClient,
  getClientStats,
  getClientTimeline,
  importClients,
  listClients,
  listArchivedClients,
  mergeClients,
  restoreClient,
  updateClient,
  type ClientCustomerType,
  type ClientDuplicate,
  type ClientImportResult,
  type ClientLifecycleStatus,
  type ClientPayload,
  type ClientRecord,
  type ClientSource,
  type ClientStats,
  type ClientTimelineEvent,
} from "@/services/clients";

const statusLabels: Record<ClientLifecycleStatus, string> = {
  lead: "Nouveau contact",
  active: "Client avec colis",
  pending: "En attente du premier colis",
  inactive: "Sans activité",
  blocked: "Bloqué",
};

const statusStyles: Record<ClientLifecycleStatus, string> = {
  lead: "bg-blue-50 text-blue-700 ring-blue-100",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  pending: "bg-amber-50 text-amber-800 ring-amber-100",
  inactive: "bg-gray-100 text-gray-700 ring-gray-200",
  blocked: "bg-red-50 text-red-700 ring-red-100",
};

const typeLabels: Record<ClientCustomerType, string> = {
  individual: "Particulier",
  business: "Entreprise",
  agent: "Agent",
  partner: "Partenaire",
};

const sourceLabels: Record<ClientSource, string> = {
  manual: "Manuel",
  whatsapp: "WhatsApp",
  website: "Site web",
  referral: "Référence",
  import: "Import",
  api: "API",
};

const emptyStats: ClientStats = {
  total: 0,
  leads: 0,
  active: 0,
  pending: 0,
  inactive: 0,
  blocked: 0,
  new_this_month: 0,
};

type ClientView = {
  key: "all" | "lead" | "active" | "pending" | "business" | "archived";
  label: string;
  status?: ClientLifecycleStatus;
  customerType?: ClientCustomerType;
  archived?: boolean;
};

const views: ClientView[] = [
  { key: "all", label: "Tous" },
  { key: "lead", label: "Nouveaux contacts", status: "lead" },
  { key: "pending", label: "Premier colis attendu", status: "pending" },
  { key: "active", label: "Clients avec colis", status: "active" },
  { key: "business", label: "Entreprises", customerType: "business" },
  { key: "archived", label: "Archivés", archived: true },
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
type ClientFormMode = "create" | "edit";
type DetailTab =
  | "summary"
  | "operations"
  | "messages"
  | "payments"
  | "history"
  | "duplicates"
  | "notes";

export function ClientsPage() {
  const { permissions, available: permissionsAvailable } = usePermissions();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [stats, setStats] = useState<ClientStats>(emptyStats);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    page_size: 30,
    total: 0,
    total_pages: 0,
  });
  const [selected, setSelected] = useState<ClientRecord | null>(null);
  const [timeline, setTimeline] = useState<ClientTimelineEvent[]>([]);
  const [duplicates, setDuplicates] = useState<ClientDuplicate[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>("summary");
  const [activeView, setActiveView] =
    useState<(typeof views)[number]["key"]>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ClientLifecycleStatus | "">("");
  const [customerType, setCustomerType] = useState<ClientCustomerType | "">("");
  const [source, setSource] = useState<ClientSource | "">("");
  const [sort, setSort] = useState("created_desc");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [mergingDuplicateId, setMergingDuplicateId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<ClientFormMode>("create");
  const [formClient, setFormClient] = useState<ClientRecord | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<ClientImportResult | null>(
    null,
  );
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [clientAction, setClientAction] = useState<
    "archive" | "restore" | null
  >(null);
  const listRequestId = useRef(0);

  const currentView = views.find((view) => view.key === activeView) || views[0];
  const archivedAllowed =
    permissionsAvailable && permissions.includes("clients.archive");
  const page = pagination.page || 1;

  useEffect(() => {
    const timeout = window.setTimeout(() => loadClients(1), 220);
    return () => window.clearTimeout(timeout);
    // The listed filters intentionally define when the debounced request runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, customerType, source, sort, activeView]);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (!selected) return;
    if (activeTab === "history") loadTimeline(selected.id);
    if (activeTab === "duplicates") loadDuplicates(selected);
  }, [activeTab, selected]);

  async function loadStats() {
    try {
      setStats(await getClientStats());
    } catch {
      setStats(emptyStats);
    }
  }

  async function loadClients(nextPage = page) {
    const requestId = ++listRequestId.current;
    setLoading(true);
    setError("");
    try {
      const response = currentView.archived
        ? await listArchivedClients({
            q: query || undefined,
            page: nextPage,
            page_size: 30,
          })
        : await listClients({
            q: query || undefined,
            status: currentView.status || status || undefined,
            customer_type:
              currentView.customerType || customerType || undefined,
            source: source || undefined,
            page: nextPage,
            page_size: 30,
            sort,
          });
      if (requestId !== listRequestId.current) return;
      setClients(response.items);
      setPagination(response.pagination);
      if (selected && !response.items.some((item) => item.id === selected.id))
        setSelected(null);
    } catch (err) {
      if (requestId !== listRequestId.current) return;
      setError(apiErrorMessage(err));
      setClients([]);
      setSelected(null);
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }

  async function archiveSelectedClient() {
    if (
      clientAction ||
      !selected ||
      !window.confirm(
        `Archiver ${selected.display_name || selected.name || "ce client"} ? Ses dossiers et opérations seront conservés.`,
      )
    )
      return;
    setClientAction("archive");
    setError("");
    try {
      await deleteClient(selected.id, selected.row_version);
      setSelected(null);
      await Promise.all([loadStats(), loadClients(1)]);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setClientAction(null);
    }
  }

  async function restoreSelectedClient() {
    if (clientAction || !selected) return;
    setClientAction("restore");
    setError("");
    try {
      await restoreClient(selected.id, selected.row_version);
      setSelected(null);
      await Promise.all([loadStats(), loadClients(1)]);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setClientAction(null);
    }
  }

  async function mergeDuplicate(source: ClientDuplicate) {
    if (
      !selected ||
      !window.confirm(
        `Fusionner ${source.display_name || source.name || "ce doublon"} dans ${selected.display_name || selected.name || "la fiche principale"} ? Cette action déplacera toutes ses opérations.`,
      )
    )
      return;
    setMergingDuplicateId(source.id);
    try {
      const merged = await mergeClients({
        source_client_id: source.id,
        target_client_id: selected.id,
        source_version: source.row_version,
        target_version: selected.row_version,
        idempotency_key: crypto.randomUUID(),
      });
      setSelected(merged);
      setDuplicates(await findClientDuplicates({ client_id: merged.id }));
      await Promise.all([loadStats(), loadClients(page)]);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setMergingDuplicateId(null);
    }
  }

  async function selectClient(client: ClientRecord) {
    setSelected(client);
    setActiveTab("summary");
    setDetailLoading(true);
    setTimeline([]);
    setDuplicates([]);
    try {
      const [detail, detectedDuplicates] = await Promise.all([
        getClient(client.id),
        findClientDuplicates({ client_id: client.id }),
      ]);
      setSelected(detail);
      setDuplicates(detectedDuplicates);
    } catch {
      setSelected(client);
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadTimeline(clientId: string) {
    setTimelineLoading(true);
    try {
      setTimeline(await getClientTimeline(clientId));
    } catch {
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  }

  async function loadDuplicates(client: ClientRecord) {
    setDuplicatesLoading(true);
    try {
      setDuplicates(await findClientDuplicates({ client_id: client.id }));
    } catch {
      setDuplicates([]);
    } finally {
      setDuplicatesLoading(false);
    }
  }

  function openCreate() {
    setFormMode("create");
    setFormClient(null);
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(client: ClientRecord) {
    setFormMode("edit");
    setFormClient(client);
    setFormError("");
    setFormOpen(true);
  }

  async function submitClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload: ClientPayload = {
      display_name: clean(form.get("display_name")),
      name: clean(form.get("name")),
      company_name: clean(form.get("company_name")),
      tax_id: clean(form.get("tax_id")),
      phone: clean(form.get("phone")),
      whatsapp_phone: clean(form.get("whatsapp_phone")),
      email: clean(form.get("email")),
      country: clean(form.get("country")),
      city: clean(form.get("city")),
      address: clean(form.get("address")),
      customer_type: String(
        form.get("customer_type") || "individual",
      ) as ClientCustomerType,
      lifecycle_status: String(
        form.get("lifecycle_status") || "lead",
      ) as ClientLifecycleStatus,
      source: String(form.get("source") || "manual") as ClientSource,
      preferred_language: clean(form.get("preferred_language")) || "FR",
      preferred_currency: clean(form.get("preferred_currency")),
      notes: clean(form.get("notes")),
      credit_enabled: form.get("credit_enabled") === "on",
      credit_limit: Number(form.get("credit_limit") || 0),
      row_version: formClient?.row_version,
    };

    try {
      const saved =
        formMode === "edit" && formClient
          ? await updateClient(formClient.id, payload)
          : await createClient(payload);
      setFormOpen(false);
      setFormClient(null);
      setSelected(saved);
      await Promise.all([
        loadStats(),
        loadClients(formMode === "edit" ? page : 1),
      ]);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const blob = await exportClients({
        q: query || undefined,
        status: currentView.status || status || undefined,
        customer_type: currentView.customerType || customerType || undefined,
        source: source || undefined,
        sort,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "slaivio-clients.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importFile?.name) {
      setImportError("Sélectionnez un fichier CSV.");
      return;
    }
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const result = await importClients(importFile);
      setImportResult(result);
      await Promise.all([loadStats(), loadClients(1)]);
    } catch (err) {
      setImportError(apiErrorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  const statCards = useMemo(
    () => [
      { label: "Clients total", value: stats.total, tone: "blue" },
      { label: "Clients avec colis", value: stats.active, tone: "blue" },
      { label: "Nouveaux contacts", value: stats.leads, tone: "blue" },
      { label: "Premier colis attendu", value: stats.pending, tone: "amber" },
      {
        label: "Sans activité",
        value: stats.inactive + stats.blocked,
        tone: "neutral",
      },
    ],
    [stats],
  );

  return (
    <div className="min-h-full bg-[#f7f7f6] text-[#1f2328]">
      <div className="overflow-hidden bg-white">
        <OperationPageHeader
          title="Clients"
          description="Suivez chaque contact depuis sa première demande jusqu’à la réception et la livraison de ses colis."
          actions={
            <>
              <PermissionGuard permission="clients.import">
                <OperationButton onClick={() => setImportOpen(true)}>
                  <Upload size={14} />
                  Importer
                </OperationButton>
              </PermissionGuard>
              <PermissionGuard permission="clients.export">
                <OperationButton
                  onClick={handleExport}
                  disabled={exporting}
                >
                  <Download size={14} />
                  {exporting ? "Export..." : "Exporter"}
                </OperationButton>
              </PermissionGuard>
              <PermissionGuard permission="clients.create">
                <OperationButton variant="primary" onClick={openCreate}>
                  <span className="text-lg leading-none">+</span>
                  Nouveau client
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
          {views.slice(0, 4).map((view) => (
            <OperationTab
              key={view.key}
              disabled={Boolean(view.archived && !archivedAllowed)}
              title={
                view.archived && !archivedAllowed
                  ? "Permission clients.archive requise"
                  : undefined
              }
              onClick={() => setActiveView(view.key)}
              active={activeView === view.key}
              className="disabled:cursor-not-allowed disabled:opacity-45"
            >
              {view.label}
              {view.archived && !archivedAllowed ? " · verrouillé" : ""}
            </OperationTab>
          ))}
          <OperationTab
            disabled={!archivedAllowed}
            title={
              archivedAllowed ? undefined : "Permission clients.archive requise"
            }
            onClick={() => setActiveView("archived")}
            active={activeView === "archived"}
            className="disabled:cursor-not-allowed disabled:opacity-45"
          >
            Archivés{archivedAllowed ? "" : " · verrouillé"}
          </OperationTab>
          <OperationTabMenu
            items={[["business", "Entreprises"]]}
            value={activeView === "business" ? activeView : ""}
            onChange={setActiveView}
          />
        </OperationTabs>

        <section>
          <OperationToolbar
            search={<OperationSearch value={query} onChange={setQuery} placeholder="Rechercher un client…" />}
            filters={<OperationButton onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}><SlidersHorizontal size={15} />Filtres</OperationButton>}
          />
          {filtersOpen && (
            <div className="flex flex-col gap-2 border-y border-[#d8dce2] bg-[#fafbfc] px-5 py-3 xl:flex-row xl:items-center">
              <SelectFilter
                value={customerType}
                onChange={(value) =>
                  setCustomerType(value as ClientCustomerType | "")
                }
                label="Type"
              >
                <option value="">Type</option>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectFilter>
              <SelectFilter
                value={status}
                onChange={(value) =>
                  setStatus(value as ClientLifecycleStatus | "")
                }
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
                value={source}
                onChange={(value) => setSource(value as ClientSource | "")}
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
                <option value="created_desc">Créés récemment</option>
                <option value="created_asc">Créés anciennement</option>
                <option value="name_asc">Nom A-Z</option>
                <option value="name_desc">Nom Z-A</option>
                <option value="activity_desc">Activité récente</option>
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
              <div className="flex-1">
                <p>{error}</p>
                <button
                  onClick={() => loadClients(page)}
                  disabled={loading}
                  className="mt-2 font-semibold underline disabled:opacity-50"
                >
                  {loading ? "Nouvelle tentative..." : "Réessayer"}
                </button>
              </div>
              <button onClick={() => setError("")} aria-label="Fermer l’alerte">
                <X size={15} />
              </button>
            </div>
          )}

          <ClientsTable
            clients={clients}
            loading={loading}
            selectedId={selected?.id}
            onSelect={selectClient}
          />

          <div className="flex flex-col gap-3 border-t border-[#d8dce2] px-5 py-3 text-[13px] text-[#5f6b76] sm:flex-row sm:items-center sm:justify-between">
            <span>
              {pagination.total === 0
                ? "0 client"
                : `${(page - 1) * pagination.page_size + 1} - ${Math.min(page * pagination.page_size, pagination.total)} sur ${pagination.total} client(s)`}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => loadClients(page - 1)}
                className={pagerButtonClass}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="rounded-md bg-[#166ee8] px-3 py-1.5 text-[13px] font-semibold text-white">
                {page}
              </span>
              <button
                disabled={page >= pagination.total_pages || loading}
                onClick={() => loadClients(page + 1)}
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
        <ClientDetails
          client={selected}
          loading={detailLoading}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          timeline={timeline}
          timelineLoading={timelineLoading}
          duplicates={duplicates}
          duplicatesLoading={duplicatesLoading}
          mergingDuplicateId={mergingDuplicateId}
          onMergeDuplicate={mergeDuplicate}
          onClose={() => setSelected(null)}
          onEdit={() => openEdit(selected)}
          archived={Boolean(currentView.archived)}
          onArchive={archiveSelectedClient}
          onRestore={restoreSelectedClient}
          clientAction={clientAction}
        />
      )}

      {formOpen && (
        <ClientFormModal
          mode={formMode}
          client={formClient}
          saving={saving}
          error={formError}
          onClose={() => {
            if (saving) return;
            setFormOpen(false);
            setFormClient(null);
            setFormError("");
          }}
          onSubmit={submitClient}
        />
      )}

      {importOpen && (
        <ImportClientsModal
          importing={importing}
          error={importError}
          result={importResult}
          selectedFile={importFile}
          onFileChange={setImportFile}
          onClose={() => {
            if (importing) return;
            setImportOpen(false);
            setImportError("");
            setImportResult(null);
            setImportFile(null);
          }}
          onSubmit={submitImport}
        />
      )}
    </div>
  );
}

function ClientsTable({
  clients,
  loading,
  selectedId,
  onSelect,
}: {
  clients: ClientRecord[];
  loading: boolean;
  selectedId?: string;
  onSelect: (client: ClientRecord) => void;
}) {
  if (loading) {
    return <TableSkeleton />;
  }

  if (clients.length === 0) {
    return <SharedEmptyState title="Aucun client trouvé" description="Créez votre premier client ou ajustez la recherche. Seules les données de l’agence active apparaissent ici." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[760px] w-full border-collapse text-left text-[13px]">
        <thead className="border-b border-[#d8dce2] bg-[#f7f8fa] font-medium text-[#5f6b76]">
          <tr>
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Téléphone</th>
            <th className="px-3 py-2">Pays / ville</th>
            <th className="px-3 py-2">Statut</th>
            <th className="px-3 py-2">Activité</th>
            <th className="w-10 px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf0f2]">
          {clients.map((client) => (
            <tr
              key={client.id}
              onClick={() => onSelect(client)}
              className={`cursor-pointer transition hover:bg-[#f6f8fb] ${selectedId === client.id ? "bg-[#edf2f8]" : ""}`}
            >
              <td className="px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <Initials
                    name={
                      client.display_name ||
                      client.name ||
                      client.company_name ||
                      "Client"
                    }
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#1f2328]">
                      {client.display_name ||
                        client.name ||
                        client.company_name ||
                        "Sans nom"}
                    </p>
                    <p className="truncate text-[12px] text-[#687584]">
                      {client.company_name || client.source}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-[#334155]">
                {client.phone || client.whatsapp_phone || "-"}
              </td>
              <td className="px-3 py-2 text-[#334155]">
                {[client.city, client.country].filter(Boolean).join(", ") ||
                  "-"}
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={client.lifecycle_status} />
              </td>
              <td className="px-3 py-2 text-[#687584]">
                {formatDate(client.last_activity_at || client.updated_at)}
              </td>
              <td className="px-3 py-2">
                <ChevronRight
                  size={16}
                  className="text-[#687584]"
                  aria-hidden="true"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientDetails({
  client,
  loading,
  activeTab,
  onTabChange,
  timeline,
  timelineLoading,
  duplicates,
  duplicatesLoading,
  mergingDuplicateId,
  onMergeDuplicate,
  onClose,
  onEdit,
  archived,
  onArchive,
  onRestore,
  clientAction,
}: {
  client: ClientRecord;
  loading: boolean;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  timeline: ClientTimelineEvent[];
  timelineLoading: boolean;
  duplicates: ClientDuplicate[];
  duplicatesLoading: boolean;
  mergingDuplicateId: string | null;
  onMergeDuplicate: (source: ClientDuplicate) => void;
  onClose: () => void;
  onEdit: () => void;
  archived: boolean;
  onArchive: () => void;
  onRestore: () => void;
  clientAction: "archive" | "restore" | null;
}) {
  const tabs: Array<{ key: DetailTab; label: string }> = [
    { key: "summary", label: "Résumé" },
    { key: "operations", label: "Opérations" },
    { key: "messages", label: "Messages" },
    { key: "payments", label: "Paiements" },
    { key: "history", label: "Historique" },
    { key: "duplicates", label: "Doublons" },
    { key: "notes", label: "Notes" },
  ];

  return (
    <OperationDrawer
      open
      close={onClose}
      width="max-w-[560px]"
      title={client.display_name || client.name || client.company_name || "Sans nom"}
      description={`Fiche client · ${typeLabels[client.customer_type]} · ${sourceLabels[client.source]}`}
      headerActions={
        <>
                {!archived && (
                  <PermissionGuard permission="clients.update">
                    <button
                      onClick={onEdit}
                      className={iconButtonClass}
                      aria-label="Modifier le client"
                    >
                      <Edit3 size={16} />
                    </button>
                  </PermissionGuard>
                )}
                <PermissionGuard
                  permission="clients.archive"
                  fallback={
                    <span
                      title="Permission clients.archive requise"
                      className="inline-flex h-8 items-center rounded-md border border-[#ddd] bg-[#f5f5f3] px-2 text-[11px] text-[#777]"
                    >
                      Archivage non autorisé
                    </span>
                  }
                >
                  {archived ? (
                    <button
                      onClick={onRestore}
                      disabled={clientAction !== null}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 text-[12px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
                      aria-label="Restaurer le client"
                    >
                      <RotateCcw size={15} />{" "}
                      {clientAction === "restore"
                        ? "Restauration..."
                        : "Restaurer"}
                    </button>
                  ) : (
                    <button
                      onClick={onArchive}
                      disabled={clientAction !== null}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                      aria-label="Archiver le client"
                    >
                      <Archive size={15} />{" "}
                      {clientAction === "archive" ? "Archivage..." : "Archiver"}
                    </button>
                  )}
                </PermissionGuard>
        </>
      }
      headerMeta={<><Initials name={client.display_name || client.name || "Client"} /><StatusBadge status={client.lifecycle_status} /></>}
      tabs={
        <>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`h-8 whitespace-nowrap rounded-md px-3 text-[13px] font-medium ${
                  activeTab === tab.key
                    ? "bg-[#e9ecef] text-[#111827]"
                    : "text-[#5f6b76] hover:bg-[#f4f6f8]"
                }`}
              >
                {tab.label}
                {tab.key === "duplicates" && duplicates.length > 0 ? (
                  <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                    {duplicates.length}
                  </span>
                ) : null}
              </button>
            ))}
        </>
      }
      bodyClassName={loading ? "opacity-60" : ""}
    >
            {activeTab === "summary" && <SummaryTab client={client} />}
            {activeTab === "operations" && <OperationsTab client={client} />}
            {activeTab === "messages" && (
              <ModulePlaceholder
                icon={MessageCircle}
                title="Messages client"
                text="Cette vue affichera les conversations WhatsApp, emails et messages liés à ce client lorsque le module Communication les aura synchronisés."
              />
            )}
            {activeTab === "payments" && (
              <ModulePlaceholder
                icon={ShieldAlert}
                title="Paiements client"
                text="Cette vue affichera les factures, paiements reçus, soldes et relances provenant du module Finance. Aucun montant n’est inventé ici."
              />
            )}
            {activeTab === "history" && (
              <HistoryTab events={timeline} loading={timelineLoading} />
            )}
            {activeTab === "duplicates" && (
              <DuplicatesTab
                targetId={client.id}
                duplicates={duplicates}
                loading={duplicatesLoading}
                mergingId={mergingDuplicateId}
                onMerge={onMergeDuplicate}
              />
            )}
            {activeTab === "notes" && <NotesTab client={client} />}
    </OperationDrawer>
  );
}

function SummaryTab({ client }: { client: ClientRecord }) {
  return (
    <div className="space-y-5">
      <Section title="Coordonnées">
        <InfoRow icon={Phone} label="Téléphone" value={client.phone || "-"} />
        <InfoRow
          icon={MessageCircle}
          label="WhatsApp"
          value={client.whatsapp_phone || client.phone || "-"}
        />
        <InfoRow icon={Mail} label="Email" value={client.email || "-"} />
        <InfoRow
          icon={UserRound}
          label="Type"
          value={typeLabels[client.customer_type]}
        />
      </Section>
      <Section title="Localisation & identité">
        <Field label="Entreprise" value={client.company_name || "-"} />
        <Field label="Identifiant fiscal" value={client.tax_id || "-"} />
        <Field label="Ville" value={client.city || "-"} />
        <Field label="Pays" value={client.country || "-"} />
        <Field label="Adresse" value={client.address || "-"} />
      </Section>
      <Section title="Résumé opérationnel">
        <div className="grid grid-cols-2 gap-3">
          <SmallMetric label="Dossiers" value={client.dossiers_count} />
          <SmallMetric
            label="Colis / expéditions"
            value={client.shipments_count}
          />
          <SmallMetric
            label="Solde"
            value={formatMoney(
              client.current_balance,
              client.preferred_currency,
            )}
          />
          <SmallMetric
            label="Total dépensé"
            value={formatMoney(client.total_spent, client.preferred_currency)}
          />
        </div>
      </Section>
    </div>
  );
}

function OperationsTab({ client }: { client: ClientRecord }) {
  return (
    <div className="space-y-4">
      <ModuleCounter
        icon={FileText}
        title="Dossiers"
        count={client.dossiers_count}
        text="Les dossiers liés à ce client seront consultables ici dès que le module Dossiers exposera sa vue détaillée."
      />
      <ModuleCounter
        icon={Package}
        title="Colis"
        count={client.shipments_count}
        text="Les colis et expéditions liés au client seront alimentés par les modules Colis, Tracking et Expéditions."
      />
      <ModuleCounter
        icon={Truck}
        title="Expéditions"
        count={client.shipments_count}
        text="La liste opérationnelle complète restera dans le module Expéditions pour garder une séparation métier propre."
      />
    </div>
  );
}

function HistoryTab({
  events,
  loading,
}: {
  events: ClientTimelineEvent[];
  loading: boolean;
}) {
  if (loading) return <LoadingLines />;
  if (events.length === 0)
    return (
      <EmptyState
        title="Aucun historique"
        text="Les événements apparaîtront ici dès que le client aura des dossiers, messages, relances ou expéditions liés."
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

function DuplicatesTab({
  targetId,
  duplicates,
  loading,
  mergingId,
  onMerge,
}: {
  targetId: string;
  duplicates: ClientDuplicate[];
  loading: boolean;
  mergingId: string | null;
  onMerge: (source: ClientDuplicate) => void;
}) {
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<ClientDuplicate[]>([]);
  const [manualLoading, setManualLoading] = useState(false);

  useEffect(() => {
    const normalized = manualQuery.trim();
    if (normalized.length < 2) {
      setManualResults([]);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(async () => {
      setManualLoading(true);
      try {
        const response = await listClients({
          q: normalized,
          page: 1,
          page_size: 10,
        });
        if (active)
          setManualResults(
            response.items
              .filter((item) => item.id !== targetId)
              .map((item) => ({ ...item, match_reason: "manual" })),
          );
      } catch {
        if (active) setManualResults([]);
      } finally {
        if (active) setManualLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [manualQuery, targetId]);

  if (loading) return <LoadingLines />;
  const candidates = [
    ...duplicates,
    ...manualResults.filter(
      (manual) => !duplicates.some((duplicate) => duplicate.id === manual.id),
    ),
  ];
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-[#d8dce2] bg-[#fbfcfd] p-4">
        <h3 className="text-[14px] font-semibold">
          Fusionner une autre fiche dans celle-ci
        </h3>
        <p className="mt-1 text-[12px] leading-5 text-[#687584]">
          Les dossiers, colis, messages et opérations de la fiche choisie seront
          déplacés vers la fiche actuellement ouverte.
        </p>
        <label className="mt-3 flex h-9 items-center rounded-md border border-[#cfd5dd] bg-white px-3 focus-within:border-[#615cf2]">
          <Search size={15} className="text-[#687584]" />
          <input
            value={manualQuery}
            onChange={(event) => setManualQuery(event.target.value)}
            placeholder="Rechercher par nom, téléphone ou email…"
            className="ml-2 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </label>
        {manualLoading && (
          <p className="mt-2 text-[12px] text-[#687584]">Recherche…</p>
        )}
      </div>
      {candidates.length === 0 && (
        <EmptyState
          title={
            manualQuery.trim().length >= 2
              ? "Aucune autre fiche trouvée"
              : "Aucun doublon détecté"
          }
          text="Utilisez la recherche ci-dessus pour sélectionner manuellement une autre fiche client."
        />
      )}
      {candidates.map((item) => (
        <div key={item.id} className="rounded-md border border-[#d8dce2] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">
                {item.display_name ||
                  item.name ||
                  item.company_name ||
                  "Client sans nom"}
              </p>
              <p className="mt-1 text-[13px] text-[#687584]">
                {item.email || item.phone || item.whatsapp_phone || "-"}
              </p>
            </div>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-[12px] font-medium text-amber-700 ring-1 ring-amber-100">
              {duplicateLabel(item.match_reason)}
            </span>
          </div>
          <PermissionGuard
            permission="clients.merge"
            fallback={
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                La permission <code>clients.merge</code> est nécessaire pour
                fusionner ces fiches.
              </p>
            }
          >
            <button
              onClick={() => onMerge(item)}
              disabled={mergingId !== null}
              className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md bg-[#615cf2] px-3 text-[12px] font-semibold text-white hover:bg-[#504ad8] disabled:opacity-50"
            >
              {mergingId === item.id
                ? "Fusion en cours…"
                : "Fusionner cette fiche dans la fiche ouverte"}
            </button>
          </PermissionGuard>
        </div>
      ))}
    </div>
  );
}

function NotesTab({ client }: { client: ClientRecord }) {
  if (!client.notes)
    return (
      <EmptyState
        title="Aucune note"
        text="Les notes internes ajoutées sur la fiche client apparaîtront ici."
      />
    );
  return (
    <div className="rounded-md border border-[#d8dce2] bg-[#fbfcfd] p-4 text-[13px] leading-6 text-[#334155]">
      {client.notes}
    </div>
  );
}

function ClientFormModal({
  mode,
  client,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  mode: ClientFormMode;
  client: ClientRecord | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const title = mode === "edit" ? "Modifier le client" : "Nouveau client";
  return (
    <OperationDrawer
      open
      title={title}
      description="Renseignez uniquement les informations réelles disponibles."
      close={onClose}
      width="max-w-3xl"
    >
        <form onSubmit={onSubmit}>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
              {error}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <Input
              label="Nom affiché"
              name="display_name"
              defaultValue={client?.display_name || ""}
            />
            <Input
              label="Nom complet"
              name="name"
              defaultValue={client?.name || ""}
            />
            <Input
              label="Entreprise"
              name="company_name"
              defaultValue={client?.company_name || ""}
            />
            <Input
              label="Téléphone"
              name="phone"
              defaultValue={client?.phone || ""}
            />
            <Input
              label="WhatsApp"
              name="whatsapp_phone"
              defaultValue={client?.whatsapp_phone || ""}
            />
            <Input
              label="Email"
              name="email"
              defaultValue={client?.email || ""}
            />
            <Input
              label="Pays"
              name="country"
              defaultValue={client?.country || ""}
            />
            <Input
              label="Ville"
              name="city"
              defaultValue={client?.city || ""}
            />
            <Input
              label="Identifiant fiscal"
              name="tax_id"
              defaultValue={client?.tax_id || ""}
            />
            <SelectInput
              label="Type"
              name="customer_type"
              defaultValue={client?.customer_type || "individual"}
              options={typeLabels}
            />
            <SelectInput
              label="Statut"
              name="lifecycle_status"
              defaultValue={client?.lifecycle_status || "lead"}
              options={statusLabels}
            />
            <SelectInput
              label="Source"
              name="source"
              defaultValue={client?.source || "manual"}
              options={sourceLabels}
            />
            <Input
              label="Langue"
              name="preferred_language"
              defaultValue={client?.preferred_language || "FR"}
            />
            <Input
              label="Devise"
              name="preferred_currency"
              defaultValue={client?.preferred_currency || ""}
            />
            <Input
              label="Limite crédit"
              name="credit_limit"
              type="number"
              defaultValue={String(client?.credit_limit || 0)}
            />
          </div>
          <Input
            label="Adresse"
            name="address"
            defaultValue={client?.address || ""}
          />
          <label className="flex items-center gap-2 text-[13px] font-medium text-[#334155]">
            <input
              name="credit_enabled"
              type="checkbox"
              defaultChecked={Boolean(client?.credit_enabled)}
              className="rounded border-[#c9d0d8]"
            />
            Crédit autorisé
          </label>
          <label className="block text-[13px] font-medium text-[#334155]">
            Notes internes
            <textarea
              name="notes"
              rows={4}
              defaultValue={client?.notes || ""}
              className="mt-1 w-full rounded-md border border-[#cfd5dd] px-3 py-2 text-[13px] outline-none focus:border-[#2f7df6]"
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-[#eef0f3] pt-4">
            <OperationButton
              type="button"
              onClick={onClose}
              disabled={saving}
            >
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
                  : "Créer le client"}
            </OperationButton>
          </div>
        </form>
    </OperationDrawer>
  );
}

function ImportClientsModal({
  importing,
  error,
  result,
  selectedFile,
  onFileChange,
  onClose,
  onSubmit,
}: {
  importing: boolean;
  error: string;
  result: ClientImportResult | null;
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function downloadErrorReport() {
    if (!result?.errors.length) return;
    const lines = [
      "ligne,erreur",
      ...result.errors.map(
        (item) => `${item.row},${JSON.stringify(importErrorLabel(item.error))}`,
      ),
    ];
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "slaivio-import-clients-erreurs.csv";
    link.click();
    window.URL.revokeObjectURL(url);
  }

  function downloadTemplate() {
    const headers =
      "nom,entreprise,telephone,whatsapp,email,pays,ville,statut,type,langue,devise,credit_enabled,credit_limit,notes";
    const example =
      "Jean Dupont,,+243999000000,+243999000000,jean@example.com,RDC,Kinshasa,lead,individual,FR,USD,false,0,Client exemple";
    const blob = new Blob(["\ufeff" + headers + "\r\n" + example + "\r\n"], {
      type: "text/csv;charset=utf-8",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "slaivio-modele-import-clients.csv";
    link.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <OperationDrawer
      open
      title="Importer des clients"
      description="CSV supporté : nom, entreprise, téléphone, WhatsApp, email, pays, ville, statut et type."
      close={onClose}
      width="max-w-lg"
    >
        <div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="text-[12px] font-semibold text-[#315fbc] underline"
            >
              Télécharger le modèle CSV
            </button>
        </div>
        <form onSubmit={onSubmit} className="grid gap-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
              {error}
            </div>
          )}
          {result && (
            <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800">
              <p>
                {result.processed} ligne(s) traitée(s) : {result.created}{" "}
                créée(s), {result.skipped} doublon(s) ignoré(s),{" "}
                {result.errors.length} erreur(s).
              </p>
              {result.errors.slice(0, 5).map((item) => (
                <p key={`${item.row}-${item.error}`} className="text-red-700">
                  Ligne {item.row} : {importErrorLabel(item.error)}
                </p>
              ))}
              {result.errors.length > 0 && (
                <button
                  type="button"
                  onClick={downloadErrorReport}
                  className="font-semibold text-[#315fbc] underline"
                >
                  Télécharger le rapport d’erreurs
                </button>
              )}
            </div>
          )}
          <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[#b9c1cc] bg-[#fbfcfd] p-5 text-center text-[13px] text-[#5f6b76] hover:bg-[#f6f8fb]">
            <Import size={22} />
            <span className="mt-2 font-medium text-[#1f2328]">
              Choisir un fichier CSV
            </span>
            <input
              name="file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) =>
                onFileChange(event.target.files?.[0] || null)
              }
              className="mt-3 text-[13px]"
            />
            {selectedFile && (
              <span className="mt-2 font-medium text-emerald-700">
                {selectedFile.name}
              </span>
            )}
          </label>
          <div className="flex justify-end gap-2 border-t border-[#eef0f3] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className={`${buttonClass} disabled:opacity-40`}
            >
              Fermer
            </button>
            <button
              type="submit"
              disabled={importing}
              className={`${primaryButtonClass} disabled:opacity-60`}
            >
              {importing ? "Import..." : "Importer"}
            </button>
          </div>
        </form>
    </OperationDrawer>
  );
}

function SelectFilter({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="relative inline-flex h-8 min-w-[120px] items-center">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full appearance-none rounded-md border border-[#cfd5dd] bg-white pl-3 pr-8 text-[13px] font-medium outline-none shadow-sm hover:bg-[#f8fafc] focus:border-[#2f7df6]"
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2 text-[#667085]"
      />
    </label>
  );
}

function Input({
  label,
  name,
  defaultValue = "",
  placeholder = "",
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block text-[13px] font-medium text-[#334155]">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 h-9 w-full rounded-md border border-[#cfd5dd] px-3 text-[13px] outline-none focus:border-[#2f7df6]"
      />
    </label>
  );
}

function SelectInput<T extends string>({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: T;
  options: Record<T, string>;
}) {
  return (
    <label className="block text-[13px] font-medium text-[#334155]">
      {label}
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1 h-9 w-full rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px] outline-none focus:border-[#2f7df6]"
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
    <div className="flex gap-3 text-[13px]">
      <Icon size={16} className="mt-0.5 text-[#64748b]" />
      <div>
        <p className="text-[#687584]">{label}</p>
        <p className="mt-0.5 font-medium text-[#1f2328]">{value}</p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 text-[13px]">
      <p className="text-[#687584]">{label}</p>
      <p className="min-w-0 break-words font-medium text-[#1f2328]">{value}</p>
    </div>
  );
}

function SmallMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-[#eef0f3] bg-[#fbfcfd] p-3">
      <p className="text-[12px] text-[#687584]">{label}</p>
      <p className="mt-1 text-[16px] font-semibold text-[#1f2328]">{value}</p>
    </div>
  );
}

function ModuleCounter({
  icon: Icon,
  title,
  count,
  text,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  text: string;
}) {
  return (
    <div className="rounded-md border border-[#d8dce2] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#f1f3f5]">
            <Icon size={17} />
          </div>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-[13px] leading-5 text-[#5f6b76]">{text}</p>
          </div>
        </div>
        <span className="text-[22px] font-semibold">{count}</span>
      </div>
    </div>
  );
}

function ModulePlaceholder({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-md border border-[#d8dce2] bg-[#fbfcfd] p-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white shadow-sm">
        <Icon size={19} />
      </div>
      <h3 className="mt-4 text-[16px] font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-[13px] leading-6 text-[#617083]">
        {text}
      </p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-md border border-[#d8dce2] bg-[#fbfcfd] p-8 text-center">
      <h3 className="text-[16px] font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-[13px] leading-6 text-[#617083]">
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

function Initials({ name }: { name: string }) {
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "CL";
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#111827] text-[13px] font-semibold text-white">
      {initials}
    </div>
  );
}

function StatusBadge({ status }: { status: ClientLifecycleStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function TimelineIcon({ type }: { type: string }) {
  const props = { size: 15 };
  if (type === "dossier") return <FileText {...props} />;
  if (type === "shipment") return <Truck {...props} />;
  if (type === "message") return <MessageCircle {...props} />;
  if (type === "followup") return <Clock3 {...props} />;
  return <History {...props} />;
}

function metricCardClass(tone: string) {
  if (tone === "amber") return "border-[#e8d29a] bg-[#fff4d7] text-[#b76100]";
  if (tone === "neutral") return "border-[#d7dbe0] bg-[#f7f8fa] text-[#1f2328]";
  return "border-[#c8d2e5] bg-[#f1f5fb] text-[#0752b8]";
}

function clean(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text || undefined;
}

function duplicateLabel(reason: string) {
  if (reason === "phone") return "Même téléphone";
  if (reason === "email") return "Même email";
  return "Nom proche";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatMoney(
  value: number | null | undefined,
  currency?: string | null,
) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${currency || "$"}`;
}

function apiErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    const target = `${API_BASE_URL || "API_BASE_URL non configurée"}${error.config?.url || ""}`;
    if (detail === "duplicate_client")
      return "Un client avec ce téléphone ou cet email existe déjà dans cette agence.";
    if (detail === "stale_client_version")
      return "Cette fiche a été modifiée par un autre membre. Fermez le formulaire, rechargez la fiche puis réessayez.";
    if (detail === "restore_identity_conflict")
      return "Restauration impossible : un client actif utilise déjà ce téléphone ou cet email. Ouvrez les doublons pour les fusionner.";
    if (detail === "merge_relationship_conflict")
      return "La fusion rencontre une relation devenue incompatible. Les données ont été conservées ; rechargez les fiches avant de réessayer.";
    if (
      detail === "merge_client_not_found" ||
      detail === "merge_target_not_found"
    )
      return "Une des fiches a été modifiée, archivée ou fusionnée. Rechargez la liste.";
    if (detail === "invalid_phone")
      return "Le numéro doit contenir entre 7 et 15 chiffres.";
    if (detail === "invalid_email") return "L’adresse email n’est pas valide.";
    if (detail === "name_company_phone_or_email_required")
      return "Ajoutez au moins un nom, une entreprise, un téléphone ou un email.";
    if (detail === "csv_required")
      return "Le fichier importé doit être un CSV.";
    if (detail === "empty_csv") return "Le fichier CSV est vide.";
    if (detail === "invalid_csv_encoding")
      return "Le CSV doit être encodé en UTF-8.";
    if (detail === "invalid_csv_headers")
      return "Les en-têtes CSV sont vides ou présents plusieurs fois.";
    if (detail === "invalid_csv_row_shape")
      return "Une ligne CSV contient plus de valeurs que les colonnes déclarées.";
    if (detail === "client_import_too_large")
      return "Le fichier CSV dépasse la limite de 5 Mo.";
    if (detail === "client_import_too_many_rows")
      return "Le fichier CSV dépasse la limite de 10 000 lignes.";
    if (detail === "client_export_too_large")
      return "L’export dépasse 50 000 clients. Ajoutez des filtres puis réessayez.";
    if (error.response?.status === 401)
      return "Session expirée. Reconnectez-vous.";
    if (error.response?.status === 403)
      return "Vous n’avez pas accès à cette organisation.";
    if (error.response?.status === 429)
      return "Trop de demandes ont été envoyées. Patientez quelques secondes puis réessayez.";
    if (error.response && error.response.status >= 500)
      return "Le service Clients rencontre un problème temporaire. Vos données ne sont pas perdues ; réessayez dans quelques instants.";
    if (!error.response)
      return `API injoignable vers ${target}. Vérifiez NEXT_PUBLIC_API_BASE_URL côté frontend et redéployez Render.`;
    if (error.response.status === 404)
      return `Route API introuvable (${target}). Vérifiez que le backend Railway a le dernier code.`;
    return (
      detail ||
      `Erreur API (${error.response?.status || "réseau"}) sur ${target}.`
    );
  }
  return "Une erreur inattendue est survenue.";
}

function importErrorLabel(error: string) {
  if (error === "duplicate_client") return "Client déjà existant";
  if (error === "invalid_phone") return "Numéro de téléphone invalide";
  if (error === "invalid_email") return "Adresse email invalide";
  if (error === "invalid_customer_type")
    return "Type invalide (individual, business, agent ou partner)";
  if (error === "invalid_lifecycle_status")
    return "Statut invalide (lead, active, pending, inactive ou blocked)";
  if (error === "invalid_credit_limit") return "Limite de crédit invalide";
  if (error === "name_company_phone_or_email_required")
    return "Nom, entreprise, téléphone ou email requis";
  return "Ligne non importée";
}
