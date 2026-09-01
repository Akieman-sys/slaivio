"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Check, Loader2, MessageCircle, RefreshCcw, ShieldCheck, Smartphone, UserRound, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { OperationButton, OperationStatus } from "@/components/ui/operation-controls";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { updateInboxAIMode, type InboxAIMode } from "@/services/inbox";
import {
  getPilotSettings,
  disconnectPilotWhatsappQR,
  getPilotWhatsappQRStatus,
  savePilotNumbering,
  savePilotKnowledgeDefaults,
  startPilotWhatsappQR,
  updateOrganization,
  type PilotSettingsData,
  type PilotQRConnection,
} from "@/services/organization-admin";

const sections = [
  ["company", "Entreprise"],
  ["responsible", "Responsable"],
  ["identifiers", "Identifiants"],
  ["communication", "WhatsApp & IA"],
  ["knowledge", "Connaissances"],
] as const;
type Section = (typeof sections)[number][0];
const inputClass = "h-10 w-full rounded-[7px] border border-[#d5dade] bg-white px-3 text-[14px] text-[#293038] outline-none transition focus:border-[#12a865] focus:ring-2 focus:ring-[#12c76f]/10";

export function PilotSettingsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [section, setSection] = useState<Section>("company");
  const [data, setData] = useState<PilotSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getPilotSettings());
      setError("");
    } catch {
      setError("Les paramètres de l’entreprise ne peuvent pas être chargés pour le moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const requested = params.get("section") as Section | null;
    if (requested && sections.some(([key]) => key === requested)) setSection(requested);
  }, [params]);

  function choose(next: Section) {
    setSection(next);
    setNotice("");
    router.replace(`/app/settings?section=${next}`, { scroll: false });
  }

  async function run(action: () => Promise<unknown>, message: string) {
    try {
      setError("");
      setNotice("");
      await action();
      setNotice(message);
      await load();
    } catch (exception) {
      const detail = (exception as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const labels: Record<string, string> = {
        pilot_whatsapp_number_not_connected: "Ce numéro WhatsApp n’est pas encore prêt à envoyer et recevoir des messages.",
        pilot_knowledge_settings_modified: "Ces réglages ont été modifiés dans une autre session. Rechargez la page.",
        numbering_was_modified: "Cet identifiant a été modifié dans une autre session. Rechargez la page.",
        organization_was_modified: "Les informations de l’entreprise ont été modifiées dans une autre session.",
      };
      setError(labels[detail || ""] || "La modification n’a pas pu être enregistrée.");
    }
  }

  if (loading && !data) return <LoadingState label="Chargement des paramètres…" />;
  if (!data) return <ErrorState title="Paramètres indisponibles" description={error} retry={load} />;

  return <div className="min-h-full bg-[#f7f7f6]">
    <OperationPageHeader title="Paramètres" description="Configurez uniquement ce qui est nécessaire au fonctionnement quotidien de votre entreprise." actions={<OperationButton onClick={load}><RefreshCcw size={14}/>Actualiser</OperationButton>}/>
    <div className="grid min-h-[calc(100vh-132px)] lg:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="hidden border-r border-[#e1e4e6] bg-[#fafafa] px-3 py-5 lg:block">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-[#8a9299]">Configuration</p>
        <nav className="grid gap-1">{sections.map(([key, label]) => <button key={key} type="button" onClick={() => choose(key)} className={`min-h-10 rounded-[7px] px-3 text-left text-[14px] font-medium transition ${section === key ? "bg-[#e7f5ef] text-[#126347]" : "text-[#46515a] hover:bg-[#eeeeed]"}`}>{label}</button>)}</nav>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[920px]">
          <label className="mb-5 grid gap-2 text-[13px] font-semibold text-[#4b5660] lg:hidden">Section<select className={inputClass} value={section} onChange={(event) => choose(event.target.value as Section)}>{sections.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {notice && <div className="mb-5 rounded-[8px] border border-[#bfe6d2] bg-[#f0faf5] px-4 py-3 text-[13px] text-[#176142]">{notice}</div>}
          {error && <div className="mb-5 rounded-[8px] border border-[#efd0cc] bg-[#fff6f5] px-4 py-3 text-[13px] text-[#9d352d]">{error}</div>}
          {section === "company" && <CompanySettings data={data} run={run}/>} 
          {section === "responsible" && <ResponsibleSettings data={data}/>} 
          {section === "identifiers" && <IdentifierSettings data={data} run={run}/>} 
          {section === "communication" && <CommunicationSettings data={data} run={run}/>} 
          {section === "knowledge" && <KnowledgeSettings data={data} run={run}/>} 
        </div>
      </main>
    </div>
  </div>;
}

function SectionHeader({title, description}:{title:string;description:string}) {
  return <header className="mb-6 border-b border-[#e2e5e7] pb-5"><h2 className="text-[21px] font-semibold tracking-[-.015em] text-[#252c32]">{title}</h2><p className="mt-1.5 max-w-[680px] text-[13px] leading-5 text-[#69747d]">{description}</p></header>;
}

function SettingsCard({title, description, children}:{title:string;description?:string;children:React.ReactNode}) {
  return <section className="overflow-hidden rounded-[10px] border border-[#dfe3e6] bg-white shadow-[0_1px_2px_rgba(15,23,42,.025)]"><header className="border-b border-[#e6e9eb] px-5 py-4"><h3 className="text-[15px] font-semibold text-[#30383f]">{title}</h3>{description && <p className="mt-1 text-[12px] leading-5 text-[#77818a]">{description}</p>}</header><div className="p-5">{children}</div></section>;
}

function Field({label, hint, children}:{label:string;hint?:string;children:React.ReactNode}) {
  return <label className="grid gap-2"><span className="text-[13px] font-semibold text-[#404b54]">{label}</span>{children}{hint && <span className="text-[12px] leading-5 text-[#7a858e]">{hint}</span>}</label>;
}

function CompanySettings({data,run}:{data:PilotSettingsData;run:(action:()=>Promise<unknown>,message:string)=>Promise<void>}) {
  const organization = data.organization;
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key:string) => String(form.get(key) || "").trim() || null;
    await run(() => updateOrganization({
      expected_version: organization.row_version,
      organization_name: value("organization_name"), legal_name: value("legal_name"),
      phone: value("phone"), email: value("email"), website: value("website"),
      country: value("country"), city: value("city"), address: value("address"),
    }), "Les informations de l’entreprise ont été enregistrées.");
  }
  return <><SectionHeader title="Entreprise" description="Ces coordonnées identifient votre entreprise dans SLAIVIO et dans les communications autorisées."/><SettingsCard title="Identité et coordonnées"><form onSubmit={submit} className="grid gap-5"><div className="grid gap-5 sm:grid-cols-2"><Field label="Nom de l’entreprise"><input name="organization_name" required defaultValue={organization.organization_name || ""} className={inputClass}/></Field><Field label="Raison sociale" hint="Optionnel si elle est différente du nom utilisé avec les clients."><input name="legal_name" defaultValue={organization.legal_name || ""} className={inputClass}/></Field></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Téléphone"><input name="phone" type="tel" defaultValue={organization.phone || ""} className={inputClass}/></Field><Field label="Email"><input name="email" type="email" defaultValue={organization.email || ""} className={inputClass}/></Field></div><Field label="Site web"><input name="website" type="url" defaultValue={organization.website || ""} className={inputClass} placeholder="https://"/></Field><div className="grid gap-5 sm:grid-cols-2"><Field label="Pays"><input name="country" defaultValue={organization.country || ""} className={inputClass}/></Field><Field label="Ville"><input name="city" defaultValue={organization.city || ""} className={inputClass}/></Field></div><Field label="Adresse"><textarea name="address" defaultValue={organization.address || ""} className={`${inputClass} h-24 resize-none py-3`}/></Field><PermissionGuard permission="organization.manage"><div className="flex justify-end border-t border-[#e7eaec] pt-5"><OperationButton type="submit" variant="primary">Enregistrer</OperationButton></div></PermissionGuard></form></SettingsCard></>;
}

function ResponsibleSettings({data}:{data:PilotSettingsData}) {
  const person = data.responsible;
  return <><SectionHeader title="Responsable" description="Le Pilot est exploité par une personne responsable. Les rôles avancés restent masqués tant qu’ils ne sont pas nécessaires."/><SettingsCard title="Responsable principal" description="Cette personne peut administrer le Pilot et contrôler les réponses de l’IA.">{person ? <div className="flex flex-col gap-4 sm:flex-row sm:items-center"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#e7f6ef] text-[#126347]"><UserRound size={21}/></span><div className="min-w-0 flex-1"><p className="truncate text-[15px] font-semibold text-[#2d363e]">{person.member_display_name || "Responsable de l’entreprise"}</p><p className="mt-1 truncate text-[13px] text-[#6d7881]">{person.member_email || "Email non renseigné"}</p></div><div className="sm:text-right"><OperationStatus label="Accès actif" tone="success"/><p className="mt-2 text-[11px] text-[#818b93]">Dernière activité : {formatDate(person.last_seen_at)}</p></div></div> : <p className="text-[13px] text-[#727d85]">Aucun responsable actif n’a été trouvé. Contactez l’équipe SLAIVIO avant la mise en production.</p>}</SettingsCard></>;
}

function IdentifierSettings({data,run}:{data:PilotSettingsData;run:(action:()=>Promise<unknown>,message:string)=>Promise<void>}) {
  return <><SectionHeader title="Identifiants" description="Créez librement le format utilisé par votre entreprise. Il sera appliqué réellement à chaque nouveau client et à chaque nouveau dossier, quelle que soit leur origine."/><div className="grid gap-5">{data.numbering.map(item => <IdentifierEditor key={item.document_type} item={item} run={run}/>)}</div><div className="mt-5 rounded-[8px] border border-[#dce4e0] bg-[#f5faf7] px-4 py-3 text-[12px] leading-5 text-[#51665b]">Une modification concerne uniquement les prochaines créations. Les anciennes références restent inchangées pour préserver l’historique.</div></>;
}

function IdentifierEditor({item,run}:{item:PilotSettingsData["numbering"][number];run:(action:()=>Promise<unknown>,message:string)=>Promise<void>}) {
  const [format,setFormat]=useState(item.prefix_format);
  useEffect(()=>setFormat(item.prefix_format),[item.prefix_format]);
  const preview=format.replaceAll("{YYYY}",String(new Date().getFullYear())).replaceAll("{YEAR}",String(new Date().getFullYear())).replaceAll("{000001}",String(item.next_number).padStart(6,"0")).replaceAll("{SEQUENCE}",String(item.next_number));
  const valid=(format.includes("{000001}")?1:0)+(format.includes("{SEQUENCE}")?1:0)===1;
  return <SettingsCard title={item.document_type === "CLIENT" ? "Identifiant client" : "Identifiant dossier"} description={item.document_type === "CLIENT" ? "Référence générée lors de l’ajout d’un client." : "Référence générée lors de la création d’un dossier, y compris depuis WhatsApp."}>
    <form onSubmit={(event)=>{event.preventDefault();if(valid)void run(()=>savePilotNumbering(item.document_type,format,item.row_version),"Le format des identifiants a été enregistré et sera utilisé pour les prochaines créations.");}} className="grid gap-4">
      <Field label="Votre format" hint="Utilisez {YYYY} pour l’année et exactement un compteur : {000001} ou {SEQUENCE}."><input value={format} onChange={event=>setFormat(event.target.value)} className={inputClass} placeholder={item.document_type === "CLIENT" ? "MONAGENCE-CLI-{YYYY}-{000001}" : "MONAGENCE-DOS-{YYYY}-{000001}"}/></Field>
      <div className="flex flex-col gap-3 rounded-[8px] bg-[#f5f7f7] px-4 py-3 sm:flex-row sm:items-center"><span className="text-[12px] font-medium text-[#68737c]">Aperçu de la prochaine référence</span><strong className="break-all font-mono text-[14px] text-[#27323a] sm:ml-auto">{preview || "—"}</strong></div>
      {!valid&&<p className="text-[12px] text-[#a14a2b]">Ajoutez exactement un compteur <code>{"{000001}"}</code> ou <code>{"{SEQUENCE}"}</code>.</p>}
      <PermissionGuard permission="pilot.settings.manage"><div className="flex justify-end border-t border-[#e7eaec] pt-4"><OperationButton type="submit" variant="primary" disabled={!valid}>Enregistrer ce format</OperationButton></div></PermissionGuard>
    </form>
  </SettingsCard>;
}

const modeContent:Record<InboxAIMode,{title:string;description:string}> = {
  SUGGESTION_ONLY:{title:"Suggestion uniquement",description:"L’IA prépare la réponse. Le responsable la vérifie et l’envoie."},
  CONTROLLED_AUTO:{title:"Automatique contrôlé",description:"L’IA répond seule uniquement lorsque la réponse est fiable, publiée et sans risque."},
  PAUSED:{title:"IA en pause",description:"Aucune réponse ni suggestion IA n’est produite. Le responsable répond manuellement."},
};
function CommunicationSettings({data,run}:{data:PilotSettingsData;run:(action:()=>Promise<unknown>,message:string)=>Promise<void>}) {
  const [qrOpen,setQROpen]=useState(false);
  const [qrTerms,setQRTerms]=useState(false);
  const [qrConnection,setQRConnection]=useState<PilotQRConnection|null>(null);
  const [qrBusy,setQRBusy]=useState(false);
  const [qrError,setQRError]=useState("");
  const qrPollingStatus=qrConnection?.status;
  useEffect(()=>{
    if(!data.whatsapp_configuration.qr_linked_device_available)return;
    let active=true;
    getPilotWhatsappQRStatus().then(connection=>{if(active)setQRConnection(connection);}).catch(()=>undefined);
    return()=>{active=false;};
  },[data.whatsapp_configuration.qr_linked_device_available]);
  useEffect(()=>{
    if(!qrOpen||!qrPollingStatus||qrPollingStatus==="CONNECTED")return;
    const timer=window.setInterval(async()=>{
      try{setQRConnection(await getPilotWhatsappQRStatus());}catch{/* Le prochain passage réessaiera sans fermer le QR. */}
    },2500);
    return()=>window.clearInterval(timer);
  },[qrOpen,qrPollingStatus]);
  useEffect(()=>{
    if(!data.whatsapp_configuration.qr_linked_device_available||qrOpen)return;
    const timer=window.setInterval(()=>getPilotWhatsappQRStatus().then(setQRConnection).catch(()=>undefined),60_000);
    return()=>window.clearInterval(timer);
  },[data.whatsapp_configuration.qr_linked_device_available,qrOpen]);
  async function openQR(){setQROpen(true);setQRError("");try{setQRConnection(await getPilotWhatsappQRStatus());}catch{setQRConnection(null);}}
  async function generateQR(){setQRBusy(true);setQRError("");try{setQRConnection(await startPilotWhatsappQR(qrTerms));}catch(exception){const detail=(exception as {response?:{data?:{detail?:string}}})?.response?.data?.detail;setQRError(detail==="pilot_whatsapp_qr_gateway_unavailable"?"Le service de connexion rapide n’est pas encore déployé.":detail==="pilot_whatsapp_qr_cohort_full"?"La cohorte pilote est complète. Cette entreprise pourra être ajoutée après libération d’une place ou validation Meta.":"Le QR code n’a pas pu être généré. Réessayez.");}finally{setQRBusy(false);}}
  async function disconnectQR(){const id=qrConnection?.connection_id||qrConnection?.id;if(!id)return;setQRBusy(true);try{await disconnectPilotWhatsappQR(id);setQRConnection(null);setQROpen(false);await run(async()=>undefined,"L’appareil WhatsApp a été déconnecté et ses accès révoqués.");}finally{setQRBusy(false);}}
  const linkedNumber=data.whatsapp_numbers.find(number=>number.provider==="QR_LINKED_DEVICE");
  const connected=qrConnection?qrConnection.status==="CONNECTED":linkedNumber?.connection_status==="CONNECTED";
  const reconnecting=qrConnection?.status==="CONNECTING"||qrConnection?.status==="DISCONNECTED";
  const displayPhone=qrConnection?.display_phone_number||linkedNumber?.display_phone_number;
  return <><SectionHeader title="WhatsApp & IA" description="Reliez le numéro WhatsApp de l’entreprise à SLAIVIO, puis choisissez comment l’IA doit assister les conversations."/><div className="grid gap-5">
    {data.whatsapp_configuration.qr_linked_device_available&&<SettingsCard title="Connexion WhatsApp" description="Recevez et envoyez les messages de l’entreprise directement depuis la Boîte de réception SLAIVIO."><div className="grid gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-[10px] bg-[#e6f7ee] text-[#078349]"><MessageCircle size={24}/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-[15px] font-semibold text-[#29323a]">WhatsApp</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${connected?"bg-[#dff5e9] text-[#087848]":"bg-[#eef1f2] text-[#657079]"}`}>{connected?"1/1":"0/1"}</span></div><p className="mt-1 text-[12px] leading-5 text-[#6f7a83]">Liez le téléphone de l’entreprise en scannant un QR code. Aucun identifiant technique n’est demandé.</p></div><PermissionGuard permission="pilot.whatsapp_qr.connect"><OperationButton variant={connected?"secondary":"primary"} onClick={()=>void openQR()}><Smartphone size={15}/>{connected?"Gérer la connexion":"Lier un compte WhatsApp"}</OperationButton></PermissionGuard></div>
      {connected&&<div className="flex items-start gap-3 rounded-[9px] border border-[#bfe4d0] bg-[#f0faf5] p-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#d8f2e4] text-[#078349]"><Check size={17}/></span><div className="min-w-0"><p className="text-[13px] font-semibold text-[#176142]">WhatsApp est actif</p><p className="mt-1 text-[12px] leading-5 text-[#527064]">{displayPhone?`${displayPhone} est connecté à SLAIVIO.`:"Le numéro connecté est prêt."} La connexion est restaurée automatiquement après une interruption du service.</p></div></div>}
      {!connected&&reconnecting&&<div className="flex items-start gap-3 rounded-[9px] border border-[#eadfbd] bg-[#fffbef] p-4"><Loader2 size={17} className="mt-0.5 shrink-0 animate-spin text-[#8a6b18]"/><div><p className="text-[13px] font-semibold text-[#6d5a22]">Reconnexion automatique en cours</p><p className="mt-1 text-[12px] leading-5 text-[#796b43]">SLAIVIO tente de rétablir la session sans demander un nouveau QR code.</p></div></div>}
    </div></SettingsCard>}
    <SettingsCard title="Mode de réponse de l’IA" description="Le choix s’applique réellement et immédiatement à la Boîte de réception."><div className="grid gap-2">{(Object.keys(modeContent) as InboxAIMode[]).map(mode=><button key={mode} type="button" onClick={()=>mode!==data.ai.pilot_response_mode&&run(()=>updateInboxAIMode(mode),"Le mode de réponse de l’IA a été modifié.")} className={`flex gap-3 rounded-[8px] border p-4 text-left transition ${mode===data.ai.pilot_response_mode?"border-[#12ad64] bg-[#eff9f4]":"border-[#dce1e4] hover:bg-[#fafbfb]"}`}><span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${mode===data.ai.pilot_response_mode?"bg-[#d7f1e4] text-[#087848]":"bg-[#f1f3f4] text-[#66717a]"}`}><Bot size={16}/></span><span className="min-w-0 flex-1"><strong className="text-[14px] text-[#303941]">{modeContent[mode].title}</strong><span className="mt-1 block text-[12px] leading-5 text-[#727d86]">{modeContent[mode].description}</span></span>{mode===data.ai.pilot_response_mode&&<Check size={16} className="mt-2 text-[#0b8e51]"/>}</button>)}</div></SettingsCard>
  </div>{qrOpen&&<QRConnectionDialog connection={qrConnection} accepted={qrTerms} setAccepted={setQRTerms} busy={qrBusy} error={qrError} close={()=>!qrBusy&&setQROpen(false)} generate={()=>void generateQR()} disconnect={()=>void disconnectQR()}/>}</>;
}

function QRConnectionDialog({connection,accepted,setAccepted,busy,error,close,generate,disconnect}:{connection:PilotQRConnection|null;accepted:boolean;setAccepted:(value:boolean)=>void;busy:boolean;error:string;close:()=>void;generate:()=>void;disconnect:()=>void}) {
  const connected=connection?.status==="CONNECTED";
  const qr=connection?.qr_data_url;
  const waiting=connection?.status==="CONNECTING"||connection?.status==="CREATED";
  return <div className="fixed inset-0 z-[95] grid place-items-center bg-[#17212b]/45 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label="Connexion WhatsApp par QR code" onMouseDown={event=>event.currentTarget===event.target&&close()}><section className="w-full max-w-[520px] overflow-hidden rounded-[12px] border border-[#d9dee1] bg-white shadow-2xl"><header className="flex items-start gap-3 border-b border-[#e5e8ea] px-5 py-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e9f6ef] text-[#10814f]"><Smartphone size={19}/></span><div className="min-w-0 flex-1"><h3 className="text-[16px] font-semibold text-[#29323a]">Connecter le WhatsApp de l’entreprise</h3><p className="mt-1 text-[12px] leading-5 text-[#717c85]">WhatsApp → Appareils connectés → Connecter un appareil</p></div><button type="button" onClick={close} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-[6px] text-[#66717a] hover:bg-[#f0f2f3]"><X size={17}/></button></header><div className="p-5">
    {connected?<div className="grid justify-items-center gap-4 py-3 text-center"><span className="grid h-16 w-16 place-items-center rounded-full bg-[#e6f7ee] text-[#078349]"><Check size={30}/></span><div><p className="text-[16px] font-semibold text-[#28323a]">WhatsApp est connecté</p><p className="mt-1 text-[13px] text-[#6c7780]">{connection.display_phone_number||"Le numéro lié est prêt à recevoir les messages."}</p></div><OperationButton onClick={disconnect} disabled={busy}>Déconnecter cet appareil</OperationButton></div>:qr?<div className="grid justify-items-center gap-4"><Image unoptimized src={qr} width={280} height={280} alt="QR code WhatsApp à scanner" className="h-[280px] w-[280px] rounded-[10px] border border-[#e0e4e6] bg-white p-2"/><div className="text-center"><p className="text-[13px] font-semibold text-[#344049]">Scannez ce code avec le téléphone de l’entreprise</p><p className="mt-1 text-[12px] text-[#77828a]">Le code se renouvelle automatiquement. Ne le partagez jamais.</p></div>{connection.status==="DISCONNECTED"&&<OperationButton onClick={generate}>Générer un nouveau code</OperationButton>}</div>:waiting?<div className="grid justify-items-center gap-3 py-12 text-center"><Loader2 size={30} className="animate-spin text-[#0b8c50]"/><p className="text-[14px] font-semibold text-[#334049]">Préparation du QR code…</p><p className="text-[12px] text-[#77828a]">Cette étape prend généralement quelques secondes.</p></div>:<div className="grid gap-4"><div className="rounded-[8px] border border-[#eadfbd] bg-[#fffbef] p-4 text-[12px] leading-5 text-[#6d5a22]"><strong className="mb-1 flex items-center gap-2 text-[13px]"><ShieldCheck size={16}/>Information importante</strong>Cette connexion utilise temporairement le mode « appareil lié ». Ce n’est pas l’API officielle Meta. L’entreprise accepte ce risque pour le pilote et pourra migrer vers Meta sans perdre ses dossiers ni ses conversations.</div><label className="flex items-start gap-3 text-[13px] leading-5 text-[#46525b]"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-[#0b8c50]"/><span>Je confirme être autorisé à connecter ce numéro et j’accepte l’utilisation temporaire de ce mode pilote.</span></label><OperationButton variant="primary" onClick={generate} disabled={!accepted||busy}>{busy?<Loader2 size={15} className="animate-spin"/>:<Smartphone size={15}/>}Afficher le QR code</OperationButton></div>}
    {error&&<p className="mt-4 rounded-[8px] border border-[#efd0cc] bg-[#fff6f5] px-4 py-3 text-[12px] text-[#9d352d]">{error}</p>}
  </div></section></div>;
}

function KnowledgeSettings({data,run}:{data:PilotSettingsData;run:(action:()=>Promise<unknown>,message:string)=>Promise<void>}) {
  const [language,setLanguage]=useState<"FR"|"EN">(data.knowledge.default_language);
  const [days,setDays]=useState(String(data.knowledge.pilot_default_review_days));
  useEffect(()=>{setLanguage(data.knowledge.default_language);setDays(String(data.knowledge.pilot_default_review_days));},[data.knowledge]);
  const summary=useMemo(()=>[{label:"Publiées",value:data.knowledge.published_count},{label:"Brouillons",value:data.knowledge.draft_count},{label:"Prêtes pour WhatsApp",value:data.knowledge.whatsapp_ready_count}],[data.knowledge]);
  return <><SectionHeader title="Connaissances" description="Définissez les valeurs proposées lors de la création d’une information. La publication reste toujours une action volontaire."/><div className="grid gap-5"><div className="grid gap-3 sm:grid-cols-3">{summary.map(item=><div key={item.label} className="rounded-[9px] border border-[#dfe3e6] bg-white px-4 py-4"><p className="text-[12px] font-medium text-[#75808a]">{item.label}</p><p className="mt-2 text-[24px] font-semibold tracking-[-.03em] text-[#293139]">{item.value}</p></div>)}</div><SettingsCard title="Valeurs proposées par défaut" description="Elles pourront être changées individuellement sur chaque information."><div className="grid gap-5 sm:grid-cols-2"><Field label="Langue habituelle"><select value={language} onChange={event=>setLanguage(event.target.value as "FR"|"EN")} className={inputClass}><option value="FR">Français</option><option value="EN">Anglais</option></select></Field><Field label="Prochaine vérification proposée"><select value={days} onChange={event=>setDays(event.target.value)} className={inputClass}><option value="30">Après 30 jours</option><option value="90">Après 3 mois</option><option value="180">Après 6 mois</option><option value="365">Après 1 an</option></select></Field></div><div className="mt-5 rounded-[8px] border border-[#dce8e2] bg-[#f5faf7] px-4 py-3 text-[12px] leading-5 text-[#4f665b]">Une information arrivée à sa date de vérification ne sera plus utilisée dans une réponse automatique tant qu’elle n’aura pas été confirmée.</div><PermissionGuard permission="pilot.settings.manage"><div className="mt-5 flex justify-end border-t border-[#e7eaec] pt-5"><OperationButton variant="primary" onClick={()=>run(()=>savePilotKnowledgeDefaults({default_language:language,default_review_days:Number(days),expected_version:data.knowledge.pilot_row_version}),"Les réglages de la base de connaissances ont été enregistrés.")}>Enregistrer</OperationButton></div></PermissionGuard></SettingsCard></div></>;
}

function formatDate(value?:string|null) {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value));
}
