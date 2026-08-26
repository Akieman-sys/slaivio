"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Check, MessageCircle, RefreshCcw, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { OperationButton, OperationStatus } from "@/components/ui/operation-controls";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { updateInboxAIMode, type InboxAIMode } from "@/services/inbox";
import {
  getPilotSettings,
  saveNumbering,
  savePilotKnowledgeDefaults,
  selectPilotWhatsappNumber,
  updateOrganization,
  type PilotSettingsData,
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

const identifierOptions:Record<"CLIENT"|"DOSSIER",Array<[string,string]>> = {
  CLIENT:[["CLI-{YYYY}-{000001}","CLI-2026-000001"],["CLI-{000001}","CLI-000001"],["CLIENT-{000001}","CLIENT-000001"]],
  DOSSIER:[["DOS-{YYYY}-{000001}","DOS-2026-000001"],["DOS-{000001}","DOS-000001"],["DOSSIER-{000001}","DOSSIER-000001"]],
};
function IdentifierSettings({data,run}:{data:PilotSettingsData;run:(action:()=>Promise<unknown>,message:string)=>Promise<void>}) {
  return <><SectionHeader title="Identifiants" description="Choisissez la forme des références générées automatiquement. Le responsable ne saisira jamais ces numéros à la main."/><div className="grid gap-5">{data.numbering.map(item => <SettingsCard key={item.document_type} title={item.document_type === "CLIENT" ? "Identifiant client" : "Identifiant dossier"} description={item.document_type === "CLIENT" ? "Exemple visible sur la fiche d’une personne." : "Exemple visible dans la liste des dossiers."}><form onSubmit={(event) => {event.preventDefault();const format=String(new FormData(event.currentTarget).get("format"));run(()=>saveNumbering(item.document_type,format,item.row_version),"Le format des identifiants a été enregistré.");}} className="flex flex-col gap-4 sm:flex-row sm:items-end"><Field label="Format" hint={`Prochain numéro interne : ${item.next_number}`}><select name="format" defaultValue={item.prefix_format} className={`${inputClass} sm:min-w-[300px]`}>{identifierOptions[item.document_type].map(([format,example])=><option key={format} value={format}>{example}</option>)}</select></Field><PermissionGuard permission="pilot.settings.manage"><OperationButton type="submit" variant="primary">Enregistrer</OperationButton></PermissionGuard></form></SettingsCard>)}</div></>;
}

const modeContent:Record<InboxAIMode,{title:string;description:string}> = {
  SUGGESTION_ONLY:{title:"Suggestion uniquement",description:"L’IA prépare la réponse. Le responsable la vérifie et l’envoie."},
  CONTROLLED_AUTO:{title:"Automatique contrôlé",description:"L’IA répond seule uniquement lorsque la réponse est fiable, publiée et sans risque."},
  PAUSED:{title:"IA en pause",description:"Aucune réponse ni suggestion IA n’est produite. Le responsable répond manuellement."},
};
function CommunicationSettings({data,run}:{data:PilotSettingsData;run:(action:()=>Promise<unknown>,message:string)=>Promise<void>}) {
  return <><SectionHeader title="WhatsApp & IA" description="Choisissez le numéro utilisé par l’entreprise et le niveau d’assistance souhaité. Aucun identifiant Meta technique n’est demandé ici."/><div className="grid gap-5"><SettingsCard title="Numéro WhatsApp de l’entreprise" description="Les numéros proviennent directement du portefeuille WhatsApp Business connecté.">{data.whatsapp_numbers.length ? <div className="grid gap-2">{data.whatsapp_numbers.map(number => {const connected=number.connection_status === "CONNECTED";return <button key={number.id} type="button" disabled={!connected} onClick={()=>!number.is_default&&run(()=>selectPilotWhatsappNumber(number.id),"Le numéro WhatsApp principal a été modifié.")} className={`flex items-center gap-3 rounded-[8px] border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${number.is_default?"border-[#12ad64] bg-[#eff9f4]":"border-[#dce1e4] hover:bg-[#fafbfb]"}`}><span className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#148b59]"><MessageCircle size={19}/></span><span className="min-w-0 flex-1"><strong className="block truncate text-[14px] text-[#303941]">{number.verified_name || "Compte WhatsApp Business"}</strong><span className="mt-1 block text-[13px] text-[#6f7982]">{number.display_phone_number || "Numéro en cours de synchronisation"}</span></span>{number.is_default ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#117148]"><Check size={14}/>Utilisé</span> : <OperationStatus label={connected?"Disponible":"Non connecté"} tone={connected?"info":"neutral"}/>}</button>})}</div> : <div className="rounded-[8px] bg-[#f6f7f7] px-4 py-5 text-[13px] leading-5 text-[#68737c]">Aucun numéro WhatsApp Business n’est encore connecté. La connexion Meta devra être finalisée avant l’activation du Pilot.</div>}</SettingsCard><SettingsCard title="Mode de réponse de l’IA" description="Le changement s’applique immédiatement à la Boîte de réception."><div className="grid gap-2">{(Object.keys(modeContent) as InboxAIMode[]).map(mode => <button key={mode} type="button" onClick={()=>mode!==data.ai.pilot_response_mode&&run(()=>updateInboxAIMode(mode),"Le mode de réponse de l’IA a été modifié.")} className={`flex gap-3 rounded-[8px] border p-4 text-left transition ${mode===data.ai.pilot_response_mode?"border-[#12ad64] bg-[#eff9f4]":"border-[#dce1e4] hover:bg-[#fafbfb]"}`}><span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${mode===data.ai.pilot_response_mode?"bg-[#d7f1e4] text-[#087848]":"bg-[#f1f3f4] text-[#66717a]"}`}><Bot size={16}/></span><span className="min-w-0 flex-1"><strong className="text-[14px] text-[#303941]">{modeContent[mode].title}</strong><span className="mt-1 block text-[12px] leading-5 text-[#727d86]">{modeContent[mode].description}</span></span>{mode===data.ai.pilot_response_mode&&<Check size={16} className="mt-2 text-[#0b8e51]"/>}</button>)}</div></SettingsCard></div></>;
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
