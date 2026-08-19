"use client";

import {
  Check,
  BookOpenCheck,
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
import Link from "next/link";
import { listClients, type ClientRecord } from "@/services/clients";

import { ErrorState, LoadingState } from "@/components/ui/page-state";
import {
  approveCopilotWorkflow,
  getCopilotEscalations,
  getCopilotCapabilities,
  getCopilotMessages,
  getCopilotWorkflows,
  rejectCopilotWorkflow,
  sendCopilotMessage,
  type CopilotEscalation,
  type CopilotMessage,
  type CopilotWorkflow,
  type CopilotCapabilities,
} from "@/services/copilot";

type Tab = "conversation" | "capabilities" | "actions" | "escalations";
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
  CREATE_CLIENT: "Créer un client",
  CREATE_FOLLOWUP: "Programmer une relance",
  UPDATE_PACKAGE_STATUS: "Changer le statut d’un colis",
  UPDATE_FOLLOWUP: "Modifier une relance",
  CREATE_DEPARTURE: "Planifier un départ",
  CREATE_BATCH: "Créer un batch",
  CONVERT_BATCH_TO_SHIPMENT: "Créer une expédition",
  UPDATE_SHIPMENT_STATUS: "Mettre à jour une expédition",
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
  const [capabilities, setCapabilities] = useState<CopilotCapabilities>({ consultations: [], actions: [], safety: [] });
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
      const [messageData, workflowData, escalationData, clientData, capabilityData] = await Promise.all([
        getCopilotMessages(),
        getCopilotWorkflows(),
        getCopilotEscalations(),
        listClients({ page: 1, page_size: 100, sort: "recent" }),
        getCopilotCapabilities(),
      ]);
      setMessages(messageData);
      setWorkflows(workflowData);
      setEscalations(escalationData);
      setClients(clientData.items);
      setCapabilities(capabilityData);
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
      if (result.workflow?.workflow_status === "PREPARED") {
        setWorkflows((current) => [
          result.workflow!,
          ...current.filter((item) => item.id !== result.workflow!.id),
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
      const execution=decision === "approve" ? await approveCopilotWorkflow(workflowId) : null;
      if (decision === "reject") await rejectCopilotWorkflow(workflowId);
      setWorkflows((current) => current.filter((item) => item.id !== workflowId));
      if(execution?.result){
        const result=execution.result;
        const cards:NonNullable<CopilotMessage["metadata"]>["cards"]=[];
        if(result.client?.id)cards.push({kind:"CLIENT",id:String(result.client.id),title:String(result.client.display_name||result.client.name||"Client créé"),subtitle:String(result.client.phone||""),href:`/app/clients?open=${result.client.id}`});
        if(result.dossier?.id)cards.push({kind:"DOSSIER",id:String(result.dossier.id),title:String(result.dossier.dossier_reference||result.dossier.tracking_id||"Dossier créé"),subtitle:String(result.dossier.status_global||""),href:`/app/dossiers?open=${result.dossier.id}`});
        if(result.package?.id)cards.push({kind:"PACKAGE",id:String(result.package.id),title:String(result.package.package_reference||result.package.tracking_id||"Colis créé"),subtitle:String(result.package.status||""),href:`/app/packages?open=${result.package.id}`});
        if(result.followup?.id)cards.push({kind:"FOLLOWUP",id:String(result.followup.id),title:String(result.followup.reference||"Relance programmée"),subtitle:String(result.followup.status||""),href:`/app/followups?open=${result.followup.id}`});
        if(result.departure?.id)cards.push({kind:"DEPARTURE",id:String(result.departure.id),title:String(result.departure.departure_code||"Départ planifié"),subtitle:String(result.departure.status||""),href:`/app/departures?open=${result.departure.id}`});
        if(result.batch?.id)cards.push({kind:"BATCH",id:String(result.batch.id),title:String(result.batch.batch_code||"Batch créé"),subtitle:String(result.batch.status||""),href:`/app/batches?open=${result.batch.id}`});
        if(result.expedition?.id)cards.push({kind:"SHIPMENT",id:String(result.expedition.id),title:String(result.expedition.expedition_reference||"Expédition créée"),subtitle:String(result.expedition.status||""),href:`/app/shipments/${result.expedition.id}`});
        const created=cards.map((card)=>card.title).join(" · ");
        setMessages((current)=>[...current,{id:`execution-${workflowId}-${Date.now()}`,role:"ASSISTANT",content:`Opération terminée avec succès${created?` : ${created}`:""}.`,created_at:new Date().toISOString(),metadata:{dialogue_state:"EXECUTED",cards}}]);
        const refreshed=await listClients({page:1,page_size:100,sort:"recent"});setClients(refreshed.items);
      }
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
        <TabButton active={tab === "capabilities"} onClick={() => setTab("capabilities")}>Ce que je peux faire</TabButton>
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

      {tab === "capabilities" && <CapabilityPanel capabilities={capabilities} onExample={(example) => { setPrompt(example); setTab("conversation"); }} />}

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
  const choices=message.metadata?.choices||[];
  const cards=message.metadata?.cards||[];
  return <div className={`flex ${user ? "justify-end" : "justify-start"}`}><div className={`max-w-[720px] rounded-[7px] px-4 py-3 text-[13px] leading-5 ${user ? "bg-[#25292d] text-white" : "border border-[#dfe1e3] bg-[#f7f8f8]"}`}>{!user && <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-[#087a46]"><Sparkles size={12} />Slaivio</span>}<p className="whitespace-pre-line">{message.content}</p>{cards.length>0&&<div className="mt-3 grid gap-2 sm:grid-cols-2">{cards.slice(0,10).map(card=><Link key={`${card.kind}-${card.id}`} href={card.href} className="group rounded-[6px] border border-[#d8dedb] bg-white px-3 py-2.5 hover:border-[#8ab5a1] hover:bg-[#f7fbf9]"><span className="block truncate text-[11px] font-semibold text-[#26312c]">{card.title}</span><span className="mt-0.5 block truncate text-[10px] text-[#737b77]">{card.subtitle}</span><span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-[#087a46]">Ouvrir <ChevronRight size={11}/></span></Link>)}</div>}{choices.length>0&&<div className="mt-3 flex flex-wrap gap-2">{choices.map(choice=><span key={choice.value} className="rounded-full border border-[#cfd8d3] bg-white px-2.5 py-1 text-[11px] text-[#315a47]">{choice.label}</span>)}</div>}</div></div>;
}

function WelcomeMessage({ setPrompt }: { setPrompt: (value: string) => void }) {
  return <div className="mx-auto max-w-2xl py-16 text-center"><span className="mx-auto grid h-10 w-10 place-items-center rounded-[7px] bg-[#e5f3ed] text-[#087a46]"><Sparkles size={19} /></span><h2 className="mt-4 text-[17px] font-semibold">Que doit préparer Slaivio ?</h2><p className="mt-1 text-[12px] text-[#727981]">Les actions sensibles vous seront toujours soumises avant exécution.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{["Prépare un dossier pour ce client", "Recherche le statut de ce colis", "Calcule un tarif pour cette route"].map((item) => <button key={item} onClick={() => setPrompt(item)} className="h-8 rounded-[5px] border border-[#d3d6d9] bg-white px-3 text-[11px] hover:bg-[#f4f5f5]">{item}</button>)}</div></div>;
}

function WorkflowCard({ workflow, decide, compact = false }: { workflow: CopilotWorkflow; decide: (id: string, decision: "approve" | "reject") => Promise<void>; compact?: boolean }) {
  const internal = workflow.client_phone.startsWith("internal:");
  const entities = workflow.entities || {};
  const clientWorkflow=workflow.workflow_type==="CREATE_CLIENT";
  const followupWorkflow=workflow.workflow_type==="CREATE_FOLLOWUP";
  const followupMutation=workflow.workflow_type==="UPDATE_FOLLOWUP";
  const departureWorkflow=workflow.workflow_type==="CREATE_DEPARTURE";
  const batchWorkflow=workflow.workflow_type==="CREATE_BATCH";
  const batchConversion=workflow.workflow_type==="CONVERT_BATCH_TO_SHIPMENT";
  const shipmentStatusWorkflow=workflow.workflow_type==="UPDATE_SHIPMENT_STATUS";
  const statusWorkflow=workflow.workflow_type==="UPDATE_PACKAGE_STATUS";
  const incomplete = clientWorkflow ? internal || !entities.client_name : followupWorkflow ? internal || !entities.client_id || !entities.followup_reason || !entities.due_at : followupMutation ? !entities.followup_id || !entities.mutation_action || !entities.row_version : departureWorkflow ? !entities.route_id || !entities.shipping_service_id || !entities.scheduled_at : batchWorkflow ? !entities.route_id || !entities.shipping_service_id || !entities.origin_warehouse_id : batchConversion ? !entities.batch_id || !entities.batch_code : shipmentStatusWorkflow ? !entities.expedition_id || !entities.target_status || entities.row_version===undefined : statusWorkflow ? !entities.package_id || !entities.target_status : internal || !entities.origin_country || !entities.destination_city || !entities.goods_type;
  const executionAge = Date.now() - new Date(workflow.updated_at || workflow.created_at).getTime();
  const executing = workflow.workflow_status === "EXECUTING" && executionAge < 120_000;
  if(shipmentStatusWorkflow)return <article className="rounded-[8px] border border-[#d9dcdf] bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]"><div className="px-4 py-3"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-[5px] bg-[#e8f3ee] text-[#087a46]"><FileCheck2 size={16}/></span><div className="min-w-0 flex-1"><h3 className="text-[12px] font-semibold">Mettre à jour une expédition</h3><p className={`mt-1 text-[11px] leading-4 text-[#737a82] ${compact?"line-clamp-2":""}`}>{workflow.source_message}</p><div className="mt-2 grid gap-1 text-[10px] text-[#596169]"><span>Expédition : {String(entities.expedition_reference||"À compléter")}</span><span>État actuel : {String(entities.current_status_label||entities.current_status||"Non renseigné")}</span><span>Nouvel état : {String(entities.target_status_label||entities.target_status||"À compléter")}</span></div>{workflow.workflow_status==="FAILED"&&<p className="mt-2 text-[10px] font-medium text-red-700">La modification a échoué. Rechargez l’état avant de réessayer si l’expédition a changé.</p>}</div></div></div><div className="flex border-t border-[#eceeef]"><button onClick={()=>void decide(workflow.id,"reject")} disabled={executing} className="flex h-9 flex-1 items-center justify-center gap-1.5 border-r border-[#eceeef] text-[11px] hover:bg-[#f7f8f8] disabled:text-[#a4aaa7]"><X size={13}/>Annuler</button><button onClick={()=>void decide(workflow.id,"approve")} disabled={executing||incomplete} className="flex h-9 flex-1 items-center justify-center gap-1.5 text-[11px] font-medium text-[#087a46] hover:bg-[#f0f7f4] disabled:text-[#a4aaa7]"><Check size={13}/>{workflow.workflow_status==="FAILED"?"Réessayer":"Exécuter"}</button></div></article>;
  if(batchConversion)return <article className="rounded-[8px] border border-[#d9dcdf] bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]"><div className="px-4 py-3"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-[5px] bg-[#e8f3ee] text-[#087a46]"><FileCheck2 size={16}/></span><div className="min-w-0 flex-1"><h3 className="text-[12px] font-semibold">Créer une expédition</h3><p className={`mt-1 text-[11px] leading-4 text-[#737a82] ${compact?"line-clamp-2":""}`}>{workflow.source_message}</p><div className="mt-2 grid gap-1 text-[10px] text-[#596169]"><span>Batch : {String(entities.batch_code||"À compléter")}</span><span>Route : {String(entities.route_name||"Non renseignée")}</span><span>Service : {String(entities.service_name||"Non renseigné")}</span><span>Colis concernés : {String(entities.package_count??0)}</span></div>{workflow.workflow_status==="FAILED"&&<p className="mt-2 text-[10px] font-medium text-red-700">L’exécution précédente a échoué. Vous pouvez réessayer sans créer de doublon.</p>}</div></div></div><div className="flex border-t border-[#eceeef]"><button onClick={()=>void decide(workflow.id,"reject")} disabled={executing} className="flex h-9 flex-1 items-center justify-center gap-1.5 border-r border-[#eceeef] text-[11px] hover:bg-[#f7f8f8] disabled:text-[#a4aaa7]"><X size={13}/>Annuler</button><button onClick={()=>void decide(workflow.id,"approve")} disabled={executing||incomplete} className="flex h-9 flex-1 items-center justify-center gap-1.5 text-[11px] font-medium text-[#087a46] hover:bg-[#f0f7f4] disabled:text-[#a4aaa7]"><Check size={13}/>{workflow.workflow_status==="FAILED"?"Réessayer":"Exécuter"}</button></div></article>;
  if(batchWorkflow)return <article className="rounded-[8px] border border-[#d9dcdf] bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]"><div className="px-4 py-3"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-[5px] bg-[#e8f3ee] text-[#087a46]"><FileCheck2 size={16}/></span><div className="min-w-0 flex-1"><h3 className="text-[12px] font-semibold">Créer un batch</h3><p className={`mt-1 text-[11px] leading-4 text-[#737a82] ${compact?"line-clamp-2":""}`}>{workflow.source_message}</p><div className="mt-2 grid gap-1 text-[10px] text-[#596169]"><span>Route : {String(entities.route_name||"À compléter")}</span><span>Service : {String(entities.service_name||"À compléter")}</span><span>Entrepôt : {String(entities.origin_warehouse_name||"À compléter")}</span><span>État initial : brouillon à préparer</span></div>{incomplete&&<p className="mt-2 text-[10px] font-medium text-amber-700">Informations à compléter dans la conversation</p>}{workflow.workflow_status==="FAILED"&&<p className="mt-2 text-[10px] font-medium text-red-700">L’exécution précédente a échoué. Vous pouvez réessayer sans créer de doublon.</p>}</div></div></div><div className="flex border-t border-[#eceeef]"><button onClick={()=>void decide(workflow.id,"reject")} disabled={executing} className="flex h-9 flex-1 items-center justify-center gap-1.5 border-r border-[#eceeef] text-[11px] hover:bg-[#f7f8f8] disabled:text-[#a4aaa7]"><X size={13}/>Annuler</button><button onClick={()=>void decide(workflow.id,"approve")} disabled={executing||incomplete} className="flex h-9 flex-1 items-center justify-center gap-1.5 text-[11px] font-medium text-[#087a46] hover:bg-[#f0f7f4] disabled:text-[#a4aaa7]"><Check size={13}/>{workflow.workflow_status==="FAILED"?"Réessayer":"Exécuter"}</button></div></article>;
  return <article className="rounded-[8px] border border-[#d9dcdf] bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]"><div className="px-4 py-3"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-[5px] bg-[#e8f3ee] text-[#087a46]"><FileCheck2 size={16} /></span><div className="min-w-0 flex-1"><h3 className="text-[12px] font-semibold">{workflow.entities?.requested_operation==="CREATE_PACKAGE"?"Créer un colis":workflowLabels[workflow.workflow_type] || workflow.workflow_type}</h3><p className={`mt-1 text-[11px] leading-4 text-[#737a82] ${compact ? "line-clamp-2" : ""}`}>{workflow.source_message}</p>{!internal&&!statusWorkflow&&!followupMutation&&!departureWorkflow && <p className="mt-2 text-[10px] text-[#596169]">Client · {String(workflow.entities?.client_name||workflow.client_phone)}</p>}{clientWorkflow?<div className="mt-2 grid gap-1 text-[10px] text-[#596169]"><span>Nom : {String(entities.client_name||"À compléter")}</span><span>WhatsApp : {internal?"À compléter":workflow.client_phone}</span></div>:followupWorkflow?<div className="mt-2 grid gap-1 text-[10px] text-[#596169]"><span>Motif : {String(entities.followup_reason||"À compléter")}</span><span>Programmée : {String(entities.due_at||"À compléter")}</span><span>Canal : WhatsApp</span></div>:followupMutation?<div className="mt-2 grid gap-1 text-[10px] text-[#596169]"><span>Relance : {String(entities.followup_reference||"À compléter")}</span><span>État actuel : {String(entities.current_status||"Non renseigné")}</span><span>Action : {String(entities.action_label||"À compléter")}</span>{entities.due_at?<span>Nouvelle date : {String(entities.due_at)}</span>:null}</div>:departureWorkflow?<div className="mt-2 grid gap-1 text-[10px] text-[#596169]"><span>Route : {String(entities.route_name||"À compléter")}</span><span>Service : {String(entities.service_name||"À compléter")}</span><span>Départ prévu : {String(entities.scheduled_at||"À compléter")}</span><span>Publication : après validation opérationnelle</span></div>:statusWorkflow?<div className="mt-2 grid gap-1 text-[10px] text-[#596169]"><span>Colis : {String(entities.package_reference||"À compléter")}</span><span>Statut actuel : {String(entities.current_status||"Non renseigné")}</span><span>Nouveau statut : {String(entities.target_status||"À compléter")}</span></div>:<div className="mt-2 grid gap-1 text-[10px] text-[#596169]"><span>Origine : {String(workflow.entities?.origin_country||"À compléter")}</span><span>Destination : {String(workflow.entities?.destination_city||"À compléter")}</span><span>Marchandise : {String(workflow.entities?.goods_type||"À compléter")}</span></div>}{incomplete&&<p className="mt-2 text-[10px] font-medium text-amber-700">Informations à compléter dans la conversation</p>}{workflow.workflow_status==="FAILED"&&<p className="mt-2 text-[10px] font-medium text-red-700">L’exécution précédente a échoué. Vous pouvez réessayer sans créer de doublon.</p>}{executing&&<p className="mt-2 text-[10px] font-medium text-amber-700">Exécution en cours…</p>}</div></div></div><div className="flex border-t border-[#eceeef]"><button onClick={() => void decide(workflow.id, "reject")} disabled={executing} className="flex h-9 flex-1 items-center justify-center gap-1.5 border-r border-[#eceeef] text-[11px] hover:bg-[#f7f8f8] disabled:text-[#a4aaa7]"><X size={13} />Annuler</button><button onClick={() => void decide(workflow.id, "approve")} disabled={executing || incomplete || !["CREATE_SHIPMENT_DRAFT","CREATE_CLIENT","CREATE_FOLLOWUP","UPDATE_PACKAGE_STATUS","UPDATE_FOLLOWUP","CREATE_DEPARTURE"].includes(workflow.workflow_type)} title={incomplete ? "Complétez les informations dans la conversation" : undefined} className="flex h-9 flex-1 items-center justify-center gap-1.5 text-[11px] font-medium text-[#087a46] hover:bg-[#f0f7f4] disabled:cursor-not-allowed disabled:text-[#a4aaa7] disabled:hover:bg-white"><Check size={13} />{workflow.workflow_status==="FAILED"?"Réessayer":"Exécuter"}</button></div></article>;
}

function CapabilityPanel({ capabilities, onExample }: { capabilities: CopilotCapabilities; onExample: (value: string) => void }) {
  return <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f7f6] px-5 py-6 sm:px-8">
    <div className="mx-auto max-w-6xl">
      <div className="flex items-start gap-3 border-b border-[#dfe1e3] pb-5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-[6px] bg-[#e5f3ed] text-[#087a46]"><BookOpenCheck size={18}/></span><div><h2 className="text-[16px] font-semibold">Capacités disponibles pour votre compte</h2><p className="mt-1 text-[12px] text-[#6d747b]">Cette liste respecte vos permissions et les données configurées par votre agence.</p></div></div>
      <CapabilitySection title="Consulter et analyser" description="Ces demandes sont exécutées immédiatement, sans modifier les données." items={capabilities.consultations} onExample={onExample}/>
      <CapabilitySection title="Préparer et exécuter" description="Slaivio collecte et vérifie les informations, puis vous présente une action à confirmer." items={capabilities.actions} onExample={onExample}/>
      <section className="mt-7 border-t border-[#dfe1e3] pt-5"><h3 className="text-[13px] font-semibold">Garanties de fonctionnement</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{capabilities.safety.map(item=><div key={item} className="flex gap-2 rounded-[7px] bg-white px-3 py-3 text-[11px] text-[#596169] shadow-[0_1px_2px_rgba(15,23,42,.04)]"><Check size={14} className="mt-0.5 shrink-0 text-[#087a46]"/>{item}</div>)}</div></section>
    </div>
  </div>;
}

function CapabilitySection({ title, description, items, onExample }: { title: string; description: string; items: CopilotCapabilities["consultations"]; onExample: (value: string) => void }) {
  return <section className="mt-7"><h3 className="text-[13px] font-semibold">{title}</h3><p className="mt-1 text-[11px] text-[#777e85]">{description}</p>{items.length?<div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map(item=><article key={item.id} className="flex min-h-36 flex-col rounded-[8px] border border-[#dfe1e3] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.03)]"><h4 className="text-[12px] font-semibold">{item.title}</h4><p className="mt-1.5 flex-1 text-[11px] leading-4 text-[#697078]">{item.description}</p><button type="button" onClick={()=>onExample(item.example)} className="mt-4 flex items-center justify-between border-t border-[#eceeef] pt-3 text-left text-[10px] font-medium text-[#087a46]"><span className="truncate">Essayer : « {item.example} »</span><ChevronRight size={12}/></button></article>)}</div>:<p className="mt-3 text-[11px] text-[#777e85]">Aucune capacité disponible avec vos permissions actuelles.</p>}</section>;
}

function ListPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="mx-auto w-full max-w-5xl p-5 sm:p-7"><div className="mb-5"><h2 className="text-[17px] font-semibold">{title}</h2><p className="mt-1 text-[12px] text-[#737a82]">{description}</p></div><div className="space-y-3">{children}</div></main>;
}

function EscalationRow({ escalation }: { escalation: CopilotEscalation }) {
  return <article className="flex items-center gap-4 border-y border-[#d9dcdf] bg-white px-4 py-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-[5px] bg-amber-50 text-amber-700"><ShieldAlert size={17} /></span><div className="min-w-0 flex-1"><h3 className="truncate text-[12px] font-semibold">{escalation.escalation_reason || "Validation humaine requise"}</h3><p className="mt-1 line-clamp-2 text-[11px] text-[#737a82]">{escalation.message}</p></div><span className="hidden text-[10px] text-[#858b92] sm:block">{escalation.client_phone || "Interne"}</span><ChevronRight size={15} className="text-[#9ba1a7]" /></article>;
}

function EmptyLine({ text }: { text: string }) { return <div className="border-y border-[#d9dcdf] bg-white px-5 py-16 text-center text-[12px] text-[#7b8289]">{text}</div>; }
