"use client";

import axios from "axios";
import { ArrowLeft, ChevronRight, History, MessageCircle, MoveRight, Plus, RotateCw, Users } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationDrawer, OperationDrawerAction, OperationDrawerTabs } from "@/components/ui/operation-drawer";
import { OperationConfirmDialog } from "@/components/ui/operation-confirm-dialog";
import { OperationButton, OperationStatus, OperationTab } from "@/components/ui/operation-controls";
import { OperationContent } from "@/components/ui/operation-primitives";
import { OperationPageHeader, OperationTabs } from "@/components/ui/operation-page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { usePilotOffline } from "@/components/offline/pilot-offline-provider";
import { newOfflineKey } from "@/services/pilot-offline";
import {
  archiveDossier, attachClientToDossier, createClientInDossier, getDossier, getDossierClientHistory,
  listDossiers, moveDossierClient, removeClientFromDossier, restoreDossier,
  searchDossierClients, updateDossier, updateDossierClientProfile,
  type DossierClientHistoryEvent, type DossierClientRelation, type DossierClientSearchResult,
  type DossierRecord,
} from "@/services/dossiers";

type DetailTab = "overview" | "clients" | "activity";
type ClientMode = "new" | "profile" | "move";
type ClientTab = "record" | "history";
type PendingConfirmation =
  | { kind: "archive" }
  | { kind: "remove"; client: DossierClientRelation }
  | { kind: "move"; client: DossierClientRelation; target: DossierRecord };
const fieldClass = "h-10 w-full rounded-[7px] border border-[#d4d9df] bg-white px-3 text-[13px] text-[#30373e] outline-none transition focus:border-[#12a865] focus:ring-2 focus:ring-[#12c76f]/10";

export function DossierDetailPage({ dossierId }: { dossierId: string }) {
  const { cache, cached, enqueue, online } = usePilotOffline();
  const router = useRouter();
  const [dossier, setDossier] = useState<DossierRecord | null>(null);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [clientMode, setClientMode] = useState<ClientMode>("new");
  const [editingClient, setEditingClient] = useState<DossierClientRelation | null>(null);
  const [viewingClient, setViewingClient] = useState<DossierClientRelation | null>(null);
  const [clientTab, setClientTab] = useState<ClientTab>("record");
  const [clientHistory, setClientHistory] = useState<DossierClientHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [moveQuery, setMoveQuery] = useState("");
  const [moveTargets, setMoveTargets] = useState<DossierRecord[]>([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<DossierClientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [clientSearchError, setClientSearchError] = useState("");
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const current = await getDossier(dossierId, true);
      await cache(`dossier:${dossierId}`, current);
      setDossier(current);
    }
    catch (cause) {
      const stored = await cached<DossierRecord>(`dossier:${dossierId}`);
      if (stored) {
        setDossier(stored);
        setError("Vous consultez la dernière version enregistrée sur cet appareil.");
      } else setError(apiError(cause));
    }
    finally { setLoading(false); }
  }, [cache, cached, dossierId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab !== "clients" || query.trim().length < 2) { setMatches([]); return; }
    setSearching(true);
    const timeout = window.setTimeout(() => searchDossierClients(query.trim(), dossierId)
      .then((items) => setMatches(items.filter((item) => !item.already_attached)))
      .catch(() => setMatches([])).finally(() => setSearching(false)), 250);
    return () => window.clearTimeout(timeout);
  }, [dossierId, query, tab]);
  useEffect(() => {
    if (!clientOpen || clientMode !== "move" || moveQuery.trim().length < 2) { setMoveTargets([]); return; }
    const timeout = window.setTimeout(() => listDossiers({ q: moveQuery.trim(), active_only: true, page_size: 20 })
      .then((result) => setMoveTargets(result.items.filter((item) => item.id !== dossierId)))
      .catch(() => setMoveTargets([])), 250);
    return () => window.clearTimeout(timeout);
  }, [clientMode, clientOpen, dossierId, moveQuery]);

  async function saveDossier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dossier) return;
    setSaving(true); setFormError("");
    const form = new FormData(event.currentTarget);
    const changes = { title: clean(form.get("title")), description: clean(form.get("description")) };
    try {
      if (!online) throw new OfflineUpdateRequested();
      const updated = await updateDossier(dossier.id, {
        row_version: dossier.row_version,
        ...changes,
      });
      await cache(`dossier:${dossierId}`, updated);
      setDossier(updated);
      setEditOpen(false);
    } catch (cause) {
      if (!online || cause instanceof OfflineUpdateRequested || isNetworkError(cause)) {
        await enqueue({
          operation_key: newOfflineKey(`pilot-dossier-update:${dossier.id}`),
          operation_type: "DOSSIER_UPDATE",
          entity_type: "DOSSIER",
          entity_id: dossier.id,
          expected_version: dossier.row_version,
          payload: changes,
        });
        const local = { ...dossier, ...changes, updated_at: new Date().toISOString(), offline_state: "PENDING" as const };
        await cache(`dossier:${dossierId}`, local);
        setDossier(local);
        setEditOpen(false);
        setError("Modification enregistrée sur cet appareil. Elle sera synchronisée au retour du réseau.");
      } else setFormError(apiError(cause));
    }
    finally { setSaving(false); }
  }

  async function attachExisting(client: DossierClientSearchResult) {
    setSaving(true); setClientSearchError("");
    try { await attachClientToDossier(dossierId, client.id); setQuery(""); setMatches([]); await load(); }
    catch (cause) { setClientSearchError(apiError(cause)); }
    finally { setSaving(false); }
  }

  async function saveNewClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setFormError("");
    const form = new FormData(event.currentTarget);
    try {
      const createdClient = await createClientInDossier(dossierId, {
        name: clean(form.get("name")) || "", phone: clean(form.get("phone")) || "",
        email: clean(form.get("email")),
        customer_type: String(form.get("customer_type") || "individual") as "individual" | "business" | "partner",
      });
      setClientOpen(false);
      await load();
      setViewingClient(createdClient);
      setClientTab("record");
    } catch (cause) { setFormError(apiError(cause)); }
    finally { setSaving(false); }
  }

  async function saveClientProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingClient) return;
    const form = new FormData(event.currentTarget);
    setSaving(true); setFormError("");
    try {
      await updateDossierClientProfile(dossierId, editingClient.client_id, {
        client_row_version: editingClient.client_row_version,
        name: clean(form.get("name")) || "",
        phone: clean(form.get("phone")) || "",
        email: clean(form.get("email")),
        customer_type: String(form.get("customer_type") || "individual") as "individual" | "business" | "partner",
      });
      setClientOpen(false); setEditingClient(null); await load();
    } catch (cause) { setFormError(apiError(cause)); }
    finally { setSaving(false); }
  }

  async function moveClient(target: DossierRecord) {
    if (!editingClient) return;
    setConfirmation({ kind: "move", client: editingClient, target });
  }

  function openAddClient() { setClientMode("new"); setEditingClient(null); setFormError(""); setClientOpen(true); }
  function openClient(client: DossierClientRelation) {
    setViewingClient(client); setClientTab("record"); setClientHistory([]); setHistoryLoading(true);
    getDossierClientHistory(dossierId, client.client_id).then(setClientHistory).catch(() => setClientHistory([])).finally(() => setHistoryLoading(false));
  }
  function openClientAction(client: DossierClientRelation, mode: "profile" | "move") {
    setViewingClient(null); setClientMode(mode); setEditingClient(client); setMoveQuery(""); setMoveTargets([]); setFormError(""); setClientOpen(true);
  }

  async function toggleArchive() {
    if (!dossier) return;
    try {
      if (dossier.archived_at) await restoreDossier(dossier.id, dossier.row_version);
      else { setConfirmation({ kind: "archive" }); return; }
      await load();
    } catch (cause) { setError(apiError(cause)); }
  }

  async function confirmPendingAction() {
    if (!dossier || !confirmation) return;
    setConfirming(true);
    try {
      if (confirmation.kind === "archive") {
        await archiveDossier(dossier.id, dossier.row_version);
      } else if (confirmation.kind === "remove") {
        await removeClientFromDossier(dossierId, confirmation.client.client_id, confirmation.client.row_version);
        setViewingClient(null);
      } else {
        await moveDossierClient(dossierId, confirmation.client.client_id, confirmation.target.id, confirmation.client.row_version);
        setClientOpen(false);
        setEditingClient(null);
        setViewingClient(null);
      }
      setConfirmation(null);
      await load();
    } catch (cause) {
      const message = apiError(cause);
      if (confirmation.kind === "move") setFormError(message);
      else setError(message);
      setConfirmation(null);
    } finally { setConfirming(false); }
  }

  if (loading && !dossier) return <LoadingState label="Ouverture du dossier…" />;
  if (error && !dossier) return <ErrorState title="Dossier indisponible" description={error} retry={load} />;
  if (!dossier) return null;

  return <div className="min-h-full bg-[#f7f8f8] text-[#25292e]">
    <OperationPageHeader
      title={dossier.title || dossier.dossier_reference}
      description={dossier.title ? dossier.dossier_reference : "Dossier de suivi"}
      actions={<>
        <OperationButton onClick={() => router.push("/app/dossiers")}><ArrowLeft size={15} /> Tous les dossiers</OperationButton>
        {!dossier.archived_at && <PermissionGuard permission="dossiers.update"><OperationButton onClick={() => { setFormError(""); setEditOpen(true); }}>Modifier</OperationButton></PermissionGuard>}
        <PermissionGuard permission="dossiers.archive"><OperationButton variant={dossier.archived_at ? "secondary" : "danger"} onClick={toggleArchive}>{dossier.archived_at ? "Restaurer" : "Archiver"}</OperationButton></PermissionGuard>
      </>}
    />
    <OperationTabs>
      <OperationTab active={tab === "overview"} onClick={() => setTab("overview")}>Vue d’ensemble</OperationTab>
      <OperationTab active={tab === "clients"} count={dossier.clients?.length || 0} onClick={() => setTab("clients")}>Clients</OperationTab>
      <OperationTab active={tab === "activity"} onClick={() => setTab("activity")}>Communications et suivi</OperationTab>
    </OperationTabs>
    <OperationContent className="mx-auto w-full max-w-[1180px]">
      {error && <div className="mb-4 flex items-center justify-between rounded-[8px] border border-[#efcaca] bg-[#fff5f5] px-4 py-3 text-[13px] text-[#a62b25]"><span>{error}</span><button onClick={load}><RotateCw size={15} /></button></div>}
      {tab === "overview" ? <Overview dossier={dossier} /> : tab === "clients" ? <Clients dossier={dossier} view={openClient} add={openAddClient} query={query} setQuery={setQuery} searching={searching} matches={matches} attach={attachExisting} saving={saving} error={clientSearchError} /> : <Activity dossier={dossier} />}
    </OperationContent>

    <OperationDrawer open={editOpen} close={() => !saving && setEditOpen(false)} title="Modifier le dossier" description="Mettez à jour uniquement les informations communes au dossier." width="max-w-[620px]" footer={<><OperationButton disabled={saving} onClick={() => setEditOpen(false)}>Annuler</OperationButton><OperationButton variant="primary" type="submit" form="edit-pilot-dossier" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</OperationButton></>}>
      <form id="edit-pilot-dossier" onSubmit={saveDossier} className="grid gap-5"><Field label="Nom ou objet du dossier"><input name="title" defaultValue={dossier.title || ""} maxLength={180} className={fieldClass} /></Field><Field label="Contexte"><textarea name="description" defaultValue={dossier.description || ""} rows={6} maxLength={3000} className={`${fieldClass} h-auto py-2.5`} /></Field>{formError && <FormError text={formError} />}</form>
    </OperationDrawer>

    <OperationDrawer open={clientOpen} close={() => !saving && setClientOpen(false)} title={clientMode === "profile" ? "Modifier les coordonnées" : clientMode === "move" ? "Déplacer vers un autre dossier" : "Nouveau client"} description={editingClient?.display_name || "Créez la fiche avec les informations essentielles communiquées par le client."} width="max-w-[640px]" footer={clientMode === "new" ? <><OperationButton disabled={saving} onClick={() => setClientOpen(false)}>Annuler</OperationButton><OperationButton variant="primary" type="submit" form="new-dossier-client" disabled={saving}>{saving ? "Ajout…" : "Créer et ajouter"}</OperationButton></> : clientMode === "profile" ? <><OperationButton disabled={saving} onClick={() => setClientOpen(false)}>Annuler</OperationButton><OperationButton variant="primary" type="submit" form="edit-client-profile" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</OperationButton></> : undefined}>
      {clientMode === "new" ? <NewClientForm submit={saveNewClient} error={formError} /> : clientMode === "profile" && editingClient ? <ClientProfileForm client={editingClient} submit={saveClientProfile} error={formError} /> : clientMode === "move" && editingClient ? <MoveClientForm query={moveQuery} setQuery={setMoveQuery} targets={moveTargets} move={moveClient} saving={saving} error={formError} /> : null}
    </OperationDrawer>

    <OperationDrawer open={Boolean(viewingClient)} close={() => setViewingClient(null)} title={viewingClient?.display_name || "Client"} description={viewingClient?.client_reference} width="max-w-[720px]" tabs={<OperationDrawerTabs items={[{ key: "record", label: "Fiche" }, { key: "history", label: "Historique", count: clientHistory.length }]} value={clientTab} onChange={(value) => setClientTab(value as ClientTab)} />} headerActions={viewingClient && !dossier.archived_at ? <PermissionGuard permission="dossiers.clients.manage"><OperationDrawerAction icon="edit" onClick={() => openClientAction(viewingClient, "profile")}>Modifier</OperationDrawerAction><OperationDrawerAction icon={<MoveRight size={15} />} onClick={() => openClientAction(viewingClient, "move")}>Déplacer</OperationDrawerAction></PermissionGuard> : undefined}>
      {viewingClient && clientTab === "record" && <ClientRecord client={viewingClient} />}
      {viewingClient && clientTab === "history" && <ClientHistory items={clientHistory} loading={historyLoading} />}
      {viewingClient && !dossier.archived_at && <PermissionGuard permission="dossiers.clients.manage"><div className="mt-8 border-t border-[#e7eaed] pt-5"><OperationDrawerAction intent="danger" onClick={() => setConfirmation({ kind: "remove", client: viewingClient })}>Retirer cette personne du dossier</OperationDrawerAction></div></PermissionGuard>}
    </OperationDrawer>

    <OperationConfirmDialog
      open={Boolean(confirmation)}
      title={confirmationTitle(confirmation)}
      description={confirmationDescription(confirmation)}
      confirmLabel={confirmationLabel(confirmation)}
      busy={confirming}
      close={() => !confirming && setConfirmation(null)}
      confirm={confirmPendingAction}
    />
  </div>;
}

function Overview({ dossier }: { dossier: DossierRecord }) {
  return <div className="grid gap-5 lg:grid-cols-[1.4fr_.8fr]"><section className="rounded-[10px] border border-[#e0e4e7] bg-white p-6"><h2 className="text-[16px] font-semibold">Résumé du dossier</h2><p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-[#59656f]">{dossier.description || "Aucun contexte n’a encore été ajouté."}</p><dl className="mt-6 grid gap-5 border-t border-[#edf0f2] pt-5 sm:grid-cols-2"><Info label="Référence" value={dossier.dossier_reference} /><Info label="Créé le" value={formatDateTime(dossier.created_at)} /><Info label="Dernière modification" value={formatDateTime(dossier.updated_at || dossier.created_at)} /></dl></section><aside className="grid content-start gap-4"><SummaryCard label="Clients rattachés" value={String(dossier.clients?.length || 0)} icon={<Users size={18} />} /><SummaryCard label="Clients à traiter" value={String((dossier.clients || []).filter((client) => client.attention_required).length)} tone="warning" icon={<MessageCircle size={18} />} /></aside></div>;
}

function Clients({ dossier, view, add, query, setQuery, searching, matches, attach, saving, error }: { dossier: DossierRecord; view: (client: DossierClientRelation) => void; add: () => void; query: string; setQuery: (value: string) => void; searching: boolean; matches: DossierClientSearchResult[]; attach: (client: DossierClientSearchResult) => void; saving: boolean; error: string }) {
  const clients = dossier.clients || [];
  return <div className="grid gap-4">
    <section className="relative rounded-[10px] border border-[#e0e4e7] bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1"><Field label="Rechercher et rattacher un client existant"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, téléphone ou email" className={fieldClass} /></Field></div>
        <OperationButton variant="primary" onClick={add}><Plus size={15} /> Nouveau client</OperationButton>
      </div>
      {searching && <p className="mt-3 text-[13px] text-[#6f7983]">Recherche…</p>}
      {query.trim().length >= 2 && !searching && <div className="absolute left-4 right-4 top-[86px] z-20 overflow-hidden rounded-[8px] border border-[#d9dee2] bg-white shadow-[0_14px_36px_rgba(15,23,42,.14)]">
        {matches.length ? matches.map((client) => <button key={client.id} type="button" disabled={saving} onClick={() => attach(client)} className="flex min-h-[58px] w-full items-center justify-between gap-4 border-b border-[#edf0f2] px-4 py-3 text-left last:border-0 hover:bg-[#f7f9f8]"><span className="min-w-0"><span className="block truncate text-[13px] font-semibold">{client.display_name}</span><span className="mt-0.5 block truncate text-[12px] text-[#78828c]">{client.client_reference} · {client.phone || client.email || "Coordonnée non renseignée"}</span></span><span className="text-[12px] font-semibold text-[#087a46]">Rattacher</span></button>) : <p className="px-4 py-4 text-center text-[13px] text-[#707b85]">Aucun client correspondant. Utilisez « Nouveau client » pour créer sa fiche.</p>}
      </div>}
      {error && <div className="mt-3"><FormError text={error} /></div>}
    </section>
    {clients.length ? <div className="overflow-hidden rounded-[10px] border border-[#e0e4e7] bg-white"><div className="hidden grid-cols-[1.4fr_1fr_1fr_150px_40px] gap-4 border-b border-[#e4e8eb] bg-[#fafbfb] px-5 py-3 text-[12px] font-semibold text-[#69747e] md:grid"><span>Client</span><span>Contact</span><span>Type de client</span><span>Dernière mise à jour</span><span /></div>{clients.map((client) => <button key={client.relation_id} onClick={() => view(client)} className="grid w-full gap-3 border-b border-[#edf0f2] px-5 py-4 text-left last:border-0 hover:bg-[#f8faf9] md:grid-cols-[1.4fr_1fr_1fr_150px_40px] md:items-center md:gap-4"><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="truncate text-[14px] font-semibold text-[#293038]">{client.display_name}</span>{client.relationship_role === "PRIMARY" && <OperationStatus label="Principal" tone="info" />}{client.attention_required && <OperationStatus label="À traiter" tone="warning" />}</span><span className="mt-1 block text-[12px] text-[#78828c]">{client.client_reference}</span></span><span className="truncate text-[13px] text-[#4d5963]">{client.phone || client.whatsapp_phone || client.email || "Non renseigné"}</span><span className="truncate text-[13px] text-[#4d5963]">{pilotClientTypeLabel(client.customer_type)}</span><span className="text-[12px] text-[#74808a]">{formatDateTime(client.last_updated_at)}</span><span className="grid h-8 w-8 place-items-center rounded-[6px] text-[#63707a]"><ChevronRight size={17} /></span></button>)}</div> : <div className="rounded-[10px] border border-[#e0e4e7] bg-white"><EmptyState title="Aucun client rattaché" description="Recherchez une personne existante ci-dessus ou créez un nouveau client." action={<OperationButton variant="primary" onClick={add}>Nouveau client</OperationButton>} /></div>}
  </div>;
}

function Activity({ dossier }: { dossier: DossierRecord }) {
  const messages = dossier.messages || [];
  const followups = dossier.followups || [];
  return <div className="grid gap-5 lg:grid-cols-2"><ActivitySection title="Communications récentes" empty="Aucune communication enregistrée.">{messages.map((message) => <ActivityItem key={message.id} title={message.sender_phone || "Conversation"} text={message.message_text || "Message sans texte"} date={message.created_at} />)}</ActivitySection><ActivitySection title="Relances" empty="Aucune relance liée à ce dossier.">{followups.map((followup) => <ActivityItem key={followup.id} title={followup.reason || "Relance client"} text={followup.message} date={followup.updated_at || followup.created_at} status={followupLabel(followup.status)} />)}</ActivitySection></div>;
}

function NewClientForm({ submit, error }: { submit: (event: FormEvent<HTMLFormElement>) => void; error: string }) { return <form id="new-dossier-client" onSubmit={submit} className="grid gap-5"><div className="rounded-[8px] bg-[#f3f6f5] px-4 py-3 text-[12px] leading-5 text-[#617069]">L’identifiant client sera généré automatiquement après la création.</div><Field label="Nom complet"><input required autoFocus name="name" autoComplete="name" placeholder="Ex. Jérémie Bawaba" className={fieldClass} /></Field><Field label="Téléphone"><input required name="phone" inputMode="tel" autoComplete="tel" placeholder="Ex. +243 970 000 000" className={fieldClass} /></Field><Field label="Email — facultatif"><input name="email" type="email" autoComplete="email" placeholder="Ex. jeremie@email.com" className={fieldClass} /></Field><Field label="Type de client"><select required name="customer_type" defaultValue="individual" className={fieldClass}><option value="individual">Particulier</option><option value="business">Entreprise</option><option value="partner">Partenaire</option></select></Field>{error && <FormError text={error} />}</form>; }

function ClientProfileForm({ client, submit, error }: { client: DossierClientRelation; submit: (event: FormEvent<HTMLFormElement>) => void; error: string }) { return <form id="edit-client-profile" onSubmit={submit} className="grid gap-5"><div className="rounded-[8px] bg-[#f3f6f5] px-4 py-3 text-[12px] leading-5 text-[#617069]">Ces coordonnées appartiennent à la fiche unique du client.</div><Field label="Identifiant client"><input value={client.client_reference} readOnly className={`${fieldClass} bg-[#f5f7f6] text-[#68737d]`} /></Field><Field label="Nom complet"><input required name="name" defaultValue={client.name || client.display_name} className={fieldClass} /></Field><Field label="Téléphone"><input required name="phone" inputMode="tel" defaultValue={client.phone || client.whatsapp_phone || ""} className={fieldClass} /></Field><Field label="Email — facultatif"><input name="email" type="email" defaultValue={client.email || ""} className={fieldClass} /></Field><Field label="Type de client"><select required name="customer_type" defaultValue={client.customer_type || "individual"} className={fieldClass}><option value="individual">Particulier</option><option value="business">Entreprise</option><option value="partner">Partenaire</option></select></Field>{error && <FormError text={error} />}</form>; }

function MoveClientForm({ query, setQuery, targets, move, saving, error }: { query: string; setQuery: (value: string) => void; targets: DossierRecord[]; move: (target: DossierRecord) => void; saving: boolean; error: string }) { return <div className="grid gap-4"><div className="rounded-[8px] bg-[#fff7e8] px-4 py-3 text-[12px] leading-5 text-[#76541d]">La personne sera retirée de ce dossier puis rattachée au dossier choisi. Son historique actuel restera conservé.</div><Field label="Rechercher le dossier de destination"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom ou référence du dossier" className={fieldClass} /></Field><div className="overflow-hidden rounded-[8px] border border-[#e0e4e7]">{targets.map((target) => <button key={target.id} disabled={saving} onClick={() => move(target)} className="flex w-full items-center justify-between border-b border-[#edf0f2] px-4 py-3.5 text-left last:border-0 hover:bg-[#f7f9f8]"><span><span className="block text-[13px] font-semibold">{target.title || target.dossier_reference}</span><span className="mt-0.5 block text-[12px] text-[#78828c]">{target.dossier_reference} · {target.client_count || 0} client(s)</span></span><ChevronRight size={16} /></button>)}{query.length >= 2 && !targets.length && <p className="p-4 text-center text-[13px] text-[#707b85]">Aucun autre dossier correspondant.</p>}</div>{error && <FormError text={error} />}</div>; }

function ClientRecord({ client }: { client: DossierClientRelation }) { return <section><h3 className="text-[15px] font-semibold">Fiche client</h3><dl className="mt-4 grid gap-5 sm:grid-cols-2"><Info label="Identifiant client" value={client.client_reference} /><Info label="Nom complet" value={client.name || client.display_name} /><Info label="Téléphone" value={client.phone || client.whatsapp_phone || "Non renseigné"} /><Info label="Email" value={client.email || "Non renseigné"} /><Info label="Type de client" value={pilotClientTypeLabel(client.customer_type)} /></dl></section>; }

function ClientHistory({ items, loading }: { items: DossierClientHistoryEvent[]; loading: boolean }) { if (loading) return <LoadingState label="Chargement de l’historique…" />; if (!items.length) return <EmptyState title="Aucun historique" description="Les prochaines modifications apparaîtront ici." />; return <div className="grid gap-0">{items.map((item) => <div key={item.id} className="flex gap-3 border-b border-[#edf0f2] py-4 last:border-0"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#edf8f2] text-[#087a46]"><History size={15} /></span><div><p className="text-[13px] font-semibold text-[#30373e]">{historyLabel(item.event_type)}</p><p className="mt-1 text-[12px] text-[#78828c]">{formatDateTime(item.created_at)}</p></div></div>)}</div>; }

function ActivitySection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) { const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children); return <section className="rounded-[10px] border border-[#e0e4e7] bg-white"><header className="border-b border-[#e8ebed] px-5 py-4"><h2 className="text-[15px] font-semibold">{title}</h2></header><div className="divide-y divide-[#edf0f2]">{hasChildren ? children : <p className="p-6 text-center text-[13px] text-[#75808a]">{empty}</p>}</div></section>; }
function ActivityItem({ title, text, date, status }: { title: string; text: string; date: string; status?: string }) { return <article className="p-4"><div className="flex items-start justify-between gap-3"><p className="text-[13px] font-semibold">{title}</p>{status && <OperationStatus label={status} />}</div><p className="mt-1.5 line-clamp-3 text-[13px] leading-5 text-[#626e78]">{text}</p><p className="mt-2 text-[11px] text-[#89929b]">{formatDateTime(date)}</p></article>; }
function SummaryCard({ label, value, icon, tone }: { label: string; value: string; icon: ReactNode; tone?: "warning" }) { return <div className={`rounded-[10px] border bg-white p-5 ${tone ? "border-[#f0d6a9]" : "border-[#e0e4e7]"}`}><div className={`grid h-9 w-9 place-items-center rounded-[8px] ${tone ? "bg-[#fff4df] text-[#9b5c00]" : "bg-[#edf8f2] text-[#087a46]"}`}>{icon}</div><p className="mt-4 text-[12px] font-medium text-[#727d87]">{label}</p><p className="mt-1 text-[26px] font-semibold tracking-[-0.03em]">{value}</p></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2"><span className="text-[13px] font-semibold text-[#414950]">{label}</span>{children}</label>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-[12px] font-medium text-[#78828c]">{label}</dt><dd className="mt-1 text-[13px] font-medium text-[#30373e]">{value}</dd></div>; }
function FormError({ text }: { text: string }) { return <p className="rounded-[7px] bg-[#fff2f2] px-3 py-2.5 text-[13px] text-[#a62b25]">{text}</p>; }
function clean(value: FormDataEntryValue | null) { const text = String(value || "").trim(); return text || null; }
class OfflineUpdateRequested extends Error {}
function isNetworkError(cause: unknown) { return axios.isAxiosError(cause) && !cause.response; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function followupLabel(value: string) { return ({ DUE: "À envoyer", SCHEDULED: "Programmée", SENT: "Envoyée", RESPONDED: "Réponse reçue", COMPLETED: "Terminée", FAILED: "Échec" } as Record<string, string>)[value] || "En cours"; }
function pilotClientTypeLabel(value?: string | null) { return ({ individual: "Particulier", business: "Entreprise", partner: "Partenaire" } as Record<string, string>)[String(value)] || "Particulier"; }
function confirmationTitle(action: PendingConfirmation | null) { if (action?.kind === "archive") return "Archiver ce dossier ?"; if (action?.kind === "remove") return "Retirer ce client du dossier ?"; if (action?.kind === "move") return "Déplacer ce client ?"; return "Confirmer l’action"; }
function confirmationDescription(action: PendingConfirmation | null) { if (action?.kind === "archive") return "Le dossier quittera les dossiers actifs, mais son historique et ses clients resteront consultables dans les archives."; if (action?.kind === "remove") return `${action.client.display_name} ne sera plus rattaché à ce dossier. Sa fiche client et l’historique de cette relation seront conservés.`; if (action?.kind === "move") return `${action.client.display_name} sera retiré de ce dossier puis rattaché à ${action.target.title || action.target.dossier_reference}. Son historique restera conservé.`; return "Vérifiez cette action avant de continuer."; }
function confirmationLabel(action: PendingConfirmation | null) { if (action?.kind === "archive") return "Archiver le dossier"; if (action?.kind === "remove") return "Retirer le client"; if (action?.kind === "move") return "Déplacer le client"; return "Confirmer"; }
function historyLabel(value: string) { return ({ CLIENT_ATTACHED: "Client ajouté au dossier", CLIENT_RELATION_UPDATED: "Situation mise à jour", CLIENT_REMOVED: "Client retiré du dossier", CLIENT_RESTORED: "Client restauré dans le dossier" } as Record<string, string>)[value] || "Fiche client mise à jour"; }
function apiError(cause: unknown) { if (!axios.isAxiosError(cause)) return "Une erreur inattendue est survenue."; if (!cause.response) return "Le serveur ne répond pas."; const detail = cause.response.data?.detail; if (typeof detail === "object" && detail?.code === "duplicate_client") return "Ce client existe déjà. Recherchez-le puis rattachez-le au dossier."; const labels: Record<string, string> = { dossier_not_found: "Ce dossier n’existe plus.", target_dossier_not_found: "Le dossier de destination n’est plus disponible.", duplicate_client: "Un autre client utilise déjà ce téléphone ou cet email.", attention_reason_required: "Expliquez pourquoi cette personne demande une attention.", stale_dossier_version: "Le dossier a été modifié ailleurs. Actualisez la page.", stale_client_version: "La fiche client a été modifiée ailleurs. Actualisez la page.", stale_dossier_client_version: "La situation a été modifiée ailleurs. Actualisez la page.", client_already_in_target_dossier: "Cette personne est déjà présente dans le dossier choisi.", invalid_dossier_assignee: "Le responsable sélectionné n’est plus disponible." }; return labels[String(detail)] || (typeof detail === "string" ? detail : "L’opération n’a pas pu être terminée."); }
