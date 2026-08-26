"use client";

import axios from "axios";
import { ArrowLeft, ArrowRight, Bot, CircleAlert, ExternalLink, MessageCircle, RotateCw, Send, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationConfirmDialog } from "@/components/ui/operation-confirm-dialog";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { OperationButton, OperationStatus, OperationTab } from "@/components/ui/operation-controls";
import { OperationSearch } from "@/components/ui/operation-primitives";
import { OperationPageHeader, OperationTabs } from "@/components/ui/operation-page-header";
import { EmptyState, LoadingState } from "@/components/ui/page-state";
import { usePilotOffline } from "@/components/offline/pilot-offline-provider";
import { searchDossierClients, type DossierClientSearchResult } from "@/services/dossiers";
import {
  generateInboxAISuggestion, getInboxAISettings, getInboxConversation, listInboxAIDrafts, listInboxConversations,
  markInboxConversationRead, sendInboxReply, summarizeInboxConversation,
  updateInboxAIMode, updateInboxContext, updateInboxState,
  type InboxAIMode, type InboxAISettings, type InboxAISuggestion,
  type InboxConversation, type InboxDetail, type InboxView, type StoredInboxAIDraft,
} from "@/services/inbox";

const fieldClass = "h-10 w-full rounded-[7px] border border-[#d4d9df] bg-white px-3 text-[13px] text-[#30373e] outline-none transition focus:border-[#12a865] focus:ring-2 focus:ring-[#12c76f]/10";

export function PilotInboxPage() {
  const { online, cache, cached } = usePilotOffline();
  const [view, setView] = useState<InboxView>("waiting");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<InboxConversation[]>([]);
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
  const [draftId, setDraftId] = useState<string | undefined>();
  const [requestedMode, setRequestedMode] = useState<InboxAIMode | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientMatches, setClientMatches] = useState<DossierClientSearchResult[]>([]);
  const [changingClient, setChangingClient] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const messagesScroll = useRef<HTMLDivElement>(null);
  const preserveScroll = useRef(false);

  const loadList = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await listInboxConversations({ view, q: query.trim() || undefined });
      await cache(`inbox:list:${view}:${query.trim()}`, response);
      setItems(response.conversations);
      setError("");
      if (selectedPhone && !response.conversations.some((item) => item.phone === selectedPhone)) {
        setSelectedPhone(null); setDetail(null);
      }
    } catch (cause) {
      const stored = await cached<Awaited<ReturnType<typeof listInboxConversations>>>(`inbox:list:${view}:${query.trim()}`);
      if (stored) { setItems(stored.conversations); setError("Conversations enregistrées sur cet appareil. Les nouveaux messages apparaîtront au retour du réseau."); }
      else setError(apiError(cause));
    }
    finally { if (!quiet) setLoading(false); }
  }, [cache, cached, query, selectedPhone, view]);

  const openConversation = useCallback(async (phone: string) => {
    if (phone !== selectedPhone) {
      setSuggestion(null); setSummary(""); setReplyText(""); setDraftId(undefined);
    }
    setSelectedPhone(phone); setDetailLoading(true); setActionError("");
    if (!online) {
      const stored = await cached<InboxDetail>(`inbox:conversation:${phone}`);
      if (stored) setDetail(stored);
      else setActionError("Cette conversation n’a pas encore été enregistrée sur cet appareil.");
      setDetailLoading(false);
      return;
    }
    try {
      if (online) await markInboxConversationRead(phone);
      const current = await getInboxConversation(phone);
      await cache(`inbox:conversation:${phone}`, current);
      setDetail(current);
      try {
        const drafts = await listInboxAIDrafts(phone);
        setSuggestion(suggestionFromStoredDraft(drafts, current, aiSettings?.pilot_response_mode || "SUGGESTION_ONLY"));
      } catch { /* The responsible user may not have the AI permission. */ }
      await loadList(true);
    } catch (cause) {
      const stored = await cached<InboxDetail>(`inbox:conversation:${phone}`);
      if (stored) { setDetail(stored); setActionError("Conversation consultée hors connexion. L’envoi et l’IA sont temporairement désactivés."); }
      else setActionError(apiError(cause));
    }
    finally { setDetailLoading(false); }
  }, [aiSettings?.pilot_response_mode, cache, cached, loadList, online, selectedPhone]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadList(), 220);
    return () => window.clearTimeout(timer);
  }, [loadList]);

  useEffect(() => {
    getInboxAISettings().then(setAiSettings).catch(() => setAiSettings(null));
  }, []);

  useEffect(() => {
    if (!online) return;
    const timer = window.setInterval(() => {
      void loadList(true);
      if (selectedPhone) void getInboxConversation(selectedPhone).then((current) => {
        setDetail(current);
        return listInboxAIDrafts(selectedPhone).then((drafts) => setSuggestion(suggestionFromStoredDraft(drafts, current, aiSettings?.pilot_response_mode || "SUGGESTION_ONLY"))).catch(() => undefined);
      }).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [aiSettings?.pilot_response_mode, loadList, online, selectedPhone]);

  useEffect(() => {
    if (preserveScroll.current) { preserveScroll.current = false; return; }
    messagesEnd.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length]);

  useEffect(() => {
    if (!changingClient || clientQuery.trim().length < 2) { setClientMatches([]); return; }
    const timer = window.setTimeout(() => searchDossierClients(clientQuery.trim()).then(setClientMatches).catch(() => setClientMatches([])), 250);
    return () => window.clearTimeout(timer);
  }, [changingClient, clientQuery]);

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    if (!online) { setActionError("Reconnectez-vous pour envoyer ce message WhatsApp."); return; }
    const message = replyText.trim();
    if (!message) return;
    setSending(true); setActionError("");
    try {
      const result = await sendInboxReply(detail.phone, message, draftId);
      if (result.status !== "ok") throw new Error(result.error || "send_failed");
      setReplyText(""); setDraftId(undefined); setSuggestion(null);
      setDetail(await getInboxConversation(detail.phone));
      await loadList(true);
    } catch (cause) { setActionError(apiError(cause)); }
    finally { setSending(false); }
  }

  async function changeAIMode(mode: InboxAIMode) {
    if (mode === "CONTROLLED_AUTO" && aiSettings?.pilot_response_mode !== "CONTROLLED_AUTO") {
      setRequestedMode(mode); return;
    }
    await saveAIMode(mode);
  }

  async function saveAIMode(mode: InboxAIMode) {
    setModeBusy(true);
    setActionError("");
    try { setAiSettings(await updateInboxAIMode(mode)); setRequestedMode(null); }
    catch (cause) { setActionError(apiError(cause)); }
    finally { setModeBusy(false); }
  }

  async function askAISuggestion() {
    if (!detail) return;
    if (!online) { setActionError("L’IA nécessite une connexion. La conversation reste consultable hors ligne."); return; }
    setAiLoading(true); setActionError("");
    try { setSuggestion(await generateInboxAISuggestion(detail.phone)); }
    catch (cause) { setActionError(apiError(cause)); }
    finally { setAiLoading(false); }
  }

  async function askAISummary() {
    if (!detail) return;
    if (!online) { setActionError("L’IA nécessite une connexion. La conversation reste consultable hors ligne."); return; }
    setAiLoading(true); setActionError("");
    try { setSummary((await summarizeInboxConversation(detail.phone)).summary); }
    catch (cause) { setActionError(apiError(cause)); }
    finally { setAiLoading(false); }
  }

  function useSuggestion() {
    if (!suggestion) return;
    setReplyText(suggestion.response_text);
    setDraftId(suggestion.draft.id);
  }

  async function loadOlderMessages() {
    if (!detail?.messages.length || olderLoading) return;
    setOlderLoading(true);
    const previousHeight = messagesScroll.current?.scrollHeight || 0;
    try {
      const older = await getInboxConversation(detail.phone, detail.messages[0].created_at);
      preserveScroll.current = true;
      setDetail({
        ...detail,
        messages: [...older.messages, ...detail.messages],
        has_older_messages: older.has_older_messages,
      });
      window.requestAnimationFrame(() => {
        if (messagesScroll.current) messagesScroll.current.scrollTop += messagesScroll.current.scrollHeight - previousHeight;
      });
    } catch (cause) { setActionError(apiError(cause)); }
    finally { setOlderLoading(false); }
  }

  async function chooseClient(client: DossierClientSearchResult) {
    if (!detail) return;
    setActionError("");
    try {
      await updateInboxContext(detail.phone, { client_id: client.id, dossier_id: null, expected_version: detail.assignment?.row_version });
      setChangingClient(false); setClientQuery("");
      setDetail(await getInboxConversation(detail.phone));
      await loadList(true);
    } catch (cause) { setActionError(apiError(cause)); }
  }

  async function chooseDossier(dossierId: string) {
    if (!detail?.client) return;
    setActionError("");
    try {
      await updateInboxContext(detail.phone, { client_id: detail.client.id, dossier_id: dossierId || null, expected_version: detail.assignment?.row_version });
      setDetail(await getInboxConversation(detail.phone));
      await loadList(true);
    } catch (cause) { setActionError(apiError(cause)); }
  }

  async function changeState(status: "OPEN" | "CLOSED", attention: boolean) {
    if (!detail) return;
    try {
      await updateInboxState(detail.phone, { status, requires_attention: attention });
      setDetail(await getInboxConversation(detail.phone));
      await loadList(true);
    } catch (cause) { setActionError(apiError(cause)); }
  }

  return <div className="min-h-full bg-[#f7f8f8] text-[#25292e]">
    <OperationPageHeader title="Boîte de réception" description="Gérez les conversations WhatsApp de l’entreprise avec le client et son dossier au même endroit." actions={aiSettings && <AIModeControl settings={aiSettings} change={changeAIMode} />} />
    <OperationTabs>
      <OperationTab active={view === "waiting"} onClick={() => setView("waiting")}>À répondre</OperationTab>
      <OperationTab active={view === "open"} onClick={() => setView("open")}>En cours</OperationTab>
      <OperationTab active={view === "closed"} onClick={() => setView("closed")}>Terminées</OperationTab>
    </OperationTabs>

    <main className="p-4 sm:p-5">
      <section className="grid min-h-[650px] overflow-hidden rounded-[10px] border border-[#dfe3e6] bg-white shadow-[0_1px_2px_rgba(15,23,42,.03)] lg:h-[calc(100vh-225px)] lg:min-h-[620px] lg:grid-cols-[320px_minmax(400px,1fr)_300px]">
        <aside className={`${selectedPhone ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-r border-[#e3e7ea]`}>
          <div className="border-b border-[#e7eaed] p-3"><OperationSearch value={query} onChange={setQuery} placeholder="Rechercher une conversation" /></div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? <LoadingState label="Chargement des conversations…" /> : error ? <InboxError text={error} retry={() => loadList()} /> : items.length ? items.map((item) => <ConversationRow key={item.phone} item={item} active={selectedPhone === item.phone} open={() => openConversation(item.phone)} />) : <EmptyState title={view === "waiting" ? "Aucun message en attente" : "Aucune conversation"} description="Les conversations WhatsApp reçues par l’entreprise apparaîtront ici." />}
          </div>
        </aside>

        <section className={`${selectedPhone ? "flex" : "hidden lg:flex"} min-h-0 flex-col`}>
          {!selectedPhone ? <EmptyConversation /> : detailLoading && !detail ? <LoadingState label="Ouverture de la conversation…" /> : detail ? <>
            <ConversationHeader detail={detail} aiDisabled={aiSettings?.pilot_response_mode === "PAUSED"} aiLoading={aiLoading} summarize={askAISummary} back={() => { setSelectedPhone(null); setDetail(null); setSuggestion(null); setSummary(""); setReplyText(""); }} info={() => setContextOpen(true)} close={() => changeState(detail.assignment?.status === "CLOSED" ? "OPEN" : "CLOSED", false)} attention={() => changeState("OPEN", true)} />
            <div ref={messagesScroll} className="min-h-0 flex-1 overflow-y-auto bg-[#f6f7f7] px-4 py-5 sm:px-6">
              <div className="mx-auto grid max-w-[760px] gap-3">{detail.has_older_messages && <button type="button" disabled={olderLoading} onClick={loadOlderMessages} className="mx-auto rounded-full border border-[#d9dee2] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#59646e] hover:bg-[#f4f6f5] disabled:opacity-60">{olderLoading ? "Chargement…" : "Afficher les messages précédents"}</button>}{detail.messages.map((message) => <MessageBubble key={message.id} message={message} />)}<div ref={messagesEnd} /></div>
            </div>
            {(summary || suggestion) && <AIWorkPanel summary={summary} suggestion={suggestion} closeSummary={() => setSummary("")} useSuggestion={useSuggestion} />}
            <ReplyComposer detail={detail} sending={sending} aiLoading={aiLoading} aiDisabled={aiSettings?.pilot_response_mode === "PAUSED"} error={actionError} value={replyText} change={setReplyText} suggest={askAISuggestion} submit={reply} />
          </> : <InboxError text={actionError || "Cette conversation n’est plus disponible."} retry={() => selectedPhone && openConversation(selectedPhone)} />}
        </section>

        <aside className="hidden min-h-0 overflow-y-auto border-l border-[#e3e7ea] bg-[#fbfcfc] lg:block">
          {detail ? <ContextPanel detail={detail} changing={changingClient} setChanging={setChangingClient} clientQuery={clientQuery} setClientQuery={setClientQuery} matches={clientMatches} chooseClient={chooseClient} chooseDossier={chooseDossier} /> : <div className="p-5 text-[13px] text-[#737d86]">Sélectionnez une conversation pour afficher le client et son dossier.</div>}
        </aside>
      </section>
    </main>
    <OperationDrawer open={contextOpen} close={() => setContextOpen(false)} title="Client et dossier" description={detail?.phone} width="max-w-[520px]">
      {detail && <ContextPanel detail={detail} changing={changingClient} setChanging={setChangingClient} clientQuery={clientQuery} setClientQuery={setClientQuery} matches={clientMatches} chooseClient={chooseClient} chooseDossier={chooseDossier} />}
    </OperationDrawer>
    <OperationConfirmDialog open={requestedMode === "CONTROLLED_AUTO"} title="Activer les réponses automatiques contrôlées ?" description="SLAIVIO répondra seul uniquement aux salutations et aux questions couvertes par une connaissance publiée et non sensible. Les autres demandes resteront à reprendre par le responsable." confirmLabel="Activer ce mode" busy={modeBusy} intent="primary" close={() => setRequestedMode(null)} confirm={() => void saveAIMode("CONTROLLED_AUTO")} />
  </div>;
}

function ConversationRow({ item, active, open }: { item: InboxConversation; active: boolean; open: () => void }) {
  const name = item.client_name || "Contact à identifier";
  return <button type="button" onClick={open} className={`grid w-full grid-cols-[38px_minmax(0,1fr)_auto] gap-3 border-b border-[#edf0f2] px-4 py-3.5 text-left ${active ? "bg-[#edf8f2]" : "hover:bg-[#f8faf9]"}`}>
    <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e4eee9] text-[12px] font-bold text-[#087a46]">{initials(name)}</span>
    <span className="min-w-0"><span className="flex items-center gap-2"><span className="truncate text-[13px] font-semibold">{name}</span>{item.unread_count > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-[#087a46] px-1.5 text-[10px] font-bold text-white">{item.unread_count}</span>}</span><span className="mt-1 block truncate text-[12px] text-[#707b85]">{item.last_direction === "outbound" ? "Vous : " : ""}{item.last_message || "Pièce jointe"}</span>{item.dossier_reference && <span className="mt-1 block truncate text-[11px] text-[#8a939b]">{item.dossier_title || item.dossier_reference}</span>}</span>
    <span className="whitespace-nowrap text-[10px] text-[#8a939b]">{relativeTime(item.last_message_at)}</span>
  </button>;
}

function ConversationHeader({ detail, aiDisabled, aiLoading, summarize, back, info, close, attention }: { detail: InboxDetail; aiDisabled: boolean; aiLoading: boolean; summarize: () => void; back: () => void; info: () => void; close: () => void; attention: () => void }) {
  const closed = detail.assignment?.status === "CLOSED";
  return <header className="flex min-h-[64px] items-center justify-between gap-3 border-b border-[#e3e7ea] px-4 py-3"><div className="flex min-w-0 items-center gap-3"><button onClick={back} className="grid h-8 w-8 place-items-center rounded-[6px] hover:bg-[#f0f2f2] lg:hidden"><ArrowLeft size={16} /></button><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e6f4ed] text-[#087a46]"><UserRound size={17} /></span><div className="min-w-0"><h2 className="truncate text-[14px] font-semibold">{detail.client?.display_name || "Contact à identifier"}</h2><p className="mt-0.5 text-[11px] text-[#75808a]">{detail.phone}</p></div></div><div className="flex items-center gap-2"><PermissionGuard permission="inbox.ai.use"><OperationButton className="hidden sm:inline-flex" disabled={aiDisabled || aiLoading} onClick={summarize}><Sparkles size={14} /> Résumer</OperationButton></PermissionGuard><OperationButton className="lg:hidden" onClick={info}>Infos</OperationButton><PermissionGuard permission="inbox.manage"><OperationButton className="hidden xl:inline-flex" onClick={attention}><CircleAlert size={14} /> À reprendre</OperationButton><OperationButton onClick={close}>{closed ? "Réouvrir" : "Terminer"}</OperationButton></PermissionGuard></div></header>;
}

function MessageBubble({ message }: { message: InboxDetail["messages"][number] }) {
  const outgoing = message.direction === "outbound";
  return <article className={`max-w-[82%] rounded-[10px] px-3.5 py-2.5 text-[13px] leading-5 shadow-[0_1px_1px_rgba(15,23,42,.04)] ${outgoing ? "ml-auto bg-[#dff5e8] text-[#26332b]" : "mr-auto border border-[#e1e5e8] bg-white text-[#30373e]"}`}><p className="whitespace-pre-wrap break-words">{message.text_body || "Pièce jointe WhatsApp"}</p><p className={`mt-1 text-right text-[10px] ${message.send_status === "FAILED" ? "text-[#b42318]" : "text-[#7b868e]"}`}>{formatTime(message.created_at)}{outgoing ? ` · ${messageStatus(message.send_status)}` : ""}</p></article>;
}

function ReplyComposer({ detail, sending, aiLoading, aiDisabled, error, value, change, suggest, submit }: { detail: InboxDetail; sending: boolean; aiLoading: boolean; aiDisabled: boolean; error: string; value: string; change: (value: string) => void; suggest: () => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  const lastInbound = [...detail.messages].reverse().find((message) => message.direction === "inbound");
  const canReply = lastInbound ? Date.now() - new Date(lastInbound.created_at).getTime() <= 24 * 60 * 60 * 1000 : false;
  if (detail.assignment?.status === "CLOSED") return <div className="border-t border-[#e2e6e9] bg-white p-4 text-center text-[12px] text-[#69747d]">Cette conversation est terminée. Réouvrez-la pour répondre.</div>;
  if (!canReply) return <div className="border-t border-[#e2e6e9] bg-[#fffaf0] p-4 text-[12px] leading-5 text-[#76541d]">La fenêtre de réponse WhatsApp de 24 heures est terminée. Un modèle WhatsApp approuvé sera nécessaire pour reprendre la conversation.</div>;
  return <form onSubmit={submit} className="border-t border-[#e2e6e9] bg-white p-3"><div className="mx-auto flex max-w-[820px] items-end gap-2"><PermissionGuard permission="inbox.ai.use"><OperationButton type="button" className="h-10 w-10 px-0" disabled={aiDisabled || aiLoading} onClick={suggest} aria-label={aiDisabled ? "L’IA est en pause" : "Suggérer une réponse"} title={aiDisabled ? "L’IA est en pause" : "Suggérer une réponse"}><Sparkles size={16} /></OperationButton></PermissionGuard><textarea required name="message" value={value} onChange={(event) => change(event.target.value)} rows={2} maxLength={4000} placeholder="Écrire une réponse au nom de l’entreprise…" className={`${fieldClass} min-h-[44px] flex-1 resize-none py-2.5`} /><PermissionGuard permission="inbox.reply"><OperationButton type="submit" variant="primary" className="h-10 w-10 px-0" disabled={sending || !value.trim()} aria-label="Envoyer"><Send size={16} /></OperationButton></PermissionGuard></div>{error && <p className="mx-auto mt-2 max-w-[820px] text-[11px] text-[#b42318]">{error}</p>}</form>;
}

function AIModeControl({ settings, change }: { settings: InboxAISettings; change: (mode: InboxAIMode) => void }) {
  const labels: Record<InboxAIMode, string> = { SUGGESTION_ONLY: "Suggestion uniquement", CONTROLLED_AUTO: "Automatique contrôlé", PAUSED: "IA en pause" };
  return <PermissionGuard permission="inbox.ai.manage" fallback={<OperationStatus label={labels[settings.pilot_response_mode]} tone={settings.pilot_response_mode === "CONTROLLED_AUTO" ? "success" : settings.pilot_response_mode === "PAUSED" ? "neutral" : "info"} />}><label className="flex items-center gap-2"><Bot size={16} className="text-[#087a46]" /><span className="sr-only">Mode de réponse de l’IA</span><select value={settings.pilot_response_mode} onChange={(event) => change(event.target.value as InboxAIMode)} className="h-9 rounded-[6px] border border-[#d4d9df] bg-white px-3 text-[13px] font-semibold text-[#30363d] outline-none focus:border-[#12a865]"><option value="SUGGESTION_ONLY">Suggestion uniquement</option><option value="CONTROLLED_AUTO">Automatique contrôlé</option><option value="PAUSED">IA en pause</option></select></label></PermissionGuard>;
}

function AIWorkPanel({ summary, suggestion, closeSummary, useSuggestion }: { summary: string; suggestion: InboxAISuggestion | null; closeSummary: () => void; useSuggestion: () => void }) {
  return <section className="max-h-[210px] overflow-y-auto border-t border-[#dfe5e8] bg-[#f8fbfa] px-4 py-3"><div className="mx-auto grid max-w-[820px] gap-3">{summary && <div className="rounded-[8px] border border-[#dce7e1] bg-white p-3"><div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-[12px] font-semibold text-[#2f3b35]"><Sparkles size={14} className="text-[#087a46]" /> Résumé pour le responsable</p><button type="button" onClick={closeSummary} className="text-[11px] font-semibold text-[#68747d]">Fermer</button></div><p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[#56616a]">{summary}</p></div>}{suggestion && <div className="rounded-[8px] border border-[#cfe5d9] bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-[12px] font-semibold text-[#2f3b35]"><Bot size={14} className="text-[#087a46]" /> Réponse suggérée</p><div className="flex items-center gap-2"><OperationStatus label={suggestion.risk_level === "SAFE" ? "Source fiable" : suggestion.risk_level === "SENSITIVE" ? "Vérification obligatoire" : "À vérifier"} tone={suggestion.risk_level === "SAFE" ? "success" : suggestion.risk_level === "SENSITIVE" ? "danger" : "warning"} /><OperationButton onClick={useSuggestion} variant="primary">Utiliser</OperationButton></div></div><p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[#46524b]">{suggestion.response_text}</p>{suggestion.sources.length > 0 && <p className="mt-2 text-[11px] text-[#718078]">Sources : {suggestion.sources.map((source) => source.title).join(", ")}</p>}{!suggestion.eligible_for_auto && <p className="mt-2 text-[11px] font-medium text-[#8b5d18]">Cette réponse ne sera jamais envoyée automatiquement sans contrôle.</p>}</div>}</div></section>;
}

function ContextPanel({ detail, changing, setChanging, clientQuery, setClientQuery, matches, chooseClient, chooseDossier }: { detail: InboxDetail; changing: boolean; setChanging: (value: boolean) => void; clientQuery: string; setClientQuery: (value: string) => void; matches: DossierClientSearchResult[]; chooseClient: (client: DossierClientSearchResult) => void; chooseDossier: (id: string) => void }) {
  return <div className="grid gap-6 p-5"><section><div className="flex items-center justify-between"><h3 className="text-[12px] font-bold uppercase tracking-[.06em] text-[#737d86]">Client</h3><PermissionGuard permission="inbox.manage"><button onClick={() => setChanging(!changing)} className="text-[12px] font-semibold text-[#087a46]">{changing ? "Annuler" : detail.client ? "Changer" : "Identifier"}</button></PermissionGuard></div>{detail.client ? <div className="mt-3 rounded-[8px] border border-[#e0e4e7] bg-white p-3.5"><p className="text-[13px] font-semibold">{detail.client.display_name || "Nom à compléter"}</p><p className="mt-1 text-[11px] text-[#7a848d]">{detail.client.client_reference}</p><p className="mt-2 text-[12px] text-[#59646e]">{detail.client.phone || detail.phone}</p>{detail.client.email && <p className="mt-1 truncate text-[12px] text-[#59646e]">{detail.client.email}</p>}</div> : <p className="mt-3 rounded-[8px] bg-[#fff7e8] p-3 text-[12px] leading-5 text-[#76541d]">Ce numéro n’est pas encore relié à une fiche client identifiable.</p>}{changing && <div className="mt-3"><input autoFocus value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} placeholder="Nom ou téléphone" className={fieldClass} /><div className="mt-2 overflow-hidden rounded-[8px] border border-[#e0e4e7] bg-white">{matches.map((client) => <button key={client.id} onClick={() => chooseClient(client)} className="flex w-full items-center justify-between border-b border-[#edf0f2] px-3 py-2.5 text-left last:border-0 hover:bg-[#f7f9f8]"><span><span className="block text-[12px] font-semibold">{client.display_name}</span><span className="text-[11px] text-[#7a848d]">{client.client_reference} · {client.phone || client.email}</span></span><ArrowRight size={14} /></button>)}</div></div>}</section>
    <section><h3 className="text-[12px] font-bold uppercase tracking-[.06em] text-[#737d86]">Dossier lié</h3>{detail.client ? detail.dossiers.length ? <div className="mt-3"><select value={detail.assignment?.dossier_id || ""} onChange={(event) => chooseDossier(event.target.value)} className={fieldClass}><option value="">Aucun dossier sélectionné</option>{detail.dossiers.map((dossier) => <option key={dossier.id} value={dossier.id}>{dossier.title || dossier.dossier_reference}</option>)}</select>{detail.assignment?.dossier_id && <Link href={`/app/dossiers/${detail.assignment.dossier_id}`} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#087a46]">Ouvrir le dossier <ExternalLink size={13} /></Link>}</div> : <div className="mt-3 rounded-[8px] border border-dashed border-[#d7dcdf] bg-white p-3 text-[12px] leading-5 text-[#69747d]">Ce client n’est encore rattaché à aucun dossier.<Link href="/app/dossiers?create=1" className="mt-2 block font-semibold text-[#087a46]">Créer un dossier</Link></div> : <p className="mt-3 text-[12px] leading-5 text-[#737d86]">Identifiez d’abord le client pour afficher ses dossiers.</p>}</section>
    <section><h3 className="text-[12px] font-bold uppercase tracking-[.06em] text-[#737d86]">État</h3><div className="mt-3 flex flex-wrap gap-2"><OperationStatus label={detail.assignment?.status === "CLOSED" ? "Terminée" : "En cours"} tone={detail.assignment?.status === "CLOSED" ? "neutral" : "success"} />{detail.assignment?.requires_attention && <OperationStatus label="À reprendre" tone="warning" />}</div></section>
  </div>;
}

function EmptyConversation() { return <div className="grid h-full place-items-center p-8 text-center"><div><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#e8f3ee] text-[#087a46]"><MessageCircle size={20} /></span><h2 className="mt-4 text-[15px] font-semibold">Sélectionnez une conversation</h2><p className="mt-2 max-w-sm text-[12px] leading-5 text-[#737d86]">Les messages, le client et son dossier s’afficheront ensemble.</p></div></div>; }
function InboxError({ text, retry }: { text: string; retry: () => void }) { return <div className="grid h-full place-items-center p-6 text-center"><div><CircleAlert size={22} className="mx-auto text-[#b42318]" /><p className="mt-3 text-[13px] text-[#8f2f28]">{text}</p><OperationButton className="mt-4" onClick={retry}><RotateCw size={14} /> Réessayer</OperationButton></div></div>; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?"; }
function formatTime(value: string) { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function relativeTime(value: string) { const diff = Date.now() - new Date(value).getTime(); const minutes = Math.floor(diff / 60000); if (minutes < 1) return "À l’instant"; if (minutes < 60) return `${minutes} min`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} h`; return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(value)); }
function messageStatus(status?: string | null) { return status === "FAILED" ? "Échec" : status === "SENT" ? "Envoyé" : status === "DELIVERED" ? "Distribué" : status === "READ" ? "Lu" : "Envoi"; }
function suggestionFromStoredDraft(drafts: StoredInboxAIDraft[], detail: InboxDetail, mode: InboxAIMode): InboxAISuggestion | null { const lastInbound = [...detail.messages].reverse().find((message) => message.direction === "inbound"); const draft = drafts.find((item) => item.status === "DRAFT" && (!lastInbound || item.source_message_id === lastInbound.id)); if (!draft) return null; return { status: "ok", mode, response_text: draft.draft_text, confidence: Number(draft.confidence || 0), risk_level: draft.risk_level, reason: draft.review_reason || "suggestion_prete", eligible_for_auto: draft.decision === "AUTO_REPLY", draft: { id: draft.id, draft_text: draft.draft_text }, sources: (draft.source_titles || []).map((title, index) => ({ id: draft.source_ids[index] || title, title })) }; }
function apiError(cause: unknown) { if (cause instanceof Error && !axios.isAxiosError(cause)) return ["send_failed", "provider_rejected_message", "message_delivery_failed"].includes(cause.message) ? "Le message n’a pas pu être envoyé." : cause.message; if (!axios.isAxiosError(cause)) return "Une erreur inattendue est survenue."; if (!cause.response) return "Le serveur ne répond pas. Réessayez dans un instant."; const code = cause.response.data?.detail; const labels: Record<string, string> = { conversation_not_found: "Cette conversation n’existe plus.", client_not_found: "Ce client n’existe plus.", client_not_in_dossier: "Ce dossier ne contient pas ce client.", stale_conversation_version: "La conversation a été modifiée ailleurs. Actualisez-la.", ai_paused: "L’IA est actuellement en pause pour l’entreprise.", ai_provider_unavailable: "Le service IA est momentanément indisponible. Vous pouvez répondre manuellement.", inbound_message_not_found: "Aucun nouveau message client ne peut être utilisé pour préparer une réponse.", "No WhatsApp number available": "Aucun numéro WhatsApp actif n’est configuré pour l’entreprise." }; return labels[String(code)] || "L’opération n’a pas pu être terminée."; }
