"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, Mail, Music2, RefreshCcw, ShieldCheck, Smartphone, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationPageHeader, OperationTabs } from "@/components/ui/operation-page-header";
import { OperationButton, OperationStatus } from "@/components/ui/operation-controls";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { dashboardLabel, useDashboardLocale } from "@/components/i18n/dashboard-language";
import { updateInboxAIMode, type InboxAIMode } from "@/services/inbox";
import {
  getPilotSettings,
  disconnectPilotWhatsappQR,
  getPilotWhatsappQRStatus,
  savePilotNumbering,
  savePilotKnowledgeDefaults,
  savePilotAIPrompt,
  savePilotWhatsappPreferences,
  requestDataOperation,
  startPilotWhatsappQR,
  testPilotAIPrompt,
  updateOrganization,
  type PilotSettingsData,
  type PilotQRConnection,
} from "@/services/organization-admin";
import { getNotificationPreferences, saveNotificationPreference, type NotificationPreference } from "@/services/notification-center";

const sections = [
  ["company", "Entreprise"],
  ["responsible", "Responsable"],
  ["identifiers", "Identifiants"],
  ["channels", "Canaux"],
  ["ai", "IA"],
  ["knowledge", "Connaissances"],
  ["privacy", "Confidentialité & données"],
  ["notifications", "Notifications"],
] as const;
type Section = (typeof sections)[number][0];
const inputClass = "h-10 w-full rounded-[7px] border border-[#d5dade] bg-white px-3 text-[14px] text-[#293038] outline-none transition focus:border-[#12a865] focus:ring-2 focus:ring-[#12c76f]/10";

export function PilotSettingsPage() {
  const locale = useDashboardLocale();
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
    if (params.get("section") === "communication") { setSection("channels"); return; }
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

  return <div className="min-h-full bg-white">
    <OperationPageHeader title={dashboardLabel(locale, "Paramètres")} description={dashboardLabel(locale, "Configurez uniquement ce qui est nécessaire au fonctionnement quotidien de votre entreprise.")} actions={<OperationButton onClick={load}><RefreshCcw size={14}/>{dashboardLabel(locale, "Actualiser")}</OperationButton>}/>
    <OperationTabs>
      {sections.map(([key, label]) => <button data-ui="operation-tab" aria-current={section === key ? "page" : undefined} key={key} type="button" onClick={() => choose(key)} className={`h-12 shrink-0 border-b-2 px-3 text-[13px] font-medium transition ${section === key ? "border-[#16855f] text-[#126347]" : "border-transparent text-[#68727c] hover:text-[#252c32]"}`}>{dashboardLabel(locale, label)}</button>)}
    </OperationTabs>
      <main className="min-w-0 px-5 py-8 sm:px-7 lg:px-10">
        <div className="pilot-settings-content mx-auto max-w-[1280px]">
          {notice && <div data-ui="settings-notice" className="mb-5 rounded-[8px] border border-[#bfe6d2] bg-[#f0faf5] px-4 py-3 text-[13px] text-[#176142]">{notice}</div>}
          {error && <div data-ui="settings-notice" className="mb-5 rounded-[8px] border border-[#efd0cc] bg-[#fff6f5] px-4 py-3 text-[13px] text-[#9d352d]">{error}</div>}
          {section === "company" && <CompanySettings data={data} run={run}/>} 
          {section === "responsible" && <ResponsibleSettings data={data}/>} 
          {section === "identifiers" && <IdentifierSettings data={data} run={run}/>} 
          {section === "channels" && <CommunicationSettings data={data} run={run}/>}
          {section === "ai" && <AISettings data={data} run={run}/>}
          {section === "knowledge" && <KnowledgeSettings data={data} run={run}/>} 
          {section === "privacy" && <PrivacySettings organizationName={data.organization.organization_name}/>}
          {section === "notifications" && <NotificationSettings/>}
        </div>
      </main>
  </div>;
}

function SectionHeader({title, description}:{title:string;description:string}) {
  const locale = useDashboardLocale();
  return <header className="mb-6 lg:mb-0 lg:pr-8"><h2 className="text-[17px] font-semibold tracking-[-.015em] text-[#252c32]">{dashboardLabel(locale, title)}</h2><p className="mt-1.5 max-w-[260px] text-[13px] leading-5 text-[#69747d]">{dashboardLabel(locale, description)}</p></header>;
}

function SettingsCard({title, description, children}:{title:string;description?:string;children:React.ReactNode}) {
  const locale = useDashboardLocale();
  return <section data-ui="settings-card" className="overflow-hidden rounded-[9px] bg-white"><header className="pb-4"><h3 className="text-[15px] font-semibold text-[#30383f]">{dashboardLabel(locale, title)}</h3>{description && <p className="mt-1 text-[12px] leading-5 text-[#77818a]">{dashboardLabel(locale, description)}</p>}</header><div>{children}</div></section>;
}

function Field({label, hint, children}:{label:string;hint?:string;children:React.ReactNode}) {
  const locale = useDashboardLocale();
  return <label className="grid gap-2"><span className="text-[13px] font-semibold text-[#404b54]">{dashboardLabel(locale, label)}</span>{children}{hint && <span className="text-[12px] leading-5 text-[#7a858e]">{dashboardLabel(locale, hint)}</span>}</label>;
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
  const [manageOpen,setManageOpen]=useState(false);
  const [qrTerms,setQRTerms]=useState(false);
  const [qrConnection,setQRConnection]=useState<PilotQRConnection|null>(null);
  const [qrBusy,setQRBusy]=useState(false);
  const [qrError,setQRError]=useState("");
  const linkedNumber=data.whatsapp_numbers.find(number=>number.provider==="QR_LINKED_DEVICE");
  const [autoRead,setAutoRead]=useState(linkedNumber?.auto_mark_read??false);
  const [groupReplies,setGroupReplies]=useState(linkedNumber?.group_replies_enabled??false);
  const [groupCreation,setGroupCreation]=useState(data.organization.whatsapp_group_on_dossier_create??false);
  const qrPollingStatus=qrConnection?.status;
  useEffect(()=>{setAutoRead(linkedNumber?.auto_mark_read??false);setGroupReplies(linkedNumber?.group_replies_enabled??false);setGroupCreation(data.organization.whatsapp_group_on_dossier_create??false);},[data.organization.whatsapp_group_on_dossier_create,linkedNumber?.auto_mark_read,linkedNumber?.group_replies_enabled]);
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
  async function disconnectQR(){const id=qrConnection?.connection_id||qrConnection?.id;if(!id)return;setQRBusy(true);try{await disconnectPilotWhatsappQR(id);setQRConnection(null);setQROpen(false);setManageOpen(false);await run(async()=>undefined,"L’appareil WhatsApp a été déconnecté et ses accès révoqués.");}finally{setQRBusy(false);}}
  async function refreshConnection(){try{setQRBusy(true);setQRConnection(await getPilotWhatsappQRStatus());}finally{setQRBusy(false)}}
  async function savePreferences(next:{autoRead?:boolean;groupReplies?:boolean;groupCreation?:boolean}){if(!linkedNumber)return;const values={autoRead:next.autoRead??autoRead,groupReplies:next.groupReplies??groupReplies,groupCreation:next.groupCreation??groupCreation};setAutoRead(values.autoRead);setGroupReplies(values.groupReplies);setGroupCreation(values.groupCreation);await run(()=>savePilotWhatsappPreferences(linkedNumber.id,{auto_mark_read:values.autoRead,group_replies_enabled:values.groupReplies,group_on_dossier_create:values.groupCreation}),"Les préférences WhatsApp ont été enregistrées.");}
  const connected=qrConnection?qrConnection.status==="CONNECTED":linkedNumber?.connection_status==="CONNECTED";
  const reconnecting=qrConnection?.status==="CONNECTING"||qrConnection?.status==="DISCONNECTED";
  const displayPhone=qrConnection?.display_phone_number||linkedNumber?.display_phone_number;
  return <><SectionHeader title="Canaux de communication" description="Connectez les canaux utilisés par l’entreprise pour recevoir et envoyer ses messages."/><div className="grid gap-5">
    <SettingsCard title="WhatsApp" description="Connectez un compte WhatsApp pour recevoir et envoyer les messages de l’entreprise depuis SLAIVIO."><div className="grid gap-4">
      <div className="flex items-center gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-[10px] bg-[#e6f7ee]"><WhatsAppLogo/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-[15px] font-semibold text-[#29323a]">WhatsApp</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${connected?"bg-[#dff5e9] text-[#087848]":"bg-[#eef1f2] text-[#657079]"}`}>{connected?"1/1":"0/1"}</span></div><p className="mt-1 text-[12px] leading-5 text-[#6f7a83]">Le canal reste sous le contrôle de l’entreprise et centralise les échanges dans la Boîte de réception.</p></div></div>
      {!data.whatsapp_configuration.qr_linked_device_available&&<p className="rounded-[8px] border border-[#eadfbd] bg-[#fffbef] p-3 text-[12px] text-[#765d20]">Le service de liaison WhatsApp doit être configuré par l’administrateur avant la première connexion.</p>}
      {connected&&<div className="overflow-hidden rounded-[9px] border border-[#dce3df]"><div className="flex items-center justify-between bg-[#f3faf6] px-4 py-3"><div className="flex items-center gap-2 text-[13px] font-semibold text-[#176142]"><span className="h-2 w-2 rounded-full bg-[#12a865]"/>Connecté</div><button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium text-[#52615a] hover:bg-white" onClick={()=>void refreshConnection()}><RefreshCcw size={13} className={qrBusy?"animate-spin":""}/>Actualiser</button></div><div className="grid gap-3 px-4 py-4 text-[12px]"><DetailRow label="Numéro de téléphone" value={displayPhone||"Numéro lié"}/><DetailRow label="ID du compte" value={linkedNumber?.phone_number_id||linkedNumber?.id||"—"} copy/></div></div>}
      {connected&&<div className="overflow-hidden rounded-[9px] border border-[#dfe3e6]"><PreferenceRow label="Marquer les messages comme lus automatiquement" checked={autoRead} change={value=>void savePreferences({autoRead:value})}/><PreferenceRow label="Réponses dans les groupes WhatsApp" checked={groupReplies} change={value=>void savePreferences({groupReplies:value})}/><PreferenceRow label="Créer un groupe lors de la création d’un dossier" description="Disponible pour les connexions compatibles ; les participants restent validés par l’entreprise." checked={groupCreation} change={value=>void savePreferences({groupCreation:value})}/></div>}
      {!connected&&reconnecting&&<div className="flex items-start gap-3 rounded-[9px] border border-[#eadfbd] bg-[#fffbef] p-4"><Loader2 size={17} className="mt-0.5 shrink-0 animate-spin text-[#8a6b18]"/><div><p className="text-[13px] font-semibold text-[#6d5a22]">Reconnexion automatique en cours</p><p className="mt-1 text-[12px] leading-5 text-[#796b43]">SLAIVIO tente de rétablir la session sans demander un nouveau QR code.</p></div></div>}
      <PermissionGuard permission="pilot.whatsapp_qr.connect"><OperationButton variant={connected?"secondary":"primary"} disabled={!data.whatsapp_configuration.qr_linked_device_available} onClick={()=>connected?setManageOpen(true):void openQR()}><Smartphone size={15}/>{connected?"Gérer le compte WhatsApp":"Lier un compte WhatsApp"}</OperationButton></PermissionGuard>
    </div></SettingsCard>
    <UnavailableChannel name="Gmail" description="Centralisez les demandes reçues par email dans la même boîte de réception." icon={<Mail size={24}/>}/>
    <UnavailableChannel name="TikTok" description="Recevez les conversations TikTok de l’entreprise dans SLAIVIO." icon={<Music2 size={24}/>}/>
  </div>{qrOpen&&<QRConnectionDialog connection={qrConnection} accepted={qrTerms} setAccepted={setQRTerms} busy={qrBusy} error={qrError} close={()=>!qrBusy&&setQROpen(false)} generate={()=>void generateQR()}/>} {manageOpen&&<WhatsappManagementDialog phone={displayPhone} accountId={linkedNumber?.phone_number_id||linkedNumber?.id} busy={qrBusy} close={()=>setManageOpen(false)} refresh={()=>void refreshConnection()} disconnect={()=>void disconnectQR()}/>}</>;
}

function WhatsAppLogo(){return <svg viewBox="0 0 32 32" className="h-7 w-7" aria-label="WhatsApp"><path fill="#25D366" d="M16 3a12.8 12.8 0 0 0-11 19.4L3.5 28l5.8-1.5A12.9 12.9 0 1 0 16 3Z"/><path fill="white" d="M23.4 19.1c-.4-.2-2.3-1.1-2.7-1.3-.4-.1-.7-.2-1 .2l-1.2 1.5c-.3.3-.5.3-.9.1-2.4-1.2-4-2.2-5.6-4.9-.4-.7.4-.7 1.2-2.2.1-.3.1-.6 0-.8l-1.2-3c-.3-.7-.7-.6-1-.6h-.8c-.3 0-.8.1-1.2.6-4.1 4.5 1.1 11.1 5.8 13.4 4.6 2.2 6.3 2.4 8.6 2 1.4-.2 2.3-1.2 2.6-2.3.3-1.1.3-2 0-2.2-.3-.2-.7-.3-1.1-.5Z"/></svg>}
function DetailRow({label,value,copy}:{label:string;value:string;copy?:boolean}){return <div className="flex items-center justify-between gap-4"><span className="text-[#77818a]">{label}</span><span className="flex min-w-0 items-center gap-2 font-medium text-[#303941]"><span className="truncate">{value}</span>{copy&&<button type="button" className="grid h-7 w-7 place-items-center rounded-[5px] text-[#62707a] hover:bg-[#f0f3f3]" aria-label="Copier l’identifiant" title="Copier" onClick={()=>void navigator.clipboard.writeText(value)}><Copy size={13}/></button>}</span></div>}
function PreferenceRow({label,description,checked,change}:{label:string;description?:string;checked:boolean;change:(value:boolean)=>void}){return <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-[#e8ebed] px-4 py-3 last:border-0"><span><span className="block text-[13px] font-medium text-[#303941]">{label}</span>{description&&<span className="mt-0.5 block text-[11px] leading-4 text-[#77818a]">{description}</span>}</span><input type="checkbox" className="peer sr-only" checked={checked} onChange={event=>change(event.target.checked)}/><span className="relative h-5 w-9 shrink-0 rounded-full bg-[#cfd5d8] transition peer-checked:bg-[#12a865] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"/></label>}
function WhatsappManagementDialog({phone,accountId,busy,close,refresh,disconnect}:{phone?:string|null;accountId?:string|null;busy:boolean;close:()=>void;refresh:()=>void;disconnect:()=>void}){return <div className="fixed inset-0 z-[95] grid place-items-center bg-[#17212b]/45 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true" onMouseDown={event=>event.currentTarget===event.target&&close()}><section className="w-full max-w-[520px] overflow-hidden rounded-[12px] border border-[#d9dee1] bg-white shadow-2xl"><header className="flex items-start gap-3 border-b border-[#e5e8ea] px-5 py-4"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#e7f7ef]"><WhatsAppLogo/></span><div className="flex-1"><h3 className="text-[16px] font-semibold">Gérer le compte WhatsApp</h3><p className="mt-1 text-[12px] text-[#717c85]">Connexion et préférences du numéro de l’entreprise.</p></div><button type="button" className="grid h-8 w-8 place-items-center rounded-[6px] hover:bg-[#f1f3f3]" aria-label="Fermer" onClick={close}><X size={17}/></button></header><div className="grid gap-4 p-5"><div className="rounded-[9px] border border-[#dce3df]"><div className="flex items-center justify-between bg-[#f3faf6] px-4 py-3 text-[13px] font-semibold text-[#176142]"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#12a865]"/>Connecté</span><button type="button" className="inline-flex items-center gap-1.5" onClick={refresh}><RefreshCcw size={13} className={busy?"animate-spin":""}/>Actualiser</button></div><div className="grid gap-3 px-4 py-4 text-[12px]"><DetailRow label="Numéro de téléphone" value={phone||"Numéro lié"}/><DetailRow label="ID du compte" value={accountId||"—"} copy/></div></div><OperationButton onClick={refresh}>Gérer le numéro</OperationButton><PermissionGuard permission="pilot.whatsapp_qr.disconnect"><OperationButton variant="danger" disabled={busy} onClick={disconnect}><Trash2 size={15}/>Supprimer le compte</OperationButton></PermissionGuard></div></section></div>}

function UnavailableChannel({name,description,icon}:{name:string;description:string;icon:React.ReactNode}) {
  return <SettingsCard title={name}><div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-[10px] bg-[#f1f3f4] text-[#65717a]">{icon}</span><div className="min-w-0 flex-1"><p className="text-[13px] leading-5 text-[#66717a]">{description}</p></div><OperationStatus label="Bientôt disponible" tone="neutral"/></div></SettingsCard>;
}

function AISettings({data,run}:{data:PilotSettingsData;run:(action:()=>Promise<unknown>,message:string)=>Promise<void>}) {
  const [systemPrompt,setSystemPrompt]=useState(data.ai.system_prompt||"");
  const [userPrompt,setUserPrompt]=useState(data.ai.user_prompt_template||"");
  const [style,setStyle]=useState(data.ai.communication_style||"PROFESSIONAL");
  const [test,setTest]=useState(""),[answer,setAnswer]=useState(""),[testing,setTesting]=useState(false),[testError,setTestError]=useState("");
  const score=[systemPrompt.trim().length>=40,/(jamais|interdit|ne pas)/i.test(systemPrompt+userPrompt),/(source|connaissance|information publiée)/i.test(systemPrompt+userPrompt),/(escalade|responsable|humain)/i.test(systemPrompt+userPrompt),/(client|message|réponse)/i.test(systemPrompt+userPrompt)].filter(Boolean).length*20;
  async function testAI(){setTesting(true);setTestError("");try{const result=await testPilotAIPrompt(test);setAnswer(result.answer);}catch{setTestError("Le test IA est indisponible. Vérifiez la configuration du fournisseur.");}finally{setTesting(false)}}
  return <><SectionHeader title="Intelligence artificielle" description="Définissez le comportement rédactionnel, puis vérifiez-le dans un espace de test avant utilisation."/><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="grid gap-5"><SettingsCard title="Mode de réponse" description="Ce choix s’applique immédiatement à la Boîte de réception."><div className="grid gap-2">{(Object.keys(modeContent) as InboxAIMode[]).map(mode=><button key={mode} type="button" onClick={()=>mode!==data.ai.pilot_response_mode&&run(()=>updateInboxAIMode(mode),"Le mode de réponse de l’IA a été modifié.")} className={`flex gap-3 rounded-[8px] border p-4 text-left transition ${mode===data.ai.pilot_response_mode?"border-[#12ad64] bg-[#eff9f4]":"border-[#dce1e4] hover:bg-[#fafbfb]"}`}><span className={`mt-0.5 grid h-8 w-8 place-items-center rounded-full ${mode===data.ai.pilot_response_mode?"bg-[#d7f1e4] text-[#087848]":"bg-[#f1f3f4] text-[#66717a]"}`}><Sparkles size={16}/></span><span className="flex-1"><strong className="text-[14px] text-[#303941]">{modeContent[mode].title}</strong><span className="mt-1 block text-[12px] leading-5 text-[#727d86]">{modeContent[mode].description}</span></span>{mode===data.ai.pilot_response_mode&&<Check size={16} className="mt-2 text-[#0b8e51]"/>}</button>)}</div></SettingsCard><SettingsCard title="Instructions et style"><div className="grid gap-5"><Field label="Prompt système" hint="Règles permanentes propres à l’entreprise."><textarea value={systemPrompt} onChange={e=>setSystemPrompt(e.target.value)} className={`${inputClass} h-32 py-3`} placeholder="Ex. Répondre avec précision, ne jamais inventer un tarif…"/></Field><Field label="Prompt utilisateur" hint="Cadre appliqué au message envoyé par le client."><textarea value={userPrompt} onChange={e=>setUserPrompt(e.target.value)} className={`${inputClass} h-24 py-3`} placeholder="Ex. Répondre au message suivant en restant fidèle aux sources…"/></Field><Field label="Style de communication"><select className={inputClass} value={style} onChange={e=>setStyle(e.target.value as typeof style)}><option value="PROFESSIONAL">Professionnel et chaleureux</option><option value="CONCISE">Concis et direct</option><option value="FORMAL">Formel</option><option value="WARM">Chaleureux</option></select></Field><div className="rounded-[8px] bg-[#f5f7f7] p-4"><div className="flex justify-between text-[12px]"><span>Score du prompt</span><strong>{score}/100</strong></div><div className="mt-2 h-1.5 rounded-full bg-[#e1e5e7]"><div className="h-full rounded-full bg-[#12ad64]" style={{width:`${score}%`}}/></div></div><PermissionGuard permission="inbox.ai.manage"><OperationButton variant="primary" onClick={()=>run(()=>savePilotAIPrompt({system_prompt:systemPrompt,user_prompt_template:userPrompt,communication_style:style,expected_version:data.ai.prompt_row_version}),"La configuration IA a été enregistrée.")}>Enregistrer la configuration</OperationButton></PermissionGuard></div></SettingsCard></div><SettingsCard title="Tester l’IA" description="Cet espace ne transmet aucun message au client."><div className="flex min-h-[420px] flex-col"><div className="flex-1 whitespace-pre-wrap rounded-[8px] bg-[#f7f8f8] p-4 text-[13px] text-[#59656f]">{answer||"Écrivez un message client pour prévisualiser le comportement configuré."}</div>{testError&&<p className="mt-3 text-[12px] text-red-600">{testError}</p>}<textarea value={test} onChange={event=>setTest(event.target.value)} className={`${inputClass} mt-4 h-24 py-3`} placeholder="Message de test…"/><OperationButton className="mt-3" variant="primary" disabled={!test.trim()||testing} onClick={()=>void testAI()}>{testing?"Test en cours…":"Tester"}</OperationButton></div></SettingsCard></div></>;
}

function PrivacySettings({organizationName}:{organizationName:string}){const [busy,setBusy]=useState(false);async function request(type:"EXPORT"|"DELETE_ORGANIZATION"){const confirmation=type==="DELETE_ORGANIZATION"?window.prompt(`Tapez exactement « ${organizationName} » pour confirmer la demande de suppression.`):undefined;if(type==="DELETE_ORGANIZATION"&&confirmation!==organizationName)return;setBusy(true);try{await requestDataOperation({request_type:type,scope:type==="EXPORT"?{modules:["clients","dossiers","messages","knowledge"],format:"JSON"}:{},confirmation});}finally{setBusy(false)}}return <><SectionHeader title="Confidentialité & données" description="Gérez les données personnelles, leur conservation et les demandes d’export ou de suppression."/><SettingsCard title="Contrôle des données" description="Les demandes sensibles sont auditées et ne suppriment jamais les données immédiatement."><div className="grid gap-3 text-[13px]"><p>Les données restent isolées par organisation et accessibles selon les permissions attribuées.</p><div className="flex flex-wrap gap-2"><OperationButton disabled={busy} onClick={()=>void request("EXPORT")}>Demander un export des données</OperationButton><OperationButton disabled={busy} variant="danger" onClick={()=>void request("DELETE_ORGANIZATION")}>Demander la suppression des données</OperationButton></div></div></SettingsCard></>}
const pilotNotificationCategories=[["OPERATIONS","Activité de l’entreprise"],["SHIPMENT","Expéditions"],["PACKAGE","Colis"],["PAYMENT","Paiements"],["COMPLIANCE","Contrôles"],["SYSTEM","Compte et sécurité"]] as const;
/* Replaced below by the readable implementation kept as the active component.
function NotificationSettings(){const [items,setItems]=useState<NotificationPreference[]>([]),[saving,setSaving]=useState(false),[error,setError]=useState("");useEffect(()=>{getNotificationPreferences().then(setItems).catch(()=>setError("Les préférences ne peuvent pas être chargées."))},[]);const current=(category:string)=>items.find(item=>item.category===category)||{category,in_app:true,email:false,whatsapp:false,digest_frequency:"IMMEDIATE"};async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);setSaving(true);setError("");try{const saved=await Promise.all(pilotNotificationCategories.map(([category])=>saveNotificationPreference({category,in_app:form.get(`${category}.app`)==="on",email:form.get(`${category}.email`)==="on",whatsapp:form.get(`${category}.whatsapp`)==="on",digest_frequency:String(form.get(`${category}.frequency`)||"IMMEDIATE")}));setItems(saved.map(result=>result.preference||result));}catch{setError("Les préférences n’ont pas pu être enregistrées.")}finally{setSaving(false)}}return <><SectionHeader title="Notifications" description="Choisissez les événements importants et les canaux utilisés pour prévenir l’équipe."/><SettingsCard title="Préférences" description="La cloche affiche les notifications ; leur configuration reste centralisée ici."><form onSubmit={submit} className="grid gap-3">{pilotNotificationCategories.map(([category,label])=>{const preference=current(category);return <div key={category} className="grid items-center gap-3 rounded-[8px] border border-[#e3e7e9] p-3 sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto_150px]"><strong className="text-[13px]">{label}</strong><ToggleLabel name={`${category}.app`} label="Slaivio" checked={preference.in_app}/><ToggleLabel name={`${category}.email`} label="Email" checked={preference.email}/><ToggleLabel name={`${category}.whatsapp`} label="WhatsApp" checked={preference.whatsapp}/><select name={`${category}.frequency`} defaultValue={preference.digest_frequency} className={inputClass}><option value="IMMEDIATE">Immédiatement</option><option value="DAILY">Chaque jour</option><option value="WEEKLY">Chaque semaine</option><option value="OFF">Désactivé</option></select></div>})}{error&&<p className="text-[12px] text-red-600">{error}</p>}<div className="flex justify-end"><OperationButton variant="primary" disabled={saving}>{saving?"Enregistrement…":"Enregistrer"}</OperationButton></div></form></SettingsCard></>}
*/
function NotificationSettings(){
  const [items,setItems]=useState<NotificationPreference[]>([]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{getNotificationPreferences().then(setItems).catch(()=>setError("Les préférences ne peuvent pas être chargées."));},[]);
  const current=(category:string):NotificationPreference=>items.find(item=>item.category===category)||{category,in_app:true,email:false,whatsapp:false,digest_frequency:"IMMEDIATE"};
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    setSaving(true);setError("");
    try{
      const saved=await Promise.all(pilotNotificationCategories.map(([category])=>saveNotificationPreference({category,in_app:form.get(`${category}.app`)==="on",email:form.get(`${category}.email`)==="on",whatsapp:form.get(`${category}.whatsapp`)==="on",digest_frequency:String(form.get(`${category}.frequency`)||"IMMEDIATE")})));
      setItems(saved.map(result=>result.preference||result));
    }catch{setError("Les préférences n’ont pas pu être enregistrées.");}finally{setSaving(false);}
  }
  return <><SectionHeader title="Notifications" description="Choisissez les événements importants et les canaux utilisés pour prévenir l’équipe."/><SettingsCard title="Préférences" description="La cloche affiche les notifications ; leur configuration reste centralisée ici."><form onSubmit={submit} className="grid gap-3">{pilotNotificationCategories.map(([category,label])=>{const preference=current(category);return <div key={category} className="grid items-center gap-3 rounded-[8px] border border-[#e3e7e9] p-3 sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto_150px]"><strong className="text-[13px]">{label}</strong><ToggleLabel name={`${category}.app`} label="Slaivio" checked={preference.in_app}/><ToggleLabel name={`${category}.email`} label="Email" checked={preference.email}/><ToggleLabel name={`${category}.whatsapp`} label="WhatsApp" checked={preference.whatsapp}/><select name={`${category}.frequency`} defaultValue={preference.digest_frequency} className={inputClass}><option value="IMMEDIATE">Immédiatement</option><option value="DAILY">Chaque jour</option><option value="WEEKLY">Chaque semaine</option><option value="OFF">Désactivé</option></select></div>})}{error&&<p className="text-[12px] text-red-600">{error}</p>}<div className="flex justify-end"><OperationButton type="submit" variant="primary" disabled={saving}>{saving?"Enregistrement…":"Enregistrer"}</OperationButton></div></form></SettingsCard></>;
}
function ToggleLabel({name,label,checked}:{name:string;label:string;checked:boolean}){return <label className="flex items-center gap-1.5 text-[11px] text-[#66717a]"><input name={name} type="checkbox" defaultChecked={checked} className="h-4 w-4 accent-[#12a865]"/>{label}</label>}

function QRConnectionDialog({connection,accepted,setAccepted,busy,error,close,generate}:{connection:PilotQRConnection|null;accepted:boolean;setAccepted:(value:boolean)=>void;busy:boolean;error:string;close:()=>void;generate:()=>void}) {
  const connected=connection?.status==="CONNECTED";
  const qr=connection?.qr_data_url;
  const waiting=connection?.status==="CONNECTING"||connection?.status==="CREATED";
  return <div className="fixed inset-0 z-[95] grid place-items-center bg-[#17212b]/45 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label="Connexion WhatsApp par QR code" onMouseDown={event=>event.currentTarget===event.target&&close()}><section className="w-full max-w-[520px] overflow-hidden rounded-[12px] border border-[#d9dee1] bg-white shadow-2xl"><header className="flex items-start gap-3 border-b border-[#e5e8ea] px-5 py-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e9f6ef] text-[#10814f]"><Smartphone size={19}/></span><div className="min-w-0 flex-1"><h3 className="text-[16px] font-semibold text-[#29323a]">Connecter le WhatsApp de l’entreprise</h3><p className="mt-1 text-[12px] leading-5 text-[#717c85]">WhatsApp → Appareils connectés → Connecter un appareil</p></div><button type="button" onClick={close} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-[6px] text-[#66717a] hover:bg-[#f0f2f3]"><X size={17}/></button></header><div className="p-5">
    {connected?<div className="grid justify-items-center gap-4 py-3 text-center"><span className="grid h-16 w-16 place-items-center rounded-full bg-[#e6f7ee] text-[#078349]"><Check size={30}/></span><div><p className="text-[16px] font-semibold text-[#28323a]">WhatsApp est connecté</p><p className="mt-1 text-[13px] text-[#6c7780]">{connection.display_phone_number||"Le numéro lié est prêt à recevoir les messages."}</p></div><OperationButton variant="primary" onClick={close}>OK</OperationButton></div>:qr?<div className="grid justify-items-center gap-4"><Image unoptimized src={qr} width={280} height={280} alt="QR code WhatsApp à scanner" className="h-[280px] w-[280px] rounded-[10px] border border-[#e0e4e6] bg-white p-2"/><div className="text-center"><p className="text-[13px] font-semibold text-[#344049]">Scannez ce code avec le téléphone de l’entreprise</p><p className="mt-1 text-[12px] text-[#77828a]">Le code se renouvelle automatiquement. Ne le partagez jamais.</p></div>{connection.status==="DISCONNECTED"&&<OperationButton onClick={generate}>Générer un nouveau code</OperationButton>}</div>:waiting?<div className="grid justify-items-center gap-3 py-12 text-center"><Loader2 size={30} className="animate-spin text-[#0b8c50]"/><p className="text-[14px] font-semibold text-[#334049]">Préparation du QR code…</p><p className="text-[12px] text-[#77828a]">Cette étape prend généralement quelques secondes.</p></div>:<div className="grid gap-4"><div className="rounded-[8px] border border-[#eadfbd] bg-[#fffbef] p-4 text-[12px] leading-5 text-[#6d5a22]"><strong className="mb-1 flex items-center gap-2 text-[13px]"><ShieldCheck size={16}/>Information importante</strong>Cette connexion utilise temporairement le mode « appareil lié ». Ce n’est pas l’API officielle Meta. L’entreprise accepte ce risque pour le pilote et pourra migrer vers Meta sans perdre ses dossiers ni ses conversations.</div><label className="flex items-start gap-3 text-[13px] leading-5 text-[#46525b]"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-[#0b8c50]"/><span>Je confirme être autorisé à connecter ce numéro et j’accepte l’utilisation temporaire de ce mode pilote.</span></label><OperationButton variant="primary" onClick={generate} disabled={!accepted||busy}>{busy?<Loader2 size={15} className="animate-spin"/>:<Smartphone size={15}/>}Afficher le QR code</OperationButton></div>}
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
