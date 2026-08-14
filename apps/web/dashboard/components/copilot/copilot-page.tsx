"use client";

import {
  Check,
  ChevronRight,
  FileCheck2,
  Mic,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { listClients, type ClientRecord } from "@/services/clients";

import { ErrorState, LoadingState } from "@/components/ui/page-state";
import {
  approveCopilotWorkflow,
  getCopilotEscalations,
  getCopilotMessages,
  getCopilotWorkflows,
  rejectCopilotWorkflow,
  sendCopilotMessage,
  type CopilotEscalation,
  type CopilotMessage,
  type CopilotWorkflow,
} from "@/services/copilot";

type Tab = "conversation" | "actions" | "escalations";
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const workflowLabels: Record<string, string> = {
  CREATE_SHIPMENT_DRAFT: "Préparer un dossier client",
  TRACKING_LOOKUP: "Rechercher un colis",
  PRICING_ANSWER: "Préparer une réponse tarifaire",
  ESCALATION_REQUIRED: "Transmettre à un responsable",
  NO_WORKFLOW: "Demande à préciser",
};

export function CopilotPage() {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [workflows, setWorkflows] = useState<CopilotWorkflow[]>([]);
  const [escalations, setEscalations] = useState<CopilotEscalation[]>([]);
  const [tab, setTab] = useState<Tab>("conversation");
  const [prompt, setPrompt] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [messageData, workflowData, escalationData, clientData] = await Promise.all([
        getCopilotMessages(),
        getCopilotWorkflows(),
        getCopilotEscalations(),
        listClients({ page: 1, page_size: 100, sort: "recent" }),
      ]);
      setMessages(messageData);
      setWorkflows(workflowData);
      setEscalations(escalationData);
      setClients(clientData.items);
    } catch {
      setError("L’espace IA n’a pas pu être chargé.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const submit = async () => {
    const content = prompt.trim();
    if (!content || sending) return;
    setSending(true);
    setError("");
    const temporary: CopilotMessage = {
      id: `temporary-${Date.now()}`,
      role: "USER",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, temporary]);
    setPrompt("");
    try {
      const result = await sendCopilotMessage(content, clientPhone.trim());
      setMessages((current) => [...current.filter((item) => item.id !== temporary.id), temporary, result.message]);
      if (result.workflow.workflow_status === "PREPARED") {
        setWorkflows((current) => [
          result.workflow,
          ...current.filter((item) => item.id !== result.workflow.id),
        ]);
      }
    } catch {
      setMessages((current) => current.filter((item) => item.id !== temporary.id));
      setPrompt(content);
      setError("La demande n’a pas été envoyée. Réessayez.");
    } finally {
      setSending(false);
    }
  };

  const decide = async (workflowId: string, decision: "approve" | "reject") => {
    setError("");
    try {
      if (decision === "approve") await approveCopilotWorkflow(workflowId);
      else await rejectCopilotWorkflow(workflowId);
      setWorkflows((current) => current.filter((item) => item.id !== workflowId));
    } catch {
      setError(decision === "approve" ? "Cette action ne peut pas encore être validée." : "Le rejet n’a pas été enregistré.");
    }
  };

  const toggleDictation = () => {
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }
    const SpeechRecognition = (window as typeof window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("La dictée vocale n’est pas disponible dans ce navigateur.");
      return;
    }
    const instance = new SpeechRecognition();
    instance.lang = "fr-FR";
    instance.continuous = false;
    instance.interimResults = false;
    instance.onresult = (event) => setPrompt((current) => `${current}${current ? " " : ""}${event.results[0][0].transcript}`);
    instance.onend = () => setListening(false);
    instance.onerror = () => setListening(false);
    recognition.current = instance;
    setListening(true);
    instance.start();
  };

  if (loading) return <LoadingState label="Préparation de l’assistant…" />;
  if (error && !messages.length && !workflows.length) return <ErrorState title="Assistant indisponible" description={error} retry={load} />;

  return (
    <div className="flex h-[calc(100dvh-56px)] min-h-[620px] flex-col overflow-hidden bg-[#f7f7f6] text-[#282c30]">
      <header className="border-b border-[#dfe1e3] bg-white px-5 py-3.5 sm:px-6">
        <div className="flex min-h-[44px] items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><Sparkles size={18} className="text-[#087a46]" /><h1 className="text-[20px] font-semibold">Assistant Slaivio</h1></div>
            <p className="mt-1 text-[12px] text-[#69717a]">Préparez les opérations, contrôlez les actions et reprenez les conversations sensibles.</p>
          </div>
        </div>
      </header>

      <nav className="flex h-11 items-end gap-5 border-b border-[#dfe1e3] bg-white px-5 sm:px-6" aria-label="Vues de l’assistant">
        <TabButton active={tab === "conversation"} onClick={() => setTab("conversation")}>Conversation</TabButton>
        <TabButton active={tab === "actions"} onClick={() => setTab("actions")} count={workflows.length}>Actions à valider</TabButton>
        <TabButton active={tab === "escalations"} onClick={() => setTab("escalations")} count={escalations.length}>Escalades</TabButton>
      </nav>

      {error && <div className="mx-5 mt-4 flex items-center border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700"><ShieldAlert size={15} className="mr-2" />{error}<button className="ml-auto" onClick={() => setError("")} aria-label="Fermer"><X size={14} /></button></div>}

      {tab === "conversation" && (
        <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-0 flex-col bg-white">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8">
              {!messages.length && <WelcomeMessage setPrompt={setPrompt} />}
              {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
              {sending && <div className="flex items-center gap-2 text-[12px] text-[#737a82]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#087a46]" />Slaivio analyse la demande…</div>}
              <div ref={endRef} />
            </div>
            <div className="border-t border-[#dfe1e3] bg-[#fafafa] p-4 sm:px-8">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label htmlFor="client-phone" className="text-[11px] font-medium text-[#60676f]">Travailler pour</label>
                <select id="client-phone" value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} className="h-8 min-w-64 rounded-[5px] border border-[#d3d6d9] bg-white px-2 text-[11px] outline-none focus:border-[#16855f]">
                  <option value="">Aucun client — action générale</option>
                  {clients.map((client)=><option key={client.id} value={client.whatsapp_phone||client.phone||""}>{client.display_name||client.company_name||client.name||client.phone||"Client"}{client.phone?` · ${client.phone}`:""}</option>)}
                </select>
                <span className="text-[10px] text-[#858b92]">À choisir seulement si la demande concerne le dossier, les colis ou le suivi d’un client.</span>
              </div>
              <div className="flex items-end gap-2 rounded-[7px] border border-[#cfd3d6] bg-white p-2 focus-within:border-[#16855f] focus-within:ring-1 focus-within:ring-[#16855f]/15">
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} rows={2} placeholder="Décrivez l’action à effectuer…" className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] leading-5 outline-none" />
                <button type="button" onClick={toggleDictation} className={`grid h-8 w-8 shrink-0 place-items-center rounded-[5px] border ${listening ? "border-red-200 bg-red-50 text-red-600" : "border-[#d7dadd] hover:bg-[#f2f3f3]"}`} title={listening ? "Arrêter la dictée" : "Dicter la demande"}>{listening ? <Square size={13} /> : <Mic size={15} />}</button>
                <button type="button" onClick={() => void submit()} disabled={!prompt.trim() || sending} className="grid h-8 w-8 shrink-0 place-items-center rounded-[5px] bg-[#087a46] text-white hover:bg-[#076b3e] disabled:bg-[#b9c4bf]" title="Envoyer"><Send size={14} /></button>
              </div>
            </div>
          </section>

          <aside className="border-l border-[#dfe1e3] bg-[#f7f7f6] p-4">
            <div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold">À contrôler</h2><button className="text-[11px] text-[#087a46]" onClick={() => setTab("actions")}>Tout voir</button></div>
            <div className="mt-3 space-y-3">
              {workflows.slice(0, 3).map((workflow) => <WorkflowCard key={workflow.id} workflow={workflow} decide={decide} compact />)}
              {!workflows.length && <div className="border-y border-[#dfe1e3] bg-white px-4 py-8 text-center text-[11px] text-[#7b8289]"><Check size={18} className="mx-auto mb-2 text-emerald-600" />Aucune action en attente.</div>}
            </div>
          </aside>
        </main>
      )}

      {tab === "actions" && <ListPanel title="Actions à valider" description="Chaque opération reste en attente jusqu’à votre décision.">{workflows.length ? workflows.map((workflow) => <WorkflowCard key={workflow.id} workflow={workflow} decide={decide} />) : <EmptyLine text="Aucune action en attente de validation." />}</ListPanel>}
      {tab === "escalations" && <ListPanel title="Escalades IA" description="Demandes sensibles ou ambiguës qui attendent une réponse de l’agence.">{escalations.length ? escalations.map((item) => <EscalationRow key={item.id} escalation={item} />) : <EmptyLine text="Aucune escalade à traiter." />}</ListPanel>}
    </div>
  );
}

function TabButton({ active, onClick, count, children }: { active: boolean; onClick: () => void; count?: number; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`flex h-10 items-center border-b-2 px-1 text-[12px] font-medium ${active ? "border-[#087a46] text-[#075f39]" : "border-transparent text-[#687079] hover:text-[#282c30]"}`}>{children}{count ? <span className="ml-2 rounded-full bg-[#edf0ef] px-1.5 py-0.5 text-[9px]">{count}</span> : null}</button>;
}

function MessageBubble({ message }: { message: CopilotMessage }) {
  const user = message.role === "USER";
  return <div className={`flex ${user ? "justify-end" : "justify-start"}`}><div className={`max-w-[720px] rounded-[7px] px-4 py-3 text-[13px] leading-5 ${user ? "bg-[#25292d] text-white" : "border border-[#dfe1e3] bg-[#f7f8f8]"}`}>{!user && <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-[#087a46]"><Sparkles size={12} />Slaivio</span>}{message.content}</div></div>;
}

function WelcomeMessage({ setPrompt }: { setPrompt: (value: string) => void }) {
  return <div className="mx-auto max-w-2xl py-16 text-center"><span className="mx-auto grid h-10 w-10 place-items-center rounded-[7px] bg-[#e5f3ed] text-[#087a46]"><Sparkles size={19} /></span><h2 className="mt-4 text-[17px] font-semibold">Que doit préparer Slaivio ?</h2><p className="mt-1 text-[12px] text-[#727981]">Les actions sensibles vous seront toujours soumises avant exécution.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{["Prépare un dossier pour ce client", "Recherche le statut de ce colis", "Calcule un tarif pour cette route"].map((item) => <button key={item} onClick={() => setPrompt(item)} className="h-8 rounded-[5px] border border-[#d3d6d9] bg-white px-3 text-[11px] hover:bg-[#f4f5f5]">{item}</button>)}</div></div>;
}

function WorkflowCard({ workflow, decide, compact = false }: { workflow: CopilotWorkflow; decide: (id: string, decision: "approve" | "reject") => Promise<void>; compact?: boolean }) {
  const internal = workflow.client_phone.startsWith("internal:");
  const entities = workflow.entities || {};
  const incomplete = internal || !entities.origin_country || !entities.destination_city || !entities.goods_type;
  return <article className="border-y border-[#d9dcdf] bg-white"><div className="px-4 py-3"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-[5px] bg-[#e8f3ee] text-[#087a46]"><FileCheck2 size={16} /></span><div className="min-w-0 flex-1"><h3 className="text-[12px] font-semibold">{workflowLabels[workflow.workflow_type] || workflow.workflow_type}</h3><p className={`mt-1 text-[11px] leading-4 text-[#737a82] ${compact ? "line-clamp-2" : ""}`}>{workflow.source_message}</p>{!internal && <p className="mt-2 text-[10px] text-[#596169]">Client · {workflow.client_phone}</p>}{incomplete && workflow.workflow_type === "CREATE_SHIPMENT_DRAFT" && <p className="mt-2 text-[10px] font-medium text-amber-700">Informations à compléter dans la conversation</p>}</div></div></div><div className="flex border-t border-[#eceeef]"><button onClick={() => void decide(workflow.id, "reject")} className="flex h-9 flex-1 items-center justify-center gap-1.5 border-r border-[#eceeef] text-[11px] hover:bg-[#f7f8f8]"><X size={13} />Rejeter</button><button onClick={() => void decide(workflow.id, "approve")} disabled={incomplete || workflow.workflow_type !== "CREATE_SHIPMENT_DRAFT"} title={incomplete ? "Complétez les informations dans la conversation" : undefined} className="flex h-9 flex-1 items-center justify-center gap-1.5 text-[11px] font-medium text-[#087a46] hover:bg-[#f0f7f4] disabled:cursor-not-allowed disabled:text-[#a4aaa7] disabled:hover:bg-white"><Check size={13} />Valider</button></div></article>;
}

function ListPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="mx-auto w-full max-w-5xl p-5 sm:p-7"><div className="mb-5"><h2 className="text-[17px] font-semibold">{title}</h2><p className="mt-1 text-[12px] text-[#737a82]">{description}</p></div><div className="space-y-3">{children}</div></main>;
}

function EscalationRow({ escalation }: { escalation: CopilotEscalation }) {
  return <article className="flex items-center gap-4 border-y border-[#d9dcdf] bg-white px-4 py-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-[5px] bg-amber-50 text-amber-700"><ShieldAlert size={17} /></span><div className="min-w-0 flex-1"><h3 className="truncate text-[12px] font-semibold">{escalation.escalation_reason || "Validation humaine requise"}</h3><p className="mt-1 line-clamp-2 text-[11px] text-[#737a82]">{escalation.message}</p></div><span className="hidden text-[10px] text-[#858b92] sm:block">{escalation.client_phone || "Interne"}</span><ChevronRight size={15} className="text-[#9ba1a7]" /></article>;
}

function EmptyLine({ text }: { text: string }) { return <div className="border-y border-[#d9dcdf] bg-white px-5 py-16 text-center text-[12px] text-[#7b8289]">{text}</div>; }
