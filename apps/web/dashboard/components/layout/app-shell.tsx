"use client";

import { UserButton } from "@clerk/nextjs";
import {
  Bell, BriefcaseBusiness, Building2, ChevronDown, ChevronLeft,
  CircleHelp, CreditCard, FileText, Folder, Home, LayoutDashboard, Map,
  Menu, MessageCircle, Network, Package, PanelLeftOpen, Radio, Receipt,
  Search, Send, Settings, ShieldCheck, Truck, Users, Warehouse, X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { OrganizationSwitcher } from "@/components/tenant/organization-switcher";

type NavigationGroup = {
  label: string;
  icon: LucideIcon;
  items: readonly { label: string; icon: LucideIcon; href: string }[];
};

const navigation: readonly NavigationGroup[] = [
  { label: "Opérations", icon: BriefcaseBusiness, items: [
    { label: "Clients", icon: Users, href: "/app/clients" },
    { label: "Dossiers", icon: Folder, href: "/app/dossiers" },
    { label: "Colis", icon: Package, href: "/app/packages" },
    { label: "Expéditions", icon: Truck, href: "/app/shipments" },
    { label: "Tracking", icon: Search, href: "/app/tracking" },
  ]},
  { label: "Communication", icon: MessageCircle, items: [
    { label: "WhatsApp Inbox", icon: MessageCircle, href: "/app/inbox" },
    { label: "Broadcasts", icon: Send, href: "/app/broadcasts" },
    { label: "Relances", icon: Radio, href: "/app/followups" },
  ]},
  { label: "Finance", icon: CreditCard, items: [
    { label: "Paiements", icon: CreditCard, href: "/app/payments" },
    { label: "Factures", icon: FileText, href: "/app/invoices" },
    { label: "Dépenses", icon: Receipt, href: "/app/expenses" },
  ]},
  { label: "Réseau cargo", icon: Network, items: [
    { label: "Workspaces", icon: Building2, href: "/app/workspaces" },
    { label: "Entrepôts", icon: Warehouse, href: "/app/warehouses" },
    { label: "Routes", icon: Map, href: "/app/routes" },
  ]},
  { label: "Gestion", icon: ShieldCheck, items: [
    { label: "Équipe", icon: Users, href: "/app/team" },
    { label: "Rapports", icon: LayoutDashboard, href: "/app/reports" },
    { label: "Paramètres", icon: Settings, href: "/app/settings" },
  ]},
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const initialGroup = navigation.find((group) =>
    group.items.some((item) => pathname.startsWith(item.href)),
  )?.label ?? "Opérations";
  const [activeGroup, setActiveGroup] = useState<string | null>(initialGroup);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  return (
    <div className="h-dvh overflow-hidden bg-[var(--workspace)] text-[var(--ink)]">
      <header className="relative z-40 flex h-[52px] items-center bg-[#292928] px-2 text-white sm:px-3">
        <button onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu" className="mr-1 rounded-md p-2 text-white/70 hover:bg-white/10 lg:hidden"><Menu size={19} /></button>
        <div className="flex w-[232px] shrink-0 items-center gap-2 px-2">
          <Image src="/slaivio-icon-official.png" width={28} height={28} alt="Slaivio" className="rounded-md" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Slaivio</span>
          <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/45">Cargo OS</span>
        </div>
        <label className="absolute left-1/2 hidden h-9 w-[min(440px,38vw)] -translate-x-1/2 items-center rounded-md border border-white/10 bg-white/[0.12] px-3 focus-within:border-white/25 focus-within:bg-white/[0.16] sm:flex">
          <Search size={15} className="text-white/55" />
          <input ref={searchRef} placeholder="Rechercher un client, dossier, colis…" aria-label="Rechercher" className="ml-2 min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/40" />
          <kbd className="rounded border border-white/10 bg-black/10 px-1.5 py-0.5 text-[10px] text-white/50">⌘ K</kbd>
        </label>
        <div className="ml-auto flex items-center gap-0.5">
          <button className="hidden items-center gap-1.5 rounded-md px-2.5 py-2 text-xs text-white/65 hover:bg-white/10 hover:text-white sm:flex"><CircleHelp size={15} /> Aide</button>
          <button aria-label="Notifications" className="rounded-md p-2 text-white/65 hover:bg-white/10 hover:text-white"><Bell size={17} /></button>
          <div className="ml-1 flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-white/15"><UserButton /></div>
        </div>
      </header>

      <div className="flex h-[calc(100dvh-52px)]">
        <button aria-label="Fermer le menu" onClick={() => setMobileOpen(false)} className={`fixed inset-0 top-[52px] z-40 bg-slate-950/25 lg:hidden ${mobileOpen ? "block" : "hidden"}`} />
        <aside className={`fixed bottom-0 left-0 top-[52px] z-50 flex flex-col overflow-hidden border-r border-[var(--line)] bg-[#fbfbfa] transition-[width,transform] lg:relative lg:top-0 lg:z-auto ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${compact ? "w-[56px]" : "w-[248px]"}`}>
          <div className="border-b border-[var(--line)] p-2">
            {compact ? <button onClick={() => setCompact(false)} aria-label="Déployer le menu" className="flex h-10 w-full items-center justify-center rounded-md text-slate-500 hover:bg-[#efefed]"><PanelLeftOpen size={18} /></button> : <OrganizationSwitcher variant="light" />}
          </div>
          <div className="flex items-center gap-1 p-2">
            <Link href="/app" onClick={() => setMobileOpen(false)} className={`flex min-h-9 flex-1 items-center rounded-md text-[13px] font-medium ${pathname === "/app" ? "bg-[#e7e7ff] text-[#4038a8]" : "text-slate-700 hover:bg-[#efefed]"} ${compact ? "justify-center" : "gap-2.5 px-2.5"}`}><Home size={17} />{!compact && "Vue d’ensemble"}</Link>
            {!compact && <button onClick={() => setCompact(true)} aria-label="Réduire le menu" className="hidden rounded-md p-2 text-slate-500 hover:bg-[#efefed] lg:block"><ChevronLeft size={16} /></button>}
            <button onClick={() => setMobileOpen(false)} aria-label="Fermer" className="rounded-md p-2 lg:hidden"><X size={17} /></button>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 pb-3">
            {navigation.map((group) => {
              const expanded = !compact && activeGroup === group.label;
              return <div key={group.label} className="mb-1">
                <button onClick={() => compact ? setCompact(false) : setActiveGroup(expanded ? null : group.label)} title={compact ? group.label : undefined} aria-expanded={expanded} className={`flex min-h-9 w-full items-center rounded-md text-[13px] font-medium hover:bg-[#efefed] ${compact ? "justify-center" : "gap-2.5 px-2.5"} ${expanded ? "bg-[#efefed] text-slate-950" : "text-slate-700"}`}>
                  <group.icon size={17} />{!compact && <><span>{group.label}</span><ChevronDown size={14} className={`ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} /></>}
                </button>
                {expanded && <div className="ml-[19px] mt-1 space-y-0.5 border-l border-[#dededb] pl-3">
                  {group.items.map((item) => <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`flex min-h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] ${pathname === item.href ? "bg-[#e7e7ff] font-semibold text-[#4038a8]" : "text-slate-600 hover:bg-[#efefed] hover:text-slate-950"}`}><item.icon size={15} />{item.label}</Link>)}
                </div>}
              </div>;
            })}
          </nav>
          {!compact && <div className="border-t border-[var(--line)] p-2 text-[11px] text-slate-400"><div className="flex items-center justify-between rounded-md px-2 py-1.5"><span>Production</span><span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> API prête</span></div></div>}
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto bg-white">{children}</main>
      </div>
    </div>
  );
}
