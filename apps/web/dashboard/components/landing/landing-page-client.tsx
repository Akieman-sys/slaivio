"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  FileSpreadsheet,
  Globe2,
  Inbox,
  LockKeyhole,
  Mail,
  Megaphone,
  Menu,
  MessageCircle,
  Package,
  PlayCircle,
  Receipt,
  Route,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Truck,
  User,
  UserCircle,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";

import { createDemoRequest } from "@/services/landing";

const navItems = [
  { key: "features", href: "#features", hasChevron: true },
  { key: "workflow", href: "#workflow" },
  { key: "pricing", href: "#pricing" },
  { key: "resources", href: "#faq", hasChevron: true },
];

type TextCard = {
  title: string;
  text: string;
};

type ProblemCardCopy = TextCard & {
  impact: string;
};

type IntegrationCopy = TextCard & {
  eyebrow: string;
};

type PricingPlanCopy = {
  name: string;
  description: string;
  price: string;
  annualText?: string;
  highlights: string[];
  features: string[];
  cta: string;
};

const processStepIcons = [User, ClipboardList, Package, Truck, ClipboardCheck, BarChart3];

const processCardMeta: Array<{
  icon: LucideIcon;
  side: "left" | "right";
}> = [
  { icon: MessageCircle, side: "left" },
  { icon: Package, side: "left" },
  { icon: Bell, side: "left" },
  { icon: FileText, side: "right" },
  { icon: BarChart3, side: "right" },
  { icon: LockKeyhole, side: "right" },
];

const demoTimelineIcons = [BarChart3, Users, Package, Truck, MessageCircle, ClipboardList];

const integrationIds: Array<{
  id: "whatsapp" | "gmail" | "tiktok";
}> = [
  { id: "whatsapp" },
  { id: "gmail" },
  { id: "tiktok" },
];

const coreFeatureMeta: Array<{
  icon: LucideIcon;
  screen: "clients" | "dossiers" | "colis" | "tracking" | "whatsapp" | "warehouse" | "routes" | "pricing" | "payments" | "reports" | "security";
}> = [
  {
    icon: BarChart3,
    screen: "reports",
  },
  {
    icon: Users,
    screen: "clients",
  },
  {
    icon: ClipboardList,
    screen: "dossiers",
  },
  {
    icon: Package,
    screen: "colis",
  },
  {
    icon: Truck,
    screen: "routes",
  },
  {
    icon: CheckCircle2,
    screen: "tracking",
  },
  {
    icon: MessageCircle,
    screen: "whatsapp",
  },
  {
    icon: CreditCard,
    screen: "payments",
  },
  {
    icon: Bell,
    screen: "payments",
  },
  {
    icon: Megaphone,
    screen: "whatsapp",
  },
  {
    icon: Inbox,
    screen: "security",
  },
  {
    icon: MessageCircle,
    screen: "whatsapp",
  },
];

const formFields = [
  { name: "full_name", labelKey: "fullName", placeholderKey: "fullNamePlaceholder" },
  { name: "agency_name", labelKey: "agency", placeholderKey: "agencyPlaceholder" },
  { name: "country", labelKey: "country", placeholderKey: "countryPlaceholder" },
  { name: "email", labelKey: "email", placeholderKey: "emailPlaceholder" },
  { name: "phone", labelKey: "phone", placeholderKey: "phonePlaceholder" },
  { name: "monthly_shipments", labelKey: "monthlyShipments", placeholderKey: "monthlyShipmentsPlaceholder" },
];

const pricingPlanMeta: Array<{
  discount?: string;
  icon: LucideIcon;
  accent?: "green" | "purple";
  popular?: boolean;
}> = [
  {
    discount: "-20%",
    icon: Send,
  },
  {
    icon: BarChart3,
    popular: true,
  },
  {
    icon: Building2,
  },
  {
    icon: ShieldCheck,
    accent: "purple",
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.65, ease: "easeOut" as const },
};

export function LandingPageClient() {
  const heroTranslations = useTranslations("hero");
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [formStatus, setFormStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [heroPhraseIndex, setHeroPhraseIndex] = useState(0);
  const [headerFixed, setHeaderFixed] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const heroPhrases = heroTranslations.raw("phrases") as string[];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setHeroPhraseIndex((index) => (index + 1) % heroPhrases.length);
    }, 2600);

    return () => window.clearInterval(interval);
  }, [heroPhrases.length]);

  useEffect(() => {
    const updateHeader = () => {
      setHeaderFixed(window.scrollY > 92);
    };

    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });

    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  useEffect(() => {
    const openDemoFromLink = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest('a[href="#demo"]');

      if (!link) {
        return;
      }

      event.preventDefault();
      setFormStatus("idle");
      setDemoModalOpen(true);
    };

    document.addEventListener("click", openDemoFromLink);

    return () => document.removeEventListener("click", openDemoFromLink);
  }, []);

  async function submitDemoRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormStatus("loading");

    const formData = new FormData(event.currentTarget);

    try {
      await createDemoRequest({
        full_name: String(formData.get("full_name") || ""),
        agency_name: String(formData.get("agency_name") || ""),
        country: String(formData.get("country") || ""),
        email: String(formData.get("email") || ""),
        phone: String(formData.get("phone") || ""),
        monthly_shipments: String(formData.get("monthly_shipments") || ""),
        message: String(formData.get("message") || ""),
      });

      event.currentTarget.reset();
      setFormStatus("success");
    } catch {
      setFormStatus("error");
    }
  }

  return (
    <main className="min-h-screen bg-[#020807] font-['Neue_Haas_Grotesk_Display_Pro','Neue_Haas_Grotesk_Text',Inter,'Helvetica_Neue',Arial,system-ui,sans-serif] text-white">
      <LandingHeader menuOpen={menuOpen} setMenuOpen={setMenuOpen} isFixed={headerFixed} />
      <HeroSection phrase={heroPhrases[heroPhraseIndex]} />
      <ProblemSection />
      <WorkflowSection />
      <WatchDemoSection />
      <IntegrationsSection />
      <CoreFeaturesSection />
      <PricingSection />
      <FaqSection openFaq={openFaq} setOpenFaq={setOpenFaq} />
      <LandingFooter />
      <DemoRequestModal
        open={demoModalOpen}
        formStatus={formStatus}
        onClose={() => setDemoModalOpen(false)}
        onSubmit={submitDemoRequest}
      />
    </main>
  );
}

function LandingHeader({
  menuOpen,
  setMenuOpen,
  isFixed,
}: {
  menuOpen: boolean;
  setMenuOpen: (value: boolean) => void;
  isFixed: boolean;
}) {
  const t = useTranslations("navigation");

  return (
    <motion.header
      initial={false}
      animate={{ y: isFixed ? 0 : 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed left-0 right-0 top-0 z-50 will-change-transform transition-[background-color,box-shadow,border-color] duration-300 ${
        isFixed
          ? "border-b border-white/[0.08] bg-[#020807]/88 shadow-[0_16px_44px_rgba(0,0,0,0.20)] backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div
        className="mx-auto grid h-[88px] max-w-[1600px] grid-cols-[1fr_auto] items-center px-4 text-white sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)_auto] lg:px-8 2xl:px-10"
      >
        <Link href="/" className="flex items-center gap-3" aria-label="SLAIVIO">
          <Image
            src="/slaivio-logo-official-dark.png"
            alt="SLAIVIO"
            width={156}
            height={60}
            className="h-auto w-[142px] object-contain sm:w-[154px]"
            priority
          />
        </Link>

        <nav className="hidden items-center justify-center gap-9 text-[15px] font-semibold text-white xl:flex 2xl:gap-11">
          {navItems.map((item) => (
            <a key={item.key} href={item.href} className="inline-flex items-center gap-1.5 transition hover:text-[#12C76F]">
              {t(item.key)}
              {item.hasChevron && <ChevronDown className="h-3.5 w-3.5" />}
            </a>
          ))}
        </nav>

        <div className="hidden items-center justify-end gap-6 lg:flex">
          <LanguageSwitcher />
          <Link href="/sign-in" className="text-sm font-semibold text-white transition hover:text-[#12C76F]">
            {t("signIn")}
          </Link>
          <a
            href="#demo"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#12C76F] px-[22px] text-sm font-bold text-white shadow-[0_0_28px_rgba(18,199,111,0.26)] transition hover:-translate-y-0.5 hover:bg-[#18d87b]"
          >
            {t("requestDemo")}
          </a>
        </div>

        <button
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white lg:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={t("openMenu")}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed left-4 right-4 top-[96px] z-50 rounded-3xl border border-white/10 bg-[#020807]/96 px-5 py-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:hidden"
          >
            <div className="flex flex-col gap-4">
              {navItems.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  className="text-sm font-semibold text-white/75"
                  onClick={() => setMenuOpen(false)}
                >
                  {t(item.key)}
                </a>
              ))}
              <LanguageSwitcher compact />
              <Link href="/sign-in" className="text-sm font-semibold text-white/75">
                {t("signIn")}
              </Link>
              <a
                href="#demo"
                onClick={() => setMenuOpen(false)}
                className="rounded-xl bg-[#12C76F] px-5 py-3 text-center text-sm font-bold text-white"
              >
                {t("requestDemo")}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

function LanguageSwitcher({
  compact = false,
  variant = "header",
  display = "short",
}: {
  compact?: boolean;
  variant?: "header" | "footer";
  display?: "short" | "name";
}) {
  const t = useTranslations("language");
  const navT = useTranslations("navigation");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const switchLocale = (nextLocale: "fr" | "en") => {
    const segments = pathname.split("/");
    const currentLocale = segments[1];

    if (currentLocale === "fr" || currentLocale === "en") {
      segments[1] = nextLocale;
    } else {
      segments.splice(1, 0, nextLocale);
    }

    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    window.localStorage.setItem("slaivio-locale", nextLocale);
    router.replace(segments.join("/") || `/${nextLocale}`, { scroll: false });
    setOpen(false);
  };

  return (
    <div className={`relative ${compact ? "w-full" : ""}`}>
      <button
        type="button"
        aria-label={navT("language")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-10 items-center justify-center gap-2 px-3 text-sm font-semibold text-white transition ${
          variant === "footer"
            ? "rounded-none bg-transparent hover:text-[#12C76F]"
            : "rounded-xl border border-white/10 bg-white/[0.04] hover:border-[#12C76F]/40 hover:bg-white/[0.08]"
        } ${
          compact ? "w-full justify-between" : ""
        }`}
      >
        <span className="inline-flex items-center gap-2">
          <Globe2 className="h-5 w-5" />
          {display === "name"
            ? locale === "en"
              ? t("en")
              : t("fr")
            : locale === "en"
              ? t("shortEn")
              : t("shortFr")}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ duration: 0.18 }}
            className={`absolute z-[70] overflow-hidden rounded-2xl border border-white/10 bg-[#07110D]/98 p-1.5 shadow-[0_22px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl ${
              variant === "footer" ? "bottom-full mb-2 right-0 w-44" : `mt-2 ${compact ? "left-0 right-0" : "right-0 w-44"}`
            }`}
          >
            {(["fr", "en"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => switchLocale(item)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                  locale === item ? "bg-[#12C76F]/14 text-[#12C76F]" : "text-white/76 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {item === "fr" ? t("fr") : t("en")}
                {locale === item && <Check className="h-4 w-4" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HeroSection({ phrase }: { phrase: string }) {
  const t = useTranslations("hero");
  const buttons = useTranslations("navigation");

  return (
    <section className="relative min-h-screen bg-[#030706] px-5 pb-14 pt-[104px] text-white sm:px-8 md:pt-[120px] lg:px-10 xl:pb-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_55%,rgba(18,199,111,0.25),transparent_35%),radial-gradient(circle_at_30%_80%,rgba(18,199,111,0.10),transparent_30%),linear-gradient(180deg,#030706_0%,#050A09_48%,#07110D_100%)]" />
        <div className="absolute left-0 top-0 h-full w-full bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,.32)_100%)]" />
        <div
          className="absolute bottom-0 left-0 h-[360px] w-[760px] opacity-[0.18]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,.72) 1.15px, transparent 1.25px)",
            backgroundSize: "12px 12px",
            clipPath:
              "polygon(2% 36%, 15% 28%, 30% 35%, 40% 20%, 55% 33%, 70% 23%, 92% 42%, 87% 78%, 67% 68%, 56% 92%, 42% 69%, 29% 88%, 18% 66%, 5% 73%)",
          }}
        />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-104px)] max-w-[1500px] items-center gap-12 md:min-h-[calc(100vh-120px)] lg:grid-cols-[0.42fr_0.58fr] xl:gap-14">
        <div className="relative z-10 max-w-[610px] lg:pl-2 xl:pl-4">
          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" as const }}
            className="text-[38px] font-semibold leading-[1.06] tracking-[-0.025em] text-white sm:text-[54px] xl:text-[64px] 2xl:text-[68px]"
          >
            {t("line1")}
            <br />
            {t("line2")}
            <br />
            <span className="relative inline-grid min-h-[1.12em] min-w-[8.5em] overflow-hidden align-top text-[#12C76F]">
              <AnimatePresence mode="wait">
                <motion.span
                  key={phrase}
                  initial={{ y: "82%", opacity: 0, filter: "blur(8px)" }}
                  animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                  exit={{ y: "-82%", opacity: 0, filter: "blur(8px)" }}
                  transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
                  className="col-start-1 row-start-1 whitespace-nowrap"
                >
                  {phrase}
                </motion.span>
              </AnimatePresence>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" as const }}
            className="mt-7 max-w-[560px] text-base leading-[1.75] text-white/70 sm:text-lg"
          >
            {t("subtitle")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" as const }}
            className="mt-9 flex flex-col gap-3 sm:mt-12 sm:flex-row sm:gap-4"
          >
            <a
              href="#demo"
              className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#12C76F] px-5 text-[15px] font-semibold text-white shadow-[0_0_35px_rgba(18,199,111,0.28)] transition hover:-translate-y-0.5 hover:bg-[#18d87b] sm:h-14 sm:w-auto sm:px-6 sm:text-base"
            >
              <Send className="h-5 w-5" />
              {buttons("requestDemo")}
            </a>
            <a
              href="#watch-demo"
              className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/[0.18] bg-white/[0.03] px-5 text-[15px] font-semibold text-white backdrop-blur transition hover:border-[#12C76F]/70 hover:shadow-[0_0_28px_rgba(18,199,111,0.16)] sm:h-14 sm:w-auto sm:px-6 sm:text-base"
            >
              <PlayCircle className="h-6 w-6 text-[#3B82F6]" />
              {t("watchVideo")}
            </a>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.85, delay: 0.4, ease: "easeOut" as const }}
          className="relative z-10 mx-auto hidden w-full max-w-[900px] md:block lg:mx-0 lg:ml-auto lg:-mr-10 xl:-mr-16 2xl:-mr-4"
        >
          <motion.div
            aria-hidden="true"
            animate={{ rotate: 360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            className="absolute -left-12 top-[44%] hidden h-[260px] w-[260px] rounded-full border border-dashed border-[#12C76F]/55 lg:block"
          />
          <motion.div
            aria-hidden="true"
            animate={{ rotate: -360 }}
            transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
            className="absolute -right-2 bottom-12 hidden h-[300px] w-[300px] rounded-full border border-dashed border-[#12C76F]/45 lg:block"
          />
          <div className="absolute -inset-12 rounded-full bg-[#12C76F]/20 blur-[90px]" />
          <DashboardPreview />

          <FloatingCard
            className="-right-2 top-7 hidden rotate-[3deg] 2xl:block"
            delay={0}
            icon={MessageCircle}
            title={t("floatingWhatsapp")}
            lines={[t("floatingWhatsappFrom")]}
            badge={t("floatingNow")}
            variant="whatsapp"
          />
          <FloatingCard
            className="-left-10 bottom-10 hidden rotate-[-2deg] xl:block"
            delay={0.7}
            icon={Package}
            title={t("floatingPackage")}
            lines={[t("floatingPackageId"), t("floatingPackageWeight")]}
            badge={t("twoMinutes")}
            variant="package"
          />
          <FloatingCard
            className="right-8 bottom-[-28px] hidden rotate-[4deg] xl:block"
            delay={1.2}
            icon={CheckCircle2}
            title={t("floatingDelivered")}
            lines={[t("floatingDeliveredId"), t("floatingDeliveredLocation")]}
            badge={t("fifteenMinutes")}
            variant="success"
          />
        </motion.div>
      </div>
    </section>
  );
}

function DashboardPreview() {
  const menu: Array<[string, LucideIcon, string?]> = [
    ["Dashboard", Route],
    ["Clients", Users],
    ["Dossiers", FileText],
    ["Colis", Package],
    ["Expéditions", Truck],
    ["Tracking", Search],
    ["WhatsApp Inbox", MessageCircle, "12"],
    ["Broadcasts", Megaphone],
    ["Relances", Bell],
    ["Base de connaissances", Inbox],
    ["Tarification", CircleDollarSign],
    ["Services", Warehouse],
    ["Paiements", CreditCard],
    ["Factures", Receipt],
    ["Organisation", Building2],
    ["Paramètres", Settings],
  ];
  const kpis = [
    ["Clients", "1,248", "+14.5%"],
    ["Dossiers", "842", "+12.3%"],
    ["Colis", "2,453", "+18.7%"],
    ["Expéditions", "320", "+9.1%"],
  ];
  const shipments = [
    ["EXP-2024-1250", "Chine → Kinshasa", "En transit", "12 Juin 2024", "green"],
    ["EXP-2024-1249", "Dubaï → Douala", "Arrivé", "08 Juin 2024", "green"],
    ["EXP-2024-1248", "Turquie → Abidjan", "En préparation", "15 Juin 2024", "amber"],
    ["EXP-2024-1247", "Chine → Yaoundé", "En transit", "10 Juin 2024", "purple"],
    ["EXP-2024-1246", "Inde → Lubumbashi", "Validé", "—", "green"],
  ];

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-white/[0.12] bg-[#070E0D]/85 shadow-[0_40px_120px_rgba(0,0,0,0.45)] backdrop-blur-[20px]">
      <div className="grid min-h-[600px] grid-cols-1 lg:grid-cols-[176px_1fr] xl:grid-cols-[190px_1fr]">
        <aside className="hidden border-r border-white/[0.08] bg-black/10 px-3 py-5 lg:block">
          <div className="mb-5 flex items-center gap-2 px-2">
            <Image
              src="/slaivio-logo-official-dark.png"
              alt="SLAIVIO"
              width={112}
              height={43}
              className="h-auto w-[104px] object-contain"
            />
          </div>
          <div className="space-y-1.5">
            {menu.map(([item, Icon, badge], index) => (
              <div
                key={item}
                className={`flex h-8 items-center gap-2 rounded-lg px-2 text-[11px] font-semibold ${
                  index === 0 ? "bg-[#12C76F]/22 text-[#12C76F]" : "text-white/78"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item}</span>
                {badge && <span className="rounded-full bg-[#12C76F] px-1.5 py-0.5 text-[9px] font-black text-[#03100d]">{badge}</span>}
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 p-4 sm:p-5 xl:p-5">
          <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex h-9 min-w-0 items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/20 px-4 text-[11px] text-white/68 sm:w-[260px]">
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">Rechercher un client, dossier, colis...</span>
            </div>
            <div className="flex items-center gap-3">
              <Bell className="h-4 w-4 text-white/80" />
              <MessageCircle className="h-4 w-4 text-white/70" />
              <UserCircle className="h-5 w-5 text-white/72" />
              <div className="hidden sm:block">
                <p className="text-[11px] font-bold">OTI Cargo Express</p>
                <p className="text-[10px] text-white/55">Kinshasa, RDC</p>
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 text-white/60 sm:block" />
            </div>
          </div>

          <h2 className="mt-5 text-lg font-bold">Tableau de bord</h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map(([title, value, delta]) => (
              <div key={title} className="rounded-lg border border-white/[0.08] bg-white/[0.035] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-[11px] font-semibold text-white">{title}</p>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <p className="text-[22px] font-extrabold tracking-[-0.04em]">{value}</p>
                  <p className="text-[11px] font-black text-[#12C76F]">{delta}</p>
                </div>
                <p className="mt-2 text-[10px] text-white/55">vs mois dernier</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.035] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold">Expéditions en cours</h3>
              <ChevronDown className="-rotate-90 h-4 w-4 text-white" />
            </div>
            <div className="grid grid-cols-[1.1fr_1.1fr_0.9fr_1fr] border-y border-white/[0.06] py-2 text-[10px] text-white/62">
              <span>Expédition</span>
              <span>Route</span>
              <span>Statut</span>
              <span>ETA</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {shipments.map(([id, route, status, eta, tone]) => (
                <div key={id} className="grid grid-cols-[1.1fr_1.1fr_0.9fr_1fr] items-center py-2 text-[10px]">
                  <span className="truncate font-bold">{id}</span>
                  <span className="truncate text-white/86">{route}</span>
                  <span>
                    <span
                      className={`rounded-full px-2 py-1 font-bold ${
                        tone === "amber"
                          ? "bg-amber-500/18 text-amber-300"
                          : tone === "purple"
                            ? "bg-violet-500/18 text-violet-300"
                            : "bg-[#12C76F]/18 text-[#12C76F]"
                      }`}
                    >
                      {status}
                    </span>
                  </span>
                  <span className="truncate text-white/86">{eta}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[0.82fr_1.15fr_0.9fr]">
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.035] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold">Revenus ce mois</h3>
                <ChevronDown className="-rotate-90 h-4 w-4" />
              </div>
              <p className="mt-5 text-2xl font-extrabold tracking-[-0.04em]">$24,850 <span className="text-[11px] text-[#12C76F]">+16.3%</span></p>
              <svg viewBox="0 0 180 120" className="mt-3 h-[116px] w-full">
                <defs>
                  <linearGradient id="hero-revenue-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgba(18,199,111,.46)" />
                    <stop offset="100%" stopColor="rgba(18,199,111,0)" />
                  </linearGradient>
                  <linearGradient id="hero-revenue-line" x1="0" x2="1">
                    <stop offset="0%" stopColor="#12C76F" />
                    <stop offset="100%" stopColor="#1FE58A" />
                  </linearGradient>
                </defs>
                {[22, 48, 74, 100].map((y) => (
                  <line key={y} x1="0" x2="180" y1={y} y2={y} stroke="rgba(255,255,255,.07)" />
                ))}
                <path d="M0 106 C18 78 28 100 45 72 C62 42 74 54 92 34 C114 8 130 58 148 32 C160 14 168 32 180 0 L180 120 L0 120 Z" fill="url(#hero-revenue-fill)" />
                <path d="M0 106 C18 78 28 100 45 72 C62 42 74 54 92 34 C114 8 130 58 148 32 C160 14 168 32 180 0" fill="none" stroke="url(#hero-revenue-line)" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-white/[0.035] p-4">
              <h3 className="text-[11px] font-bold">Répartition par service</h3>
              <div className="mt-5 flex items-center gap-6">
                <div className="relative h-[118px] w-[118px] shrink-0 rounded-full bg-[conic-gradient(#38BDF8_0_45%,#12C76F_45%_80%,#F59E0B_80%_95%,#8B5CF6_95%_100%)] p-[14px]">
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#07110D] text-center">
                    <span className="text-xl font-extrabold">2,458</span>
                    <span className="text-[10px] text-white/60">Colis</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-3 text-[11px]">
                  {[
                    ["Air Cargo", "45%", "#38BDF8"],
                    ["Sea Cargo", "35%", "#12C76F"],
                    ["Express", "15%", "#F59E0B"],
                    ["Groupage", "5%", "#8B5CF6"],
                  ].map(([label, value, color]) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="flex-1 truncate">{label}</span>
                      <span className="text-white/72">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-white/[0.035] p-4">
              <h3 className="text-[11px] font-bold">Messages WhatsApp</h3>
              <p className="mt-4 text-2xl font-extrabold">128</p>
              <p className="text-[10px] text-white/55">Non lus</p>
              <div className="mt-4 space-y-3">
                {["+243 81 234 5678", "+237 6 00 76 54 32", "+225 07 89 45 67 78"].map((phone, index) => (
                  <div key={phone} className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-black text-[#07110D]">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-bold">{phone}</p>
                      <p className="truncate text-[9px] text-white/50">Bonjour, j&apos;aimerais connaître le pr...</p>
                    </div>
                    <span className="text-[9px] text-white/45">{index === 0 ? "10:24" : index === 1 ? "09:15" : "Hier"}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-[10px] font-bold">Voir toutes les conversations</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FloatingCard({
  className,
  icon: Icon,
  title,
  lines,
  badge,
  delay,
  variant,
}: {
  className: string;
  icon: LucideIcon;
  title: string;
  lines: string[];
  badge: string;
  delay: number;
  variant: "whatsapp" | "package" | "success";
}) {
  return (
    <motion.div
      animate={{ y: [0, -8, 0] }}
      transition={{
        duration: variant === "success" ? 8.5 : variant === "package" ? 7.5 : 6.5,
        delay,
        repeat: Infinity,
        repeatType: "mirror",
        ease: "easeInOut" as const,
      }}
      className={`absolute w-[282px] rounded-[18px] border border-white/[0.14] bg-[rgba(5,10,9,0.82)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-[20px] ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${variant === "success" ? "bg-[#12C76F] text-white" : "border border-[#12C76F] bg-[#12C76F]/10 text-[#12C76F]"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-bold">{title}</h3>
            <span className="shrink-0 text-[10px] text-white/45">{badge}</span>
          </div>
          {lines.map((line) => (
            <p key={line} className="mt-1 truncate text-sm text-white/85">{line}</p>
          ))}
        </div>
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#12C76F]" />
      </div>
    </motion.div>
  );
}

function ProblemSection() {
  const t = useTranslations("problem");
  const [activeProblem, setActiveProblem] = useState(0);
  const problemIcons = [MessageCircle, FileSpreadsheet, Clock, Package, BarChart3, Users];
  const problemCards = (t.raw("cards") as ProblemCardCopy[]).map((card, index) => ({
    ...card,
    icon: problemIcons[index],
  }));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveProblem((index) => (index + 1) % problemCards.length);
    }, 3200);

    return () => window.clearInterval(interval);
  }, [problemCards.length]);

  const ActiveIcon = problemCards[activeProblem].icon;

  return (
    <section id="solutions" className="relative overflow-hidden bg-[#EEF3EF] px-5 py-20 text-[#07111F] sm:px-8 lg:px-12 lg:pb-24 lg:pt-[112px]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#F6FAF7_0%,#EEF3EF_48%,#E7EFE9_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.20]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(18,199,111,.18) 1px, transparent 1.2px), linear-gradient(rgba(15,23,42,.045) 1px, transparent 1px)",
            backgroundSize: "30px 30px, 60px 60px",
            maskImage: "radial-gradient(circle at 24% 44%, black, transparent 72%)",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(18,199,111,0.08),transparent_60%)]" />
        <div className="absolute -left-24 top-32 h-[420px] w-[420px] rounded-full bg-[#12C76F]/[0.045] blur-[90px]" />
        <div
          className="absolute bottom-14 left-0 h-[260px] w-[420px] opacity-[0.10]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(18,199,111,.5) 1px, transparent 1.2px)",
            backgroundSize: "13px 13px",
          }}
        />
        <div
          className="absolute right-0 top-24 hidden h-[620px] w-[50vw] opacity-[0.18] lg:block"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(18,199,111,.26) 1px, transparent 1px), radial-gradient(circle, rgba(7,17,31,.18) 1px, transparent 1.4px)",
            backgroundSize: "34px 34px, 22px 22px",
            maskImage: "radial-gradient(circle at 64% 44%, black, transparent 72%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[1440px]">
        <div className="max-w-[860px]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.62, ease: "easeOut" as const }}
            className="hidden"
          />
          <motion.h2
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.68, ease: "easeOut" as const }}
            className="max-w-[700px] text-[36px] font-normal leading-[1.08] tracking-[-0.035em] text-[#07111F] sm:text-[48px] xl:text-[56px]"
          >
            {t("titleLine1")}
            <br />
            {t("titleLine2")} <span className="text-[#12C76F]">{t("titleAccent")}</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.68, delay: 0.08, ease: "easeOut" as const }}
            className="mt-7 max-w-[620px] text-[17px] font-normal leading-[1.75] tracking-[-0.01em] text-[#475569] sm:text-[19px]"
          >
            {t("subtitle")}
          </motion.p>

          <div className="mt-10 max-w-[820px]">
            <div className="relative min-h-[610px] overflow-hidden rounded-[30px] border border-slate-900/[0.07] bg-white/90 p-5 shadow-[0_30px_90px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:min-h-[520px] sm:p-8 lg:min-h-[500px]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_14%,rgba(18,199,111,0.10),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,255,255,0.62))]" />
              <AnimatePresence mode="wait">
                <motion.div
                  key={problemCards[activeProblem].title}
                  initial={{ opacity: 0, x: 28, filter: "blur(8px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, x: -28, filter: "blur(8px)" }}
                  transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
                  className="relative grid min-h-[520px] gap-6 pb-12 sm:min-h-[390px] sm:grid-cols-[92px_1fr] sm:items-center sm:pb-10 lg:min-h-[370px]"
                >
                  <div className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-[#12C76F]/14 text-[#12C76F] ring-1 ring-[#12C76F]/20 sm:mt-1">
                    <ActiveIcon className="h-9 w-9" />
                  </div>
                  <div className="flex h-full flex-col justify-center">
                    <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-[#12C76F]">
                      {t("problemLabel")} {String(activeProblem + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-3 text-[30px] font-normal leading-tight tracking-[-0.035em] text-[#07111F] sm:text-[40px]">
                      {problemCards[activeProblem].title}
                    </h3>
                    <p className="mt-5 max-w-[640px] text-[17px] font-normal leading-8 tracking-[-0.01em] text-[#475569]">
                      {problemCards[activeProblem].text}
                    </p>
                    <div className="mt-7 rounded-2xl border border-[#12C76F]/16 bg-[#EAFBF2] p-4">
                      <p className="text-sm font-medium text-[#12C76F]">{t("impactLabel")}</p>
                      <p className="mt-1 text-[15px] font-normal leading-7 tracking-[-0.01em] text-[#334155]">
                        {problemCards[activeProblem].impact}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="absolute bottom-5 left-5 right-5 flex items-center gap-2 sm:bottom-8 sm:left-8 sm:right-8">
                {problemCards.map((card, index) => (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => setActiveProblem(index)}
                    className={`h-2.5 rounded-full transition-all ${
                      index === activeProblem
                        ? "w-10 bg-[#12C76F]"
                        : "w-2.5 bg-slate-900/14 hover:bg-slate-900/28"
                    }`}
                    aria-label={`Afficher ${card.title}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  const t = useTranslations("workflow");
  const processSteps = (t.raw("steps") as TextCard[]).map((step, index) => ({
    ...step,
    icon: processStepIcons[index],
  }));
  const processCards = (t.raw("cards") as TextCard[]).map((card, index) => ({
    ...card,
    ...processCardMeta[index],
  }));
  const processPairs = [
    [processCards[0], processCards[3]],
    [processCards[1], processCards[4]],
    [processCards[2], processCards[5]],
  ];
  const [activePair, setActivePair] = useState(0);
  const [leftCard, rightCard] = processPairs[activePair];
  const pairPositions = [
    ["xl:self-start xl:mt-10", "xl:self-end xl:mb-10"],
    ["xl:self-center", "xl:self-center"],
    ["xl:self-end xl:mb-10", "xl:self-start xl:mt-10"],
  ];
  const [leftPosition, rightPosition] = pairPositions[activePair];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActivePair((index) => (index + 1) % processPairs.length);
    }, 5200);

    return () => window.clearInterval(interval);
  }, [processPairs.length]);

  return (
    <section id="workflow" className="relative overflow-hidden bg-[#EEF4EF] px-5 py-20 text-[#07111F] sm:px-8 lg:px-10 lg:py-24">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#F6FAF7_0%,#EEF4EF_52%,#F8FAF6_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(18,199,111,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(18,199,111,.16) 1px, transparent 1px)",
            backgroundSize: "46px 46px",
            maskImage: "radial-gradient(circle at 50% 42%, black, transparent 72%)",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(7,17,13,0.055),rgba(246,247,244,0))]" />
        <div className="absolute left-1/2 top-20 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#12C76F]/[0.045] blur-[90px]" />
        <div className="absolute bottom-20 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-[#07111F]/[0.035] blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-[1500px]">
        <motion.div {...fadeUp} className="mx-auto max-w-[900px] text-center">
          <h2 className="text-[34px] font-normal leading-[1.08] tracking-[-0.035em] text-[#07111F] sm:text-[46px] lg:text-[56px] xl:text-[64px]">
            {t("titleLine1")}
            <br />
            {t("titleLine2")} <span className="text-[#12C76F]">{t("titleAccent")}</span>
          </h2>
          <p className="mx-auto mt-6 max-w-[820px] text-[16px] font-normal leading-[1.7] tracking-[-0.01em] text-[#475569] sm:text-[18px] lg:text-[20px]">
            {t("subtitle")}
          </p>
        </motion.div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-6 xl:gap-5">
          {processSteps.map((step, index) => (
            <motion.div
              key={step.title}
              {...fadeUp}
              transition={{ duration: 0.55, delay: index * 0.08 }}
              className="relative text-center"
            >
              {index < processSteps.length - 1 && (
                <div className="absolute left-[calc(50%+46px)] top-[18px] hidden h-px w-[calc(100%-92px)] border-t border-dashed border-[#12C76F]/35 xl:block" />
              )}
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#EAFBF2] text-[13px] font-semibold text-[#07111F]">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="mx-auto mt-5 flex h-[58px] w-[58px] items-center justify-center rounded-[16px] bg-[#EAFBF2] text-[#0BAA5D]">
                <step.icon className="h-7 w-7" />
              </div>
              <h3 className="mt-5 text-[16px] font-semibold tracking-[-0.02em] text-[#07111F]">{step.title}</h3>
              <p className="mx-auto mt-3 max-w-[220px] text-[14px] font-normal leading-[1.75] tracking-[-0.01em] text-[#475569]">
                {step.text}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="relative mt-16 lg:mt-20">
          <div className="relative mx-auto grid max-w-[1500px] gap-6 xl:grid-cols-[280px_minmax(0,1060px)_280px] xl:items-center xl:gap-8">
            <div className={`hidden xl:block ${leftPosition}`}>
              <AnimatePresence mode="wait">
                <ProcessFloatingCard key={leftCard.title} card={leftCard} align="left" />
              </AnimatePresence>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.75, ease: "easeOut" as const }}
              className="relative mx-auto w-full max-w-[1120px]"
            >
              <div className="absolute -left-12 top-1/2 hidden h-px w-12 border-t border-dashed border-[#12C76F]/50 xl:block" />
              <div className="absolute -right-12 top-1/2 hidden h-px w-12 border-t border-dashed border-[#12C76F]/50 xl:block" />
              <DashboardPreview />
            </motion.div>

            <div className={`hidden xl:block ${rightPosition}`}>
              <AnimatePresence mode="wait">
                <ProcessFloatingCard key={rightCard.title} card={rightCard} align="right" />
              </AnimatePresence>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:hidden">
              {processCards.map((card, index) => (
                <ProcessStaticCard key={card.title} card={card} delay={index * 0.05} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProcessFloatingCard({
  card,
  align,
}: {
  card: TextCard & { icon: LucideIcon; side: "left" | "right" };
  align: "left" | "right";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22, x: align === "left" ? -24 : 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      exit={{ opacity: 0, y: -18, x: align === "left" ? -24 : 24, scale: 0.96 }}
      transition={{
        opacity: { duration: 0.45 },
        x: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
        scale: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
        y: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
      }}
      whileHover={{ y: -10, scale: 1.025, rotate: 0 }}
      className={`relative min-h-[180px] rounded-[22px] border border-slate-900/[0.08] bg-white/95 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur transition ${
        align === "left" ? "text-left" : "text-left"
      }`}
    >
      <div
        className={`absolute top-1/2 hidden h-px w-10 border-t border-dashed border-[#12C76F]/40 xl:block ${
          align === "left" ? "-right-10" : "-left-10"
        }`}
      />
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EAFBF2] text-[#0BAA5D]">
          <card.icon className="h-7 w-7" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-[#07111F]">{card.title}</h3>
          <p className="mt-3 text-[14px] font-normal leading-7 tracking-[-0.01em] text-[#475569]">{card.text}</p>
        </div>
      </div>
    </motion.div>
  );
}

function ProcessStaticCard({
  card,
  delay,
}: {
  card: TextCard & { icon: LucideIcon; side: "left" | "right" };
  delay: number;
}) {
  return (
    <motion.div
      {...fadeUp}
      transition={{ duration: 0.5, delay }}
      className="rounded-[18px] border border-slate-900/[0.08] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.07)]"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAFBF2] text-[#0BAA5D]">
          <card.icon className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-[#07111F]">{card.title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-[#475569]">{card.text}</p>
        </div>
      </div>
    </motion.div>
  );
}

// Retained as a reusable landing variant while the production page is consolidated.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LightDashboardPreview() {
  const menu: Array<[string, LucideIcon, string?]> = [
    ["Dashboard", Route],
    ["Clients", Users],
    ["Dossiers", FileText],
    ["Colis", Package],
    ["Expéditions", Truck],
    ["Tracking", Search],
    ["WhatsApp Inbox", MessageCircle, "12"],
    ["Broadcasts", Megaphone],
    ["Relances", Bell],
    ["Base de connaissances", Inbox],
    ["Tarification", CircleDollarSign],
    ["Services", Warehouse],
    ["Paiements", CreditCard],
  ];
  const kpis = [
    ["Clients", "1,248", "+14.5%"],
    ["Dossiers", "842", "+12.3%"],
    ["Colis", "2,453", "+18.7%"],
    ["Expéditions", "320", "+9.1%"],
    ["Revenus (ce mois)", "$24,850", "+16.3%"],
  ];
  const shipments = [
    ["EXP-2024-1250", "Chine → Kinshasa", "En transit", "12 Juin 2024", "green"],
    ["EXP-2024-1249", "Dubai → Douala", "Arrivé", "08 Juin 2024", "green"],
    ["EXP-2024-1248", "Turquie → Abidjan", "En préparation", "15 Juin 2024", "amber"],
    ["EXP-2024-1247", "Chine → Yaoundé", "En transit", "10 Juin 2024", "purple"],
    ["EXP-2024-1246", "Inde → Lubumbashi", "Validé", "—", "green"],
  ];

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-900/[0.08] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.10)]">
      <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-[190px_1fr]">
        <aside className="hidden border-r border-slate-900/[0.07] bg-[#FBFDFD] px-4 py-5 lg:block">
          <div className="mb-5 flex items-center gap-2">
            <Image
              src="/slaivio-icon-official.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
            />
            <span className="text-[19px] font-semibold tracking-[-0.04em] text-[#07111F]">Slaivio</span>
          </div>
          <div className="space-y-1.5">
            {menu.map(([item, Icon, badge], index) => (
              <div
                key={item}
                className={`flex h-8 items-center gap-2 rounded-lg px-2 text-[11px] font-medium ${
                  index === 0 ? "bg-[#12C76F]/12 text-[#0BAA5D]" : "text-[#334155]"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item}</span>
                {badge && <span className="rounded-full bg-[#12C76F] px-1.5 py-0.5 text-[9px] font-bold text-white">{badge}</span>}
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 p-4 sm:p-5 lg:p-6">
          <div className="flex flex-col gap-3 border-b border-slate-900/[0.06] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex h-9 min-w-0 items-center gap-2 rounded-2xl border border-slate-900/[0.08] bg-[#FAFCFB] px-4 text-[11px] text-[#64748B] sm:w-[285px]">
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">Rechercher un client, dossier, colis...</span>
            </div>
            <div className="flex items-center gap-3 text-[#334155]">
              <Bell className="h-4 w-4" />
              <MessageCircle className="h-4 w-4" />
              <UserCircle className="h-5 w-5" />
              <div className="hidden sm:block">
                <p className="text-[11px] font-semibold text-[#07111F]">OTI Cargo Express</p>
                <p className="text-[10px] text-[#64748B]">Kinshasa, RDC</p>
              </div>
            </div>
          </div>

          <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.02em] text-[#07111F]">Tableau de bord</h3>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {kpis.map(([title, value, delta]) => (
              <div key={title} className="rounded-xl border border-slate-900/[0.07] bg-white p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <p className="truncate text-[11px] font-medium text-[#475569]">{title}</p>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <p className="text-[21px] font-semibold tracking-[-0.04em] text-[#07111F]">{value}</p>
                  <p className="text-[10px] font-semibold text-[#12C76F]">{delta}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1.45fr_0.9fr]">
            <div className="rounded-xl border border-slate-900/[0.07] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-[13px] font-semibold text-[#07111F]">Expéditions en cours</h4>
                <ChevronDown className="-rotate-90 h-4 w-4 text-[#475569]" />
              </div>
              <div className="grid grid-cols-[1.15fr_1.1fr_0.9fr_1fr] border-y border-slate-900/[0.06] py-2 text-[10px] text-[#64748B]">
                <span>Expédition</span>
                <span>Route</span>
                <span>Statut</span>
                <span>ETA</span>
              </div>
              <div className="divide-y divide-slate-900/[0.05]">
                {shipments.map(([id, route, status, eta, tone]) => (
                  <div key={id} className="grid grid-cols-[1.15fr_1.1fr_0.9fr_1fr] items-center py-2 text-[10px]">
                    <span className="truncate font-semibold text-[#07111F]">{id}</span>
                    <span className="truncate text-[#334155]">{route}</span>
                    <span>
                      <span
                        className={`rounded-full px-2 py-1 font-semibold ${
                          tone === "amber"
                            ? "bg-amber-100 text-amber-700"
                            : tone === "purple"
                              ? "bg-violet-100 text-violet-700"
                              : "bg-[#12C76F]/12 text-[#0BAA5D]"
                        }`}
                      >
                        {status}
                      </span>
                    </span>
                    <span className="truncate text-[#334155]">{eta}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-900/[0.07] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <h4 className="text-[13px] font-semibold text-[#07111F]">Répartition par service</h4>
              <div className="mt-5 flex items-center gap-5">
                <div className="relative h-[122px] w-[122px] shrink-0 rounded-full bg-[conic-gradient(#38BDF8_0_45%,#12C76F_45%_80%,#F59E0B_80%_95%,#8B5CF6_95%_100%)] p-[14px]">
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center">
                    <span className="text-xl font-semibold text-[#07111F]">2,453</span>
                    <span className="text-[10px] text-[#64748B]">Colis</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-3 text-[11px]">
                  {[
                    ["Air Cargo", "45%", "#38BDF8"],
                    ["Sea Cargo", "35%", "#12C76F"],
                    ["Express", "15%", "#F59E0B"],
                    ["Groupage", "5%", "#8B5CF6"],
                  ].map(([label, value, color]) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="flex-1 truncate text-[#334155]">{label}</span>
                      <span className="text-[#64748B]">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WatchDemoSection() {
  const t = useTranslations("demo");
  const demoTimeline = (t.raw("timeline") as TextCard[]).map((step, index) => ({
    ...step,
    icon: demoTimelineIcons[index],
  }));

  return (
    <section id="watch-demo" className="relative overflow-hidden bg-[#F2F5F1] px-5 py-20 text-[#07111F] sm:px-8 lg:px-10 xl:py-[120px]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.72),rgba(230,239,232,.72))]" />
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(18,199,111,.16) 1px, transparent 1px), linear-gradient(rgba(18,199,111,.10) 1px, transparent 1px)",
            backgroundSize: "54px 54px",
            maskImage: "radial-gradient(circle at 66% 40%, black, transparent 70%)",
          }}
        />
        <div className="absolute left-0 top-0 h-[460px] w-[520px] rounded-full bg-[#12C76F]/[0.04] blur-[90px]" />
        <div className="absolute right-0 top-[22%] h-[520px] w-[680px] rounded-full bg-slate-100/80 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-[1440px]">
        <div className="grid gap-14 xl:grid-cols-[0.45fr_0.55fr] xl:items-center xl:gap-14">
          <motion.div {...fadeUp} className="max-w-[560px]">
            <h2 className="text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] text-[#07111F] sm:text-[46px] lg:text-[56px] xl:text-[64px]">
              {t("titleLine1")}
              <br />
              <span className="text-[#16C35B]">{t("titleAccent")}</span>
            </h2>
            <p className="mt-7 max-w-[520px] text-[16px] font-normal leading-[1.7] tracking-[-0.01em] text-[#5B6472] sm:text-[18px] lg:text-[21px]">
              {t("subtitle")}
            </p>

            <div className="mt-10 max-w-[430px] space-y-[26px]">
              {demoTimeline.map((step, index) => (
                <DemoTimelineItem key={step.title} step={step} index={index} />
              ))}
            </div>
          </motion.div>

          <div className="relative">
            <svg
              aria-hidden="true"
              viewBox="0 0 250 230"
              className="absolute -left-[160px] top-[42%] hidden h-[230px] w-[250px] text-[#16C35B] xl:block"
            >
              <motion.path
                d="M10 210 C80 210 20 75 116 72 C158 70 177 40 235 35"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="7 9"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                whileInView={{ pathLength: 1, opacity: 0.75 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1.4, ease: "easeOut" as const }}
              />
              <path d="M231 27 L244 35 L231 43" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>

            <motion.div {...fadeUp} className="mx-auto mb-5 max-w-[760px] text-center">
              <h3 className="text-[30px] font-bold leading-tight tracking-[-0.035em] text-[#07111F] sm:text-[40px]">
                {t("dashboardTitleLine1")}
                <br className="sm:hidden" /> {t("dashboardTitleLine2")}
              </h3>
              <p className="mt-2 text-[17px] font-normal leading-7 text-[#697386] sm:text-[18px]">
                {t("dashboardSubtitle")}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 24 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.78, ease: "easeOut" as const }}
              className="mx-auto w-full max-w-[760px]"
            >
              <DashboardPreview />
            </motion.div>
          </div>
        </div>

        <motion.div
          {...fadeUp}
          className="mx-auto mt-12 flex min-h-[130px] w-full max-w-[760px] flex-col gap-5 rounded-[26px] border border-slate-900/[0.06] bg-[#FBFCFC] p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-6 lg:mt-11 lg:flex-row lg:items-center lg:justify-between xl:max-w-[760px]"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <motion.div
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" as const }}
              className="relative flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full bg-white text-[#16C35B] shadow-[0_16px_38px_rgba(15,23,42,0.12)]"
            >
              <PlayCircle className="h-8 w-8 fill-[#16C35B]/10" />
            </motion.div>
            <div>
              <h3 className="text-[24px] font-bold leading-tight tracking-[-0.03em] text-[#07111F] sm:text-[30px]">
                {t("videoTitle")}
              </h3>
              <p className="mt-2 max-w-[520px] text-[15px] leading-7 text-[#5B6472] sm:text-base">
                {t("videoText")}
              </p>
            </div>
          </div>
          <a
            href="#watch-demo"
            className="group inline-flex h-12 w-full items-center justify-center gap-3 rounded-2xl px-5 text-[16px] font-bold text-[#0BAA5D] transition duration-300 hover:bg-[#16C35B] hover:text-white lg:w-auto"
          >
            {t("videoButton")}
            <ArrowRight className="h-5 w-5 transition duration-300 group-hover:translate-x-[5px]" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}

function DemoTimelineItem({
  step,
  index,
}: {
  step: TextCard & { icon: LucideIcon };
  index: number;
}) {
  return (
    <motion.div
      {...fadeUp}
      transition={{ duration: 0.55, delay: index * 0.12 }}
      className="relative flex gap-5"
    >
      <div className="relative shrink-0">
        <div className="flex h-[70px] w-[70px] items-center justify-center rounded-[18px] border border-slate-900/[0.06] bg-white text-[#16C35B] shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <step.icon className="h-8 w-8 stroke-[1.7]" />
        </div>
        {index < demoTimelineIcons.length - 1 && (
          <div className="absolute left-1/2 top-[78px] h-[42px] -translate-x-1/2 border-l border-dashed border-[#16C35B]/20" />
        )}
      </div>
      <div className="min-w-0 pt-2">
        <div className="flex items-center gap-4">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#16C35B] text-[13px] font-bold text-white">
            {index + 1}
          </span>
          <h3 className="text-[18px] font-bold tracking-[-0.02em] text-[#07111F]">{step.title}</h3>
        </div>
        <p className="mt-3 text-[15px] leading-7 tracking-[-0.01em] text-[#5B6472]">{step.text}</p>
      </div>
    </motion.div>
  );
}

// Retained as a reusable landing variant while the production page is consolidated.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DemoDashboardPreview() {
  const menu: Array<[string, LucideIcon, string?]> = [
    ["Dashboard", Route],
    ["Clients", Users],
    ["Dossiers", FileText],
    ["Colis", Package],
    ["Expéditions", Truck],
    ["Tracking", Search],
    ["WhatsApp Inbox", MessageCircle, "12"],
    ["Broadcasts", Megaphone],
    ["Relances", Bell],
    ["Base de connaissances", Inbox],
    ["Tarification", CircleDollarSign],
    ["Services", Warehouse],
    ["Factures", Receipt],
    ["Organisation", Building2],
    ["Paramètres", Settings],
  ];
  const kpis = [
    ["Clients", "1,248", "+14.5%"],
    ["Dossiers", "842", "+12.3%"],
    ["Colis", "2,453", "+18.7%"],
    ["Expéditions", "320", "+9.1%"],
    ["Revenus", "24,850$", "+16.3%"],
  ];
  const shipments = [
    ["EXP-2024-1250", "Chine → Kinshasa", "En transit", "12 Juin 2024", "green"],
    ["EXP-2024-1249", "Dubai → Douala", "Arrivé", "08 Juin 2024", "green"],
    ["EXP-2024-1248", "Turquie → Abidjan", "En préparation", "15 Juin 2024", "amber"],
    ["EXP-2024-1247", "Chine → Yaoundé", "En transit", "10 Juin 2024", "purple"],
    ["EXP-2024-1246", "Inde → Lubumbashi", "Validé", "—", "green"],
  ];

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-900/[0.06] bg-white shadow-[0_45px_120px_rgba(15,23,42,0.10)]">
      <div className="grid min-h-[600px] grid-cols-1 lg:grid-cols-[170px_1fr]">
        <aside className="hidden border-r border-slate-900/[0.06] bg-[#FBFCFC] px-3 py-5 lg:block">
          <div className="mb-5 flex items-center gap-2 px-1">
            <Image src="/slaivio-icon-official.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
            <span className="text-[18px] font-bold tracking-[-0.04em] text-[#07111F]">SLAIVIO</span>
          </div>
          <div className="space-y-1.5">
            {menu.map(([item, Icon, badge], index) => (
              <div
                key={item}
                className={`flex h-8 items-center gap-2 rounded-lg px-2 text-[10.5px] font-semibold ${
                  index === 0 ? "bg-[#16C35B]/10 text-[#0BAA5D]" : "text-[#334155]"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item}</span>
                {badge && <span className="rounded-full bg-[#16C35B] px-1.5 py-0.5 text-[8px] font-bold text-white">{badge}</span>}
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4 border-b border-slate-900/[0.06] pb-4">
            <div className="flex h-9 min-w-0 items-center gap-2 rounded-2xl border border-slate-900/[0.06] bg-[#FBFCFC] px-4 text-[10px] text-[#697386] sm:w-[255px]">
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">Rechercher un client, dossier, colis...</span>
            </div>
            <div className="flex items-center gap-3 text-[#334155]">
              <Bell className="h-4 w-4" />
              <MessageCircle className="h-4 w-4" />
              <UserCircle className="h-5 w-5" />
              <div className="hidden sm:block">
                <p className="text-[10.5px] font-bold text-[#07111F]">OTI Cargo Express</p>
                <p className="text-[9px] text-[#697386]">Kinshasa, RDC</p>
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 sm:block" />
            </div>
          </div>

          <h3 className="mt-5 text-[18px] font-bold tracking-[-0.02em] text-[#07111F]">Tableau de bord</h3>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {kpis.map(([title, value, delta]) => (
              <div key={title} className="rounded-xl border border-slate-900/[0.06] bg-white p-3.5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                <p className="truncate text-[10px] font-medium text-[#5B6472]">{title}</p>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <p className="text-[20px] font-extrabold tracking-[-0.04em] text-[#07111F]">{value}</p>
                  <p className="text-[9.5px] font-bold text-[#16C35B]">{delta}</p>
                </div>
                <p className="mt-2 text-[9px] text-[#697386]">vs mois dernier</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1.25fr_0.9fr]">
            <div className="rounded-xl border border-slate-900/[0.06] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-[12px] font-bold text-[#07111F]">Expéditions en cours</h4>
                <ChevronDown className="-rotate-90 h-4 w-4 text-[#697386]" />
              </div>
              <div className="grid grid-cols-[1.15fr_1fr_0.9fr_1fr] border-y border-slate-900/[0.06] py-2 text-[9.5px] text-[#697386]">
                <span>Expédition</span>
                <span>Route</span>
                <span>Statut</span>
                <span>ETA</span>
              </div>
              <div className="divide-y divide-slate-900/[0.05]">
                {shipments.map(([id, route, status, eta, tone]) => (
                  <div key={id} className="grid grid-cols-[1.15fr_1fr_0.9fr_1fr] items-center py-2 text-[9.5px]">
                    <span className="truncate font-bold text-[#07111F]">{id}</span>
                    <span className="truncate text-[#334155]">{route}</span>
                    <span>
                      <span
                        className={`rounded-full px-2 py-1 font-bold ${
                          tone === "amber"
                            ? "bg-amber-100 text-amber-700"
                            : tone === "purple"
                              ? "bg-violet-100 text-violet-700"
                              : "bg-[#16C35B]/12 text-[#0BAA5D]"
                        }`}
                      >
                        {status}
                      </span>
                    </span>
                    <span className="truncate text-[#334155]">{eta}</span>
                  </div>
                ))}
              </div>
              <a href="#demo" className="mt-4 inline-flex items-center gap-2 text-[11px] font-bold text-[#0BAA5D]">
                Voir toutes les expéditions <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="rounded-xl border border-slate-900/[0.06] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
              <h4 className="text-[12px] font-bold text-[#07111F]">Répartition par service</h4>
              <div className="mt-5 flex items-center gap-4">
                <div className="relative h-[118px] w-[118px] shrink-0 rounded-full bg-[conic-gradient(#60A5FA_0_45%,#16C35B_45%_80%,#F59E0B_80%_95%,#8B5CF6_95%_100%)] p-[15px]">
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center">
                    <span className="text-xl font-extrabold text-[#07111F]">2,453</span>
                    <span className="text-[9px] text-[#697386]">Colis</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-3 text-[10px]">
                  {[
                    ["Air Cargo", "45%", "#60A5FA"],
                    ["Sea Cargo", "35%", "#16C35B"],
                    ["Express", "15%", "#F59E0B"],
                    ["Groupage", "5%", "#8B5CF6"],
                  ].map(([label, value, color]) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="flex-1 truncate text-[#334155]">{label}</span>
                      <span className="text-[#697386]">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ["Messages WhatsApp", "128", "Non lus"],
              ["Derniers colis reçus", "CBJ-987654", "12.5 kg"],
              ["Paiements récents", "PAY-2024-5421", "850$"],
            ].map(([title, value, detail]) => (
              <div key={title} className="rounded-xl border border-slate-900/[0.06] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between">
                  <h4 className="truncate text-[11px] font-bold text-[#07111F]">{title}</h4>
                  <span className="text-[9px] font-semibold text-[#697386]">Voir tous</span>
                </div>
                <p className="mt-4 text-[17px] font-extrabold tracking-[-0.03em] text-[#07111F]">{value}</p>
                <p className="mt-1 text-[10px] text-[#697386]">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function IntegrationsSection() {
  const t = useTranslations("integrations");
  const integrations = (t.raw("items") as IntegrationCopy[]).map((item, index) => ({
    ...item,
    ...integrationIds[index],
  }));

  return (
    <section id="integrations" className="relative overflow-hidden bg-[#EAF1EC] px-5 py-20 text-[#07111F] sm:px-8 lg:px-10 xl:py-[120px]">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.20]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(18,199,111,.20) 1px, transparent 1.3px), radial-gradient(circle, rgba(7,17,31,.07) 1px, transparent 1.2px)",
            backgroundPosition: "0 0, 18px 18px",
            backgroundSize: "36px 36px",
            maskImage: "radial-gradient(circle at 50% 52%, black, transparent 72%)",
          }}
        />
        <div className="absolute left-0 top-0 h-[520px] w-[620px] rounded-full bg-[#12C76F]/[0.035] blur-[100px]" />
        <div className="absolute right-0 bottom-0 h-[520px] w-[700px] rounded-full bg-slate-100/80 blur-[110px]" />
        <div
          className="absolute right-10 top-32 hidden h-[280px] w-[440px] opacity-[0.08] lg:block"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(18,199,111,.7) 1px, transparent 1.2px)",
            backgroundSize: "16px 16px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[1440px]">
        <motion.div {...fadeUp} className="mx-auto max-w-[880px] text-center">
          <h2 className="text-[34px] font-normal leading-[1.08] tracking-[-0.035em] text-[#07111F] sm:text-[46px] lg:text-[56px] xl:text-[64px]">
            {t("titleLine1")}
            <br />
            {t("titleLine2")} <span className="text-[#12C76F]">{t("titleAccent")}</span>
          </h2>
          <p className="mx-auto mt-6 max-w-[760px] text-[16px] leading-[1.75] tracking-[-0.01em] text-[#475569] sm:text-[18px] lg:text-[20px]">
            {t("subtitle")}
          </p>
        </motion.div>

        <div className="relative mx-auto mt-16 hidden h-[820px] max-w-[1160px] lg:block">
          <svg aria-hidden="true" viewBox="0 0 1160 820" className="absolute inset-0 h-full w-full">
            <motion.path
              d="M348 176 C420 152 455 176 505 226"
              fill="none"
              stroke="#12C76F"
              strokeDasharray="6 6"
              strokeLinecap="round"
              strokeWidth="2"
              opacity="0.75"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1.2, ease: "easeOut" as const }}
            />
            <motion.path
              d="M812 176 C740 152 705 176 655 226"
              fill="none"
              stroke="#12C76F"
              strokeDasharray="6 6"
              strokeLinecap="round"
              strokeWidth="2"
              opacity="0.75"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1.2, delay: 0.1, ease: "easeOut" as const }}
            />
            <motion.path
              d="M580 692 C580 560 580 432 580 340"
              fill="none"
              stroke="#12C76F"
              strokeDasharray="6 6"
              strokeLinecap="round"
              strokeWidth="2"
              opacity="0.75"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1.2, delay: 0.2, ease: "easeOut" as const }}
            />
          </svg>

          <IntegrationCard integration={integrations[0]} className="left-0 top-[88px]" delay={0} />
          <IntegrationCard integration={integrations[1]} className="right-0 top-[88px]" delay={0.08} />
          <IntegrationCard integration={integrations[2]} className="bottom-0 left-1/2 -translate-x-1/2" delay={0.16} />

          <div className="absolute left-1/2 top-[42px] h-[438px] w-[438px] -translate-x-1/2 rounded-full">
            <motion.div
              aria-hidden="true"
              animate={{ rotate: 360 }}
              transition={{ duration: 44, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full border border-dashed border-[#12C76F]/35"
            />
            <div className="absolute inset-10 rounded-full bg-[#12C76F]/[0.055]" />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0"
            >
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
                className="absolute left-[58px] top-[46px]"
              >
                <IntegrationBubble id="whatsapp" />
              </motion.div>
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
                className="absolute right-[58px] top-[46px]"
              >
                <IntegrationBubble id="gmail" />
              </motion.div>
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
                className="absolute bottom-[-8px] left-1/2 -translate-x-1/2"
              >
                <IntegrationBubble id="tiktok" />
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, ease: "easeOut" as const }}
              className="absolute left-1/2 top-1/2 flex h-[172px] w-[172px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#12C76F]/16 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.10)]"
            >
              <div className="absolute inset-[-18px] rounded-full bg-[#12C76F]/[0.055]" />
              <Image
                src="/slaivio-icon-official.png"
                alt="SLAIVIO"
                width={92}
                height={92}
                className="relative h-[92px] w-[92px] object-contain"
              />
            </motion.div>
          </div>
        </div>

        <div className="mt-12 grid gap-4 lg:hidden">
          {integrations.map((integration, index) => (
            <IntegrationMobileCard key={integration.id} integration={integration} delay={index * 0.08} />
          ))}
        </div>

      </div>
    </section>
  );
}

function CoreFeaturesSection() {
  const t = useTranslations("features");
  const [activeFeature, setActiveFeature] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const coreFeatures = (t.raw("items") as TextCard[]).map((feature, index) => ({
    ...feature,
    ...coreFeatureMeta[index],
  }));
  const activeCoreFeature = coreFeatures[activeFeature];

  useEffect(() => {
    if (isPaused) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveFeature((index) => (index + 1) % coreFeatures.length);
    }, 6000);

    return () => window.clearInterval(interval);
  }, [isPaused, coreFeatures.length]);

  const goToFeature = (direction: "previous" | "next") => {
    setActiveFeature((index) => {
      if (direction === "previous") {
        return index === 0 ? coreFeatures.length - 1 : index - 1;
      }

      return (index + 1) % coreFeatures.length;
    });
  };

  return (
    <section
      id="features"
      className="relative overflow-hidden bg-[#F0F5F1] px-5 py-[86px] text-[#07111F] sm:px-8 lg:px-10 xl:py-[132px]"
      style={{ fontFeatureSettings: '"cv02" 1, "cv03" 1, "liga" 1, "kern" 1' }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#F8FAF6_0%,#F0F5F1_48%,#E8F0EA_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(18,199,111,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.045) 1px, transparent 1px)",
            backgroundSize: "58px 58px",
            maskImage: "radial-gradient(circle at 50% 42%, black, transparent 76%)",
          }}
        />
        <div className="absolute left-1/2 top-24 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-[#12C76F]/[0.045] blur-[100px]" />
      </div>
      <div className="relative mx-auto max-w-[1440px]">
        <motion.div {...fadeUp} className="mx-auto max-w-[1320px] text-center">
          <h2 className="mx-auto max-w-[1040px] text-[34px] font-extrabold leading-[1.08] tracking-[-0.035em] text-[#07111F] sm:text-[46px] lg:text-[58px] xl:text-[64px]">
            {t("titleLine1")}
            <br />
            <span className="text-[#12C76F]">{t("titleAccent")}</span>
          </h2>
          <p className="mx-auto mt-6 max-w-[780px] text-[16px] font-normal leading-[1.7] text-[#667085] sm:text-[19px] lg:text-[21px]">
            {t("subtitle")}
          </p>
        </motion.div>

        <div
          className="relative mx-auto mt-14 max-w-[1180px]"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <button
            type="button"
            aria-label="Fonctionnalité précédente"
            onClick={() => goToFeature("previous")}
            className="absolute left-[-30px] top-1/2 z-20 hidden h-[58px] w-[58px] -translate-y-1/2 items-center justify-center rounded-full border border-black/[0.06] bg-white text-[#12C76F] shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition duration-300 hover:bg-[#12C76F] hover:text-white xl:flex"
          >
            <ChevronLeft className="h-6 w-6 stroke-[1.8]" />
          </button>
          <button
            type="button"
            aria-label="Fonctionnalité suivante"
            onClick={() => goToFeature("next")}
            className="absolute right-[-30px] top-1/2 z-20 hidden h-[58px] w-[58px] -translate-y-1/2 items-center justify-center rounded-full border border-black/[0.06] bg-white text-[#12C76F] shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition duration-300 hover:bg-[#12C76F] hover:text-white xl:flex"
          >
            <ChevronRight className="h-6 w-6 stroke-[1.8]" />
          </button>

          <div className="min-h-[700px] sm:min-h-[620px]">
            <AnimatePresence mode="wait">
              <motion.article
                key={activeCoreFeature.title}
                initial={{ opacity: 0, x: 42, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -42, scale: 0.98 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="grid overflow-hidden rounded-[32px] border border-slate-900/[0.06] bg-white shadow-[0_28px_90px_rgba(15,23,42,0.11)] lg:min-h-[600px] lg:grid-cols-[1.2fr_0.8fr]"
              >
                <div className="min-h-[430px] border-b border-slate-900/[0.05] bg-[#F4F7F5] p-3 lg:border-b-0 lg:border-r lg:p-4">
                  <FeatureImage feature={activeCoreFeature} />
                </div>
                <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-12">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ECFDF3] text-[#12C76F]">
                    <activeCoreFeature.icon className="h-7 w-7 stroke-[1.8]" />
                  </div>
                  <p className="mt-8 text-sm font-bold uppercase tracking-[0.14em] text-[#12C76F]">
                    {t("label")} {String(activeFeature + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-3 text-[30px] font-bold leading-tight tracking-[-0.035em] text-[#07111F] sm:text-[38px]">
                    {activeCoreFeature.title}
                  </h3>
                  <p className="mt-5 text-[16px] leading-8 text-[#475569] sm:text-[19px] sm:leading-9">
                    {activeCoreFeature.text}
                  </p>
                </div>
              </motion.article>
            </AnimatePresence>
          </div>

          <div className="mt-6 flex items-center justify-center gap-4 xl:hidden">
            <button
              type="button"
              aria-label="Fonctionnalité précédente"
              onClick={() => goToFeature("previous")}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-black/[0.06] bg-white text-[#12C76F] shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition hover:bg-[#12C76F] hover:text-white"
            >
              <ChevronLeft className="h-5 w-5 stroke-[1.8]" />
            </button>
            <button
              type="button"
              aria-label="Fonctionnalité suivante"
              onClick={() => goToFeature("next")}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-black/[0.06] bg-white text-[#12C76F] shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition hover:bg-[#12C76F] hover:text-white"
            >
              <ChevronRight className="h-5 w-5 stroke-[1.8]" />
            </button>
          </div>

          <div className="mt-6 flex justify-center gap-4">
            {coreFeatures.map((feature, index) => (
              <button
                key={feature.title}
                type="button"
                aria-label={`Afficher ${feature.title}`}
                onClick={() => setActiveFeature(index)}
                className={`h-2 w-2 rounded-full transition ${
                  index === activeFeature ? "bg-[#12C76F]" : "bg-[#D9DDE5] hover:bg-[#AAB2C0]"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureImage({
  feature,
}: {
  feature: TextCard & (typeof coreFeatureMeta)[number];
}) {
  return (
    <div className="relative h-full min-h-[430px] overflow-hidden rounded-[24px] border border-slate-900/[0.07] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <FeatureScreen type={feature.screen} />
    </div>
  );
}

function FeatureScreen({ type }: { type: (typeof coreFeatureMeta)[number]["screen"] }) {
  if (type === "clients") {
    return (
      <div className="h-full rounded-[18px] bg-white p-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]">
        <ScreenHeader title="Clients" action="Nouveau client" />
        <div className="mt-4 flex h-8 items-center gap-2 rounded-lg bg-[#F5F7FA] px-3 text-[9px] font-medium text-[#697386]">
          <Search className="h-3 w-3" />
          Rechercher un client...
        </div>
        <div className="mt-4 space-y-3">
          {["Jean Kabasele", "Marie Tshibola", "David Mwamba", "Grace Mukendi"].map((name, index) => (
            <div key={name} className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#FECACA] via-[#FED7AA] to-[#111827]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-bold text-[#07111F]">{name}</p>
                <p className="text-[8px] text-[#697386]">+243 89 {index + 1}23 4567</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-[#F8FAFC] p-3">
          {["Total dossiers", "Total colis", "Total dépensé"].map((label, index) => (
            <div key={label} className="flex items-center justify-between py-1 text-[9px]">
              <span className="text-[#697386]">{label}</span>
              <span className="font-bold text-[#07111F]">{["12", "24", "$4,560"][index]}</span>
            </div>
          ))}
          <div className="mt-3 rounded-lg border border-slate-900/[0.06] bg-white py-2 text-center text-[9px] font-bold text-[#07111F]">
            Voir le profil
          </div>
        </div>
      </div>
    );
  }

  if (type === "dossiers") {
    return (
      <div className="h-full rounded-[18px] bg-white p-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]">
        <ScreenHeader title="Dossiers" />
        <div className="mt-5 flex justify-between text-[8px] font-bold text-[#07111F]">
          {["Tous", "En cours", "Terminés", "Archivés"].map((tab, index) => (
            <span key={tab} className={index === 0 ? "border-b-2 border-[#12C76F] pb-2" : "pb-2"}>
              {tab}
            </span>
          ))}
        </div>
        <div className="mt-4 space-y-4">
          {["DOS-2024-1250", "DOS-2024-1249", "DOS-2024-1248", "DOS-2024-1247"].map((id, index) => (
            <div key={id} className="flex items-center gap-3">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${["bg-orange-100", "bg-orange-100", "bg-violet-100", "bg-sky-100"][index]}`}>
                <Package className={`h-4 w-4 ${["text-orange-500", "text-orange-500", "text-violet-500", "text-sky-500"][index]}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-[#07111F]">{id}</p>
                <p className="text-[8px] text-[#697386]">{["Jean Kabasele", "Grace Mukendi", "David Mwamba", "Marie Tshibola"][index]}</p>
              </div>
              <span className={`rounded-md px-2 py-1 text-[8px] font-bold ${["bg-[#D1FADF] text-[#0BAA5D]", "bg-sky-100 text-sky-600", "bg-violet-100 text-violet-600", "bg-orange-100 text-orange-600"][index]}`}>
                {["En cours", "Nouveau", "En transit", "En attente"][index]}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "colis") {
    return (
      <div className="h-full rounded-[18px] bg-white p-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]">
        <ScreenHeader title="Colis" action="Nouveau colis" />
        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-orange-100">
            <Package className="h-9 w-9 text-orange-500" />
          </div>
          <div>
            <p className="text-[13px] font-extrabold text-[#07111F]">COL-2024-1246</p>
            <p className="mt-1 text-[9px] text-[#697386]">Enregistré le 12 Juin 2024</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#F8FAFC] p-3">
          {[
            ["Poids", "12.5 kg"],
            ["Dimensions", "50x40x30 cm"],
            ["Catégorie", "Électronique"],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[8px] text-[#697386]">{label}</p>
              <p className="mt-1 text-[9px] font-bold text-[#07111F]">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl bg-[#F8FAFC] p-3">
          {[
            ["Entrepôt", "Yiwu, Chine"],
            ["Expédition", "EXP-2024-1250"],
            ["Statut", "En préparation"],
          ].map(([label, value], index) => (
            <div key={label}>
              <p className="text-[8px] text-[#697386]">{label}</p>
              <p className={`mt-1 text-[9px] font-bold ${index === 2 ? "rounded-md bg-orange-100 px-1 py-0.5 text-orange-600" : "text-[#07111F]"}`}>
                {value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-10 rounded-lg bg-gradient-to-br from-orange-200 via-orange-100 to-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  if (type === "tracking") {
    return (
      <div className="h-full rounded-[18px] bg-white p-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]">
        <ScreenHeader title="Tracking" />
        <div className="mt-5 space-y-4">
          {[
            ["Reçu à l'entrepôt", "Yiwu, Chine", "12 Juin 2024", true],
            ["Validé", "Yiwu, Chine", "12 Juin 2024", true],
            ["En transit", "Guangzhou, Chine", "14 Juin 2024", true],
            ["Arrivé à destination", "Kinshasa, RDC", "22 Juin 2024", true],
            ["Livré au client", "", "ETA", false],
          ].map(([title, place, date, done], index) => (
            <div key={String(title)} className="relative flex gap-3">
              {index < 4 && <span className="absolute left-[9px] top-5 h-8 border-l border-dashed border-[#12C76F]/60" />}
              <span className={`relative z-10 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${done ? "bg-[#12C76F] text-white" : "bg-[#EEF2F6] text-[#98A2B3]"}`}>
                <Check className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-bold text-[#07111F]">{title}</p>
                  <p className="text-right text-[8px] text-[#344054]">{date}</p>
                </div>
                {place && <p className="mt-1 text-[8px] text-[#697386]">{place}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type !== "whatsapp") {
    return <GenericFeatureScreen type={type} />;
  }

  return (
    <div className="h-full rounded-[18px] bg-white p-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-extrabold text-[#07111F]">WhatsApp Inbox</p>
        <MessageCircle className="h-8 w-8 text-[#12C76F]" />
      </div>
      <div className="mt-4 flex h-8 items-center gap-2 rounded-lg bg-[#F5F7FA] px-3 text-[9px] font-medium text-[#697386]">
        <Search className="h-3 w-3" />
        Rechercher...
      </div>
      <div className="mt-4 flex gap-5 text-[8px] font-bold text-[#07111F]">
        {["Toutes", "Non lues", "En attente"].map((tab, index) => (
          <span key={tab} className={index === 0 ? "border-b-2 border-[#12C76F] pb-2" : "pb-2"}>
            {tab}
          </span>
        ))}
      </div>
      <div className="mt-4 space-y-4">
        {[
          ["Jean Kabasele", "Bonjour, ou en est mon colis ?", "10:30", "2"],
          ["Grace Mukendi", "Merci pour les informations", "09:15", ""],
          ["+237 6 98 76 54 32", "Bonjour, j'aimerais un devis", "Hier", ""],
          ["David Mwamba", "Mon colis est-il déjà arrivé ?", "Hier", ""],
        ].map(([name, message, time, badge]) => (
          <div key={name} className="flex items-start gap-3">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#FECACA] via-[#FED7AA] to-[#111827]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[10px] font-bold text-[#07111F]">{name}</p>
                <p className="text-[8px] text-[#344054]">{time}</p>
              </div>
              <p className="mt-1 truncate text-[8px] text-[#697386]">{message}</p>
            </div>
            {badge && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#12C76F] text-[8px] font-bold text-white">{badge}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function GenericFeatureScreen({
  type,
}: {
  type: Exclude<(typeof coreFeatureMeta)[number]["screen"], "clients" | "dossiers" | "colis" | "tracking" | "whatsapp">;
}) {
  const content = {
    warehouse: {
      title: "Entrepôts & Bureaux",
      icon: Warehouse,
      stats: ["3 pays", "12 bureaux", "8 entrepôts"],
      rows: ["Kinshasa HQ", "Yiwu Warehouse", "Douala Office", "Abidjan Hub"],
    },
    routes: {
      title: "Routes & Services",
      icon: Route,
      stats: ["Air Cargo", "Sea Cargo", "Express"],
      rows: ["Chine → Kinshasa", "Dubaï → Douala", "Turquie → Abidjan", "Inde → Lubumbashi"],
    },
    pricing: {
      title: "Tarification avancée",
      icon: CircleDollarSign,
      stats: ["Poids", "CBM", "Catégorie"],
      rows: ["Air Cargo: 12.50$/kg", "Sea Cargo: 480$/CBM", "Express: 18.00$/kg", "Groupage: tarif mixte"],
    },
    payments: {
      title: "Paiements & Facturation",
      icon: CreditCard,
      stats: ["$24,850", "18 factures", "7 relances"],
      rows: ["PAY-2024-5421 payé", "PAY-2024-5420 partiel", "INV-2024-1189 envoyé", "Relance Grace Mukendi"],
    },
    reports: {
      title: "Rapports & Analyses",
      icon: BarChart3,
      stats: ["+16.3%", "2,453 colis", "320 expéditions"],
      rows: ["Route la plus rentable", "Volume par service", "Retards par destination", "Performance bureaux"],
    },
    security: {
      title: "Sécurité & Permissions",
      icon: ShieldCheck,
      stats: ["Admin", "Manager", "Agent"],
      rows: ["Accès finances limité", "Dossiers par bureau", "Journal d'activité", "Permissions par rôle"],
    },
  }[type];
  const Icon = content.icon;

  return (
    <div className="h-full rounded-[20px] bg-white p-4 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ECFDF3] text-[#12C76F]">
            <Icon className="h-6 w-6 stroke-[1.8]" />
          </div>
          <div>
            <p className="text-[15px] font-extrabold tracking-[-0.03em] text-[#07111F]">{content.title}</p>
            <p className="mt-1 text-[10px] text-[#697386]">Vue opérationnelle</p>
          </div>
        </div>
        <span className="rounded-full bg-[#12C76F]/10 px-3 py-1.5 text-[10px] font-bold text-[#12C76F]">
          Actif
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {content.stats.map((stat) => (
          <div key={stat} className="rounded-2xl border border-slate-900/[0.06] bg-[#F8FAFC] p-3">
            <p className="text-[9px] text-[#697386]">Indicateur</p>
            <p className="mt-2 truncate text-[13px] font-extrabold text-[#07111F]">{stat}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-900/[0.06] bg-[#FBFCFC] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-3 w-36 rounded-full bg-slate-200" />
          <div className="h-7 w-20 rounded-full bg-[#12C76F]/12" />
        </div>
        <div className="space-y-3">
          {content.rows.map((row, index) => (
            <div key={row} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,0.035)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ECFDF3] text-[10px] font-bold text-[#12C76F]">
                {index + 1}
              </span>
              <span className="truncate text-[11px] font-bold text-[#07111F]">{row}</span>
              <Check className="h-4 w-4 text-[#12C76F]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScreenHeader({ title, action }: { title: string; action?: string }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[13px] font-extrabold text-[#07111F]">{title}</p>
      {action && (
        <span className="rounded-md bg-[#12C76F] px-2.5 py-1.5 text-[8px] font-bold text-white">
          + {action}
        </span>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AudioWave() {
  return (
    <div className="flex h-8 items-center gap-1" aria-hidden="true">
      {[12, 22, 15, 28].map((height, index) => (
        <motion.span
          key={`${height}-${index}`}
          animate={{ height: [height * 0.45, height, height * 0.55] }}
          transition={{ duration: 1.1, delay: index * 0.12, repeat: Infinity, ease: "easeInOut" as const }}
          className="w-0.5 rounded-full bg-[#12C76F]"
          style={{ height }}
        />
      ))}
    </div>
  );
}

function IntegrationCard({
  integration,
  className,
  delay,
}: {
  integration: IntegrationCopy & (typeof integrationIds)[number];
  className: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: "easeOut" as const }}
      whileHover={{ y: -4, boxShadow: "0 24px 64px rgba(15,23,42,0.12)" }}
      className={`absolute w-[260px] rounded-[18px] border border-slate-900/[0.08] bg-white p-7 shadow-[0_20px_50px_rgba(15,23,42,0.08)] ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-semibold text-[#12C76F]">{integration.eyebrow}</p>
          <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-[#07111F]">{integration.title}</h3>
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#12C76F] text-white">
          <Check className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-4 text-[14px] leading-7 text-[#475569]">{integration.text}</p>
    </motion.div>
  );
}

function IntegrationMobileCard({
  integration,
  delay,
}: {
  integration: IntegrationCopy & (typeof integrationIds)[number];
  delay: number;
}) {
  return (
    <motion.div
      {...fadeUp}
      transition={{ duration: 0.55, delay }}
      className="rounded-[22px] border border-slate-900/[0.08] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.07)]"
    >
      <div className="flex items-start gap-4">
        <IntegrationBubble id={integration.id} compact />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-[#12C76F]">{integration.eyebrow}</p>
              <h3 className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-[#07111F]">{integration.title}</h3>
            </div>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#12C76F] text-white">
              <Check className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-[14px] leading-7 text-[#475569]">{integration.text}</p>
        </div>
      </div>
    </motion.div>
  );
}

function IntegrationBubble({
  id,
  compact = false,
}: {
  id: (typeof integrationIds)[number]["id"];
  compact?: boolean;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full border border-slate-900/[0.06] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.10)] ${
        compact ? "h-14 w-14" : "h-[88px] w-[88px]"
      }`}
      aria-label={id}
    >
      {id === "whatsapp" && (
        <svg viewBox="0 0 64 64" className={compact ? "h-10 w-10" : "h-14 w-14"} aria-hidden="true">
          <circle cx="32" cy="32" r="30" fill="#25D366" />
          <path
            d="M20.4 45.5l1.8-6.7A13.9 13.9 0 1134.1 46c-2.3 0-4.5-.6-6.5-1.6l-7.2 1.1z"
            fill="#fff"
          />
          <path
            d="M28.2 23.9c-.3-.8-.7-.8-1.1-.8h-.9c-.3 0-.8.1-1.2.6-.4.5-1.6 1.6-1.6 3.8s1.7 4.4 1.9 4.7c.2.3 3.2 5.1 8 6.9 4 1.6 4.8 1.3 5.7 1.2.9-.1 2.8-1.1 3.2-2.3.4-1.1.4-2.1.3-2.3-.1-.2-.4-.3-.9-.6l-3.1-1.5c-.5-.2-.8-.3-1.1.3-.3.5-1.2 1.5-1.5 1.8-.3.3-.6.3-1.1.1-.5-.2-2.1-.8-4-2.5-1.5-1.3-2.5-3-2.8-3.5-.3-.5 0-.8.2-1 .2-.2.5-.6.8-.9.3-.3.4-.5.6-.9.2-.3.1-.7 0-1-.1-.2-1.1-2.8-1.4-3.7z"
            fill="#25D366"
          />
        </svg>
      )}
      {id === "gmail" && (
        <svg viewBox="0 0 64 64" className={compact ? "h-10 w-10" : "h-14 w-14"} aria-hidden="true">
          <rect x="8" y="14" width="48" height="36" rx="6" fill="#fff" />
          <path d="M14 18l18 15 18-15v8L32 41 14 26z" fill="#EA4335" />
          <path d="M14 26v20H8V20z" fill="#C5221F" />
          <path d="M50 26v20h6V20z" fill="#34A853" />
          <path d="M14 18l18 15 18-15h-8L32 26 22 18z" fill="#FBBC04" />
          <path d="M8 20l6 6v20H8z" fill="#4285F4" />
        </svg>
      )}
      {id === "tiktok" && (
        <svg viewBox="0 0 64 64" className={compact ? "h-10 w-10" : "h-14 w-14"} aria-hidden="true">
          <circle cx="32" cy="32" r="30" fill="#050505" />
          <path d="M36 17c1 6 4.5 9.5 10 10v7c-3.8 0-7.1-1.1-10-3.3v12.1c0 7.1-5.4 12.2-12.2 12.2-6.4 0-11.8-4.9-11.8-11.5 0-7.2 6.1-12.2 13.5-11.2v7.1c-3.1-1-6.2.8-6.2 4.1 0 2.7 2.1 4.4 4.6 4.4 2.7 0 4.7-1.9 4.7-5V17z" fill="#25F4EE" />
          <path d="M39 17c1 6 4.5 9.5 10 10v7c-3.8 0-7.1-1.1-10-3.3v12.1c0 7.1-5.4 12.2-12.2 12.2-4.7 0-8.9-2.7-10.7-6.7 2.1 1.7 4.7 2.7 7.7 2.7 6.8 0 12.2-5.1 12.2-12.2V26.7c2.9 2.2 6.2 3.3 10 3.3v-3c-3.9-.9-6.6-3.2-8-7z" fill="#FE2C55" opacity=".9" />
          <path d="M36 17c1 6 4.5 9.5 10 10v4c-3.8 0-7.1-1.1-10-3.3v12.1c0 7.1-5.4 12.2-12.2 12.2-6.4 0-11.8-4.9-11.8-11.5 0-7.2 6.1-12.2 13.5-11.2v4.1c-3.1-1-6.2.8-6.2 4.1 0 2.7 2.1 4.4 4.6 4.4 2.7 0 4.7-1.9 4.7-5V17z" fill="#fff" />
        </svg>
      )}
    </div>
  );
}

function PricingSection() {
  const t = useTranslations("pricing");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const pricingPlans = (t.raw("plans") as PricingPlanCopy[]).map((plan, index) => ({
    ...plan,
    ...pricingPlanMeta[index],
  }));

  return (
    <section
      id="pricing"
      className="relative overflow-hidden bg-[#05080D] px-5 py-20 text-white sm:px-8 lg:px-10 xl:py-[140px]"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_center,rgba(18,199,111,.08),transparent_45%)]" />
        <div className="absolute left-[-12%] top-[22%] h-[520px] w-[520px] rounded-full bg-[#12C76F]/[0.045] blur-[115px]" />
        <div className="absolute bottom-[-18%] right-[-8%] h-[620px] w-[620px] rounded-full bg-emerald-900/[0.18] blur-[130px]" />
      </div>

      <div className="relative mx-auto max-w-[1440px]">
        <motion.div {...fadeUp} className="mx-auto max-w-[980px] text-center">
          <h2 className="mx-auto max-w-[1040px] text-[34px] font-extrabold leading-[1.08] tracking-[-0.035em] text-white sm:text-[46px] lg:text-[58px] xl:text-[68px]">
            {t("titleLine1")}
            <br />
            {t("titleLine2")} <span className="text-[#12C76F]">{t("titleAccent")}</span>
          </h2>
          <p className="mx-auto mt-6 max-w-[760px] text-[16px] leading-[1.7] text-white/70 sm:text-[19px] lg:text-[22px]">
            {t("subtitle")}
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <div className="relative inline-flex rounded-full border border-white/[0.08] bg-white/[0.06] p-1">
              {(["monthly", "annual"] as const).map((cycle) => (
                <button
                  key={cycle}
                  type="button"
                  onClick={() => setBillingCycle(cycle)}
                  className={`relative z-10 h-11 rounded-full px-6 text-sm font-bold transition duration-250 ${
                    billingCycle === cycle ? "bg-[#12C76F] text-white" : "text-white/62 hover:text-white"
                  }`}
                >
                  {cycle === "monthly" ? t("monthly") : t("annual")}
                </button>
              ))}
            </div>
            <span className="rounded-full border border-[#12C76F]/15 bg-[#12C76F]/10 px-4 py-2 text-sm font-bold text-[#12C76F]">
              {t("save")}
            </span>
          </div>
        </motion.div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2 2xl:grid-cols-4">
          {pricingPlans.map((plan, index) => (
            <PricingCard key={`${plan.name}-${index}`} plan={plan} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingCard({
  plan,
  index,
}: {
  plan: PricingPlanCopy & (typeof pricingPlanMeta)[number];
  index: number;
}) {
  const t = useTranslations("pricing");
  const isPurple = plan.accent === "purple";
  const accentColor = isPurple ? "#A855F7" : "#12C76F";
  const Icon = plan.icon;

  return (
    <motion.article
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.58, delay: index * 0.12, ease: "easeOut" as const }}
      whileHover={{ y: -8 }}
      className={`relative flex min-h-[660px] flex-col rounded-[24px] border bg-[#0D1219] p-6 shadow-[0_25px_70px_rgba(0,0,0,.45)] transition duration-300 ${
        plan.popular
          ? "border-[#12C76F]/70 shadow-[0_25px_90px_rgba(18,199,111,.16)]"
          : isPurple
            ? "border-white/[0.08] hover:border-[#A855F7]/70"
            : "border-white/[0.08] hover:border-[#12C76F]/70"
      }`}
    >
      {plan.popular && (
        <span className="absolute right-5 top-5 rounded-full bg-[#12C76F] px-3 py-1.5 text-xs font-extrabold text-white">
          {t("popular")}
        </span>
      )}

      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: isPurple ? "rgba(168,85,247,.12)" : "rgba(18,199,111,.10)", color: accentColor }}
      >
        <Icon className="h-7 w-7 stroke-[1.8]" />
      </div>

      <h3 className="mt-6 text-[28px] font-extrabold tracking-[-0.04em] text-white">{plan.name}</h3>
      <p className="mt-3 min-h-[52px] text-[15px] leading-7 text-white/58">{plan.description}</p>

      <div className="mt-6 flex items-end gap-2">
        <span className={`text-[46px] font-extrabold leading-none tracking-[-0.05em] text-white ${index === 3 ? "text-[38px]" : "sm:text-[58px]"}`}>
          {plan.price}
        </span>
        {index !== 3 && <span className="pb-2 text-[17px] font-semibold text-white/52">{t("perMonth")}</span>}
      </div>
      <div className="mt-3 flex min-h-[26px] items-center gap-2">
        {plan.annualText && <p className="text-sm text-white/42">{plan.annualText}</p>}
        {plan.discount && <span className="rounded-full bg-[#12C76F]/14 px-2 py-1 text-xs font-extrabold text-[#12C76F]">{plan.discount}</span>}
      </div>

      <div
        className="mt-6 rounded-[18px] border p-4"
        style={{
          borderColor: isPurple ? "rgba(168,85,247,.18)" : "rgba(18,199,111,.18)",
          backgroundColor: isPurple ? "rgba(168,85,247,.10)" : "rgba(18,199,111,.10)",
        }}
      >
        {plan.highlights.map((item) => (
          <div key={item} className="flex items-center gap-3 py-1.5 text-[15px] font-bold text-white">
            <Check className="h-4 w-4 shrink-0" style={{ color: accentColor }} />
            {item}
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {plan.features.map((feature) => (
          <div key={feature} className="flex items-start gap-3 text-[15px] leading-6 text-white/86 xl:text-[17px]">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#12C76F]" />
            <span>{feature}</span>
          </div>
        ))}
      </div>

      <a
        href="#demo"
        className={`mt-auto inline-flex h-[52px] items-center justify-center rounded-2xl px-5 text-[15px] font-extrabold transition duration-300 hover:scale-[1.03] ${
          plan.popular
            ? "bg-[#12C76F] text-white shadow-[0_0_34px_rgba(18,199,111,.24)] hover:bg-[#18d87b]"
            : isPurple
              ? "border border-[#A855F7]/50 text-[#C084FC] hover:bg-[#A855F7] hover:text-white"
              : "border border-[#12C76F]/50 text-[#12C76F] hover:bg-[#12C76F] hover:text-white"
        }`}
      >
        {plan.cta}
      </a>
    </motion.article>
  );
}

function DemoRequestModal({
  open,
  formStatus,
  onClose,
  onSubmit,
}: {
  open: boolean;
  formStatus: "idle" | "loading" | "success" | "error";
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const t = useTranslations("forms");
  const benefits = t.raw("benefits") as string[];

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#020807]/75 px-4 py-6 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-modal-title"
            initial={{ opacity: 0, y: 26, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(event) => event.stopPropagation()}
            className="relative max-h-[92vh] w-full max-w-[860px] overflow-y-auto rounded-[32px] border border-white/[0.10] bg-[#07110D] p-5 text-white shadow-[0_40px_140px_rgba(0,0,0,.55)] sm:p-7"
          >
            <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-[radial-gradient(circle_at_top_left,rgba(18,199,111,.18),transparent_42%)]" />
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 transition hover:bg-white/[0.12] hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative grid gap-7 lg:grid-cols-[0.78fr_1.22fr]">
              <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.045] p-6">
                <Image
                  src="/slaivio-logo-official-dark.png"
                  alt="Slaivio"
                  width={170}
                  height={64}
                  className="h-auto w-[156px] object-contain"
                />
                <h2 id="demo-modal-title" className="mt-8 text-[32px] font-extrabold leading-tight tracking-[-0.04em]">
                  {t("demoTitle")}
                </h2>
                <p className="mt-4 text-[16px] leading-7 text-white/62">
                  {t("demoDescription")}
                </p>
                <div className="mt-7 space-y-3 text-sm text-white/70">
                  {benefits.map((item) => (
                    <div key={item} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#12C76F]/14 text-[#12C76F]">
                        <Check className="h-4 w-4" />
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {formStatus === "success" ? (
                <div className="flex min-h-[460px] flex-col items-center justify-center rounded-[26px] border border-[#12C76F]/18 bg-[#12C76F]/[0.07] p-7 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#12C76F] text-white shadow-[0_0_40px_rgba(18,199,111,.25)]">
                    <CheckCircle2 className="h-9 w-9" />
                  </div>
                  <h3 className="mt-6 text-[30px] font-extrabold tracking-[-0.04em]">{t("successTitle")}</h3>
                  <p className="mt-4 max-w-[460px] text-[16px] leading-7 text-white/66">{t("successText")}</p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-8 inline-flex h-12 items-center justify-center rounded-2xl bg-[#12C76F] px-6 text-sm font-extrabold text-white transition hover:bg-[#18d87b]"
                  >
                    {t("close")}
                  </button>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="rounded-[26px] border border-white/[0.08] bg-white/[0.045] p-5 sm:p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {formFields.map((field) => (
                      <label key={field.name} className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">
                          {t(field.labelKey)}
                        </span>
                        <input
                          name={field.name}
                          required={field.name === "full_name" || field.name === "email"}
                          type={field.name === "email" ? "email" : "text"}
                          placeholder={t(field.placeholderKey)}
                          className="mt-2 h-[52px] w-full rounded-2xl border border-white/10 bg-white/[0.055] px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#12C76F]/70"
                        />
                      </label>
                    ))}
                  </div>

                  <label className="mt-4 block">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">
                      {t("message")}
                    </span>
                    <textarea
                      name="message"
                      rows={5}
                      placeholder={t("messagePlaceholder")}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#12C76F]/70"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={formStatus === "loading"}
                    className="mt-5 inline-flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[#12C76F] px-6 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#18d87b] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {formStatus === "loading" ? t("sending") : t("send")}
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  {formStatus === "error" && (
                    <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
                      {t("error")}
                    </p>
                  )}
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FaqSection({
  openFaq,
  setOpenFaq,
}: {
  openFaq: number;
  setOpenFaq: (index: number) => void;
}) {
  const t = useTranslations("faq");
  const faqItems = t.raw("items") as Array<{ question: string; answer: string }>;

  const handleFaqKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    const nextIndex =
      event.key === "ArrowDown"
        ? (index + 1) % faqItems.length
        : index === 0
          ? faqItems.length - 1
          : index - 1;
    const nextButton = document.getElementById(`faq-trigger-${nextIndex}`);
    nextButton?.focus();
  };

  return (
    <section id="faq" className="relative overflow-hidden bg-[#F8FAF7] px-5 py-24 text-[#0F172A] sm:px-8 lg:px-10 xl:py-[150px]">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(18,199,111,.20) 1px, transparent 1.2px), radial-gradient(circle, rgba(15,23,42,.08) 1px, transparent 1.2px)",
            backgroundPosition: "0 0, 18px 18px",
            backgroundSize: "36px 36px",
            maskImage: "linear-gradient(180deg, transparent 0%, black 18%, black 78%, transparent 100%)",
          }}
        />
        <div className="absolute left-1/2 top-24 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-[#12C76F]/[0.045] blur-[105px]" />
      </div>

      <div className="relative mx-auto max-w-[1320px]">
        <motion.div {...fadeUp} className="mx-auto max-w-[900px] text-center">
          <h2 className="text-[42px] font-extrabold leading-[1.04] tracking-[-0.04em] text-[#0F172A] sm:text-[56px] xl:text-[72px]">
            {t("titleLine1")}
            <br />
            {t("titleLine2")} <span className="text-[#12C76F]">{t("titleAccent")}</span>
          </h2>
          <p className="mx-auto mt-7 max-w-[760px] text-[18px] leading-[1.7] text-[#64748B] sm:text-[20px] xl:text-[22px]">
            {t("subtitle")}
          </p>
        </motion.div>

        <motion.div
          {...fadeUp}
          role="region"
          aria-label={t("aria")}
          className="mx-auto mt-16 max-w-[980px] overflow-hidden rounded-[26px] border border-[#E7EDF4] bg-white shadow-[0_20px_70px_rgba(15,23,42,.05)] xl:mt-[70px]"
        >
          {faqItems.map(({ question, answer }, index) => (
            <motion.div
              key={question}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.48, delay: index * 0.08, ease: "easeOut" as const }}
              className="border-b border-[#EEF2F7] last:border-b-0"
            >
              <button
                id={`faq-trigger-${index}`}
                type="button"
                className="flex min-h-[88px] w-full items-center justify-between gap-5 bg-white px-6 text-left transition duration-250 hover:bg-[#FAFCFE] sm:min-h-[94px] sm:px-[38px]"
                onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                aria-expanded={openFaq === index}
                aria-controls={`faq-panel-${index}`}
                onKeyDown={(event) => handleFaqKeyDown(event, index)}
              >
                <span className="text-[16px] font-bold leading-6 text-[#0F172A] sm:text-[18px]">{question}</span>
                <ChevronDown className={`h-[22px] w-[22px] shrink-0 stroke-[2] text-[#0F172A] transition duration-250 ${openFaq === index ? "rotate-180 text-[#12C76F]" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {openFaq === index && (
                  <motion.div
                    id={`faq-panel-${index}`}
                    role="region"
                    aria-labelledby={`faq-trigger-${index}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <motion.p
                      initial={{ y: 8, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 8, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="w-[90%] px-6 pb-8 text-[16px] leading-[1.8] text-[#475569] sm:px-[38px] sm:pb-[34px] sm:text-[17px]"
                    >
                      {answer}
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function LandingFooter() {
  const t = useTranslations("footer");
  const footerColumns = t.raw("columns") as Array<{
    title: string;
    links: Array<{ label: string; href: string }>;
  }>;

  return (
    <footer className="relative overflow-hidden bg-[#060B10] px-5 py-16 text-white sm:px-8 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_center,rgba(18,199,111,0.06),transparent_45%)]" />
      <motion.div {...fadeUp} className="relative mx-auto max-w-[1440px]">
        <div className="h-px w-full bg-white/[0.14]" />

        <div className="grid gap-12 py-16 lg:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] xl:gap-[72px] xl:py-[72px]">
          <div className="lg:col-span-2 xl:col-span-1">
            <Image
              src="/slaivio-logo-official-dark.png"
              alt="Slaivio"
              width={210}
              height={80}
              className="h-auto w-[190px] object-contain sm:w-[210px]"
            />
            <p className="mt-8 max-w-[420px] whitespace-pre-line text-[18px] leading-[1.75] text-white/78 sm:text-[20px]">
              {t("description")}
            </p>
            <div className="mt-10 flex gap-[18px]">
              <FooterSocial href="https://wa.me/" label="WhatsApp" type="whatsapp" />
              <FooterSocial href="#" label="LinkedIn" type="linkedin" />
              <FooterSocial href="#" label="YouTube" type="youtube" />
              <FooterSocial href="mailto:contact@slaivio.com" label="Email" type="email" />
            </div>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title}>
              <h3 className="text-[20px] font-bold text-[#12C76F]">{column.title}</h3>
              <div className="mt-8 flex flex-col gap-7">
                {column.links.map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    className="text-[18px] leading-none text-white/78 transition duration-200 hover:translate-x-1 hover:text-[#12C76F] sm:text-[20px]"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="h-px w-full bg-white/[0.14]" />
        <div className="flex flex-col gap-6 pt-10 md:flex-row md:items-center md:justify-between">
          <p className="text-[16px] text-white/56 sm:text-[18px]">{t("copyright")}</p>
          <div className="w-fit md:border-l md:border-white/[0.14] md:pl-12">
            <LanguageSwitcher variant="footer" display="name" />
          </div>
        </div>
      </motion.div>
    </footer>
  );
}

function FooterSocial({
  href,
  label,
  type,
}: {
  href: string;
  label: string;
  type: "whatsapp" | "linkedin" | "youtube" | "email";
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center text-[#12C76F] transition duration-200 hover:-translate-y-1 hover:text-[#20E489]"
    >
      {type === "email" && <Mail className="h-6 w-6 stroke-[1.8]" />}
      {type === "whatsapp" && <MessageCircle className="h-6 w-6 stroke-[1.8]" />}
      {type === "linkedin" && (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="currentColor">
          <path d="M6.94 8.75H3.56V20h3.38zM5.25 7.2a1.96 1.96 0 100-3.92 1.96 1.96 0 000 3.92zM20.44 20v-6.38c0-3.42-1.82-5.02-4.25-5.02a3.67 3.67 0 00-3.32 1.83h-.05V8.75H9.58V20h3.37v-5.56c0-1.47.28-2.9 2.1-2.9 1.8 0 1.83 1.69 1.83 3V20z" />
        </svg>
      )}
      {type === "youtube" && (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true" fill="currentColor">
          <path d="M21.58 7.19a2.75 2.75 0 00-1.94-1.95C17.93 4.78 12 4.78 12 4.78s-5.93 0-7.64.46a2.75 2.75 0 00-1.94 1.95A28.7 28.7 0 002 12a28.7 28.7 0 00.42 4.81 2.75 2.75 0 001.94 1.95c1.71.46 7.64.46 7.64.46s5.93 0 7.64-.46a2.75 2.75 0 001.94-1.95A28.7 28.7 0 0022 12a28.7 28.7 0 00-.42-4.81zM10 15.22V8.78L15.5 12z" />
        </svg>
      )}
    </a>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Pill({ children, icon: Icon }: { children: ReactNode; icon: LucideIcon }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#12C76F]/20 bg-[#12C76F]/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0BAA5D]">
      <Icon className="h-4 w-4" />
      {children}
    </span>
  );
}
