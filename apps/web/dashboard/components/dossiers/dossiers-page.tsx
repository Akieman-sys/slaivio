"use client";

import axios from "axios";
import { AlertCircle, Bell, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { OperationActionMenu, OperationButton, OperationMetric, OperationMetricGrid, OperationStatus, OperationTab } from "@/components/ui/operation-controls";
import { OperationContent, OperationMetrics, OperationSearch, OperationTable, OperationToolbar } from "@/components/ui/operation-primitives";
import { OperationPageHeader, OperationTabs } from "@/components/ui/operation-page-header";
import { EmptyState, TableSkeleton } from "@/components/ui/page-state";
import {
  createDossier, exportDossiers, getDossierStats,
  listArchivedDossiers, listDossierMembers, listDossiers, searchDossierClients,
  type DossierClientSearchResult, type DossierMember, type DossierRecord, type DossierStats,
} from "@/services/dossiers";

type PilotView = "active" | "attention" | "recent" | "archived";

const EMPTY_STATS: DossierStats = {
  total: 0, active: 0, leads: 0, quoted: 0, waiting_packages: 0, in_transit: 0,
  delivered: 0, payment_pending: 0, total_value: 0, client_memberships: 0,
  clients_requiring_attention: 0, dossiers_requiring_attention: 0, archived: 0,
};
const PAGE_SIZE = 30;
const fieldClass = "h-10 w-full rounded-[7px] border border-[#d4d9df] bg-white px-3 text-[13px] text-[#30373e] outline-none transition focus:border-[#12a865] focus:ring-2 focus:ring-[#12c76f]/10";

export function DossiersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledEntryAction = useRef(false);
  const [view, setView] = useState<PilotView>("active");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DossierRecord[]>([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientMatches, setClientMatches] = useState<DossierClientSearchResult[]>([]);
  const [selectedClients, setSelectedClients] = useState<DossierClientSearchResult[]>([]);
  const [members, setMembers] = useState<DossierMember[]>([]);
  const [clientSearching, setClientSearching] = useState(false);

  const load = useCallback(async (nextPage = 1) => {
    setLoading(true);
    setError("");
    try {
      const response = view === "archived"
        ? await listArchivedDossiers({ q: query || undefined, page: nextPage, page_size: PAGE_SIZE })
        : await listDossiers({
            q: query || undefined, active_only: true,
            attention_required: view === "attention",
            updated_since_hours: view === "recent" ? 168 : undefined,
            page: nextPage, page_size: PAGE_SIZE, sort: "updated_desc",
          });
      setItems(response.items);
      setPage(response.pagination.page);
      setTotal(response.pagination.total);
      setTotalPages(response.pagination.total_pages);
    } catch (cause) {
      setItems([]);
      setError(apiError(cause));
    } finally {
      setLoading(false);
    }
  }, [query, view]);

  const refreshStats = useCallback(async () => {
    try { setStats(await getDossierStats()); } catch { setStats(EMPTY_STATS); }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => load(1), 220);
    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  useEffect(() => {
    if (handledEntryAction.current) return;
    handledEntryAction.current = true;
    const requestedView = searchParams.get("view");
    if (requestedView === "attention" || requestedView === "recent" || requestedView === "archived") {
      setView(requestedView);
    }
    if (searchParams.get("create") === "1") {
      setCreateError("");
      setClientQuery("");
      setSelectedClients([]);
      setClientMatches([]);
      setCreateOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!createOpen || clientQuery.trim().length < 2) {
      setClientMatches([]);
      setClientSearching(false);
      return;
    }
    setClientSearching(true);
    const timeout = window.setTimeout(() => {
      searchDossierClients(clientQuery.trim())
        .then((matches) => setClientMatches(matches.filter((match) => !selectedClients.some((client) => client.id === match.id))))
        .catch(() => setClientMatches([]))
        .finally(() => setClientSearching(false));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [clientQuery, createOpen, selectedClients]);

  useEffect(() => {
    if (!createOpen) return;
    listDossierMembers().then(setMembers).catch(() => setMembers([]));
  }, [createOpen]);

  function openDetail(dossier: DossierRecord) { router.push(`/app/dossiers/${dossier.id}`); }

  function openCreate() {
    setCreateError("");
    setClientQuery("");
    setSelectedClients([]);
    setClientMatches([]);
    setCreateOpen(true);
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    const form = new FormData(event.currentTarget);
    try {
      const dossier = await createDossier({
        client_ids: selectedClients.map((client) => client.id),
        idempotency_key: `pilot-dossier:${crypto.randomUUID()}`,
        title: clean(form.get("title")),
        description: clean(form.get("description")),
        assigned_to: clean(form.get("assigned_to")),
        primary_channel: "manual",
      });
      setCreateOpen(false);
      await Promise.all([load(1), refreshStats()]);
      router.push(`/app/dossiers/${dossier.id}`);
    } catch (cause) { setCreateError(apiError(cause)); }
    finally { setCreating(false); }
  }

  async function handleExport() {
    try {
      const blob = await exportDossiers({ q: query || undefined, sort: "updated_desc" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "dossiers-slaivio.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setError(apiError(cause)); }
  }

  const tabs = useMemo(() => [
    { key: "active" as const, label: "Dossiers actifs", count: stats.active },
    { key: "attention" as const, label: "À traiter", count: stats.dossiers_requiring_attention },
    { key: "recent" as const, label: "Modifiés récemment" },
    { key: "archived" as const, label: "Archivés", count: stats.archived },
  ], [stats]);

  return <div className="min-h-full bg-[#f7f8f8] text-[#25292e]">
    <OperationPageHeader
      title="Dossiers"
      description="Regroupez les clients concernés, suivez leur situation et retrouvez les dossiers qui demandent votre attention."
      actions={<>
        <OperationActionMenu><button type="button" onClick={() => setView("attention")}><Bell size={15} /> Voir les dossiers à traiter</button></OperationActionMenu>
        <PermissionGuard permission="dossiers.export"><OperationButton onClick={handleExport}><Download size={15} /> Exporter</OperationButton></PermissionGuard>
        <PermissionGuard permission="dossiers.create"><OperationButton variant="primary" onClick={openCreate}>Nouveau dossier</OperationButton></PermissionGuard>
      </>}
    />

    <OperationMetrics><OperationMetricGrid>
      <OperationMetric label="Dossiers actifs" value={stats.active.toLocaleString("fr-FR")} />
      <OperationMetric label="Clients rattachés" value={stats.client_memberships.toLocaleString("fr-FR")} />
      <OperationMetric label="Dossiers à traiter" value={stats.dossiers_requiring_attention.toLocaleString("fr-FR")} tone={stats.dossiers_requiring_attention ? "warning" : "default"} />
      <OperationMetric label="Clients à suivre" value={stats.clients_requiring_attention.toLocaleString("fr-FR")} tone={stats.clients_requiring_attention ? "warning" : "default"} />
    </OperationMetricGrid></OperationMetrics>

    <OperationTabs>{tabs.map((tab) => <OperationTab key={tab.key} active={view === tab.key} count={tab.count} onClick={() => setView(tab.key)}>{tab.label}</OperationTab>)}</OperationTabs>
    <OperationToolbar search={<OperationSearch value={query} onChange={setQuery} placeholder="Rechercher un dossier ou un client" />} />

    {error && <div className="mx-5 mt-5 flex items-start gap-3 rounded-[8px] border border-[#efcaca] bg-[#fff5f5] p-4 text-[13px] text-[#a62b25] sm:mx-6">
      <AlertCircle size={17} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Impossible d’afficher les dossiers</p><p className="mt-0.5">{error}</p></div>
    </div>}

    <OperationContent>
      <OperationTable>
        {loading ? <TableSkeleton rows={7} columns={6} /> : items.length === 0 ? <EmptyState
          title={view === "attention" ? "Aucun dossier ne demande votre attention" : "Aucun dossier dans cette vue"}
          description={query ? "Essayez une autre recherche." : "Créez un dossier lorsque vous commencez à suivre une nouvelle situation."}
          action={view === "active" ? <OperationButton variant="primary" onClick={openCreate}>Nouveau dossier</OperationButton> : undefined}
        /> : <DossiersTable items={items} openDetail={openDetail} />}
      </OperationTable>
      {!loading && total > 0 && <div className="mt-3 flex items-center justify-between text-[12px] text-[#6f7983]">
        <span>{plural(total, "dossier")}</span><div className="flex items-center gap-2">
          <OperationButton className="h-8 w-8 px-0" disabled={page <= 1} onClick={() => load(page - 1)} aria-label="Page précédente"><ChevronLeft size={15} /></OperationButton>
          <span className="min-w-16 text-center font-medium text-[#404951]">{page} / {Math.max(totalPages, 1)}</span>
          <OperationButton className="h-8 w-8 px-0" disabled={page >= totalPages} onClick={() => load(page + 1)} aria-label="Page suivante"><ChevronRight size={15} /></OperationButton>
        </div>
      </div>}
    </OperationContent>

    <OperationDrawer
      open={createOpen} close={() => !creating && setCreateOpen(false)} title="Nouveau dossier"
      description="Créez le dossier avec les informations déjà connues. Vous pourrez le compléter ensuite." width="max-w-[600px]"
      footer={<><OperationButton disabled={creating} onClick={() => setCreateOpen(false)}>Annuler</OperationButton><OperationButton variant="primary" type="submit" form="pilot-dossier-create" disabled={creating}>{creating ? "Création…" : "Créer le dossier"}</OperationButton></>}
    >
      <form id="pilot-dossier-create" onSubmit={submitCreate} className="grid gap-6">
        <section className="grid gap-4"><div><h3 className="text-[15px] font-semibold text-[#25292e]">Informations du dossier</h3><p className="mt-1 text-[13px] leading-5 text-[#68737d]">Renseignez uniquement ce que vous connaissez maintenant.</p></div>
          <label className="grid gap-2"><span className="text-[13px] font-semibold text-[#414950]">Nom ou objet du dossier</span><input name="title" maxLength={180} placeholder="Ex. Suivi des commandes boutique Mardoche" className={fieldClass} /></label>
          <label className="grid gap-2"><span className="text-[13px] font-semibold text-[#414950]">Contexte <span className="font-normal text-[#7a848d]">— facultatif</span></span><textarea name="description" maxLength={3000} rows={4} placeholder="Expliquez brièvement ce qui doit être suivi dans ce dossier." className={`${fieldClass} h-auto py-2.5`} /></label>
          <label className="grid gap-2"><span className="text-[13px] font-semibold text-[#414950]">Responsable <span className="font-normal text-[#7a848d]">— facultatif</span></span><select name="assigned_to" className={fieldClass}><option value="">Non attribué</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}</select></label>
        </section>
        <section><h3 className="text-[15px] font-semibold text-[#25292e]">Clients concernés <span className="font-normal text-[#7a848d]">— facultatif</span></h3>
          <p className="mt-1 text-[13px] leading-5 text-[#68737d]">Ajoutez un ou plusieurs clients existants. Vous pourrez aussi le faire plus tard.</p>
          <SelectedClients clients={selectedClients} remove={(id) => setSelectedClients((current) => current.filter((client) => client.id !== id))} />
          <ClientSearch query={clientQuery} setQuery={setClientQuery} searching={clientSearching} matches={clientMatches} select={(client) => { setSelectedClients((current) => [...current, client]); setClientQuery(""); }} />
        </section>
        <div className="rounded-[8px] border border-[#dfe4e7] bg-[#f8faf9] p-4 text-[13px] leading-5 text-[#59656f]">Le dossier recevra automatiquement une référence unique. Aucune information technique ne vous sera demandée.</div>
        {createError && <p className="rounded-[7px] bg-[#fff2f2] px-3 py-2.5 text-[13px] text-[#a62b25]">{createError}</p>}
      </form>
    </OperationDrawer>
  </div>;
}

function DossiersTable({ items, openDetail }: { items: DossierRecord[]; openDetail: (dossier: DossierRecord) => void }) {
  return <table className="w-full min-w-[850px] border-collapse text-left"><thead className="bg-[#f7f8f9] text-[12px] font-semibold text-[#606b75]"><tr className="border-b border-[#e2e6e9]">
    <th className="px-5 py-3">Dossier</th><th className="px-5 py-3">Clients</th><th className="px-5 py-3">Suivi</th><th className="px-5 py-3">Responsable</th><th className="px-5 py-3">Dernière modification</th><th className="w-14 px-4 py-3"><span className="sr-only">Ouvrir</span></th>
  </tr></thead><tbody className="divide-y divide-[#edf0f2] bg-white text-[13px]">{items.map((dossier) => <tr key={dossier.id} className="transition-colors hover:bg-[#fafbfb]">
    <td className="px-5 py-3.5"><button type="button" onClick={() => openDetail(dossier)} className="text-left"><span className="block font-semibold text-[#25292e]">{dossier.title || dossier.dossier_reference}</span><span className="mt-0.5 block text-[12px] text-[#78828c]">{dossier.title ? dossier.dossier_reference : `Créé le ${formatDate(dossier.created_at)}`}</span></button></td>
    <td className="px-5 py-3.5"><p className="font-medium text-[#343b42]">{dossier.client_count ? dossier.client_name || "Clients rattachés" : "Aucun client"}</p><p className="mt-0.5 text-[12px] text-[#78828c]">{plural(dossier.client_count || 0, "client")}</p></td>
    <td className="px-5 py-3.5">{dossier.attention_count > 0 ? <OperationStatus label={plural(dossier.attention_count, "attention")} tone="warning" /> : <OperationStatus label="Suivi normal" tone="success" />}</td>
    <td className="px-5 py-3.5 text-[#4c5660]">{dossier.assigned_to || "Non attribué"}</td><td className="px-5 py-3.5 text-[#4c5660]">{formatRelative(dossier.updated_at || dossier.created_at)}</td>
    <td className="px-4 py-3.5 text-right"><button type="button" onClick={() => openDetail(dossier)} className="grid h-8 w-8 place-items-center rounded-[6px] text-[#68737d] hover:bg-[#eef1f2] hover:text-[#25292e]" aria-label={`Ouvrir ${dossier.dossier_reference}`}><ChevronRight size={17} /></button></td>
  </tr>)}</tbody></table>;
}

function SelectedClients({ clients, remove }: { clients: DossierClientSearchResult[]; remove: (id: string) => void }) {
  if (!clients.length) return null;
  return <div className="mt-4 grid gap-2">{clients.map((client) => <div key={client.id} className="flex items-center justify-between rounded-[8px] border border-[#b8ddca] bg-[#f2fbf6] p-3.5"><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-[#26312b]">{client.display_name}</p><p className="mt-0.5 text-[12px] text-[#617169]">{client.phone || client.whatsapp_phone || client.email || client.client_reference}</p></div><button type="button" className="text-[12px] font-semibold text-[#087a46]" onClick={() => remove(client.id)}>Retirer</button></div>)}</div>;
}

function ClientSearch({ query, setQuery, searching, matches, select }: { query: string; setQuery: (value: string) => void; searching: boolean; matches: DossierClientSearchResult[]; select: (client: DossierClientSearchResult) => void }) {
  return <div className="relative mt-4"><OperationSearch value={query} onChange={setQuery} placeholder="Nom, téléphone ou email" />{(searching || matches.length > 0) && <div className="mt-2 overflow-hidden rounded-[8px] border border-[#dfe3e7] bg-white">{searching ? <p className="px-4 py-3 text-[13px] text-[#6f7983]">Recherche…</p> : matches.map((client) => <button key={client.id} type="button" onClick={() => select(client)} className="flex w-full items-center justify-between border-b border-[#edf0f2] px-4 py-3 text-left last:border-0 hover:bg-[#f7f9f8]"><span><span className="block text-[13px] font-semibold text-[#30373e]">{client.display_name}</span><span className="mt-0.5 block text-[12px] text-[#77818b]">{client.phone || client.whatsapp_phone || client.email || "Coordonnée non renseignée"}</span></span><ChevronRight size={16} className="text-[#77818b]" /></button>)}</div>}</div>;
}

function plural(value: number, label: string) { return `${value.toLocaleString("fr-FR")} ${label}${value > 1 ? "s" : ""}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatRelative(value: string) { const diff = Date.now() - new Date(value).getTime(); const hours = Math.floor(diff / 3_600_000); if (hours < 1) return "Il y a moins d’une heure"; if (hours < 24) return `Il y a ${hours} h`; const days = Math.floor(hours / 24); if (days < 8) return `Il y a ${days} jour${days > 1 ? "s" : ""}`; return formatDateTime(value); }
function apiError(cause: unknown) { if (!axios.isAxiosError(cause)) return "Une erreur inattendue est survenue."; if (!cause.response) return "Le serveur ne répond pas. Réessayez dans un instant."; const detail = cause.response.data?.detail; if (detail === "stale_dossier_version") return "Ce dossier a été modifié ailleurs. Actualisez la page."; if (detail === "client_not_found") return "Le client sélectionné n’existe plus."; return typeof detail === "string" ? detail : "L’opération n’a pas pu être terminée."; }
function clean(value: FormDataEntryValue | null) { const text = String(value || "").trim(); return text || null; }
