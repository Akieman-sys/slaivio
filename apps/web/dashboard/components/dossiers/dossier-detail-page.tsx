"use client";

import axios from "axios";
import { ArrowLeft, ChevronRight, History, MessageCircle, MoveRight, Pencil, Plus, RotateCw, Users } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationDrawer, OperationDrawerAction, OperationDrawerTabs } from "@/components/ui/operation-drawer";
import { OperationButton, OperationStatus, OperationTab } from "@/components/ui/operation-controls";
import { OperationContent } from "@/components/ui/operation-primitives";
import { OperationPageHeader, OperationTabs } from "@/components/ui/operation-page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import {
  archiveDossier, attachClientToDossier, createClientInDossier, getDossier, getDossierClientHistory,
  listDossierMembers, listDossiers, moveDossierClient, removeClientFromDossier, restoreDossier,
  searchDossierClients, updateDossier, updateDossierClientProfile, updateDossierClientRelation,
  type DossierClientHistoryEvent, type DossierClientRelation, type DossierClientSearchResult,
  type DossierMember, type DossierRecord,
} from "@/services/dossiers";

type DetailTab = "overview" | "clients" | "activity";
type ClientMode = "existing" | "new" | "relation" | "profile" | "move";
type ClientTab = "record" | "situation" | "history";
const fieldClass = "h-10 w-full rounded-[7px] border border-[#d4d9df] bg-white px-3 text-[13px] text-[#30373e] outline-none transition focus:border-[#12a865] focus:ring-2 focus:ring-[#12c76f]/10";

export function DossierDetailPage({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const [dossier, setDossier] = useState<DossierRecord | null>(null);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [clientMode, setClientMode] = useState<ClientMode>("existing");
  const [editingClient, setEditingClient] = useState<DossierClientRelation | null>(null);
  const [viewingClient, setViewingClient] = useState<DossierClientRelation | null>(null);
  const [clientTab, setClientTab] = useState<ClientTab>("record");
  const [clientHistory, setClientHistory] = useState<DossierClientHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [moveQuery, setMoveQuery] = useState("");
  const [moveTargets, setMoveTargets] = useState<DossierRecord[]>([]);
  const [members, setMembers] = useState<DossierMember[]>([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<DossierClientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setDossier(await getDossier(dossierId, true)); }
    catch (cause) { setError(apiError(cause)); }
    finally { setLoading(false); }
  }, [dossierId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { listDossierMembers().then(setMembers).catch(() => setMembers([])); }, []);
  useEffect(() => {
    if (!clientOpen || clientMode !== "existing" || query.trim().length < 2) { setMatches([]); return; }
    setSearching(true);
    const timeout = window.setTimeout(() => searchDossierClients(query.trim(), dossierId)
      .then((items) => setMatches(items.filter((item) => !item.already_attached)))
      .catch(() => setMatches([])).finally(() => setSearching(false)), 250);
    return () => window.clearTimeout(timeout);
  }, [clientMode, clientOpen, dossierId, query]);
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
    try {
      setDossier(await updateDossier(dossier.id, {
        row_version: dossier.row_version,
        title: clean(form.get("title")), description: clean(form.get("description")),
        assigned_to: clean(form.get("assigned_to")),
      }));
      setEditOpen(false);
    } catch (cause) { setFormError(apiError(cause)); }
    finally { setSaving(false); }
  }

  async function attachExisting(client: DossierClientSearchResult) {
    setSaving(true); setFormError("");
    try { await attachClientToDossier(dossierId, client.id); setClientOpen(false); setQuery(""); await load(); }
    catch (cause) { setFormError(apiError(cause)); }
    finally { setSaving(false); }
  }

  async function saveNewClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setFormError("");
    const form = new FormData(event.currentTarget);
    try {
      await createClientInDossier(dossierId, {
        name: clean(form.get("name")), company_name: clean(form.get("company_name")),
        phone: clean(form.get("phone")), whatsapp_phone: clean(form.get("whatsapp_phone")),
        email: clean(form.get("email")), customer_type: clean(form.get("customer_type")),
        lifecycle_status: clean(form.get("lifecycle_status")), preferred_language: clean(form.get("preferred_language")),
        situation: clean(form.get("situation")),
      });
      setClientOpen(false); await load();
    } catch (cause) { setFormError(apiError(cause)); }
    finally { setSaving(false); }
  }

  async function saveClientRelation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingClient) return;
    setSaving(true); setFormError("");
    const form = new FormData(event.currentTarget);
    const attention = form.get("attention_required") === "on";
    try {
      await updateDossierClientRelation(dossierId, editingClient.client_id, {
        row_version: editingClient.row_version, situation: clean(form.get("situation")),
        attention_required: attention, attention_reason: attention ? clean(form.get("attention_reason")) : null,
        make_primary: form.get("make_primary") === "on",
      });
      setClientOpen(false); setEditingClient(null); await load();
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
        name: clean(form.get("name")), company_name: clean(form.get("company_name")),
        phone: clean(form.get("phone")), whatsapp_phone: clean(form.get("whatsapp_phone")),
        email: clean(form.get("email")), customer_type: clean(form.get("customer_type")),
        lifecycle_status: clean(form.get("lifecycle_status")), preferred_language: clean(form.get("preferred_language")),
      });
      setClientOpen(false); setEditingClient(null); await load();
    } catch (cause) { setFormError(apiError(cause)); }
    finally { setSaving(false); }
  }

  async function moveClient(target: DossierRecord) {
    if (!editingClient) return;
    if (!window.confirm(`Déplacer ${editingClient.display_name} vers ${target.title || target.dossier_reference} ?`)) return;
    setSaving(true); setFormError("");
    try {
      await moveDossierClient(dossierId, editingClient.client_id, target.id, editingClient.row_version);
      setClientOpen(false); setEditingClient(null); setViewingClient(null); await load();
    } catch (cause) { setFormError(apiError(cause)); }
    finally { setSaving(false); }
  }

  async function removeClient(client: DossierClientRelation) {
    if (!window.confirm(`Retirer ${client.display_name} de ce dossier ?`)) return;
    try { await removeClientFromDossier(dossierId, client.client_id, client.row_version); await load(); }
    catch (cause) { setError(apiError(cause)); }
  }

  function openAddClient() { setClientMode("existing"); setEditingClient(null); setQuery(""); setMatches([]); setFormError(""); setClientOpen(true); }
  function openClient(client: DossierClientRelation) {
    setViewingClient(client); setClientTab("record"); setClientHistory([]); setHistoryLoading(true);
    getDossierClientHistory(dossierId, client.client_id).then(setClientHistory).catch(() => setClientHistory([])).finally(() => setHistoryLoading(false));
  }
  function openClientAction(client: DossierClientRelation, mode: "profile" | "relation" | "move") {
    setViewingClient(null); setClientMode(mode); setEditingClient(client); setMoveQuery(""); setMoveTargets([]); setFormError(""); setClientOpen(true);
  }

  async function toggleArchive() {
    if (!dossier) return;
    try {
      if (dossier.archived_at) await restoreDossier(dossier.id, dossier.row_version);
      else {
        if (!window.confirm("Archiver ce dossier ? Son historique restera consultable.")) return;
        await archiveDossier(dossier.id, dossier.row_version);
      }
      await load();
    } catch (cause) { setError(apiError(cause)); }
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
        {!dossier.archived_at && <PermissionGuard permission="dossiers.clients.manage"><OperationButton variant="primary" onClick={openAddClient}><Plus size={15} /> Ajouter un client</OperationButton></PermissionGuard>}
      </>}
    />
    <OperationTabs>
      <OperationTab active={tab === "overview"} onClick={() => setTab("overview")}>Vue d’ensemble</OperationTab>
      <OperationTab active={tab === "clients"} count={dossier.clients?.length || 0} onClick={() => setTab("clients")}>Clients</OperationTab>
      <OperationTab active={tab === "activity"} onClick={() => setTab("activity")}>Communications et suivi</OperationTab>
    </OperationTabs>
    <OperationContent className="mx-auto w-full max-w-[1180px]">
      {error && <div className="mb-4 flex items-center justify-between rounded-[8px] border border-[#efcaca] bg-[#fff5f5] px-4 py-3 text-[13px] text-[#a62b25]"><span>{error}</span><button onClick={load}><RotateCw size={15} /></button></div>}
      {tab === "overview" ? <Overview dossier={dossier} /> : tab === "clients" ? <Clients dossier={dossier} view={openClient} add={openAddClient} /> : <Activity dossier={dossier} />}
    </OperationContent>

    <OperationDrawer open={editOpen} close={() => !saving && setEditOpen(false)} title="Modifier le dossier" description="Mettez à jour uniquement les informations communes au dossier." width="max-w-[620px]" footer={<><OperationButton disabled={saving} onClick={() => setEditOpen(false)}>Annuler</OperationButton><OperationButton variant="primary" type="submit" form="edit-pilot-dossier" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</OperationButton></>}>
      <form id="edit-pilot-dossier" onSubmit={saveDossier} className="grid gap-5"><Field label="Nom ou objet du dossier"><input name="title" defaultValue={dossier.title || ""} maxLength={180} className={fieldClass} /></Field><Field label="Contexte"><textarea name="description" defaultValue={dossier.description || ""} rows={6} maxLength={3000} className={`${fieldClass} h-auto py-2.5`} /></Field><Field label="Responsable"><select name="assigned_to" defaultValue={dossier.assigned_to || ""} className={fieldClass}><option value="">Non attribué</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}</select></Field>{formError && <FormError text={formError} />}</form>
    </OperationDrawer>

    <OperationDrawer open={clientOpen} close={() => !saving && setClientOpen(false)} title={clientMode === "profile" ? "Modifier les coordonnées" : clientMode === "relation" ? "Mettre à jour la situation" : clientMode === "move" ? "Déplacer vers un autre dossier" : "Ajouter un client"} description={editingClient?.display_name || "Recherchez une personne existante ou créez une nouvelle fiche."} width="max-w-[640px]" footer={clientMode === "new" ? <><OperationButton disabled={saving} onClick={() => setClientOpen(false)}>Annuler</OperationButton><OperationButton variant="primary" type="submit" form="new-dossier-client" disabled={saving}>{saving ? "Ajout…" : "Créer et ajouter"}</OperationButton></> : clientMode === "profile" ? <><OperationButton disabled={saving} onClick={() => setClientOpen(false)}>Annuler</OperationButton><OperationButton variant="primary" type="submit" form="edit-client-profile" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</OperationButton></> : clientMode === "relation" ? <><OperationButton disabled={saving} onClick={() => setClientOpen(false)}>Annuler</OperationButton><OperationButton variant="primary" type="submit" form="edit-dossier-client" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</OperationButton></> : undefined}>
      {clientMode === "existing" ? <ExistingClientSearch query={query} setQuery={setQuery} searching={searching} matches={matches} select={attachExisting} create={() => setClientMode("new")} error={formError} /> : clientMode === "new" ? <NewClientForm submit={saveNewClient} error={formError} /> : clientMode === "profile" && editingClient ? <ClientProfileForm client={editingClient} submit={saveClientProfile} error={formError} /> : clientMode === "relation" && editingClient ? <EditClientForm client={editingClient} submit={saveClientRelation} error={formError} /> : clientMode === "move" && editingClient ? <MoveClientForm query={moveQuery} setQuery={setMoveQuery} targets={moveTargets} move={moveClient} saving={saving} error={formError} /> : null}
    </OperationDrawer>

    <OperationDrawer open={Boolean(viewingClient)} close={() => setViewingClient(null)} title={viewingClient?.display_name || "Client"} description={viewingClient?.client_reference} width="max-w-[720px]" tabs={<OperationDrawerTabs items={[{ key: "record", label: "Fiche" }, { key: "situation", label: "Situation" }, { key: "history", label: "Historique", count: clientHistory.length }]} value={clientTab} onChange={(value) => setClientTab(value as ClientTab)} />} headerActions={viewingClient && !dossier.archived_at ? <PermissionGuard permission="dossiers.clients.manage"><OperationDrawerAction icon="edit" onClick={() => openClientAction(viewingClient, "profile")}>Modifier</OperationDrawerAction><OperationDrawerAction icon={<MoveRight size={15} />} onClick={() => openClientAction(viewingClient, "move")}>Déplacer</OperationDrawerAction></PermissionGuard> : undefined}>
      {viewingClient && clientTab === "record" && <ClientRecord client={viewingClient} />}
      {viewingClient && clientTab === "situation" && <ClientSituation client={viewingClient} edit={() => openClientAction(viewingClient, "relation")} readonly={Boolean(dossier.archived_at)} />}
      {viewingClient && clientTab === "history" && <ClientHistory items={clientHistory} loading={historyLoading} />}
      {viewingClient && !dossier.archived_at && <PermissionGuard permission="dossiers.clients.manage"><div className="mt-8 border-t border-[#e7eaed] pt-5"><button className="text-[13px] font-semibold text-[#a62b25]" onClick={async () => { await removeClient(viewingClient); setViewingClient(null); }}>Retirer cette personne du dossier</button></div></PermissionGuard>}
    </OperationDrawer>
  </div>;
}

function Overview({ dossier }: { dossier: DossierRecord }) {
  return <div className="grid gap-5 lg:grid-cols-[1.4fr_.8fr]"><section className="rounded-[10px] border border-[#e0e4e7] bg-white p-6"><h2 className="text-[16px] font-semibold">Résumé du dossier</h2><p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-[#59656f]">{dossier.description || "Aucun contexte n’a encore été ajouté."}</p><dl className="mt-6 grid gap-5 border-t border-[#edf0f2] pt-5 sm:grid-cols-2"><Info label="Référence" value={dossier.dossier_reference} /><Info label="Responsable" value={dossier.assigned_to || "Non attribué"} /><Info label="Créé le" value={formatDateTime(dossier.created_at)} /><Info label="Dernière modification" value={formatDateTime(dossier.updated_at || dossier.created_at)} /></dl></section><aside className="grid content-start gap-4"><SummaryCard label="Clients rattachés" value={String(dossier.clients?.length || 0)} icon={<Users size={18} />} /><SummaryCard label="Clients à traiter" value={String((dossier.clients || []).filter((client) => client.attention_required).length)} tone="warning" icon={<MessageCircle size={18} />} /></aside></div>;
}

function Clients({ dossier, view, add }: { dossier: DossierRecord; view: (client: DossierClientRelation) => void; add: () => void }) {
  const clients = dossier.clients || [];
  if (!clients.length) return <EmptyState title="Aucun client rattaché" description="Ajoutez les personnes concernées par ce dossier." action={<OperationButton variant="primary" onClick={add}>Ajouter un client</OperationButton>} />;
  return <div className="overflow-hidden rounded-[10px] border border-[#e0e4e7] bg-white"><div className="hidden grid-cols-[1.4fr_1fr_1.4fr_150px_40px] gap-4 border-b border-[#e4e8eb] bg-[#fafbfb] px-5 py-3 text-[12px] font-semibold text-[#69747e] md:grid"><span>Client</span><span>Contact</span><span>Situation</span><span>Dernière mise à jour</span><span /></div>{clients.map((client) => <button key={client.relation_id} onClick={() => view(client)} className="grid w-full gap-3 border-b border-[#edf0f2] px-5 py-4 text-left last:border-0 hover:bg-[#f8faf9] md:grid-cols-[1.4fr_1fr_1.4fr_150px_40px] md:items-center md:gap-4"><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="truncate text-[14px] font-semibold text-[#293038]">{client.display_name}</span>{client.relationship_role === "PRIMARY" && <OperationStatus label="Principal" tone="info" />}{client.attention_required && <OperationStatus label="À traiter" tone="warning" />}</span><span className="mt-1 block text-[12px] text-[#78828c]">{client.client_reference}</span></span><span className="truncate text-[13px] text-[#4d5963]">{client.phone || client.whatsapp_phone || client.email || "Non renseigné"}</span><span className="truncate text-[13px] text-[#4d5963]">{client.situation || "Non renseignée"}</span><span className="text-[12px] text-[#74808a]">{formatDateTime(client.last_updated_at)}</span><span className="grid h-8 w-8 place-items-center rounded-[6px] text-[#63707a]"><ChevronRight size={17} /></span></button>)}</div>;
}

function Activity({ dossier }: { dossier: DossierRecord }) {
  const messages = dossier.messages || [];
  const followups = dossier.followups || [];
  return <div className="grid gap-5 lg:grid-cols-2"><ActivitySection title="Communications récentes" empty="Aucune communication enregistrée.">{messages.map((message) => <ActivityItem key={message.id} title={message.sender_phone || "Conversation"} text={message.message_text || "Message sans texte"} date={message.created_at} />)}</ActivitySection><ActivitySection title="Relances" empty="Aucune relance liée à ce dossier.">{followups.map((followup) => <ActivityItem key={followup.id} title={followup.reason || "Relance client"} text={followup.message} date={followup.updated_at || followup.created_at} status={followupLabel(followup.status)} />)}</ActivitySection></div>;
}

function ExistingClientSearch({ query, setQuery, searching, matches, select, create, error }: { query: string; setQuery: (value: string) => void; searching: boolean; matches: DossierClientSearchResult[]; select: (client: DossierClientSearchResult) => void; create: () => void; error: string }) { return <div className="grid gap-4"><Field label="Rechercher un client"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, téléphone, WhatsApp ou email" className={fieldClass} /></Field>{searching && <p className="text-[13px] text-[#6f7983]">Recherche…</p>}<div className="overflow-hidden rounded-[8px] border border-[#e0e4e7]">{matches.map((client) => <button key={client.id} disabled={searching} onClick={() => select(client)} className="flex w-full items-center justify-between border-b border-[#edf0f2] px-4 py-3.5 text-left last:border-0 hover:bg-[#f7f9f8]"><span><span className="block text-[13px] font-semibold">{client.display_name}</span><span className="mt-0.5 block text-[12px] text-[#78828c]">{client.phone || client.whatsapp_phone || client.email || client.client_reference}</span></span><ChevronRight size={16} /></button>)}{query.length >= 2 && !searching && !matches.length && <p className="p-4 text-center text-[13px] text-[#707b85]">Aucun client correspondant.</p>}</div><button type="button" onClick={create} className="text-left text-[13px] font-semibold text-[#087a46]">Créer un nouveau client</button>{error && <FormError text={error} />}</div>; }

function NewClientForm({ submit, error }: { submit: (event: FormEvent<HTMLFormElement>) => void; error: string }) { return <form id="new-dossier-client" onSubmit={submit} className="grid gap-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Nom de la personne"><input name="name" className={fieldClass} /></Field><Field label="Entreprise"><input name="company_name" className={fieldClass} /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Téléphone"><input name="phone" inputMode="tel" className={fieldClass} /></Field><Field label="Numéro WhatsApp"><input name="whatsapp_phone" inputMode="tel" className={fieldClass} /></Field></div><Field label="Email"><input name="email" type="email" className={fieldClass} /></Field><div className="grid gap-4 sm:grid-cols-3"><Field label="Type"><select name="customer_type" defaultValue="individual" className={fieldClass}><option value="individual">Particulier</option><option value="business">Entreprise</option><option value="agent">Intermédiaire</option><option value="partner">Partenaire</option></select></Field><Field label="Statut"><select name="lifecycle_status" defaultValue="lead" className={fieldClass}><option value="lead">Nouveau contact</option><option value="active">En relation active</option><option value="pending">En attente</option><option value="inactive">Inactif</option><option value="blocked">Ne plus contacter</option></select></Field><Field label="Langue"><select name="preferred_language" defaultValue="FR" className={fieldClass}><option value="FR">Français</option><option value="EN">Anglais</option></select></Field></div><Field label="Situation dans ce dossier"><textarea name="situation" rows={4} className={`${fieldClass} h-auto py-2.5`} /></Field><p className="text-[12px] leading-5 text-[#74808a]">Renseignez un nom ou une entreprise, ainsi qu’au moins un moyen de contact.</p>{error && <FormError text={error} />}</form>; }

function EditClientForm({ client, submit, error }: { client: DossierClientRelation; submit: (event: FormEvent<HTMLFormElement>) => void; error: string }) { return <form id="edit-dossier-client" onSubmit={submit} className="grid gap-5"><Field label="Situation dans ce dossier"><textarea name="situation" defaultValue={client.situation || ""} rows={5} className={`${fieldClass} h-auto py-2.5`} /></Field><label className="flex items-center gap-3 rounded-[8px] border border-[#dfe3e7] p-3.5 text-[13px] font-medium"><input name="attention_required" type="checkbox" defaultChecked={client.attention_required} className="h-4 w-4 accent-[#12c76f]" /> Cette personne demande une attention particulière</label><Field label="Motif de l’attention"><textarea name="attention_reason" defaultValue={client.attention_reason || ""} rows={3} className={`${fieldClass} h-auto py-2.5`} /></Field><label className="flex items-center gap-3 text-[13px]"><input name="make_primary" type="checkbox" defaultChecked={client.relationship_role === "PRIMARY"} className="h-4 w-4 accent-[#12c76f]" /> Utiliser comme contact principal du dossier</label>{error && <FormError text={error} />}</form>; }

function ClientProfileForm({ client, submit, error }: { client: DossierClientRelation; submit: (event: FormEvent<HTMLFormElement>) => void; error: string }) { return <form id="edit-client-profile" onSubmit={submit} className="grid gap-5"><div className="rounded-[8px] bg-[#f3f6f5] px-4 py-3 text-[12px] leading-5 text-[#617069]">Ces coordonnées appartiennent à la fiche unique du client. Elles seront actualisées partout où cette personne apparaît.</div><div className="grid gap-4 sm:grid-cols-2"><Field label="Nom complet"><input required name="name" defaultValue={client.name || ""} className={fieldClass} /></Field><Field label="Entreprise"><input name="company_name" defaultValue={client.company_name || ""} className={fieldClass} /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Téléphone"><input name="phone" inputMode="tel" defaultValue={client.phone || ""} className={fieldClass} /></Field><Field label="WhatsApp"><input name="whatsapp_phone" inputMode="tel" defaultValue={client.whatsapp_phone || ""} className={fieldClass} /></Field></div><Field label="Email"><input name="email" type="email" defaultValue={client.email || ""} className={fieldClass} /></Field><div className="grid gap-4 sm:grid-cols-3"><Field label="Type"><select name="customer_type" defaultValue={client.customer_type || "individual"} className={fieldClass}><option value="individual">Particulier</option><option value="business">Entreprise</option><option value="agent">Intermédiaire</option><option value="partner">Partenaire</option></select></Field><Field label="Statut"><select name="lifecycle_status" defaultValue={client.lifecycle_status || "lead"} className={fieldClass}><option value="lead">Nouveau contact</option><option value="active">En relation active</option><option value="pending">En attente</option><option value="inactive">Inactif</option><option value="blocked">Ne plus contacter</option></select></Field><Field label="Langue"><select name="preferred_language" defaultValue={(client.preferred_language || "FR").toUpperCase()} className={fieldClass}><option value="FR">Français</option><option value="EN">Anglais</option></select></Field></div>{error && <FormError text={error} />}</form>; }

function MoveClientForm({ query, setQuery, targets, move, saving, error }: { query: string; setQuery: (value: string) => void; targets: DossierRecord[]; move: (target: DossierRecord) => void; saving: boolean; error: string }) { return <div className="grid gap-4"><div className="rounded-[8px] bg-[#fff7e8] px-4 py-3 text-[12px] leading-5 text-[#76541d]">La personne sera retirée de ce dossier puis rattachée au dossier choisi. Son historique actuel restera conservé.</div><Field label="Rechercher le dossier de destination"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom ou référence du dossier" className={fieldClass} /></Field><div className="overflow-hidden rounded-[8px] border border-[#e0e4e7]">{targets.map((target) => <button key={target.id} disabled={saving} onClick={() => move(target)} className="flex w-full items-center justify-between border-b border-[#edf0f2] px-4 py-3.5 text-left last:border-0 hover:bg-[#f7f9f8]"><span><span className="block text-[13px] font-semibold">{target.title || target.dossier_reference}</span><span className="mt-0.5 block text-[12px] text-[#78828c]">{target.dossier_reference} · {target.client_count || 0} client(s)</span></span><ChevronRight size={16} /></button>)}{query.length >= 2 && !targets.length && <p className="p-4 text-center text-[13px] text-[#707b85]">Aucun autre dossier correspondant.</p>}</div>{error && <FormError text={error} />}</div>; }

function ClientRecord({ client }: { client: DossierClientRelation }) { return <div className="grid gap-6"><section><h3 className="text-[15px] font-semibold">Coordonnées</h3><dl className="mt-4 grid gap-5 sm:grid-cols-2"><Info label="Nom complet" value={client.name || client.display_name} /><Info label="Entreprise" value={client.company_name || "Non renseignée"} /><Info label="Téléphone" value={client.phone || "Non renseigné"} /><Info label="WhatsApp" value={client.whatsapp_phone || "Non renseigné"} /><Info label="Email" value={client.email || "Non renseigné"} /><Info label="Langue" value={languageLabel(client.preferred_language)} /></dl></section><section className="border-t border-[#e7eaed] pt-5"><h3 className="text-[15px] font-semibold">Profil</h3><dl className="mt-4 grid gap-5 sm:grid-cols-2"><Info label="Type" value={clientTypeLabel(client.customer_type)} /><Info label="Statut" value={clientStatusLabel(client.lifecycle_status)} /></dl></section></div>; }

function ClientSituation({ client, edit, readonly }: { client: DossierClientRelation; edit: () => void; readonly: boolean }) { return <div className="grid gap-5"><section className="rounded-[9px] border border-[#e2e6e9] p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="text-[15px] font-semibold">Situation dans ce dossier</h3><p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[#53606a]">{client.situation || "Aucune situation n’a encore été renseignée."}</p></div>{!readonly && <OperationDrawerAction icon={<Pencil size={15} />} onClick={edit}>Mettre à jour</OperationDrawerAction>}</div></section><section className={`rounded-[9px] p-5 ${client.attention_required ? "bg-[#fff7e8]" : "bg-[#f3f6f5]"}`}><div className="flex items-center gap-2"><MessageCircle size={17} /><h3 className="text-[14px] font-semibold">{client.attention_required ? "Attention requise" : "Aucune attention particulière"}</h3></div>{client.attention_reason && <p className="mt-2 text-[13px] leading-5 text-[#73521c]">{client.attention_reason}</p>}<p className="mt-3 text-[12px] text-[#6f7a75]">Dernière mise à jour : {formatDateTime(client.last_updated_at)}</p></section></div>; }

function ClientHistory({ items, loading }: { items: DossierClientHistoryEvent[]; loading: boolean }) { if (loading) return <LoadingState label="Chargement de l’historique…" />; if (!items.length) return <EmptyState title="Aucun historique" description="Les prochaines modifications apparaîtront ici." />; return <div className="grid gap-0">{items.map((item) => <div key={item.id} className="flex gap-3 border-b border-[#edf0f2] py-4 last:border-0"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#edf8f2] text-[#087a46]"><History size={15} /></span><div><p className="text-[13px] font-semibold text-[#30373e]">{historyLabel(item.event_type)}</p><p className="mt-1 text-[12px] text-[#78828c]">{formatDateTime(item.created_at)}</p></div></div>)}</div>; }

function ActivitySection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) { const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children); return <section className="rounded-[10px] border border-[#e0e4e7] bg-white"><header className="border-b border-[#e8ebed] px-5 py-4"><h2 className="text-[15px] font-semibold">{title}</h2></header><div className="divide-y divide-[#edf0f2]">{hasChildren ? children : <p className="p-6 text-center text-[13px] text-[#75808a]">{empty}</p>}</div></section>; }
function ActivityItem({ title, text, date, status }: { title: string; text: string; date: string; status?: string }) { return <article className="p-4"><div className="flex items-start justify-between gap-3"><p className="text-[13px] font-semibold">{title}</p>{status && <OperationStatus label={status} />}</div><p className="mt-1.5 line-clamp-3 text-[13px] leading-5 text-[#626e78]">{text}</p><p className="mt-2 text-[11px] text-[#89929b]">{formatDateTime(date)}</p></article>; }
function SummaryCard({ label, value, icon, tone }: { label: string; value: string; icon: ReactNode; tone?: "warning" }) { return <div className={`rounded-[10px] border bg-white p-5 ${tone ? "border-[#f0d6a9]" : "border-[#e0e4e7]"}`}><div className={`grid h-9 w-9 place-items-center rounded-[8px] ${tone ? "bg-[#fff4df] text-[#9b5c00]" : "bg-[#edf8f2] text-[#087a46]"}`}>{icon}</div><p className="mt-4 text-[12px] font-medium text-[#727d87]">{label}</p><p className="mt-1 text-[26px] font-semibold tracking-[-0.03em]">{value}</p></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2"><span className="text-[13px] font-semibold text-[#414950]">{label}</span>{children}</label>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-[12px] font-medium text-[#78828c]">{label}</dt><dd className="mt-1 text-[13px] font-medium text-[#30373e]">{value}</dd></div>; }
function FormError({ text }: { text: string }) { return <p className="rounded-[7px] bg-[#fff2f2] px-3 py-2.5 text-[13px] text-[#a62b25]">{text}</p>; }
function clean(value: FormDataEntryValue | null) { const text = String(value || "").trim(); return text || null; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function followupLabel(value: string) { return ({ DUE: "À envoyer", SCHEDULED: "Programmée", SENT: "Envoyée", RESPONDED: "Réponse reçue", COMPLETED: "Terminée", FAILED: "Échec" } as Record<string, string>)[value] || "En cours"; }
function clientTypeLabel(value?: string | null) { return ({ individual: "Particulier", business: "Entreprise", agent: "Intermédiaire", partner: "Partenaire" } as Record<string, string>)[String(value)] || "Non renseigné"; }
function clientStatusLabel(value?: string | null) { return ({ lead: "Nouveau contact", active: "En relation active", pending: "En attente", inactive: "Inactif", blocked: "Ne plus contacter" } as Record<string, string>)[String(value)] || "Non renseigné"; }
function languageLabel(value?: string | null) { return ({ FR: "Français", EN: "Anglais" } as Record<string, string>)[String(value || "").toUpperCase()] || value || "Non renseignée"; }
function historyLabel(value: string) { return ({ CLIENT_ATTACHED: "Client ajouté au dossier", CLIENT_RELATION_UPDATED: "Situation mise à jour", CLIENT_REMOVED: "Client retiré du dossier", CLIENT_RESTORED: "Client restauré dans le dossier" } as Record<string, string>)[value] || "Fiche client mise à jour"; }
function apiError(cause: unknown) { if (!axios.isAxiosError(cause)) return "Une erreur inattendue est survenue."; if (!cause.response) return "Le serveur ne répond pas."; const detail = cause.response.data?.detail; if (typeof detail === "object" && detail?.code === "duplicate_client") return "Ce client existe déjà. Recherchez-le puis rattachez-le au dossier."; const labels: Record<string, string> = { dossier_not_found: "Ce dossier n’existe plus.", target_dossier_not_found: "Le dossier de destination n’est plus disponible.", duplicate_client: "Un autre client utilise déjà ce téléphone ou cet email.", attention_reason_required: "Expliquez pourquoi cette personne demande une attention.", stale_dossier_version: "Le dossier a été modifié ailleurs. Actualisez la page.", stale_client_version: "La fiche client a été modifiée ailleurs. Actualisez la page.", stale_dossier_client_version: "La situation a été modifiée ailleurs. Actualisez la page.", client_already_in_target_dossier: "Cette personne est déjà présente dans le dossier choisi.", invalid_dossier_assignee: "Le responsable sélectionné n’est plus disponible." }; return labels[String(detail)] || (typeof detail === "string" ? detail : "L’opération n’a pas pu être terminée."); }
