"use client";

import axios from "axios";
import { Archive, ArrowLeft, ArrowRight, WandSparkles as Bot, CheckCheck, ChevronDown, CircleAlert, ExternalLink, Info, MessageCircle, MoreHorizontal, Paperclip, RotateCw, Send, Sparkles, UserRound, Users, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePilotOffline } from "@/components/offline/pilot-offline-provider";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationConfirmDialog } from "@/components/ui/operation-confirm-dialog";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { OperationButton, OperationStatus } from "@/components/ui/operation-controls";
import { OperationSearch } from "@/components/ui/operation-primitives";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { EmptyState, LoadingState } from "@/components/ui/page-state";
import { dashboardLabel, useDashboardLocale } from "@/components/i18n/dashboard-language";
import { searchDossierClients, type DossierClientSearchResult } from "@/services/dossiers";
import {
  generateInboxAISuggestion, getInboxAISettings, getInboxConversation, listInboxAIDrafts,
  listInboxConversations, markInboxConversationRead, sendInboxReply, summarizeInboxConversation,
  updateInboxAIMode, updateInboxContext, updateInboxConversationAIMode, updateInboxState,
  type InboxAIMode, type InboxAISettings, type InboxAISuggestion, type InboxConversation,
  type InboxDetail, type InboxView, type StoredInboxAIDraft,
} from "@/services/inbox";

const fieldClass = "h-10 w-full rounded-[7px] border border-[#d4d9df] bg-white px-3 text-[13px] text-[#30373e] outline-none transition focus:border-[#12a865] focus:ring-2 focus:ring-[#12c76f]/10";
const miniAction = "inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[#d9dfe2] bg-white px-2.5 text-[11px] font-semibold text-[#4f5b63] hover:bg-[#f2f5f3] disabled:opacity-50";
const menuAction = "flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[12px] font-medium text-[#48535b] hover:bg-[#f2f5f3]";
const filters: Array<{ id: InboxView; label: string }> = [
  { id: "all", label: "Toutes" }, { id: "groups", label: "Groupes" }, { id: "private", label: "Privées" }, { id: "unread", label: "Non lues" },
  { id: "attention", label: "À reprendre" }, { id: "ai", label: "IA active" },
];

export function PilotInboxPage() {
  const locale = useDashboardLocale();
  const { online, cache, cached } = usePilotOffline();
  const [view, setView] = useState<InboxView>("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<InboxConversation[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [detail, setDetail] = useState<InboxDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSettings, setAiSettings] = useState<InboxAISettings | null>(null);
  const [suggestion, setSuggestion] = useState<InboxAISuggestion | null>(null);
  const [summary, setSummary] = useState("");
  const [replyText, setReplyText] = useState("");
  const [draftId, setDraftId] = useState<string>();
  const [requestedMode, setRequestedMode] = useState<InboxAIMode | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientMatches, setClientMatches] = useState<DossierClientSearchResult[]>([]);
  const [changingClient, setChangingClient] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [closeRequested, setCloseRequested] = useState(false);
  const [newMessages, setNewMessages] = useState(0);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const messagesScroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  const loadList = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await listInboxConversations({ view, q: query.trim() || undefined });
      await cache(`inbox:list:${view}:${query.trim()}`, response);
      setItems(response.conversations); setError("");
    } catch (cause) {
      const stored = await cached<Awaited<ReturnType<typeof listInboxConversations>>>(`inbox:list:${view}:${query.trim()}`);
      if (stored) { setItems(stored.conversations); setError("Conversations enregistrées sur cet appareil. Les nouveaux messages apparaîtront au retour du réseau."); }
      else setError(apiError(cause));
    } finally { if (!quiet) setLoading(false); }
  }, [cache, cached, query, view]);

  const loadDraft = useCallback(async (phone: string, current: InboxDetail) => {
    try {
      const drafts = await listInboxAIDrafts(phone);
      setSuggestion(storedSuggestion(drafts, current, aiSettings?.pilot_response_mode || "SUGGESTION_ONLY"));
    } catch { /* Permission IA facultative. */ }
  }, [aiSettings?.pilot_response_mode]);

  const openConversation = useCallback(async (phone: string) => {
    if (phone !== selectedPhone) { setSuggestion(null); setSummary(""); setReplyText(""); setDraftId(undefined); setNewMessages(0); nearBottom.current = true; }
    setSelectedPhone(phone); setDetailLoading(true); setActionError(""); setMenuOpen(false);
    if (!online) {
      const stored = await cached<InboxDetail>(`inbox:conversation:${phone}`);
      if (stored) setDetail(stored); else setActionError("Cette conversation n’a pas encore été enregistrée sur cet appareil.");
      setDetailLoading(false); return;
    }
    try {
      await markInboxConversationRead(phone);
      const current = await getInboxConversation(phone);
      await cache(`inbox:conversation:${phone}`, current); setDetail(current); await loadDraft(phone, current); await loadList(true);
      window.requestAnimationFrame(() => messagesEnd.current?.scrollIntoView({ block: "end" }));
    } catch (cause) {
      const stored = await cached<InboxDetail>(`inbox:conversation:${phone}`);
      if (stored) { setDetail(stored); setActionError("Conversation consultée hors connexion. L’envoi et l’IA sont temporairement désactivés."); }
      else setActionError(apiError(cause));
    } finally { setDetailLoading(false); }
  }, [cache, cached, loadDraft, loadList, online, selectedPhone]);

  useEffect(() => { const timer = window.setTimeout(() => void loadList(), 220); return () => window.clearTimeout(timer); }, [loadList]);
  useEffect(() => { getInboxAISettings().then(setAiSettings).catch(() => setAiSettings(null)); }, []);
  useEffect(() => {
    if (!online) return;
    const timer = window.setInterval(() => {
      void loadList(true);
      if (!selectedPhone) return;
      void getInboxConversation(selectedPhone).then(async current => {
        setDetail(previous => {
          if (!previous || previous.phone !== current.phone) return current;
          const known = new Set(previous.messages.map(message => message.id));
          const added = current.messages.filter(message => !known.has(message.id));
          if (!added.length) return previous;
          if (nearBottom.current) window.requestAnimationFrame(() => messagesEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
          else setNewMessages(count => count + added.length);
          return current;
        });
        await cache(`inbox:conversation:${selectedPhone}`, current); await loadDraft(selectedPhone, current);
      }).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [cache, loadDraft, loadList, online, selectedPhone]);
  useEffect(() => {
    if (!changingClient || clientQuery.trim().length < 2) { setClientMatches([]); return; }
    const timer = window.setTimeout(() => searchDossierClients(clientQuery.trim()).then(setClientMatches).catch(() => setClientMatches([])), 250);
    return () => window.clearTimeout(timer);
  }, [changingClient, clientQuery]);

  const selectedItems = useMemo(() => items.filter(item => checked.has(item.phone)), [checked, items]);
  function trackScroll() { const element = messagesScroll.current; if (!element) return; nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90; if (nearBottom.current) setNewMessages(0); }
  function jumpToLatest() { messagesEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" }); nearBottom.current = true; setNewMessages(0); }
  function toggle(phone: string) { setChecked(current => { const next = new Set(current); if (next.has(phone)) next.delete(phone); else next.add(phone); return next; }); }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return;
    if (!online) { setActionError("Reconnectez-vous pour envoyer ce message WhatsApp."); return; }
    const message = replyText.trim(); if (!message) return;
    setSending(true); setActionError("");
    try {
      const result = await sendInboxReply(detail.phone, message, draftId); if (result.status !== "ok") throw new Error(result.error || "send_failed");
      setReplyText(""); setDraftId(undefined); setSuggestion(null); nearBottom.current = true;
      const current = await getInboxConversation(detail.phone); setDetail(current); await cache(`inbox:conversation:${detail.phone}`, current); await loadList(true);
      window.requestAnimationFrame(() => messagesEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
    } catch (cause) { setActionError(apiError(cause)); } finally { setSending(false); }
  }
  async function saveAgencyMode(mode: InboxAIMode) { setModeBusy(true); try { setAiSettings(await updateInboxAIMode(mode)); setRequestedMode(null); await loadList(true); } catch (cause) { setActionError(apiError(cause)); } finally { setModeBusy(false); } }
  async function changeAgencyMode(mode: InboxAIMode) { if (mode === "CONTROLLED_AUTO" && aiSettings?.pilot_response_mode !== mode) setRequestedMode(mode); else await saveAgencyMode(mode); }
  async function changeConversationMode(mode: "INHERIT" | "CONTROLLED_AUTO" | "PAUSED", phone = detail?.phone) { if (!phone) return; setModeBusy(true); try { await updateInboxConversationAIMode(phone, mode); if (phone === detail?.phone) setDetail(await getInboxConversation(phone)); await loadList(true); } catch (cause) { setActionError(apiError(cause)); } finally { setModeBusy(false); } }
  async function bulkMode(mode: "CONTROLLED_AUTO" | "PAUSED") { setModeBusy(true); try { await Promise.all(selectedItems.map(item => updateInboxConversationAIMode(item.phone, mode))); setChecked(new Set()); await loadList(true); } catch (cause) { setActionError(apiError(cause)); } finally { setModeBusy(false); } }
  async function bulkRead() { try { await Promise.all(selectedItems.map(item => markInboxConversationRead(item.phone))); setChecked(new Set()); await loadList(true); } catch (cause) { setActionError(apiError(cause)); } }
  async function askSuggestion() { if (!detail) return; if (!online) { setActionError("L’IA nécessite une connexion. La conversation reste consultable hors ligne."); return; } setAiLoading(true); try { setSuggestion(await generateInboxAISuggestion(detail.phone)); } catch (cause) { setActionError(apiError(cause)); } finally { setAiLoading(false); } }
  async function askSummary() { if (!detail) return; if (!online) { setActionError("L’IA nécessite une connexion. La conversation reste consultable hors ligne."); return; } setAiLoading(true); try { setSummary((await summarizeInboxConversation(detail.phone)).summary); } catch (cause) { setActionError(apiError(cause)); } finally { setAiLoading(false); } }
  async function loadOlder() { if (!detail?.messages.length || olderLoading) return; setOlderLoading(true); const oldHeight = messagesScroll.current?.scrollHeight || 0; try { const older = await getInboxConversation(detail.phone, detail.messages[0].created_at); setDetail({ ...detail, messages: [...older.messages, ...detail.messages], has_older_messages: older.has_older_messages }); window.requestAnimationFrame(() => { if (messagesScroll.current) messagesScroll.current.scrollTop += messagesScroll.current.scrollHeight - oldHeight; }); } catch (cause) { setActionError(apiError(cause)); } finally { setOlderLoading(false); } }
  async function chooseClient(client: DossierClientSearchResult) { if (!detail) return; try { await updateInboxContext(detail.phone, { client_id: client.id, dossier_id: null, expected_version: detail.assignment?.row_version }); setChangingClient(false); setClientQuery(""); setDetail(await getInboxConversation(detail.phone)); await loadList(true); } catch (cause) { setActionError(apiError(cause)); } }
  async function chooseDossier(dossierId: string) { if (!detail?.client) return; try { await updateInboxContext(detail.phone, { client_id: detail.client.id, dossier_id: dossierId || null, expected_version: detail.assignment?.row_version }); setDetail(await getInboxConversation(detail.phone)); await loadList(true); } catch (cause) { setActionError(apiError(cause)); } }
  async function changeState(status: "OPEN" | "CLOSED", attention: boolean) { if (!detail) return; try { await updateInboxState(detail.phone, { status, requires_attention: attention }); setDetail(await getInboxConversation(detail.phone)); await loadList(true); setCloseRequested(false); } catch (cause) { setActionError(apiError(cause)); } }

  return <div className="flex min-h-0 flex-col bg-[#f7f8f8] text-[#25292e] lg:h-[calc(100vh-64px)]">
    <OperationPageHeader title={dashboardLabel(locale,"Boîte de réception")} description={dashboardLabel(locale,"Conversations WhatsApp, clients et dossiers réunis dans un espace de travail simple.")} actions={aiSettings && <AIModeControl settings={aiSettings} change={changeAgencyMode} />} />
    <main className="min-h-0 flex-1 p-3 sm:p-4"><section className="grid h-[calc(100vh-170px)] min-h-[620px] overflow-hidden rounded-[10px] border border-[#dfe3e6] bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)] lg:h-full lg:min-h-0 lg:grid-cols-[330px_minmax(420px,1fr)_300px] xl:grid-cols-[350px_minmax(480px,1fr)_320px]">
      <aside className={`${selectedPhone ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-r border-[#e3e7ea]`}><div className="border-b border-[#e7eaed] p-3"><OperationSearch value={query} onChange={setQuery} placeholder="Nom, téléphone ou identifiant" /><div className="mt-3 flex gap-1 overflow-x-auto pb-0.5">{filters.map(filter => <button key={filter.id} onClick={() => setView(filter.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold ${view === filter.id ? "bg-[#24312b] text-white" : "bg-[#f0f2f2] text-[#626d75] hover:bg-[#e7ebea]"}`}>{filter.label}</button>)}</div></div>
        {checked.size > 0 && <div className="border-b border-[#e4e8ea] bg-[#f7faf8] p-3"><div className="flex items-center justify-between"><strong className="text-[12px]">{checked.size} sélectionnée{checked.size > 1 ? "s" : ""}</strong><button onClick={() => setChecked(new Set())} className="grid h-7 w-7 place-items-center rounded hover:bg-[#e9eeeb]"><X size={14} /></button></div><div className="mt-2 flex flex-wrap gap-2"><button onClick={bulkRead} className={miniAction}><CheckCheck size={13} />Marquer comme lu</button><PermissionGuard permission="inbox.ai.manage"><button disabled={modeBusy} onClick={() => bulkMode("PAUSED")} className={miniAction}><UserRound size={13} />Manuel</button><button disabled={modeBusy} onClick={() => bulkMode("CONTROLLED_AUTO")} className={miniAction}><Bot size={13} />IA</button></PermissionGuard></div></div>}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{loading ? <LoadingState label="Chargement des conversations…" /> : error && !items.length ? <InboxError text={error} retry={() => loadList()} /> : items.length ? items.map(item => <ConversationRow key={item.phone} item={item} active={selectedPhone === item.phone} checked={checked.has(item.phone)} toggle={() => toggle(item.phone)} open={() => openConversation(item.phone)} />) : <EmptyState title="Aucune conversation" description="Les conversations correspondant à ce filtre apparaîtront ici." />}</div>{error && items.length > 0 && <p className="border-t bg-[#fffaf0] px-3 py-2 text-[10px] text-[#7b5a23]">{error}</p>}</aside>

      <section className={`${selectedPhone ? "flex" : "hidden lg:flex"} min-h-0 flex-col bg-white`}>{!selectedPhone ? <EmptyConversation /> : detailLoading && !detail ? <LoadingState label="Ouverture de la conversation…" /> : detail ? <>
        <ConversationHeader detail={detail} agencyMode={aiSettings?.pilot_response_mode || "SUGGESTION_ONLY"} busy={modeBusy} aiLoading={aiLoading} menuOpen={menuOpen} setMenuOpen={setMenuOpen} changeMode={changeConversationMode} summarize={askSummary} back={() => { setSelectedPhone(null); setDetail(null); }} info={() => setContextOpen(true)} archive={() => setCloseRequested(true)} reopen={() => changeState("OPEN", false)} attention={() => changeState("OPEN", true)} />
        <div ref={messagesScroll} onScroll={trackScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f4f6f5] px-3 py-5 sm:px-6"><div className="mx-auto grid max-w-[760px] gap-2">{detail.has_older_messages && <button disabled={olderLoading} onClick={loadOlder} className="mx-auto mb-2 rounded-full border bg-white px-3 py-1.5 text-[11px] font-semibold">{olderLoading ? "Chargement…" : "Afficher les messages précédents"}</button>}{detail.messages.map((message, index) => <div key={message.id}>{isNewDay(detail.messages, index) && <DaySeparator value={message.created_at} />}<MessageBubble message={message} /></div>)}<div ref={messagesEnd} /></div>{newMessages > 0 && <button onClick={jumpToLatest} className="sticky bottom-3 left-1/2 z-10 mx-auto flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#24312b] px-4 py-2 text-[11px] font-semibold text-white shadow-lg">{newMessages} nouveau{newMessages > 1 ? "x" : ""} message{newMessages > 1 ? "s" : ""}<ChevronDown size={14} /></button>}</div>
        {(summary || suggestion) && <AIWorkPanel summary={summary} suggestion={suggestion} close={() => setSummary("")} use={() => { if (suggestion) { setReplyText(suggestion.response_text); setDraftId(suggestion.draft.id); } }} />}
        <ReplyComposer detail={detail} sending={sending} aiLoading={aiLoading} aiDisabled={detail.is_group || (detail.assignment?.ai_mode_override || aiSettings?.pilot_response_mode) === "PAUSED"} error={actionError} value={replyText} change={setReplyText} suggest={askSuggestion} submit={reply} />
      </> : <InboxError text={actionError || "Cette conversation n’est plus disponible."} retry={() => selectedPhone && openConversation(selectedPhone)} />}</section>

      <aside className="hidden min-h-0 overflow-y-auto overscroll-contain border-l border-[#e3e7ea] bg-[#fbfcfc] lg:block">{detail ? detail.is_group ? <GroupContextPanel detail={detail} /> : <ContextPanel detail={detail} changing={changingClient} setChanging={setChangingClient} clientQuery={clientQuery} setClientQuery={setClientQuery} matches={clientMatches} chooseClient={chooseClient} chooseDossier={chooseDossier} /> : <p className="p-5 text-[13px] text-[#737d86]">Sélectionnez une conversation pour afficher le client et son dossier.</p>}</aside>
    </section></main>
    <OperationDrawer open={contextOpen} close={() => setContextOpen(false)} title={detail?.is_group ? "Groupe WhatsApp" : "Client et dossier"} description={detail?.phone} width="max-w-[520px]">{detail && (detail.is_group ? <GroupContextPanel detail={detail} /> : <ContextPanel detail={detail} changing={changingClient} setChanging={setChangingClient} clientQuery={clientQuery} setClientQuery={setClientQuery} matches={clientMatches} chooseClient={chooseClient} chooseDossier={chooseDossier} />)}</OperationDrawer>
    <OperationConfirmDialog open={requestedMode === "CONTROLLED_AUTO"} title="Activer les réponses automatiques contrôlées ?" description="SLAIVIO répondra seul uniquement aux demandes couvertes par une connaissance publiée et fiable." confirmLabel="Activer ce mode" busy={modeBusy} intent="primary" close={() => setRequestedMode(null)} confirm={() => void saveAgencyMode("CONTROLLED_AUTO")} />
    <OperationConfirmDialog open={closeRequested} title="Archiver cette conversation ?" description="Elle quittera les conversations actives, mais son historique restera conservé et consultable." confirmLabel="Archiver" busy={false} close={() => setCloseRequested(false)} confirm={() => void changeState("CLOSED", false)} />
  </div>;
}

function ConversationRow({ item, active, checked, toggle, open }: { item: InboxConversation; active: boolean; checked: boolean; toggle: () => void; open: () => void }) {
  const name = item.is_group ? (item.conversation_name || item.dossier_title || "Groupe WhatsApp") : (item.client_name || item.last_sender_name || "Contact à identifier");
  const mode = item.effective_ai_mode === "CONTROLLED_AUTO" ? "Réponse automatique" : item.effective_ai_mode === "PAUSED" ? "Réponse manuelle" : "Suggestion IA";
  const sender = item.last_sender_name || item.last_sender_phone;
  const contactPhone = item.last_sender_phone || item.client_phone || item.phone;
  return <div className={`grid grid-cols-[28px_38px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[#edf0f2] px-3 py-3 ${active ? "bg-[#eaf6f0]" : "hover:bg-[#f8faf9]"}`}><label className="grid h-7 w-7 place-items-center"><input type="checkbox" checked={checked} onChange={toggle} aria-label={`Sélectionner ${name}`} className="h-4 w-4 accent-[#087a46]" /></label><button onClick={open} className="contents text-left"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#e3eee8] text-[12px] font-bold text-[#087a46]">{item.is_group ? <Users size={17} /> : initials(name)}</span><span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-[13px]">{name}</strong>{item.is_group && <span className="rounded-full bg-[#e9edff] px-1.5 py-0.5 text-[9px] font-bold text-[#5147c7]">GROUPE</span>}{item.unread_count > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-[#087a46] px-1.5 text-[10px] font-bold text-white">{item.unread_count}</span>}</span>{!item.is_group && <span className="mt-0.5 block truncate text-[11px] text-[#78838c]">{contactPhone}</span>}<span className="mt-1 block truncate text-[12px] text-[#65717a]">{item.last_direction === "outbound" ? "Vous : " : item.is_group && sender ? `${sender} : ` : ""}{item.last_message || "Pièce jointe"}</span><span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-medium ${item.effective_ai_mode === "CONTROLLED_AUTO" ? "text-[#087a46]" : "text-[#7b858d]"}`}>{item.is_group ? <Users size={10} /> : item.effective_ai_mode === "CONTROLLED_AUTO" ? <Bot size={10} /> : <UserRound size={10} />}{item.is_group ? `${item.participant_count || 0} participant(s)` : mode}</span></span><span className="self-start whitespace-nowrap pt-0.5 text-[10px] text-[#8a939b]">{relativeTime(item.last_message_at)}</span></button></div>;
}

function ConversationHeader({ detail, agencyMode, busy, aiLoading, menuOpen, setMenuOpen, changeMode, summarize, back, info, archive, reopen, attention }: { detail: InboxDetail; agencyMode: InboxAIMode; busy: boolean; aiLoading: boolean; menuOpen: boolean; setMenuOpen: (value: boolean) => void; changeMode: (mode: "INHERIT" | "CONTROLLED_AUTO" | "PAUSED") => void; summarize: () => void; back: () => void; info: () => void; archive: () => void; reopen: () => void; attention: () => void }) {
  const override = detail.assignment?.ai_mode_override; const effective = override || agencyMode; const closed = detail.assignment?.status === "CLOSED";
  const contactPhone = detail.last_sender_phone || detail.client?.phone || detail.phone;
  const mode = effective === "CONTROLLED_AUTO" ? "Réponse automatique" : effective === "PAUSED" ? "Réponse manuelle" : "Suggestion IA";
  return <header className="relative flex min-h-[68px] items-center justify-between gap-3 border-b px-3 py-3 sm:px-4"><div className="flex min-w-0 items-center gap-3"><button onClick={back} className="grid h-8 w-8 place-items-center rounded hover:bg-[#f0f2f2] lg:hidden"><ArrowLeft size={16} /></button><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e6f4ed] text-[#087a46]">{detail.is_group ? <Users size={17} /> : <UserRound size={17} />}</span><div className="min-w-0"><h2 className="truncate text-[14px] font-semibold">{detail.is_group ? (detail.conversation_name || "Groupe WhatsApp") : (detail.client?.display_name || detail.last_sender_name || "Contact à identifier")}</h2><p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-[#75808a]"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${detail.is_group ? "bg-[#5147c7]" : effective === "CONTROLLED_AUTO" ? "bg-[#0c9b58]" : "bg-[#a8b0b6]"}`} /><span className="truncate">{detail.is_group ? `Groupe WhatsApp · ${detail.participant_count || 0} participant(s)` : `${contactPhone} · ${mode}`}</span></p></div></div><div className="flex items-center gap-1.5">{!detail.is_group && <PermissionGuard permission="inbox.ai.manage"><select disabled={busy} value={override || "INHERIT"} onChange={event => changeMode(event.target.value as "INHERIT" | "CONTROLLED_AUTO" | "PAUSED")} className="hidden h-9 rounded-[7px] border bg-white px-2 text-[11px] font-semibold sm:block"><option value="INHERIT">Réglage de l’agence</option><option value="CONTROLLED_AUTO">Laisser répondre l’IA</option><option value="PAUSED">Répondre manuellement</option></select></PermissionGuard>}{!detail.is_group && <OperationButton className="hidden xl:inline-flex" disabled={effective === "PAUSED" || aiLoading} onClick={summarize}><Sparkles size={14} /> Résumer</OperationButton>}<OperationButton className="lg:hidden" onClick={info}><Info size={15} /></OperationButton><button onClick={() => setMenuOpen(!menuOpen)} className="grid h-9 w-9 place-items-center rounded-[7px] border bg-white" aria-label="Actions"><MoreHorizontal size={17} /></button></div>{menuOpen && <div className="absolute right-3 top-[58px] z-30 w-56 rounded-[9px] border bg-white p-1.5 shadow-xl">{!detail.is_group && <button onClick={() => { summarize(); setMenuOpen(false); }} className={menuAction}><Sparkles size={14} />Résumer</button>}<button onClick={() => { attention(); setMenuOpen(false); }} className={menuAction}><CircleAlert size={14} />Marquer à reprendre</button>{closed ? <button onClick={() => { reopen(); setMenuOpen(false); }} className={menuAction}><RotateCw size={14} />Rouvrir</button> : <button onClick={() => { archive(); setMenuOpen(false); }} className={`${menuAction} text-[#9a3d35]`}><Archive size={14} />Archiver</button>}</div>}</header>;
}

function MessageBubble({ message }: { message: InboxDetail["messages"][number] }) { const outgoing = message.direction === "outbound"; const type = (message.message_type || "text").toLowerCase(); return <article className={`max-w-[84%] rounded-[10px] px-3.5 py-2.5 text-[13px] leading-5 shadow-sm ${outgoing ? "ml-auto bg-[#dcf4e6]" : "mr-auto border bg-white"}`}>{!outgoing && message.is_group && <p className="mb-1 text-[11px] font-semibold text-[#087a46]">{message.sender_name || "Participant"} <span className="font-normal text-[#78838c]">· {message.sender_phone || "Numéro masqué"}</span></p>}{type !== "text" && <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-[#617069]"><Paperclip size={13} />{messageTypeLabel(type)}</p>}<p className="whitespace-pre-wrap break-words">{message.text_body || messageTypeLabel(type)}</p><p className={`mt-1 text-right text-[10px] ${message.send_status === "FAILED" ? "text-[#b42318]" : "text-[#7b868e]"}`}>{formatTime(message.created_at)}{outgoing ? ` · ${messageStatus(message.send_status)}` : ""}</p></article>; }

function ReplyComposer({ detail, sending, aiLoading, aiDisabled, error, value, change, suggest, submit }: { detail: InboxDetail; sending: boolean; aiLoading: boolean; aiDisabled: boolean; error: string; value: string; change: (value: string) => void; suggest: () => void; submit: (event: FormEvent<HTMLFormElement>) => void }) { const inbound = [...detail.messages].reverse().find(message => message.direction === "inbound"); const canReply = inbound ? Date.now() - new Date(inbound.created_at).getTime() <= 86400000 : false; if (detail.assignment?.status === "CLOSED") return <div className="border-t p-4 text-center text-[12px]">Cette conversation est archivée. Rouvrez-la pour répondre.</div>; if (!canReply) return <div className="border-t bg-[#fffaf0] p-4 text-[12px] text-[#76541d]">La fenêtre de réponse WhatsApp de 24 heures est terminée. Un modèle WhatsApp approuvé sera nécessaire.</div>; return <form onSubmit={submit} className="border-t bg-white p-3"><div className="mx-auto flex max-w-[820px] items-end gap-2"><button type="button" disabled title="Disponible après sécurisation du stockage WhatsApp" className="grid h-10 w-10 place-items-center text-[#9aa2a8]"><Paperclip size={17} /></button><PermissionGuard permission="inbox.ai.use"><OperationButton type="button" className="h-10 w-10 px-0" disabled={aiDisabled || aiLoading} onClick={suggest} aria-label="Suggérer une réponse"><Sparkles size={16} /></OperationButton></PermissionGuard><textarea required value={value} onChange={event => change(event.target.value)} rows={2} maxLength={4000} placeholder="Écrire une réponse au nom de l’entreprise…" className={`${fieldClass} min-h-[44px] flex-1 resize-none py-2.5`} /><PermissionGuard permission="inbox.reply"><OperationButton type="submit" variant="primary" className="h-10 w-10 px-0" disabled={sending || !value.trim()} aria-label="Envoyer"><Send size={16} /></OperationButton></PermissionGuard></div>{error && <p className="mx-auto mt-2 max-w-[820px] text-[11px] text-[#b42318]">{error}</p>}</form>; }

function AIModeControl({ settings, change }: { settings: InboxAISettings; change: (mode: InboxAIMode) => void }) { return <PermissionGuard permission="inbox.ai.manage" fallback={<OperationStatus label={modeLabel(settings.pilot_response_mode)} tone="info" />}><label className="flex items-center gap-2"><Bot size={16} className="text-[#087a46]" /><select value={settings.pilot_response_mode} onChange={event => change(event.target.value as InboxAIMode)} className="h-9 rounded-[6px] border bg-white px-3 text-[13px] font-semibold"><option value="SUGGESTION_ONLY">Suggestion uniquement</option><option value="CONTROLLED_AUTO">Automatique contrôlé</option><option value="PAUSED">IA en pause</option></select></label></PermissionGuard>; }
function AIWorkPanel({ summary, suggestion, close, use }: { summary: string; suggestion: InboxAISuggestion | null; close: () => void; use: () => void }) { return <section className="max-h-[210px] overflow-y-auto border-t bg-[#f8fbfa] px-4 py-3"><div className="mx-auto grid max-w-[820px] gap-3">{summary && <div className="rounded-[8px] border bg-white p-3"><div className="flex justify-between"><strong className="text-[12px]">Résumé pour le responsable</strong><button onClick={close} className="text-[11px]">Fermer</button></div><p className="mt-2 whitespace-pre-wrap text-[12px] leading-5">{summary}</p></div>}{suggestion && <div className="rounded-[8px] border bg-white p-3"><div className="flex items-center justify-between gap-2"><strong className="text-[12px]">Réponse suggérée</strong><OperationButton onClick={use} variant="primary">Utiliser</OperationButton></div><p className="mt-2 whitespace-pre-wrap text-[12px] leading-5">{suggestion.response_text}</p>{suggestion.sources.length > 0 && <p className="mt-2 text-[11px] text-[#718078]">Sources : {suggestion.sources.map(source => source.title).join(", ")}</p>}</div>}</div></section>; }

function GroupContextPanel({ detail }: { detail: InboxDetail }) {
  const dossier = detail.dossiers.find(item => item.selected) || detail.dossiers[0];
  return <div className="grid gap-6 p-5"><section><h3 className="text-[12px] font-bold uppercase text-[#737d86]">Conversation de groupe</h3><div className="mt-3 rounded-[8px] border bg-white p-3.5"><strong className="text-[13px]">{detail.conversation_name || "Groupe WhatsApp"}</strong><p className="mt-1 text-[12px] text-[#65717a]">{detail.participant_count || 0} participant(s) identifié(s)</p><p className="mt-2 break-all text-[10px] text-[#879098]">{detail.phone}</p></div></section><section><h3 className="text-[12px] font-bold uppercase text-[#737d86]">Dernier expéditeur</h3><div className="mt-3 rounded-[8px] bg-[#f3f6f5] p-3 text-[12px]"><strong className="block">{detail.last_sender_name || "Nom WhatsApp non disponible"}</strong><span className="mt-1 block text-[#65717a]">{detail.last_sender_phone || "Numéro non disponible"}</span></div></section><section><h3 className="text-[12px] font-bold uppercase text-[#737d86]">Dossier associé</h3>{dossier ? <div className="mt-3"><strong className="text-[13px]">{dossier.title || dossier.dossier_reference}</strong><p className="mt-1 text-[11px] text-[#737d86]">{dossier.dossier_reference}</p><Link href={`/app/dossiers/${dossier.id}`} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#087a46]">Ouvrir le dossier <ExternalLink size={13} /></Link></div> : <p className="mt-3 text-[12px] text-[#737d86]">Aucun dossier associé à ce groupe.</p>}</section><section><h3 className="text-[12px] font-bold uppercase text-[#737d86]">Suivi</h3><div className="mt-3 flex gap-2"><OperationStatus label={detail.assignment?.status === "CLOSED" ? "Archivé" : "En cours"} tone={detail.assignment?.status === "CLOSED" ? "neutral" : "success"} />{detail.assignment?.requires_attention && <OperationStatus label="À reprendre" tone="warning" />}</div></section></div>;
}

function ContextPanel({ detail, changing, setChanging, clientQuery, setClientQuery, matches, chooseClient, chooseDossier }: { detail: InboxDetail; changing: boolean; setChanging: (value: boolean) => void; clientQuery: string; setClientQuery: (value: string) => void; matches: DossierClientSearchResult[]; chooseClient: (client: DossierClientSearchResult) => void; chooseDossier: (id: string) => void }) { const dossier = detail.dossiers.find(item => item.id === detail.assignment?.dossier_id); const contactPhone = detail.last_sender_phone || detail.client?.phone || detail.phone; return <div className="grid gap-6 p-5"><section><div className="flex justify-between"><h3 className="text-[12px] font-bold uppercase text-[#737d86]">Client</h3><PermissionGuard permission="inbox.manage"><button onClick={() => setChanging(!changing)} className="text-[12px] font-semibold text-[#087a46]">{changing ? "Annuler" : detail.client ? "Changer" : "Identifier"}</button></PermissionGuard></div>{detail.client ? <div className="mt-3 rounded-[8px] border bg-white p-3.5"><strong className="text-[13px]">{detail.client.display_name || "Nom à compléter"}</strong><p className="mt-1 text-[11px]">{detail.client.client_reference}</p><p className="mt-2 text-[12px]"><span className="text-[#737d86]">Numéro WhatsApp : </span>{contactPhone}</p>{detail.client.email && <p className="mt-1 truncate text-[12px]">{detail.client.email}</p>}</div> : <div className="mt-3 rounded-[8px] bg-[#fff7e8] p-3 text-[12px]"><p>Ce numéro n’est pas encore relié à une fiche client.</p><p className="mt-2 font-semibold text-[#25292e]">{contactPhone}</p></div>}{changing && <div className="mt-3"><input autoFocus value={clientQuery} onChange={event => setClientQuery(event.target.value)} placeholder="Nom, téléphone ou identifiant" className={fieldClass} /><div className="mt-2 overflow-hidden rounded-[8px] border bg-white">{matches.map(client => <button key={client.id} onClick={() => chooseClient(client)} className="flex w-full items-center justify-between border-b px-3 py-2.5 text-left"><span><strong className="block text-[12px]">{client.display_name}</strong><span className="text-[11px]">{client.client_reference} · {client.phone || client.email}</span></span><ArrowRight size={14} /></button>)}</div></div>}</section><section><h3 className="text-[12px] font-bold uppercase text-[#737d86]">Dossier associé</h3>{detail.client ? detail.dossiers.length ? <div className="mt-3"><select value={detail.assignment?.dossier_id || ""} onChange={event => chooseDossier(event.target.value)} className={fieldClass}><option value="">Aucun dossier sélectionné</option>{detail.dossiers.map(item => <option key={item.id} value={item.id}>{item.title || item.dossier_reference}</option>)}</select>{dossier && <Link href={`/app/dossiers/${dossier.id}`} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#087a46]">Ouvrir le dossier <ExternalLink size={13} /></Link>}</div> : <div className="mt-3 rounded-[8px] border border-dashed p-3 text-[12px]">Aucun dossier lié.<Link href="/app/dossiers?create=1" className="mt-2 block font-semibold text-[#087a46]">Créer un dossier</Link></div> : <p className="mt-3 text-[12px]">Identifiez d’abord le client.</p>}</section><section><h3 className="text-[12px] font-bold uppercase text-[#737d86]">Suivi</h3><div className="mt-3 flex gap-2"><OperationStatus label={detail.assignment?.status === "CLOSED" ? "Archivée" : "En cours"} tone={detail.assignment?.status === "CLOSED" ? "neutral" : "success"} />{detail.assignment?.requires_attention && <OperationStatus label="À reprendre" tone="warning" />}</div></section></div>; }

function DaySeparator({ value }: { value: string }) { return <div className="my-4 flex items-center gap-3"><span className="h-px flex-1 bg-[#dfe4e1]" /><span className="rounded-full bg-[#e7ebe9] px-3 py-1 text-[10px] font-semibold">{formatDay(value)}</span><span className="h-px flex-1 bg-[#dfe4e1]" /></div>; }
function EmptyConversation() { return <div className="grid h-full place-items-center p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e8f3ee] text-[#087a46]"><MessageCircle size={21} /></span><h2 className="mt-4 text-[15px] font-semibold">Sélectionnez une conversation</h2><p className="mt-2 text-[12px] text-[#737d86]">Les messages, le client et son dossier s’afficheront ensemble.</p></div></div>; }
function InboxError({ text, retry }: { text: string; retry: () => void }) { return <div className="grid h-full place-items-center p-6 text-center"><div><CircleAlert size={22} className="mx-auto text-[#b42318]" /><p className="mt-3 text-[13px] text-[#8f2f28]">{text}</p><OperationButton className="mt-4" onClick={retry}><RotateCw size={14} /> Réessayer</OperationButton></div></div>; }
function isNewDay(messages: InboxDetail["messages"], index: number) { return index === 0 || new Date(messages[index - 1].created_at).toDateString() !== new Date(messages[index].created_at).toDateString(); }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?"; }
function formatTime(value: string) { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatDay(value: string) { const date = new Date(value); const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1); if (date.toDateString() === today.toDateString()) return "Aujourd’hui"; if (date.toDateString() === yesterday.toDateString()) return "Hier"; return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "short" }).format(date); }
function relativeTime(value: string) { const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000); if (minutes < 1) return "À l’instant"; if (minutes < 60) return `${minutes} min`; if (minutes < 1440) return `${Math.floor(minutes / 60)} h`; return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(value)); }
function messageStatus(status?: string | null) { return status === "FAILED" ? "Échec" : status === "SENT" ? "Envoyé" : status === "DELIVERED" ? "Distribué" : status === "READ" ? "Lu" : "Envoi"; }
function messageTypeLabel(type: string) { return ({ image: "Photo", video: "Vidéo", audio: "Message vocal", ptt: "Message vocal", document: "Document", sticker: "Sticker", location: "Localisation", contact: "Contact" } as Record<string, string>)[type] || "Pièce jointe WhatsApp"; }
function modeLabel(mode: InboxAIMode) { return mode === "CONTROLLED_AUTO" ? "Automatique contrôlé" : mode === "PAUSED" ? "IA en pause" : "Suggestion uniquement"; }
function storedSuggestion(drafts: StoredInboxAIDraft[], detail: InboxDetail, mode: InboxAIMode): InboxAISuggestion | null { const inbound = [...detail.messages].reverse().find(message => message.direction === "inbound"); const draft = drafts.find(item => item.status === "DRAFT" && (!inbound || item.source_message_id === inbound.id)); if (!draft) return null; return { status: "ok", mode, response_text: draft.draft_text, confidence: Number(draft.confidence || 0), risk_level: draft.risk_level, reason: draft.review_reason || "suggestion_prete", eligible_for_auto: draft.decision === "AUTO_REPLY", draft: { id: draft.id, draft_text: draft.draft_text }, sources: (draft.source_titles || []).map((title, index) => ({ id: draft.source_ids[index] || title, title })) }; }
function apiError(cause: unknown) { if (cause instanceof Error && !axios.isAxiosError(cause)) return ["send_failed", "provider_rejected_message", "message_delivery_failed"].includes(cause.message) ? "Le message n’a pas pu être envoyé." : cause.message; if (!axios.isAxiosError(cause)) return "Une erreur inattendue est survenue."; if (!cause.response) return "Le serveur ne répond pas. Réessayez dans un instant."; const code = cause.response.data?.detail; return ({ conversation_not_found: "Cette conversation n’existe plus.", client_not_found: "Ce client n’existe plus.", client_not_in_dossier: "Ce dossier ne contient pas ce client.", stale_conversation_version: "La conversation a été modifiée ailleurs. Actualisez-la.", invalid_conversation_ai_mode: "Ce mode de conversation n’est pas autorisé.", ai_paused: "L’IA est actuellement en pause pour cette conversation.", ai_provider_unavailable: "Le service IA est momentanément indisponible.", inbound_message_not_found: "Aucun nouveau message client n’est disponible.", "No WhatsApp number available": "Aucun numéro WhatsApp actif n’est configuré." } as Record<string, string>)[String(code)] || "L’opération n’a pas pu être terminée."; }
