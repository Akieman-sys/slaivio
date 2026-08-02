"use client";

import { UserButton } from "@clerk/nextjs";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  Home,
  Menu,
  PanelLeftOpen,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { usePermissions } from "@/components/permissions/permission-provider";
import { OrganizationSwitcher } from "@/components/tenant/organization-switcher";
import { appNavigation, canAccessRoute, searchableAppRoutes } from "@/config/app-navigation";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const { permissions, loading: permissionsLoading, available: permissionsAvailable } = usePermissions();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const initialGroup = appNavigation.find((group) => group.routes.some((route) => pathname.startsWith(route.href)))?.label ?? "Opérations";
  const [activeGroup, setActiveGroup] = useState<string | null>(initialGroup);

  const visibleGroups = useMemo(() => appNavigation.map((group) => ({
    ...group,
    routes: group.routes.filter((route) => canAccessRoute(route, permissions, permissionsAvailable)),
  })).filter((group) => group.routes.length > 0), [permissions, permissionsAvailable]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    const allowed = searchableAppRoutes.filter((route) => canAccessRoute(route, permissions, permissionsAvailable));
    if (!normalized) return allowed;
    return allowed.filter((route) => [route.label, ...route.keywords].some((term) => term.toLocaleLowerCase("fr").includes(normalized)));
  }, [query, permissions, permissionsAvailable]);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (event.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  function openRoute(href: string) {
    setSearchOpen(false);
    setQuery("");
    setMobileOpen(false);
    router.push(href);
  }

  return (
    <div className="h-dvh overflow-hidden bg-[var(--workspace)] text-[var(--ink)]">
      <header className="relative z-40 flex h-[52px] items-center bg-[#292928] px-2 text-white sm:px-3">
        <button onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu" className="mr-1 rounded-md p-2 text-white/70 hover:bg-white/10 lg:hidden"><Menu size={19} /></button>
        <div className="flex w-[232px] shrink-0 items-center gap-2 px-2">
          <Image src="/slaivio-icon-official.png" width={28} height={28} alt="Slaivio" className="rounded-md" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Slaivio</span>
          <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/45">Cargo OS</span>
        </div>
        <button onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }} className="absolute left-1/2 hidden h-9 w-[min(440px,38vw)] -translate-x-1/2 items-center rounded-md border border-white/10 bg-white/[0.12] px-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:flex" aria-label="Ouvrir la recherche">
          <Search size={15} className="text-white/55" />
          <span className="ml-2 min-w-0 flex-1 truncate text-[13px] text-white/40">Rechercher dans Slaivio…</span>
          <kbd className="rounded border border-white/10 bg-black/10 px-1.5 py-0.5 text-[10px] text-white/50">Ctrl K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <a href="mailto:support@slaivio.com" className="hidden items-center gap-1.5 rounded-md px-2.5 py-2 text-xs text-white/65 hover:bg-white/10 hover:text-white sm:flex"><CircleHelp size={15} /> Aide</a>
          <button aria-label="Notifications — bientôt disponible" title="Notifications — bientôt disponible" disabled className="cursor-not-allowed rounded-md p-2 text-white/30"><Bell size={17} /></button>
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
          <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-2 pb-3">
            {visibleGroups.map((group) => {
              const expanded = !compact && activeGroup === group.label;
              return <div key={group.label} className="mb-1">
                <button onClick={() => compact ? setCompact(false) : setActiveGroup(expanded ? null : group.label)} title={compact ? group.label : undefined} aria-expanded={expanded} className={`flex min-h-9 w-full items-center rounded-md text-[13px] font-medium hover:bg-[#efefed] ${compact ? "justify-center" : "gap-2.5 px-2.5"} ${expanded ? "bg-[#efefed] text-slate-950" : "text-slate-700"}`}>
                  <group.icon size={17} />{!compact && <><span>{group.label}</span><ChevronDown size={14} className={`ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} /></>}
                </button>
                {expanded && <div className="ml-[19px] mt-1 space-y-0.5 border-l border-[#dededb] pl-3">
                  {group.routes.map((route) => <Link key={route.href} href={route.href} onClick={() => setMobileOpen(false)} aria-current={pathname === route.href ? "page" : undefined} className={`flex min-h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] ${pathname === route.href ? "bg-[#e7e7ff] font-semibold text-[#4038a8]" : "text-slate-600 hover:bg-[#efefed] hover:text-slate-950"}`}><route.icon size={15} />{route.label}</Link>)}
                </div>}
              </div>;
            })}
          </nav>
          {!compact && !permissionsLoading && !permissionsAvailable && <div className="border-t border-amber-200 bg-amber-50 p-3 text-[11px] leading-4 text-amber-800"><span className="flex items-center gap-1.5 font-semibold"><ShieldAlert size={13} /> Droits indisponibles</span><span className="mt-1 block">Les API sécurisent toujours chaque action.</span></div>}
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto bg-white">{children}</main>
      </div>

      {searchOpen && <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/35 px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Recherche Slaivio" onMouseDown={(event) => { if (event.currentTarget === event.target) setSearchOpen(false); }}>
        <div className="w-full max-w-xl overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl">
          <label className="flex h-12 items-center border-b border-[var(--line)] px-4"><Search size={17} className="text-slate-400" /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && results[0]) openRoute(results[0].href); }} placeholder="Clients, dossiers, colis, expéditions…" className="ml-3 min-w-0 flex-1 bg-transparent text-sm outline-none" autoComplete="off" /><kbd className="text-xs text-slate-400">Échap</kbd></label>
          <div className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-500">Aucune section disponible ne correspond à cette recherche.</p>}
            {results.map((route) => <button key={route.href} onClick={() => openRoute(route.href)} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-[#efefed] focus:bg-[#efefed] focus:outline-none"><route.icon size={16} className="text-slate-500" /><span>{route.label}</span><span className="ml-auto text-xs text-slate-400">{route.href}</span></button>)}
          </div>
        </div>
      </div>}
    </div>
  );
}
