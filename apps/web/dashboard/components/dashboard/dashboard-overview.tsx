"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import axios from "axios";
import {
  Bell, BriefcaseBusiness, Building2, ChevronDown, ChevronLeft,
  CircleHelp, CreditCard, FileText, Folder, Home, LayoutDashboard, Map,
  Menu, MessageCircle, Network, Package, Radio, Receipt, Search, Send,
  Settings, ShieldCheck, Truck, Users, Warehouse, X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";

import { getDashboardHome, type DashboardHome } from "@/services/dashboard";

type NavEntry = readonly [string, ComponentType<{ size?: number }>, string];
type NavGroup = {
  label: string;
  icon: ComponentType<{ size?: number }>;
  items: readonly NavEntry[];
};

const navGroups: readonly NavGroup[] = [
  {
    label: "Opérations",
    icon: BriefcaseBusiness,
    items: [
      ["Clients", Users, "/app/clients"],
      ["Dossiers", Folder, "/app/dossiers"],
      ["Colis", Package, "/app/packages"],
      ["Expéditions", Truck, "/app/shipments"],
      ["Tracking", Search, "/app/tracking"],
    ],
  },
  {
    label: "Communication",
    icon: MessageCircle,
    items: [
      ["WhatsApp Inbox", MessageCircle, "/app/inbox"],
      ["Broadcasts", Send, "/app/broadcasts"],
      ["Relances", Radio, "/app/followups"],
    ],
  },
  {
    label: "Finance",
    icon: CreditCard,
    items: [
      ["Paiements", CreditCard, "/app/payments"],
      ["Factures", FileText, "/app/invoices"],
      ["Dépenses", Receipt, "/app/expenses"],
    ],
  },
  {
    label: "Réseau cargo",
    icon: Network,
    items: [
      ["Workspaces", Building2, "/app/workspaces"],
      ["Entrepôts", Warehouse, "/app/warehouses"],
      ["Routes", Map, "/app/routes"],
    ],
  },
  {
    label: "Gestion",
    icon: ShieldCheck,
    items: [
      ["Équipe", Users, "/app/team"],
      ["Rapports", LayoutDashboard, "/app/reports"],
      ["Paramètres", Settings, "/app/settings"],
    ],
  },
];

export function DashboardOverviewPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [homeData, setHomeData] = useState<DashboardHome | null>(null);
  const [agencyState, setAgencyState] = useState<"loading" | "ready" | "none" | "error">("loading");
  const [agencyError, setAgencyError] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setAgencyState("error");
      return;
    }

    let active = true;
    getToken()
      .then((token) => getDashboardHome(token))
      .then((home) => {
        if (!active) return;
        setHomeData(home);
        if (home.status === "no_workspace" || !home.workspace.org_id) {
          setAgencyState("none");
          return;
        }
        setAgencyState("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAgencyState("error");
        if (!axios.isAxiosError(error) || !error.response) {
          setAgencyError("API Slaivio injoignable. Vérifiez NEXT_PUBLIC_API_URL et le service backend Render.");
          return;
        }
        const status = error.response.status;
        if (status === 401) {
          setAgencyError("Authentification refusée (401). Vérifiez CLERK_JWKS_URL et que le frontend et le backend utilisent la même instance Clerk.");
        } else if (status === 403 || status === 409) {
          setAgencyError(`Agence non provisionnée (${status}). Vérifiez le webhook Clerk et le membership.`);
        } else if (status >= 500) {
          setAgencyError(`Erreur backend/Supabase (${status}). Consultez les logs du backend Render.`);
        } else {
          setAgencyError(`L’API a répondu avec le statut ${status}.`);
        }
      });

    return () => { active = false; };
  }, [getToken, isLoaded, isSignedIn]);

  return (
    <>
      <div className="mx-auto max-w-[1240px] px-6 py-8 sm:px-10 lg:px-12">
        <h1 className="text-[28px] font-semibold tracking-[-0.035em]">Accueil</h1>
        <p className={`mt-3 text-sm ${agencyState === "error" ? "text-red-600" : "text-slate-500"}`}>
          {agencyState === "loading" && "Chargement de votre agence…"}
          {agencyState === "ready" && <>Votre espace Slaivio est connecté aux données de votre agence.</>}
          {agencyState === "none" && "Aucune agence associée à ce compte."}
          {agencyState === "error" && agencyError}
        </p>
        <ConnectedAccountCard home={homeData} state={agencyState} />
      </div>
    </>
  );
}

export function DashboardFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>("Opérations");

  function selectGroup(label: string) {
    if (compact) {
      setCompact(false);
      setActiveGroup(label);
      return;
    }
    setActiveGroup((current) => current === label ? null : label);
  }

  return (
    <div className="h-dvh overflow-hidden bg-[#f7f8fa] text-[#1d1f25]">
      <GlobalHeader openMobile={() => setMobileOpen(true)} />
      <div className="flex h-[calc(100dvh-58px)]">
        <Sidebar
          mobileOpen={mobileOpen}
          compact={compact}
          activeGroup={activeGroup}
          closeMobile={() => setMobileOpen(false)}
          selectGroup={selectGroup}
          toggleCompact={() => setCompact((value) => !value)}
          pathname={pathname}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function ConnectedAccountCard({ home, state }: { home: DashboardHome | null; state: "loading" | "ready" | "none" | "error" }) {
  const manager = home?.manager;
  const workspace = home?.workspace;
  const whatsapp = home?.whatsapp;

  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-[#d9dce1] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="border-b border-[#e3e6eb] px-6 py-4">
        <h2 className="text-base font-semibold text-[#1d1f25]">Compte connecté</h2>
        <p className="mt-1 text-sm text-slate-500">Première information affichée dans l’accueil : l’identité et l’agence active du compte.</p>
      </div>

      {state === "loading" && (
        <div className="grid gap-4 p-6 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {state !== "loading" && (
        <div className="grid gap-0 md:grid-cols-[1.1fr_1fr_1fr]">
          <div className="border-b border-[#e3e6eb] p-6 md:border-b-0 md:border-r">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1d1f25] text-sm font-semibold text-white">
                {manager?.initials || "SL"}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#1d1f25]">{manager?.name || "Compte Slaivio"}</p>
                <p className="mt-1 truncate text-sm text-slate-500">{manager?.email || "Email non disponible"}</p>
              </div>
            </div>
          </div>

          <div className="border-b border-[#e3e6eb] p-6 md:border-b-0 md:border-r">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Agence active</p>
            <p className="mt-3 truncate text-sm font-semibold text-[#1d1f25]">{workspace?.name || "Aucune agence"}</p>
            <p className="mt-1 text-sm text-slate-500">
              {workspace?.country || workspace?.city
                ? [workspace.city, workspace.country].filter(Boolean).join(", ")
                : state === "none" ? "Aucun workspace associé" : "Localisation non renseignée"}
            </p>
          </div>

          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">WhatsApp Business</p>
            <div className="mt-3 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${whatsapp?.configured ? "bg-emerald-500" : "bg-slate-300"}`} />
              <p className="text-sm font-semibold text-[#1d1f25]">{whatsapp?.configured ? "Connecté" : "Non configuré"}</p>
            </div>
            <p className="mt-1 truncate text-sm text-slate-500">{whatsapp?.phone || whatsapp?.status || "Aucun numéro actif"}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function GlobalHeader({ openMobile }: { openMobile: () => void }) {
  return (
    <header className="relative z-40 flex h-[58px] items-center border-b border-[#d9dce1] bg-white px-3 sm:px-5">
      <button onClick={openMobile} aria-label="Ouvrir le menu" className="mr-2 rounded-md p-2 hover:bg-slate-100 lg:hidden">
        <Menu size={20} />
      </button>
      <div className="flex w-[235px] shrink-0 items-center gap-2">
        <Image src="/slaivio-icon-official.png" width={30} height={30} alt="Slaivio" className="rounded-md" />
        <span className="text-xl font-bold tracking-tight">Slaivio</span>
      </div>
      <label className="absolute left-1/2 hidden w-[min(430px,38vw)] -translate-x-1/2 items-center rounded-full border border-[#d9dce1] bg-white px-4 py-2 shadow-sm focus-within:border-slate-400 sm:flex">
        <Search size={16} className="text-slate-500" />
        <input placeholder="Rechercher dans Slaivio…" aria-label="Rechercher" className="ml-2 min-w-0 flex-1 bg-transparent text-sm outline-none" />
        <kbd className="text-xs text-slate-400">Ctrl K</kbd>
      </label>
      <div className="ml-auto flex items-center gap-1">
        <button className="hidden items-center gap-1 rounded-full px-3 py-2 text-sm hover:bg-slate-100 sm:flex"><CircleHelp size={16} /> Aide</button>
        <button aria-label="Notifications" className="rounded-full p-2.5 hover:bg-slate-100"><Bell size={18} /></button>
        <div className="ml-1 flex h-8 w-8 items-center justify-center"><UserButton /></div>
      </div>
    </header>
  );
}

function Sidebar({ mobileOpen, compact, activeGroup, closeMobile, selectGroup, toggleCompact, pathname }: {
  mobileOpen: boolean;
  compact: boolean;
  activeGroup: string | null;
  closeMobile: () => void;
  selectGroup: (label: string) => void;
  toggleCompact: () => void;
  pathname: string;
}) {
  return (
    <>
      <button aria-label="Fermer le menu" onClick={closeMobile} className={`fixed inset-0 z-40 bg-slate-950/25 lg:hidden ${mobileOpen ? "block" : "hidden"}`} />
      <aside className={`fixed bottom-0 left-0 top-[58px] z-50 flex flex-col overflow-hidden border-r border-[#d9dce1] bg-white transition-[width,transform] lg:relative lg:top-0 lg:z-auto ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${compact ? "w-[56px]" : "w-[250px]"}`}>
        <div className="flex items-center gap-1 p-2">
          <Link href="/app" title="Accueil" className={`flex min-h-10 flex-1 items-center rounded-md text-sm font-semibold ${pathname === "/app" ? "bg-[#eef0f4] text-slate-950" : "text-slate-700 hover:bg-slate-100"} ${compact ? "justify-center" : "gap-3 px-3"}`}>
            <Home size={19} />
            {!compact && <span>Accueil</span>}
          </Link>
          {!compact && <button onClick={toggleCompact} aria-label="Réduire le menu" className="hidden rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:block"><ChevronLeft size={17} /></button>}
          <button onClick={closeMobile} aria-label="Fermer" className="rounded-md p-2 lg:hidden"><X size={18} /></button>
        </div>

        <nav className="flex-1 overflow-hidden px-2 pb-3">
          {navGroups.map((group) => {
            const GroupIcon = group.icon;
            const expanded = !compact && activeGroup === group.label;
            return (
              <div key={group.label} className="mb-1">
                <button
                  onClick={() => selectGroup(group.label)}
                  title={compact ? group.label : undefined}
                  aria-expanded={expanded}
                  className={`flex min-h-10 w-full items-center rounded-md text-sm font-semibold transition hover:bg-slate-100 ${compact ? "justify-center" : "gap-3 px-3"} ${expanded ? "bg-slate-50 text-slate-950" : "text-slate-700"}`}
                >
                  <GroupIcon size={18} />
                  {!compact && <><span>{group.label}</span><ChevronDown size={15} className={`ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} /></>}
                </button>
                {expanded && (
                  <div className="ml-[21px] mt-1 space-y-0.5 border-l border-slate-200 pl-3">
                    {group.items.map(([label, Icon, href]) => (
                      <Link key={href} href={href} className={`flex min-h-9 items-center gap-3 rounded-md px-3 text-sm transition ${pathname === href ? "bg-[#eef0f4] font-semibold text-slate-950" : "text-slate-600 hover:bg-[#f3f4f6] hover:text-slate-950"}`}>
                        <Icon size={16} />
                        <span>{label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {compact && <button onClick={toggleCompact} aria-label="Déployer le menu" className="m-2 flex h-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><Menu size={18} /></button>}
      </aside>
    </>
  );
}
