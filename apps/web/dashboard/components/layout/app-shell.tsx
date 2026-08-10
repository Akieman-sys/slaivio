"use client";

import { UserButton } from "@clerk/nextjs";
import { Bell, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Home, Menu, Search, Settings, ShieldAlert, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { usePermissions } from "@/components/permissions/permission-provider";
import { OrganizationSwitcher } from "@/components/tenant/organization-switcher";
import { appNavigation, canAccessRoute, searchableAppRoutes } from "@/config/app-navigation";
import { SESSION_EXPIRED_EVENT } from "@/services/api";
import { platformAccess } from "@/services/platform-admin";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const { permissions, loading: permissionsLoading, available: permissionsAvailable } = usePermissions();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [platformAllowed, setPlatformAllowed] = useState(false);
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

  useEffect(() => {
    const onSessionExpired = () => setSessionExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  useEffect(() => {
    platformAccess().then(setPlatformAllowed).catch(() => setPlatformAllowed(false));
  }, []);

  function openRoute(href: string) {
    setSearchOpen(false);
    setQuery("");
    setMobileOpen(false);
    router.push(href);
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f7f7f6] text-[#202124]">
      <button aria-label="Fermer le menu" onClick={() => setMobileOpen(false)} className={`fixed inset-0 z-40 bg-slate-950/25 lg:hidden ${mobileOpen ? "block" : "hidden"}`} />

      <aside className={`fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col overflow-hidden border-r border-[#d8d8d5] bg-[#fbfbfa] transition-[width,transform] lg:relative lg:z-auto ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${compact ? "w-[64px]" : "w-[255px]"}`}>
        <div className="flex h-[64px] shrink-0 items-center border-b border-[#d8d8d5] px-4">
          <Image src="/slaivio-icon-official.png" width={32} height={32} alt="Slaivio" className="rounded-[5px]" />
          {!compact && <><span className="ml-2.5 text-[15px] font-semibold tracking-[-0.02em]">Slaivio</span><button title="Paramètres" aria-label="Paramètres" disabled className="ml-auto cursor-not-allowed rounded p-1.5 text-[#666] opacity-55"><Settings size={16} /></button><button onClick={() => setMobileOpen(false)} aria-label="Fermer" className="ml-1 rounded p-1.5 text-[#555] lg:hidden"><X size={17} /></button></>}
        </div>

        <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-2 py-2">
          <Link href="/app" onClick={() => setMobileOpen(false)} aria-current={pathname === "/app" ? "page" : undefined} className={`flex min-h-[38px] items-center rounded-[4px] text-[14px] ${compact ? "justify-center" : "gap-2.5 px-2.5"} ${pathname === "/app" ? "bg-[#dcdafa] font-medium text-[#27234f]" : "text-[#343434] hover:bg-[#eeeeec]"}`}><Home size={17} strokeWidth={1.8} />{!compact && "Vue d’ensemble"}</Link>

          {!compact && <div className="mt-3 px-2 pb-1 text-[12px] font-medium text-[#555]">Organisation</div>}
          {!compact && <div className="mb-2 px-1"><OrganizationSwitcher variant="light" /></div>}

          {visibleGroups.map((group) => {
            const expanded = !compact && activeGroup === group.label;
            return <div key={group.label} className="mt-1">
              <button onClick={() => compact ? setCompact(false) : setActiveGroup(expanded ? null : group.label)} title={compact ? group.label : undefined} aria-expanded={expanded} className={`flex min-h-[36px] w-full items-center rounded-[4px] text-[13px] hover:bg-[#eeeeec] ${compact ? "justify-center" : "gap-2.5 px-2.5"} ${expanded ? "text-[#222]" : "text-[#555]"}`}>
                <group.icon size={16} strokeWidth={1.8} />{!compact && <><span>{group.label}</span><ChevronDown size={14} className={`ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} /></>}
              </button>
              {expanded && <div className="ml-[18px] border-l border-[#dededb] pl-2">
                {group.routes.map((route) => <Link key={route.href} href={route.href} onClick={() => setMobileOpen(false)} aria-current={pathname === route.href ? "page" : undefined} className={`my-0.5 flex min-h-[34px] items-center gap-2.5 rounded-[4px] px-2.5 text-[13px] ${pathname === route.href ? "bg-[#dcdafa] font-medium text-[#39347f]" : "text-[#454545] hover:bg-[#eeeeec]"}`}><route.icon size={15} strokeWidth={1.8} />{route.label}</Link>)}
              </div>}
            </div>;
          })}
        </nav>

        {!compact && !permissionsLoading && !permissionsAvailable && <div className="border-t border-amber-200 bg-amber-50 p-3 text-[11px] leading-4 text-amber-800"><span className="flex items-center gap-1.5 font-semibold"><ShieldAlert size={13} /> Droits indisponibles</span><span className="mt-1 block">Les API sécurisent toujours chaque action.</span></div>}
        {!compact && <div className="border-t border-[#d8d8d5] px-2 py-2">{platformAllowed&&<Link href="/app/platform" className="mb-1 flex min-h-[36px] items-center gap-2.5 rounded-[4px] bg-[#202124] px-2.5 text-[13px] text-white"><ShieldAlert size={16}/> Super Admin</Link>}<Link href="/app/support" className="flex min-h-[36px] items-center gap-2.5 rounded-[4px] px-2.5 text-[13px] text-[#343434] hover:bg-[#eeeeec]"><CircleHelp size={16} /> Centre d’aide</Link></div>}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-[52px] shrink-0 items-center bg-[#30302f] px-3 text-white">
          <button onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu" className="mr-1 rounded p-2 text-white/75 hover:bg-white/10 lg:hidden"><Menu size={18} /></button>
          <button onClick={() => setCompact((value) => !value)} aria-label={compact ? "Déployer le menu" : "Réduire le menu"} className="hidden rounded p-2 text-white/75 hover:bg-white/10 lg:block">{compact ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</button>
          <button onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }} className="absolute left-1/2 flex h-[34px] w-[min(400px,46vw)] -translate-x-1/2 items-center rounded-[5px] border border-white/10 bg-white/[0.15] px-3 text-left hover:bg-white/[0.18]" aria-label="Ouvrir la recherche"><Search size={15} className="text-white/65" /><span className="ml-2 min-w-0 flex-1 truncate text-[13px] text-white/65">Rechercher dans l’organisation…</span><kbd className="rounded border border-white/15 bg-black/10 px-1.5 py-0.5 text-[10px] text-white/65">Ctrl K</kbd></button>
          <div className="ml-auto flex items-center gap-1"><Link href="/app/notifications" aria-label="Ouvrir les notifications" title="Notifications" className="rounded p-2 text-white/75 hover:bg-white/10"><Bell size={18} /></Link><div className="ml-1 flex h-8 w-8 items-center justify-center"><UserButton /></div></div>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#f7f7f6]">{children}</main>
      </section>

      {searchOpen && <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/35 px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Recherche Slaivio" onMouseDown={(event) => { if (event.currentTarget === event.target) setSearchOpen(false); }}><div className="w-full max-w-xl overflow-hidden rounded-[7px] border border-slate-300 bg-white shadow-2xl"><label className="flex h-12 items-center border-b border-[#ddd] px-4"><Search size={17} className="text-slate-400" /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && results[0]) openRoute(results[0].href); }} placeholder="Clients, dossiers, colis, expéditions…" className="ml-3 min-w-0 flex-1 bg-transparent text-sm outline-none" autoComplete="off" /><kbd className="text-xs text-slate-400">Échap</kbd></label><div className="max-h-80 overflow-y-auto p-2">{results.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-500">Aucune section disponible ne correspond à cette recherche.</p>}{results.map((route) => <button key={route.href} onClick={() => openRoute(route.href)} className="flex w-full items-center gap-3 rounded-[4px] px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-[#eeeeec] focus:bg-[#eeeeec] focus:outline-none"><route.icon size={16} className="text-slate-500" /><span>{route.label}</span><span className="ml-auto text-xs text-slate-400">{route.href}</span></button>)}</div></div></div>}

      {sessionExpired && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" role="alertdialog" aria-modal="true" aria-labelledby="session-expired-title"><section className="w-full max-w-sm rounded-[7px] border border-slate-300 bg-white p-6 shadow-2xl"><div className="flex h-10 w-10 items-center justify-center rounded-[5px] bg-amber-50 text-amber-700"><ShieldAlert size={19} /></div><h2 id="session-expired-title" className="mt-4 text-lg font-semibold text-slate-950">Votre session a expiré</h2><p className="mt-2 text-sm leading-6 text-slate-600">Reconnectez-vous avant de poursuivre. Les données déjà affichées restent intactes, mais aucune nouvelle action ne sera envoyée.</p><button onClick={() => { const returnTo = `${window.location.pathname}${window.location.search}`; window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`); }} className="mt-5 inline-flex h-9 w-full items-center justify-center rounded-[5px] bg-[#30302f] px-4 text-sm font-semibold text-white hover:bg-black">Se reconnecter</button></section></div>}
    </div>
  );
}
