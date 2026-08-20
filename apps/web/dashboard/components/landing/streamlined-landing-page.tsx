"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  FileText,
  Globe2,
  Menu,
  MessageSquare,
  Package,
  Play,
  Route,
  ShieldCheck,
  Truck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { createDemoRequest } from "@/services/landing";

const copy = {
  fr: {
    nav: [
      ["Produit", "#platform"],
      ["Opérations", "#operations"],
      ["Communication", "#communication"],
      ["Tarifs", "#pricing"],
      ["Ressources", "#faq"],
    ],
    login: "Se connecter",
    demo: "Demander une démo",
    video: "Voir la plateforme",
    heroTitle: "Digitalisez les opérations de votre agence Cargo.",
    heroText: "Slaivio réunit vos clients, communications, dossiers, colis, entrepôts, expéditions, tracking, finances et documents dans un seul système.",
    heroNote: "Conçu pour les agences Cargo, freight forwarders et entreprises d’import-export.",
    problemEyebrow: "Une seule source de vérité",
    problemTitle: "Votre agence grandit. Vos outils doivent suivre.",
    problemText: "Remplacez les informations dispersées entre messageries, Excel, documents et cahiers par des processus structurés, partagés et traçables.",
    problems: [
      ["Communications dispersées", "Les demandes et décisions restent isolées entre plusieurs employés et canaux."],
      ["Opérations manuelles", "Réception, tracking, relances et facturation demandent trop de ressaisie."],
      ["Données éparpillées", "Clients, colis, paiements et documents ne racontent pas toujours la même histoire."],
      ["Pilotage tardif", "La direction découvre les retards et les blocages lorsqu’ils ont déjà un impact."],
    ],
    platformEyebrow: "La plateforme",
    platformTitle: "Toute votre agence, organisée dans un seul système.",
    platformText: "Chaque équipe travaille dans son espace, sur les mêmes données opérationnelles.",
    domains: [
      ["Relation client", "Clients, inbox, conversations, relances et historique.", "users"],
      ["Opérations Cargo", "Dossiers, colis, entrepôts, batchs, expéditions et retraits.", "package"],
      ["Commercial", "Routes, services, tarification et devis cohérents.", "route"],
      ["Finance", "Factures, paiements, soldes, crédit et rapports.", "chart"],
      ["Documents", "Chaque fichier relié au bon client et à la bonne opération.", "file"],
    ],
    operationsEyebrow: "Le cœur de Slaivio",
    operationsTitle: "Pilotez le parcours Cargo de bout en bout.",
    operationsText: "Du premier dossier jusqu’à la remise finale, chaque étape alimente le même historique et les mêmes indicateurs.",
    operationSteps: ["Dossier", "Colis", "Entrepôt", "Groupage", "Expédition", "Tracking", "Retrait"],
    communicationEyebrow: "Relation client",
    communicationTitle: "Une seule relation client, plusieurs canaux.",
    communicationText: "WhatsApp Business est le premier canal disponible. L’architecture est conçue pour réunir progressivement email, TikTok et d’autres points de contact sans perdre le contexte du client.",
    available: "Disponible",
    soon: "À venir",
    contextTitle: "Le contexte reste attaché au client",
    contextItems: ["Identité et coordonnées", "Conversations", "Dossiers et colis", "Factures et paiements", "Relances et historique"],
    intelligenceEyebrow: "Automatisation et pilotage",
    intelligenceTitle: "Moins de travail répétitif. Plus de contrôle.",
    intelligence: [
      ["Automatisations opérationnelles", "Un colis reçu peut mettre à jour son statut, enrichir la timeline et préparer une notification."],
      ["Assistant transversal", "Interrogez les données de l’agence et préparez des actions avec permissions et validation."],
      ["Organisation maîtrisée", "Workspaces, rôles, permissions et audit protègent chaque équipe et chaque marché."],
    ],
    setupEyebrow: "Mise en place",
    setupTitle: "Passez à Slaivio sans repartir de zéro.",
    setupSteps: [
      ["01", "Configurer", "Workspaces, bureaux, entrepôts, routes et services."],
      ["02", "Importer", "Clients, dossiers, colis et tarifs depuis vos fichiers existants."],
      ["03", "Connecter", "Votre équipe et les canaux réellement disponibles."],
      ["04", "Déployer", "Former les utilisateurs et ouvrir progressivement les automatisations."],
    ],
    pricingEyebrow: "Tarifs",
    pricingTitle: "Un niveau adapté à chaque étape de votre croissance.",
    pricingText: "Nous validons avec vous le périmètre, le volume et l’accompagnement nécessaire avant la mise en production.",
    plans: [
      ["Starter", "119 $", "Pour commencer la digitalisation", ["Opérations essentielles", "WhatsApp Business", "Tracking", "Support standard"]],
      ["Growth", "299 $", "Pour structurer plusieurs équipes", ["Tout Starter", "Entrepôts multiples", "Tarification avancée", "Rapports et automatisations"]],
      ["Enterprise", "Sur devis", "Pour les organisations complexes", ["Multi-workspaces", "Permissions avancées", "Migration accompagnée", "Intégrations spécifiques"]],
    ],
    faqEyebrow: "Questions fréquentes",
    faqTitle: "Ce qu’il faut savoir avant de commencer.",
    faqs: [
      ["Qu’est-ce que Slaivio ?", "Une plateforme de digitalisation conçue pour centraliser la relation client, les opérations Cargo, la finance, les documents et le pilotage."],
      ["Slaivio est-il uniquement basé sur WhatsApp ?", "Non. WhatsApp Business est le premier canal fort. Slaivio est conçu comme une plateforme opérationnelle omnicanale."],
      ["Puis-je importer mes données existantes ?", "Oui. Les imports structurés permettent de reprendre notamment clients, dossiers, colis et tarifs depuis CSV ou Excel."],
      ["Puis-je gérer plusieurs pays et entrepôts ?", "Oui. Les workspaces, bureaux et entrepôts permettent d’organiser plusieurs marchés avec des accès distincts."],
      ["Les employés peuvent-ils avoir des accès différents ?", "Oui. Les rôles et permissions définissent ce que chaque utilisateur peut consulter ou modifier."],
      ["Comment se déroule la mise en place ?", "Nous cadrons la configuration, l’import, la formation et l’activation progressive avant le test en production."],
    ],
    finalTitle: "Passez à une nouvelle façon de gérer votre agence Cargo.",
    finalText: "Centralisez vos opérations, vos clients, vos communications et vos finances dans un système conçu pour votre métier.",
    footerText: "La plateforme opérationnelle des agences Cargo.",
    formTitle: "Demander une démo",
    formStep: "Étape",
    next: "Continuer",
    back: "Retour",
    send: "Envoyer la demande",
    sending: "Envoi…",
    success: "Merci. Votre demande a bien été enregistrée.",
    error: "La demande n’a pas pu être envoyée. Réessayez.",
  },
  en: {
    nav: [["Product", "#platform"], ["Operations", "#operations"], ["Communication", "#communication"], ["Pricing", "#pricing"], ["Resources", "#faq"]],
    login: "Sign in", demo: "Request a demo", video: "See the platform",
    heroTitle: "Digitize your Cargo agency operations.",
    heroText: "Slaivio brings customers, communications, cases, parcels, warehouses, shipments, tracking, finance and documents into one system.",
    heroNote: "Built for Cargo agencies, freight forwarders and import-export businesses.",
    problemEyebrow: "One source of truth", problemTitle: "Your agency is growing. Your tools should keep up.",
    problemText: "Replace information scattered across messaging, spreadsheets, documents and notebooks with structured, shared and traceable workflows.",
    problems: [["Scattered communication", "Requests and decisions remain isolated across employees and channels."], ["Manual operations", "Reception, tracking, follow-ups and billing require too much re-entry."], ["Fragmented data", "Customers, parcels, payments and documents do not always tell the same story."], ["Late visibility", "Management discovers delays and blockers only after they have an impact."]],
    platformEyebrow: "The platform", platformTitle: "Your entire agency, organized in one system.", platformText: "Every team works in its own space, on the same operational data.",
    domains: [["Customer relationship", "Customers, inbox, conversations, follow-ups and history.", "users"], ["Cargo operations", "Cases, parcels, warehouses, batches, shipments and pickups.", "package"], ["Commercial", "Routes, services, pricing and consistent quotes.", "route"], ["Finance", "Invoices, payments, balances, credit and reports.", "chart"], ["Documents", "Every file linked to the right customer and operation.", "file"]],
    operationsEyebrow: "The core of Slaivio", operationsTitle: "Run the Cargo journey end to end.", operationsText: "From the first case to final handover, every step feeds the same history and operational metrics.",
    operationSteps: ["Case", "Parcel", "Warehouse", "Batch", "Shipment", "Tracking", "Pickup"],
    communicationEyebrow: "Customer relationship", communicationTitle: "One customer relationship, multiple channels.",
    communicationText: "WhatsApp Business is the first available channel. The architecture is designed to progressively bring email, TikTok and other touchpoints together without losing customer context.",
    available: "Available", soon: "Coming soon", contextTitle: "Context stays attached to the customer",
    contextItems: ["Identity and contact details", "Conversations", "Cases and parcels", "Invoices and payments", "Follow-ups and history"],
    intelligenceEyebrow: "Automation and visibility", intelligenceTitle: "Less repetitive work. More control.",
    intelligence: [["Operational automation", "A received parcel can update status, enrich the timeline and prepare a notification."], ["Cross-platform assistant", "Query agency data and prepare actions with permissions and validation."], ["Controlled organization", "Workspaces, roles, permissions and audit protect every team and market."]],
    setupEyebrow: "Implementation", setupTitle: "Move to Slaivio without starting over.",
    setupSteps: [["01", "Configure", "Workspaces, offices, warehouses, routes and services."], ["02", "Import", "Customers, cases, parcels and pricing from existing files."], ["03", "Connect", "Your team and the channels actually available."], ["04", "Launch", "Train users and progressively enable automation."]],
    pricingEyebrow: "Pricing", pricingTitle: "A level for every stage of growth.", pricingText: "We validate scope, volume and implementation support with you before production.",
    plans: [["Starter", "$119", "Start digitizing operations", ["Core operations", "WhatsApp Business", "Tracking", "Standard support"]], ["Growth", "$299", "Structure multiple teams", ["Everything in Starter", "Multiple warehouses", "Advanced pricing", "Reports and automation"]], ["Enterprise", "Custom", "Complex organizations", ["Multi-workspace", "Advanced permissions", "Guided migration", "Specific integrations"]]],
    faqEyebrow: "Frequently asked questions", faqTitle: "What to know before getting started.",
    faqs: [["What is Slaivio?", "A digitization platform built to centralize customer relationships, Cargo operations, finance, documents and management."], ["Is Slaivio only based on WhatsApp?", "No. WhatsApp Business is the first strong channel. Slaivio is designed as an omnichannel operational platform."], ["Can I import existing data?", "Yes. Structured imports can bring customers, cases, parcels and pricing from CSV or Excel."], ["Can I manage several countries and warehouses?", "Yes. Workspaces, offices and warehouses organize multiple markets with separate access."], ["Can employees have different access?", "Yes. Roles and permissions define what each user can view or change."], ["How does implementation work?", "We frame configuration, import, training and gradual activation before production testing."]],
    finalTitle: "A new way to run your Cargo agency.", finalText: "Bring operations, customers, communications and finance into a system designed for your business.",
    footerText: "The operational platform for Cargo agencies.", formTitle: "Request a demo", formStep: "Step", next: "Continue", back: "Back", send: "Send request", sending: "Sending…", success: "Thank you. Your request has been received.", error: "The request could not be sent. Please try again.",
  },
} as const;

const domainIcons: Record<string, LucideIcon> = { users: Users, package: Package, route: Route, chart: BarChart3, file: FileText };

export function StreamlinedLandingPage() {
  const locale = useLocale();
  const t = locale === "en" ? copy.en : copy.fr;
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoStep, setDemoStep] = useState(1);
  const [formStatus, setFormStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!demoOpen) return;
    const previous = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDemoOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [demoOpen]);

  function switchLocale() {
    const next = locale === "fr" ? "en" : "fr";
    const parts = pathname.split("/");
    parts[1] = next;
    router.push(parts.join("/") || `/${next}`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload = { ...form, ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])) };
    setFormStatus("loading");
    try {
      await createDemoRequest({
        full_name: `${payload.first_name || ""} ${payload.last_name || ""}`.trim(),
        email: payload.email || "",
        phone: payload.phone,
        agency_name: payload.agency_name,
        country: payload.country,
        monthly_shipments: payload.monthly_shipments,
        message: [payload.need, payload.employees && `Équipe: ${payload.employees}`, payload.offices && `Bureaux: ${payload.offices}`, payload.tools && `Outils: ${payload.tools}`].filter(Boolean).join(" · "),
      });
      setFormStatus("success");
    } catch {
      setFormStatus("error");
    }
  }

  return (
    <main className="min-h-screen bg-[#fbfcfa] font-sans text-[#111814] antialiased">
      <header className="sticky top-0 z-50 border-b border-[#e4e9e5]/90 bg-[#fbfcfa]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-5 lg:px-8">
          <Link href={`/${locale}`} aria-label="Slaivio"><Image src="/slaivio-logo-official-dark.png" alt="Slaivio" width={132} height={44} className="h-auto w-[118px]" priority /></Link>
          <nav className="hidden items-center gap-7 lg:flex">{t.nav.map(([label, href]) => <a key={href} href={href} className="text-[14px] font-medium text-[#566159] transition hover:text-[#111814]">{label}</a>)}</nav>
          <div className="hidden items-center gap-2 lg:flex">
            <button onClick={switchLocale} className="h-9 rounded-md px-3 text-[13px] font-semibold text-[#566159] hover:bg-[#f0f3f0]">{locale === "fr" ? "FR" : "EN"} <ChevronDown className="ml-1 inline" size={13} /></button>
            <Link href="/sign-in" className="inline-flex h-9 items-center px-3 text-[14px] font-semibold">{t.login}</Link>
            <button onClick={() => setDemoOpen(true)} className="inline-flex h-10 items-center rounded-md bg-[#111814] px-4 text-[14px] font-semibold text-white hover:bg-[#273029]">{t.demo}</button>
          </div>
          <button onClick={() => setMenuOpen(!menuOpen)} className="grid h-10 w-10 place-items-center rounded-md border border-[#dbe1dc] lg:hidden" aria-label="Menu">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        </div>
        {menuOpen && <div className="border-t border-[#e4e9e5] bg-white px-5 py-4 lg:hidden"><nav className="grid">{t.nav.map(([label, href]) => <a onClick={() => setMenuOpen(false)} key={href} href={href} className="border-b border-[#edf0ed] py-3 text-[15px] font-medium">{label}</a>)}</nav><div className="mt-4 grid grid-cols-3 gap-2"><button onClick={switchLocale} className="h-10 rounded-md border border-[#dbe1dc]">{locale === "fr" ? "FR" : "EN"}</button><Link href="/sign-in" className="grid h-10 place-items-center rounded-md border border-[#dbe1dc] text-[13px] font-semibold">{t.login}</Link><button onClick={() => setDemoOpen(true)} className="h-10 rounded-md bg-[#111814] text-[13px] font-semibold text-white">{t.demo}</button></div></div>}
      </header>

      <section className="relative overflow-hidden border-b border-[#e5eae6] px-5 pb-16 pt-20 lg:px-8 lg:pb-24 lg:pt-28">
        <div className="absolute inset-x-0 top-0 -z-0 h-[520px] bg-[radial-gradient(circle_at_65%_15%,rgba(18,199,111,.10),transparent_46%)]" />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-[.88fr_1.12fr]">
          <div className="max-w-[650px]">
            <div className="mb-7 h-1 w-12 rounded-full bg-[#12c76f]" />
            <h1 className="text-balance text-[44px] font-semibold leading-[1.04] tracking-[-0.048em] sm:text-[58px] lg:text-[68px]">{t.heroTitle}</h1>
            <p className="mt-7 max-w-[620px] text-[17px] leading-7 text-[#58635b] sm:text-[18px]">{t.heroText}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <button onClick={() => setDemoOpen(true)} className="inline-flex h-12 items-center gap-2 rounded-md bg-[#111814] px-5 text-[15px] font-semibold text-white hover:bg-[#273029]">{t.demo}<ArrowRight size={16} /></button>
              <a href="#platform" className="inline-flex h-12 items-center gap-2 rounded-md border border-[#d5dcd6] bg-white px-5 text-[15px] font-semibold hover:bg-[#f5f7f5]"><Play size={15} fill="currentColor" />{t.video}</a>
            </div>
            <p className="mt-6 text-[13px] leading-5 text-[#768078]">{t.heroNote}</p>
          </div>
          <ProductPreview english={locale === "en"} />
        </div>
      </section>

      <SectionShell eyebrow={t.problemEyebrow} title={t.problemTitle} text={t.problemText}>
        <div className="mt-12 grid border-y border-[#dde4de] md:grid-cols-2 lg:grid-cols-4">{t.problems.map(([title, text], index) => <article key={title} className={`py-7 md:px-6 lg:min-h-[190px] ${index > 0 ? "lg:border-l lg:border-[#dde4de]" : ""}`}><span className="text-[12px] font-semibold text-[#12a960]">0{index + 1}</span><h3 className="mt-4 text-[17px] font-semibold tracking-[-.015em]">{title}</h3><p className="mt-3 text-[14px] leading-6 text-[#667168]">{text}</p></article>)}</div>
      </SectionShell>

      <SectionShell id="platform" tone="soft" eyebrow={t.platformEyebrow} title={t.platformTitle} text={t.platformText}>
        <div className="mt-12 grid overflow-hidden rounded-xl border border-[#dce3dd] bg-white lg:grid-cols-[.78fr_1.22fr]">
          <div className="divide-y divide-[#e8ece9]">{t.domains.map(([title, text, icon], index) => { const Icon = domainIcons[icon]; return <article key={title} className="group flex gap-4 px-5 py-5 hover:bg-[#f8faf8]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#ecf8f1] text-[#0c8a50]"><Icon size={17} /></span><div><h3 className="text-[15px] font-semibold">{title}</h3><p className="mt-1 text-[13px] leading-5 text-[#6a746c]">{text}</p></div><span className="ml-auto self-center text-[12px] text-[#a1aaa3]">0{index + 1}</span></article>; })}</div>
          <div className="border-t border-[#dce3dd] bg-[#101713] p-5 text-white lg:border-l lg:border-t-0 sm:p-8"><PlatformMap /></div>
        </div>
      </SectionShell>

      <SectionShell id="operations" eyebrow={t.operationsEyebrow} title={t.operationsTitle} text={t.operationsText}>
        <div className="mt-12 overflow-hidden rounded-xl border border-[#dce3dd] bg-white p-5 sm:p-8">
          <div className="grid gap-2 md:grid-cols-7">{t.operationSteps.map((step, index) => <div key={step} className="relative"><div className="rounded-lg border border-[#e0e5e1] bg-[#fafbfa] px-3 py-4"><span className="text-[11px] font-semibold text-[#0f9e5a]">0{index + 1}</span><p className="mt-2 text-[14px] font-semibold">{step}</p></div>{index < t.operationSteps.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-[#aab2ac] md:block" size={14} />}</div>)}</div>
          <div className="mt-8 grid gap-5 border-t border-[#e7ebe8] pt-7 sm:grid-cols-3">{(locale === "en" ? [["Active shipments", "18", "12 on schedule"], ["Parcels in warehouse", "2,104", "184 received today"], ["Receivables", "$6,680", "12 invoices due"]] : [["Expéditions en cours", "18", "12 dans les délais"], ["Colis en entrepôt", "2 104", "184 reçus aujourd’hui"], ["À recevoir", "6 680 $", "12 factures à échéance"]]).map(([label, value, detail]) => <PreviewMetric key={label} label={label} value={value} detail={detail} />)}</div>
        </div>
      </SectionShell>

      <SectionShell id="communication" tone="soft" eyebrow={t.communicationEyebrow} title={t.communicationTitle} text={t.communicationText}>
        <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-xl border border-[#dce3dd] bg-white p-6 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-3"><Channel name="WhatsApp Business" status={t.available} active /><Channel name="Email / Gmail" status={t.soon} /><Channel name="TikTok" status={t.soon} /></div>
            <div className="my-7 flex items-center gap-3"><div className="h-px flex-1 bg-[#e1e6e2]" /><ArrowRight className="rotate-90 text-[#8c968f]" size={16} /><div className="h-px flex-1 bg-[#e1e6e2]" /></div>
            <div className="rounded-lg bg-[#101713] p-5 text-white"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-md bg-[#183525] text-[#4ee79b]"><MessageSquare size={17} /></span><div><p className="text-[14px] font-semibold">Inbox Slaivio</p><p className="text-[12px] text-[#aeb9b1]">Conversation reliée au client et à ses opérations</p></div></div></div>
          </div>
          <div className="rounded-xl border border-[#dce3dd] bg-white p-6 sm:p-8"><h3 className="text-[18px] font-semibold tracking-[-.02em]">{t.contextTitle}</h3><div className="mt-5 divide-y divide-[#e9edea]">{t.contextItems.map(item => <p key={item} className="flex items-center gap-3 py-3 text-[14px]"><Check className="text-[#0f9e5a]" size={15} />{item}</p>)}</div></div>
        </div>
      </SectionShell>

      <SectionShell eyebrow={t.intelligenceEyebrow} title={t.intelligenceTitle}>
        <div className="mt-12 grid gap-5 md:grid-cols-3">{t.intelligence.map(([title, text], index) => <article key={title} className="rounded-xl border border-[#dde3de] bg-white p-6"><span className="text-[12px] font-semibold text-[#0f9e5a]">0{index + 1}</span><h3 className="mt-5 text-[18px] font-semibold tracking-[-.02em]">{title}</h3><p className="mt-3 text-[14px] leading-6 text-[#667168]">{text}</p></article>)}</div>
      </SectionShell>

      <SectionShell tone="dark" eyebrow={t.setupEyebrow} title={t.setupTitle}>
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl bg-white/15 md:grid-cols-4">{t.setupSteps.map(([number, title, text]) => <article key={number} className="bg-[#111814] p-6"><span className="text-[12px] font-semibold text-[#45dc91]">{number}</span><h3 className="mt-5 text-[17px] font-semibold text-white">{title}</h3><p className="mt-3 text-[13px] leading-6 text-[#aeb8b1]">{text}</p></article>)}</div>
      </SectionShell>

      <SectionShell id="pricing" eyebrow={t.pricingEyebrow} title={t.pricingTitle} text={t.pricingText}>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">{t.plans.map(([name, price, description, features], index) => <article key={name} className={`rounded-xl border p-6 ${index === 1 ? "border-[#8fd9b1] bg-[#f4fbf7]" : "border-[#dce3dd] bg-white"}`}><p className="text-[14px] font-semibold">{name}</p><div className="mt-5 text-[34px] font-semibold tracking-[-.04em]">{price}<span className="ml-1 text-[13px] font-normal text-[#6b756d]">{price.includes("$ ") || price.includes("$") ? "/ mois" : ""}</span></div><p className="mt-3 min-h-10 text-[13px] leading-5 text-[#69736b]">{description}</p><div className="my-6 h-px bg-[#e2e7e3]" /><ul className="space-y-3">{features.map(feature => <li key={feature} className="flex gap-3 text-[13px]"><Check className="mt-0.5 shrink-0 text-[#0f9e5a]" size={14} />{feature}</li>)}</ul><button onClick={() => setDemoOpen(true)} className={`mt-7 h-10 w-full rounded-md text-[14px] font-semibold ${index === 1 ? "bg-[#111814] text-white" : "border border-[#d2d9d3] bg-white"}`}>{t.demo}</button></article>)}</div>
      </SectionShell>

      <SectionShell id="faq" tone="soft" eyebrow={t.faqEyebrow} title={t.faqTitle}>
        <div className="mx-auto mt-12 max-w-[820px] divide-y divide-[#dde3de] border-y border-[#dde3de]">{t.faqs.map(([question, answer]) => <details key={question} className="group py-1"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-[16px] font-semibold"><span>{question}</span><span className="text-[20px] font-normal text-[#7b857d] group-open:rotate-45">+</span></summary><p className="max-w-[720px] pb-5 text-[14px] leading-6 text-[#667168]">{answer}</p></details>)}</div>
      </SectionShell>

      <section className="border-t border-[#dfe5e0] bg-white px-5 py-20 text-center lg:px-8 lg:py-28"><div className="mx-auto max-w-[780px]"><div className="mx-auto mb-7 h-1 w-12 rounded-full bg-[#12c76f]" /><h2 className="text-balance text-[36px] font-semibold leading-[1.08] tracking-[-.04em] sm:text-[48px]">{t.finalTitle}</h2><p className="mx-auto mt-5 max-w-[650px] text-[16px] leading-7 text-[#647067]">{t.finalText}</p><button onClick={() => setDemoOpen(true)} className="mt-8 inline-flex h-12 items-center gap-2 rounded-md bg-[#111814] px-5 text-[15px] font-semibold text-white">{t.demo}<ArrowRight size={16} /></button></div></section>

      <footer className="bg-[#0d130f] px-5 py-12 text-white lg:px-8"><div className="mx-auto max-w-[1240px]"><div className="flex flex-col justify-between gap-8 border-b border-white/10 pb-10 sm:flex-row"><div><Image src="/slaivio-logo-official-dark.png" alt="Slaivio" width={120} height={40} className="brightness-0 invert" /><p className="mt-4 text-[13px] text-[#aab5ad]">{t.footerText}</p></div><div className="flex flex-wrap gap-x-8 gap-y-3">{t.nav.slice(0, 4).map(([label, href]) => <a key={href} href={href} className="text-[13px] text-[#c3ccc5] hover:text-white">{label}</a>)}</div></div><div className="flex flex-col justify-between gap-3 pt-7 text-[12px] text-[#89958c] sm:flex-row"><p>© 2026 Slaivio</p><div className="flex gap-5"><a href="#">{locale === "en" ? "Privacy" : "Confidentialité"}</a><a href="#">{locale === "en" ? "Terms" : "Conditions"}</a><button onClick={switchLocale}>{locale === "fr" ? "FR" : "EN"}</button></div></div></div></footer>

      {demoOpen && <DemoModal t={t} english={locale === "en"} step={demoStep} status={formStatus} close={() => { setDemoOpen(false); setDemoStep(1); setFormStatus("idle"); }} next={(values) => { setForm(current => ({ ...current, ...values })); setDemoStep(2); }} back={() => setDemoStep(1)} submit={submit} />}
    </main>
  );
}

function SectionShell({ id, eyebrow, title, text, tone = "light", children }: { id?: string; eyebrow: string; title: string; text?: string; tone?: "light" | "soft" | "dark"; children: React.ReactNode }) {
  return <section id={id} className={`px-5 py-20 lg:px-8 lg:py-28 ${tone === "soft" ? "border-y border-[#e2e7e3] bg-[#f3f6f3]" : tone === "dark" ? "bg-[#111814] text-white" : "bg-[#fbfcfa]"}`}><div className="mx-auto max-w-[1240px]"><p className={`text-[12px] font-semibold uppercase tracking-[.14em] ${tone === "dark" ? "text-[#45dc91]" : "text-[#0f9e5a]"}`}>{eyebrow}</p><div className="mt-5 grid gap-5 lg:grid-cols-[.86fr_1.14fr]"><h2 className="max-w-[660px] text-balance text-[34px] font-semibold leading-[1.08] tracking-[-.04em] sm:text-[44px]">{title}</h2>{text && <p className={`max-w-[650px] text-[16px] leading-7 ${tone === "dark" ? "text-[#aeb8b1]" : "text-[#647067]"}`}>{text}</p>}</div>{children}</div></section>;
}

function ProductPreview({ english }: { english: boolean }) {
  const rows = english ? [["EXP-2026-00458", "Guangzhou → Kinshasa", "In transit"], ["EXP-2026-00462", "Yiwu → Douala", "Preparing"], ["EXP-2026-00467", "Dubai → Kinshasa", "Review"]] : [["EXP-2026-00458", "Guangzhou → Kinshasa", "En transit"], ["EXP-2026-00462", "Yiwu → Douala", "Préparation"], ["EXP-2026-00467", "Dubai → Kinshasa", "À valider"]];
  return <div className="relative rounded-[14px] border border-[#d7ded8] bg-white p-2 shadow-[0_30px_80px_rgba(25,43,32,.14)]"><div className="overflow-hidden rounded-[10px] border border-[#e2e7e3]"><div className="flex h-12 items-center border-b border-[#e5e9e6] px-4"><div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#d9dedb]" /><span className="h-2.5 w-2.5 rounded-full bg-[#d9dedb]" /><span className="h-2.5 w-2.5 rounded-full bg-[#d9dedb]" /></div><p className="mx-auto text-[12px] font-semibold text-[#687269]">Vue d’ensemble · Agence RDC</p></div><div className="grid min-h-[430px] grid-cols-[136px_1fr] bg-[#f6f8f6]"><aside className="border-r border-[#e3e8e4] bg-white p-3"><Image src="/slaivio-mark.png" alt="" width={26} height={26} className="mb-6 h-6 w-6" />{["Accueil", "Clients", "Dossiers", "Colis", "Expéditions", "Finance"].map((item, index) => <p key={item} className={`mb-1 rounded px-2 py-2 text-[10px] ${index === 0 ? "bg-[#eaf7f0] font-semibold text-[#087a46]" : "text-[#768078]"}`}>{item}</p>)}</aside><div className="p-4 sm:p-5"><div className="flex items-center justify-between"><div><p className="text-[13px] font-semibold">Bonjour Grace</p><p className="mt-1 text-[10px] text-[#7a847c]">Voici l’activité de votre agence.</p></div><span className="rounded bg-[#111814] px-3 py-1.5 text-[9px] font-semibold text-white">Nouveau colis</span></div><div className="mt-5 grid grid-cols-3 overflow-hidden rounded-md border border-[#e0e5e1] bg-white"><PreviewMetric compact label="Colis" value="8 452" detail="+184 aujourd’hui" /><PreviewMetric compact label="Expéditions" value="18" detail="12 à l’heure" /><PreviewMetric compact label="À recevoir" value="6 680 $" detail="12 factures" /></div><div className="mt-4 rounded-md border border-[#e0e5e1] bg-white"><div className="flex items-center justify-between border-b border-[#e7ebe8] px-3 py-3"><p className="text-[11px] font-semibold">Expéditions en cours</p><span className="text-[9px] text-[#0f9e5a]">Tout voir</span></div>{rows.map(([reference, route, status]) => <div key={reference} className="grid grid-cols-[1fr_1.4fr_auto] gap-2 border-b border-[#edf0ee] px-3 py-3 text-[9px] last:border-0"><b>{reference}</b><span className="text-[#6e786f]">{route}</span><span className="rounded-full bg-[#edf7f1] px-2 py-0.5 text-[#087a46]">{status}</span></div>)}</div><div className="mt-4 grid grid-cols-2 gap-3"><div className="h-24 rounded-md border border-[#e0e5e1] bg-white p-3"><p className="text-[10px] font-semibold">Activité récente</p><div className="mt-3 h-1.5 w-full rounded bg-[#e9eeea]"><div className="h-full w-3/4 rounded bg-[#12c76f]" /></div><div className="mt-3 h-1.5 w-4/5 rounded bg-[#edf0ee]" /></div><div className="h-24 rounded-md border border-[#e0e5e1] bg-white p-3"><p className="text-[10px] font-semibold">À contrôler</p><p className="mt-3 text-[9px] text-[#6f7971]">3 documents manquants</p><p className="mt-2 text-[9px] text-[#6f7971]">2 colis bloqués</p></div></div></div></div></div></div>;
}

function PlatformMap() {
  return <div><div className="flex items-center justify-between"><div><p className="text-[12px] text-[#91a097]">Slaivio Platform</p><h3 className="mt-1 text-[20px] font-semibold">Une donnée, plusieurs équipes.</h3></div><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#173424] text-[#4ee79b]"><Globe2 size={19} /></span></div><div className="mt-8 grid grid-cols-2 gap-3">{[[Users, "Relation client"], [Truck, "Opérations"], [BarChart3, "Finance"], [ShieldCheck, "Administration"]].map(([Icon, label]) => { const Component = Icon as LucideIcon; return <div key={String(label)} className="rounded-lg border border-white/10 bg-white/[.04] p-4"><Component className="text-[#4ee79b]" size={17} /><p className="mt-5 text-[13px] font-semibold">{String(label)}</p><p className="mt-1 text-[11px] text-[#92a098]">Données reliées et permissions contrôlées</p></div>; })}</div></div>;
}

function PreviewMetric({ label, value, detail, compact = false }: { label: string; value: string; detail: string; compact?: boolean }) {
  return <div className={`${compact ? "p-3" : "px-1"} border-r border-[#e5e9e6] last:border-r-0`}><p className={`${compact ? "text-[9px]" : "text-[12px]"} text-[#737e75]`}>{label}</p><p className={`${compact ? "mt-1 text-[16px]" : "mt-2 text-[25px]"} font-semibold tracking-[-.03em]`}>{value}</p><p className={`${compact ? "mt-1 text-[8px]" : "mt-1 text-[12px]"} text-[#0d9455]`}>{detail}</p></div>;
}

function Channel({ name, status, active = false }: { name: string; status: string; active?: boolean }) {
  return <div className={`rounded-lg border p-4 ${active ? "border-[#9fd8b9] bg-[#f0faf5]" : "border-[#e0e5e1] bg-[#fafbfa]"}`}><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${active ? "bg-[#dff5e9] text-[#087a46]" : "bg-[#ecefed] text-[#737c75]"}`}>{status}</span><p className="mt-5 text-[13px] font-semibold">{name}</p></div>;
}

function DemoModal({ t, english, step, status, close, next, back, submit }: { t: typeof copy.fr | typeof copy.en; english: boolean; step: number; status: "idle" | "loading" | "success" | "error"; close: () => void; next: (values: Record<string, string>) => void; back: () => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  function firstStep(event: FormEvent<HTMLFormElement>) { event.preventDefault(); next(Object.fromEntries(Array.from(new FormData(event.currentTarget).entries()).map(([key, value]) => [key, String(value)]))); }
  const field = "h-11 w-full rounded-md border border-[#cfd7d1] bg-white px-3 text-[14px] outline-none focus:border-[#12a960] focus:ring-2 focus:ring-[#12c76f]/10";
  const labels = english ? { close: "Close", first: "First name", last: "Last name", email: "Work email", phone: "Phone", agency: "Agency", country: "Country", employees: "Number of employees", volume: "Monthly volume", offices: "Number of offices", tools: "Current tools", need: "Primary need", select: "Select", low: "Fewer than 500 parcels", medium: "500–2,000 parcels", high: "2,000–10,000 parcels", veryHigh: "More than 10,000 parcels", software: "Existing software", paper: "Paper / notebooks", other: "Other" } : { close: "Fermer", first: "Prénom", last: "Nom", email: "Email professionnel", phone: "Téléphone", agency: "Agence", country: "Pays", employees: "Nombre d’employés", volume: "Volume mensuel", offices: "Nombre de bureaux", tools: "Outils actuels", need: "Besoin principal", select: "Sélectionner", low: "Moins de 500 colis", medium: "500–2 000 colis", high: "2 000–10 000 colis", veryHigh: "Plus de 10 000 colis", software: "Logiciel existant", paper: "Papier / cahiers", other: "Autre" };
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-[#101713]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t.formTitle}><div className="w-full max-w-[580px] rounded-xl border border-[#dce3dd] bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,.28)] sm:p-8"><div className="flex items-start justify-between"><div><p className="text-[12px] font-semibold uppercase tracking-[.12em] text-[#0f9e5a]">{t.formStep} {step}/2</p><h2 className="mt-2 text-[26px] font-semibold tracking-[-.035em]">{t.formTitle}</h2></div><button onClick={close} className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#f1f3f1]" aria-label={labels.close}><X size={18} /></button></div>{status === "success" ? <div className="py-12 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e7f8ef] text-[#0b9555]"><Check size={20} /></span><p className="mt-5 text-[15px] font-medium">{t.success}</p><button onClick={close} className="mt-6 h-10 rounded-md bg-[#111814] px-5 text-[14px] font-semibold text-white">OK</button></div> : step === 1 ? <form onSubmit={firstStep} className="mt-7 grid gap-4 sm:grid-cols-2"><Field label={labels.first}><input required name="first_name" className={field} /></Field><Field label={labels.last}><input required name="last_name" className={field} /></Field><Field label={labels.email}><input required type="email" name="email" className={field} /></Field><Field label={labels.phone}><input required name="phone" className={field} /></Field><Field label={labels.agency}><input required name="agency_name" className={field} /></Field><Field label={labels.country}><input required name="country" className={field} /></Field><button className="mt-2 h-11 rounded-md bg-[#111814] text-[14px] font-semibold text-white sm:col-span-2">{t.next}</button></form> : <form onSubmit={submit} className="mt-7 grid gap-4 sm:grid-cols-2"><Field label={labels.employees}><select required name="employees" className={field}><option value="">{labels.select}</option><option>1–5</option><option>6–20</option><option>21–50</option><option>50+</option></select></Field><Field label={labels.volume}><select required name="monthly_shipments" className={field}><option value="">{labels.select}</option><option>{labels.low}</option><option>{labels.medium}</option><option>{labels.high}</option><option>{labels.veryHigh}</option></select></Field><Field label={labels.offices}><input name="offices" type="number" min="1" className={field} /></Field><Field label={labels.tools}><select name="tools" className={field}><option>WhatsApp + Excel</option><option>{labels.software}</option><option>Email + Excel</option><option>{labels.paper}</option><option>{labels.other}</option></select></Field><Field label={labels.need} className="sm:col-span-2"><textarea required name="need" rows={3} className={`${field} h-auto py-3`} /></Field>{status === "error" && <p className="text-[13px] text-red-700 sm:col-span-2">{t.error}</p>}<div className="mt-2 flex gap-2 sm:col-span-2"><button type="button" onClick={back} className="h-11 flex-1 rounded-md border border-[#d3dad4] text-[14px] font-semibold">{t.back}</button><button disabled={status === "loading"} className="h-11 flex-[1.5] rounded-md bg-[#111814] text-[14px] font-semibold text-white disabled:opacity-60">{status === "loading" ? t.sending : t.send}</button></div></form>}</div></div>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`grid gap-1.5 text-[12px] font-semibold text-[#4f5a52] ${className}`}><span>{label}</span>{children}</label>;
}
