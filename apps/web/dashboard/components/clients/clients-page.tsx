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
  MoreHorizontal,
  Package,
  Phone,
  Search,
  RotateCcw,
  ShieldAlert,
  Truck,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "@/services/api";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
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
  lead: "Lead",
  active: "Actif",
  pending: "En attente",
  inactive: "Inactif",
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
  { key: "lead", label: "Leads", status: "lead" },
  { key: "active", label: "Actifs", status: "active" },
  { key: "pending", label: "À suivre", status: "pending" },
  { key: "business", label: "Entreprises", customerType: "business" },
  { key: "archived", label: "Archivés", archived: true },
];

const buttonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px] font-medium text-[#1f2328] shadow-sm transition hover:bg-[#f7f8fa]";
const primaryButtonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#12c76f] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0fb966]";
const iconButtonClass = "inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[#4f5b67] transition hover:border-[#d8dce2] hover:bg-[#f4f6f8]";
const pagerButtonClass = "flex h-8 w-8 items-center justify-center rounded-md border border-[#cfd5dd] bg-white text-[#334155] shadow-sm disabled:opacity-40";

type Pagination = { page: number; page_size: number; total: number; total_pages: number };
type ClientFormMode = "create" | "edit";
type DetailTab = "summary" | "operations" | "messages" | "payments" | "history" | "duplicates" | "notes";

export function ClientsPage() {
  const { permissions, available: permissionsAvailable } = usePermissions();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [stats, setStats] = useState<ClientStats>(emptyStats);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: 30, total: 0, total_pages: 0 });
  const [selected, setSelected] = useState<ClientRecord | null>(null);
  const [timeline, setTimeline] = useState<ClientTimelineEvent[]>([]);
  const [duplicates, setDuplicates] = useState<ClientDuplicate[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>("summary");
  const [activeView, setActiveView] = useState<(typeof views)[number]["key"]>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ClientLifecycleStatus | "">("");
  const [customerType, setCustomerType] = useState<ClientCustomerType | "">("");
  const [source, setSource] = useState<ClientSource | "">("");
  const [sort, setSort] = useState("created_desc");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<ClientFormMode>("create");
  const [formClient, setFormClient] = useState<ClientRecord | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<ClientImportResult | null>(null);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);

  const currentView = views.find((view) => view.key === activeView) || views[0];
  const visibleViews = views.filter((view) => !view.archived || (permissionsAvailable && permissions.includes("clients.archive")));
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
    setLoading(true);
    setError("");
    try {
      const response = currentView.archived ? await listArchivedClients({
        q: query || undefined,
        page: nextPage,
        page_size: 30,
      }) : await listClients({
        q: query || undefined,
        status: currentView.status || status || undefined,
        customer_type: currentView.customerType || customerType || undefined,
        source: source || undefined,
        page: nextPage,
        page_size: 30,
        sort,
      });
      setClients(response.items);
      setPagination(response.pagination);
      if (selected && !response.items.some((item) => item.id === selected.id)) setSelected(null);
    } catch (err) {
      setError(apiErrorMessage(err));
      setClients([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  async function archiveSelectedClient() {
    if (!selected || !window.confirm(`Archiver ${selected.display_name || selected.name || "ce client"} ? Ses dossiers et opérations seront conservés.`)) return;
    try {
      await deleteClient(selected.id);
      setSelected(null);
      await Promise.all([loadStats(), loadClients(1)]);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function restoreSelectedClient() {
    if (!selected) return;
    try {
      await restoreClient(selected.id);
      setSelected(null);
      await Promise.all([loadStats(), loadClients(1)]);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function selectClient(client: ClientRecord) {
    setSelected(client);
    setActiveTab("summary");
    setDetailLoading(true);
    setTimeline([]);
    setDuplicates([]);
    try {
      setSelected(await getClient(client.id));
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
      customer_type: String(form.get("customer_type") || "individual") as ClientCustomerType,
      lifecycle_status: String(form.get("lifecycle_status") || "lead") as ClientLifecycleStatus,
      source: String(form.get("source") || "manual") as ClientSource,
      preferred_language: clean(form.get("preferred_language")) || "FR",
      preferred_currency: clean(form.get("preferred_currency")),
      notes: clean(form.get("notes")),
      credit_enabled: form.get("credit_enabled") === "on",
      credit_limit: Number(form.get("credit_limit") || 0),
      row_version: formClient?.row_version,
    };

    try {
      const saved = formMode === "edit" && formClient
        ? await updateClient(formClient.id, payload)
        : await createClient(payload);
      setFormOpen(false);
      setFormClient(null);
      setSelected(saved);
      await Promise.all([loadStats(), loadClients(formMode === "edit" ? page : 1)]);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
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
    }
  }

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File) || !file.name) {
      setImportError("Sélectionnez un fichier CSV.");
      return;
    }
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const result = await importClients(file);
      setImportResult(result);
      await Promise.all([loadStats(), loadClients(1)]);
    } catch (err) {
      setImportError(apiErrorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  const statCards = useMemo(() => [
    { label: "Clients total", value: stats.total, tone: "blue" },
    { label: "Actifs", value: stats.active, tone: "blue" },
    { label: "Leads", value: stats.leads, tone: "blue" },
    { label: "À suivre", value: stats.pending, tone: "amber" },
    { label: "Inactifs", value: stats.inactive + stats.blocked, tone: "neutral" },
  ], [stats]);

  return (
    <div className="min-h-full bg-[#f7f7f6] text-[#1f2328]">
      <div className="overflow-hidden bg-white">
        <OperationPageHeader title="Clients" description="Répertoire opérationnel des leads, clients et partenaires. Les lignes affichées proviennent uniquement de l’organisation active."
          actions={<>
              <PermissionGuard permission="clients.import"><button onClick={() => setImportOpen(true)} className={buttonClass}>
                <Upload size={16} />
                Importer
              </button></PermissionGuard>
              <PermissionGuard permission="clients.export"><button onClick={handleExport} className={buttonClass}>
                <Download size={16} />
                Exporter
              </button></PermissionGuard>
              <PermissionGuard permission="clients.create"><button onClick={openCreate} className={primaryButtonClass}>
                <span className="text-lg leading-none">+</span>
                Nouveau client
              </button></PermissionGuard>
            </>}
          tabs={<>
            {visibleViews.map((view) => (
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

        <section className="grid gap-3 border-b border-[#d8dce2] px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
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
            <SelectFilter value={customerType} onChange={(value) => setCustomerType(value as ClientCustomerType | "")} label="Type">
              <option value="">Type</option>
              {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectFilter>
            <SelectFilter value={status} onChange={(value) => setStatus(value as ClientLifecycleStatus | "")} label="Statut">
              <option value="">Statut</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectFilter>
            <SelectFilter value={source} onChange={(value) => setSource(value as ClientSource | "")} label="Source">
              <option value="">Source</option>
              {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectFilter>
            <SelectFilter value={sort} onChange={setSort} label="Tri">
              <option value="created_desc">Créés récemment</option>
              <option value="created_asc">Créés anciennement</option>
              <option value="name_asc">Nom A-Z</option>
              <option value="name_desc">Nom Z-A</option>
              <option value="activity_desc">Activité récente</option>
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

          <ClientsTable clients={clients} loading={loading} selectedId={selected?.id} onSelect={selectClient} />

          <div className="flex flex-col gap-3 border-t border-[#d8dce2] px-5 py-3 text-[13px] text-[#5f6b76] sm:flex-row sm:items-center sm:justify-between">
            <span>{pagination.total === 0 ? "0 client" : `${(page - 1) * pagination.page_size + 1} - ${Math.min(page * pagination.page_size, pagination.total)} sur ${pagination.total} client(s)`}</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1 || loading} onClick={() => loadClients(page - 1)} className={pagerButtonClass}>
                <ChevronLeft size={16} />
              </button>
              <span className="rounded-md bg-[#166ee8] px-3 py-1.5 text-[13px] font-semibold text-white">{page}</span>
              <button disabled={page >= pagination.total_pages || loading} onClick={() => loadClients(page + 1)} className={pagerButtonClass}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
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
          onClose={() => setSelected(null)}
          onEdit={() => openEdit(selected)}
          archived={Boolean(currentView.archived)}
          onArchive={archiveSelectedClient}
          onRestore={restoreSelectedClient}
        />
      )}

      {formOpen && (
        <ClientFormModal
          mode={formMode}
          client={formClient}
          saving={saving}
          error={formError}
          onClose={() => {
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
          onClose={() => {
            setImportOpen(false);
            setImportError("");
            setImportResult(null);
          }}
          onSubmit={submitImport}
        />
      )}
    </div>
  );
}

function ClientsTable({ clients, loading, selectedId, onSelect }: {
  clients: ClientRecord[];
  loading: boolean;
  selectedId?: string;
  onSelect: (client: ClientRecord) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-1 p-4">
        {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-11 animate-pulse rounded-md bg-[#eef1f5]" />)}
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
        <h2 className="text-[18px] font-semibold">Aucun client trouvé</h2>
        <p className="mt-2 max-w-md text-[13px] leading-6 text-[#617083]">
          Créez votre premier client ou ajustez la recherche. Cette liste affichera uniquement les données réelles de votre agence.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1120px] w-full border-collapse text-left text-[13px]">
        <thead className="border-b border-[#d8dce2] bg-[#f7f8fa] font-medium text-[#5f6b76]">
          <tr>
            <th className="w-10 px-4 py-2"><input type="checkbox" className="rounded border-[#c9d0d8]" aria-label="Sélectionner tous les clients" /></th>
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Téléphone</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Pays</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Statut</th>
            <th className="px-3 py-2 text-right">Dossiers</th>
            <th className="px-3 py-2 text-right">Colis</th>
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
              <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>
                <input type="checkbox" className="rounded border-[#c9d0d8]" aria-label={`Sélectionner ${client.display_name || client.name || "client"}`} />
              </td>
              <td className="px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#1f2328]">{client.display_name || client.name || client.company_name || "Sans nom"}</p>
                  <p className="truncate text-[12px] text-[#687584]">{client.company_name || client.source}</p>
                </div>
              </td>
              <td className="px-3 py-2 text-[#334155]">{client.phone || client.whatsapp_phone || "-"}</td>
              <td className="px-3 py-2 text-[#334155]">{client.email || "-"}</td>
              <td className="px-3 py-2 text-[#334155]">{[client.city, client.country].filter(Boolean).join(", ") || "-"}</td>
              <td className="px-3 py-2 text-[#334155]">{typeLabels[client.customer_type]}</td>
              <td className="px-3 py-2"><StatusBadge status={client.lifecycle_status} /></td>
              <td className="px-3 py-2 text-right font-medium">{client.dossiers_count}</td>
              <td className="px-3 py-2 text-right font-medium">{client.shipments_count}</td>
              <td className="px-3 py-2 text-[#687584]">{formatDate(client.last_activity_at || client.updated_at)}</td>
              <td className="px-3 py-2"><MoreHorizontal size={16} className="text-[#687584]" /></td>
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
  onClose,
  onEdit,
  archived,
  onArchive,
  onRestore,
}: {
  client: ClientRecord;
  loading: boolean;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  timeline: ClientTimelineEvent[];
  timelineLoading: boolean;
  duplicates: ClientDuplicate[];
  duplicatesLoading: boolean;
  onClose: () => void;
  onEdit: () => void;
  archived: boolean;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [client.id]);

  function close() {
    setVisible(false);
    window.setTimeout(onClose, 180);
  }

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
    <div className="fixed inset-0 z-50">
      <button aria-label="Fermer la fiche client" onClick={close} className={`absolute inset-0 bg-slate-950/20 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`} />
      <aside className={`absolute right-0 top-0 h-full w-full max-w-[560px] border-l border-[#cfd5dd] bg-white shadow-[-18px_0_42px_rgba(15,23,42,0.16)] transition-transform duration-200 ease-out ${visible ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex h-full flex-col">
          <div className="border-b border-[#d8dce2] px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-[#687584]">Fiche client</p>
                <h2 className="mt-1 truncate text-[22px] font-semibold tracking-[-0.02em]">{client.display_name || client.name || client.company_name || "Sans nom"}</h2>
                <p className="mt-1 text-[13px] text-[#687584]">{typeLabels[client.customer_type]} · {sourceLabels[client.source]}</p>
              </div>
              <div className="flex gap-1">
                {!archived && <PermissionGuard permission="clients.update"><button onClick={onEdit} className={iconButtonClass} aria-label="Modifier le client"><Edit3 size={16} /></button></PermissionGuard>}
                <PermissionGuard permission="clients.archive">{archived ? <button onClick={onRestore} className={iconButtonClass} aria-label="Restaurer le client" title="Restaurer"><RotateCcw size={16} /></button> : <button onClick={onArchive} className={`${iconButtonClass} hover:text-red-600`} aria-label="Archiver le client" title="Archiver"><Archive size={16} /></button>}</PermissionGuard>
                <button onClick={close} className={iconButtonClass} aria-label="Fermer"><X size={17} /></button>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Initials name={client.display_name || client.name || "Client"} />
              <StatusBadge status={client.lifecycle_status} />
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
            {activeTab === "summary" && <SummaryTab client={client} />}
            {activeTab === "operations" && <OperationsTab client={client} />}
            {activeTab === "messages" && <ModulePlaceholder icon={MessageCircle} title="Messages client" text="Cette vue affichera les conversations WhatsApp, emails et messages liés à ce client lorsque le module Communication les aura synchronisés." />}
            {activeTab === "payments" && <ModulePlaceholder icon={ShieldAlert} title="Paiements client" text="Cette vue affichera les factures, paiements reçus, soldes et relances provenant du module Finance. Aucun montant n’est inventé ici." />}
            {activeTab === "history" && <HistoryTab events={timeline} loading={timelineLoading} />}
            {activeTab === "duplicates" && <DuplicatesTab duplicates={duplicates} loading={duplicatesLoading} />}
            {activeTab === "notes" && <NotesTab client={client} />}
          </div>
        </div>
      </aside>
    </div>
  );
}

function SummaryTab({ client }: { client: ClientRecord }) {
  return (
    <div className="space-y-5">
      <Section title="Coordonnées">
        <InfoRow icon={Phone} label="Téléphone" value={client.phone || "-"} />
        <InfoRow icon={MessageCircle} label="WhatsApp" value={client.whatsapp_phone || client.phone || "-"} />
        <InfoRow icon={Mail} label="Email" value={client.email || "-"} />
        <InfoRow icon={UserRound} label="Type" value={typeLabels[client.customer_type]} />
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
          <SmallMetric label="Colis / expéditions" value={client.shipments_count} />
          <SmallMetric label="Solde" value={formatMoney(client.current_balance, client.preferred_currency)} />
          <SmallMetric label="Total dépensé" value={formatMoney(client.total_spent, client.preferred_currency)} />
        </div>
      </Section>
    </div>
  );
}

function OperationsTab({ client }: { client: ClientRecord }) {
  return (
    <div className="space-y-4">
      <ModuleCounter icon={FileText} title="Dossiers" count={client.dossiers_count} text="Les dossiers liés à ce client seront consultables ici dès que le module Dossiers exposera sa vue détaillée." />
      <ModuleCounter icon={Package} title="Colis" count={client.shipments_count} text="Les colis et expéditions liés au client seront alimentés par les modules Colis, Tracking et Expéditions." />
      <ModuleCounter icon={Truck} title="Expéditions" count={client.shipments_count} text="La liste opérationnelle complète restera dans le module Expéditions pour garder une séparation métier propre." />
    </div>
  );
}

function HistoryTab({ events, loading }: { events: ClientTimelineEvent[]; loading: boolean }) {
  if (loading) return <LoadingLines />;
  if (events.length === 0) return <EmptyState title="Aucun historique" text="Les événements apparaîtront ici dès que le client aura des dossiers, messages, relances ou expéditions liés." />;
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

function DuplicatesTab({ duplicates, loading }: { duplicates: ClientDuplicate[]; loading: boolean }) {
  if (loading) return <LoadingLines />;
  if (duplicates.length === 0) return <EmptyState title="Aucun doublon détecté" text="Aucun autre client ne partage actuellement le même téléphone, email ou nom proche dans cette organisation." />;
  return (
    <div className="space-y-3">
      {duplicates.map((item) => (
        <div key={item.id} className="rounded-md border border-[#d8dce2] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{item.display_name || item.name || item.company_name || "Client sans nom"}</p>
              <p className="mt-1 text-[13px] text-[#687584]">{item.email || item.phone || item.whatsapp_phone || "-"}</p>
            </div>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-[12px] font-medium text-amber-700 ring-1 ring-amber-100">{duplicateLabel(item.match_reason)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function NotesTab({ client }: { client: ClientRecord }) {
  if (!client.notes) return <EmptyState title="Aucune note" text="Les notes internes ajoutées sur la fiche client apparaîtront ici." />;
  return <div className="rounded-md border border-[#d8dce2] bg-[#fbfcfd] p-4 text-[13px] leading-6 text-[#334155]">{client.notes}</div>;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[#d8dce2] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#d8dce2] px-5 py-4">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{title}</h2>
            <p className="mt-1 text-[13px] text-[#687584]">Renseignez uniquement les informations réelles disponibles.</p>
          </div>
          <button onClick={onClose} className={iconButtonClass}><X size={17} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-5 p-5">
          {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</div>}
          <div className="grid gap-4 md:grid-cols-3">
            <Input label="Nom affiché" name="display_name" defaultValue={client?.display_name || ""} />
            <Input label="Nom complet" name="name" defaultValue={client?.name || ""} />
            <Input label="Entreprise" name="company_name" defaultValue={client?.company_name || ""} />
            <Input label="Téléphone" name="phone" defaultValue={client?.phone || ""} />
            <Input label="WhatsApp" name="whatsapp_phone" defaultValue={client?.whatsapp_phone || ""} />
            <Input label="Email" name="email" defaultValue={client?.email || ""} />
            <Input label="Pays" name="country" defaultValue={client?.country || ""} />
            <Input label="Ville" name="city" defaultValue={client?.city || ""} />
            <Input label="Identifiant fiscal" name="tax_id" defaultValue={client?.tax_id || ""} />
            <SelectInput label="Type" name="customer_type" defaultValue={client?.customer_type || "individual"} options={typeLabels} />
            <SelectInput label="Statut" name="lifecycle_status" defaultValue={client?.lifecycle_status || "lead"} options={statusLabels} />
            <SelectInput label="Source" name="source" defaultValue={client?.source || "manual"} options={sourceLabels} />
            <Input label="Langue" name="preferred_language" defaultValue={client?.preferred_language || "FR"} />
            <Input label="Devise" name="preferred_currency" defaultValue={client?.preferred_currency || ""} />
            <Input label="Limite crédit" name="credit_limit" type="number" defaultValue={String(client?.credit_limit || 0)} />
          </div>
          <Input label="Adresse" name="address" defaultValue={client?.address || ""} />
          <label className="flex items-center gap-2 text-[13px] font-medium text-[#334155]">
            <input name="credit_enabled" type="checkbox" defaultChecked={Boolean(client?.credit_enabled)} className="rounded border-[#c9d0d8]" />
            Crédit autorisé
          </label>
          <label className="block text-[13px] font-medium text-[#334155]">
            Notes internes
            <textarea name="notes" rows={4} defaultValue={client?.notes || ""} className="mt-1 w-full rounded-md border border-[#cfd5dd] px-3 py-2 text-[13px] outline-none focus:border-[#2f7df6]" />
          </label>
          <div className="flex justify-end gap-2 border-t border-[#eef0f3] pt-4">
            <button type="button" onClick={onClose} className={buttonClass}>Annuler</button>
            <button disabled={saving} className={`${primaryButtonClass} disabled:opacity-60`}>
              {saving ? "Enregistrement..." : mode === "edit" ? "Enregistrer" : "Créer le client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportClientsModal({ importing, error, result, onClose, onSubmit }: {
  importing: boolean;
  error: string;
  result: ClientImportResult | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <div className="w-full max-w-lg rounded-lg border border-[#d8dce2] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#d8dce2] px-5 py-4">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Importer des clients</h2>
            <p className="mt-1 text-[13px] text-[#687584]">CSV supporté: nom, entreprise, téléphone, whatsapp, email, pays, ville, statut, type.</p>
          </div>
          <button onClick={onClose} className={iconButtonClass}><X size={17} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</div>}
          {result && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800">
              {result.created} créé(s), {result.skipped} doublon(s) ignoré(s), {result.errors.length} erreur(s).
            </div>
          )}
          <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[#b9c1cc] bg-[#fbfcfd] p-5 text-center text-[13px] text-[#5f6b76] hover:bg-[#f6f8fb]">
            <Import size={22} />
            <span className="mt-2 font-medium text-[#1f2328]">Choisir un fichier CSV</span>
            <input name="file" type="file" accept=".csv,text/csv" className="mt-3 text-[13px]" />
          </label>
          <div className="flex justify-end gap-2 border-t border-[#eef0f3] pt-4">
            <button type="button" onClick={onClose} className={buttonClass}>Fermer</button>
            <button disabled={importing} className={`${primaryButtonClass} disabled:opacity-60`}>{importing ? "Import..." : "Importer"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SelectFilter({ value, onChange, children }: { value: string; onChange: (value: string) => void; label: string; children: React.ReactNode }) {
  return (
    <label className="relative inline-flex h-8 min-w-[120px] items-center">
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-full appearance-none rounded-md border border-[#cfd5dd] bg-white pl-3 pr-8 text-[13px] font-medium outline-none shadow-sm hover:bg-[#f8fafc] focus:border-[#2f7df6]">
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 text-[#667085]" />
    </label>
  );
}

function Input({ label, name, defaultValue = "", placeholder = "", type = "text" }: { label: string; name: string; defaultValue?: string; placeholder?: string; type?: string }) {
  return (
    <label className="block text-[13px] font-medium text-[#334155]">
      {label}
      <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className="mt-1 h-9 w-full rounded-md border border-[#cfd5dd] px-3 text-[13px] outline-none focus:border-[#2f7df6]" />
    </label>
  );
}

function SelectInput<T extends string>({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: T; options: Record<T, string> }) {
  return (
    <label className="block text-[13px] font-medium text-[#334155]">
      {label}
      <select name={name} defaultValue={defaultValue} className="mt-1 h-9 w-full rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px] outline-none focus:border-[#2f7df6]">
        {Object.entries(options).map(([value, label]) => <option key={value} value={value}>{String(label)}</option>)}
      </select>
    </label>
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

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
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

function SmallMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[#eef0f3] bg-[#fbfcfd] p-3">
      <p className="text-[12px] text-[#687584]">{label}</p>
      <p className="mt-1 text-[16px] font-semibold text-[#1f2328]">{value}</p>
    </div>
  );
}

function ModuleCounter({ icon: Icon, title, count, text }: { icon: LucideIcon; title: string; count: number; text: string }) {
  return (
    <div className="rounded-md border border-[#d8dce2] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#f1f3f5]"><Icon size={17} /></div>
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

function ModulePlaceholder({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-md border border-[#d8dce2] bg-[#fbfcfd] p-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white shadow-sm"><Icon size={19} /></div>
      <h3 className="mt-4 text-[16px] font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-[13px] leading-6 text-[#617083]">{text}</p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-md border border-[#d8dce2] bg-[#fbfcfd] p-8 text-center">
      <h3 className="text-[16px] font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-[13px] leading-6 text-[#617083]">{text}</p>
    </div>
  );
}

function LoadingLines() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-md bg-[#eef1f5]" />)}
    </div>
  );
}

function Initials({ name }: { name: string }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CL";
  return <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#111827] text-[13px] font-semibold text-white">{initials}</div>;
}

function StatusBadge({ status }: { status: ClientLifecycleStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ${statusStyles[status]}`}>{statusLabels[status]}</span>;
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
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatMoney(value: number | null | undefined, currency?: string | null) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${currency || "$"}`;
}

function apiErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    const target = `${API_BASE_URL || "API_BASE_URL non configurée"}${error.config?.url || ""}`;
    if (detail === "duplicate_client") return "Un client avec ce téléphone ou cet email existe déjà dans cette agence.";
    if (detail === "stale_client_version") return "Cette fiche a été modifiée par un autre membre. Fermez le formulaire, rechargez la fiche puis réessayez.";
    if (detail === "invalid_phone") return "Le numéro doit contenir entre 7 et 15 chiffres.";
    if (detail === "invalid_email") return "L’adresse email n’est pas valide.";
    if (detail === "name_company_phone_or_email_required") return "Ajoutez au moins un nom, une entreprise, un téléphone ou un email.";
    if (detail === "csv_required") return "Le fichier importé doit être un CSV.";
    if (detail === "empty_csv") return "Le fichier CSV est vide.";
    if (error.response?.status === 401) return "Session expirée. Reconnectez-vous.";
    if (error.response?.status === 403) return "Vous n’avez pas accès à cette organisation.";
    if (!error.response) return `API injoignable vers ${target}. Vérifiez NEXT_PUBLIC_API_BASE_URL côté frontend et redéployez Render.`;
    if (error.response.status === 404) return `Route API introuvable (${target}). Vérifiez que le backend Railway a le dernier code.`;
    return detail || `Erreur API (${error.response?.status || "réseau"}) sur ${target}.`;
  }
  return "Une erreur inattendue est survenue.";
}
