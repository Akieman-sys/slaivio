"use client";

import {
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Grid2X2,
  Home,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [platformAllowed, setPlatformAllowed] = useState(false);

  const visibleRoutes = useMemo(
    () =>
      appNavigation
        .flatMap((group) => group.routes.map((route) => ({ ...route, group: group.label })))
        .filter((route) => canAccessRoute(route, permissions, permissionsAvailable)),
    [permissions, permissionsAvailable],
  );

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    const allowed = searchableAppRoutes.filter((route) =>
      canAccessRoute(route, permissions, permissionsAvailable),
    );
    if (!normalized) return allowed;
    return allowed.filter((route) =>
      [route.label, ...route.keywords].some((term) =>
        term.toLocaleLowerCase("fr").includes(normalized),
      ),
    );
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
    <div className="flex h-dvh overflow-hidden bg-[#f7f7f5] text-[#242426]">
      <button
        aria-label="Fermer le menu"
        onClick={() => setMobileOpen(false)}
        className={`fixed inset-0 z-40 bg-black/35 lg:hidden ${mobileOpen ? "block" : "hidden"}`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex bg-white transition-transform lg:relative lg:z-auto lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex w-12 shrink-0 flex-col items-center border-r border-[#d9d9d6] bg-[#fbfbfa] py-2">
          <Link
            href="/app"
            aria-label="Slaivio"
            className="mb-3 flex h-8 w-8 items-center justify-center overflow-hidden rounded-[5px] shadow-sm"
          >
            <Image src="/slaivio-icon-official.png" width={32} height={32} alt="Slaivio" />
          </Link>
          <RailLink href="/app" active={pathname === "/app"} icon={<Home size={18} />} label="Accueil" />
          <RailLink href="/app/notifications" active={pathname.startsWith("/app/notifications")} icon={<Bell size={18} />} label="Notifications" />
          <RailLink href="/app/settings" active={pathname.startsWith("/app/settings")} icon={<Settings size={18} />} label="Paramètres" />
          <RailLink href="/app/support" active={pathname.startsWith("/app/support")} icon={<CircleHelp size={18} />} label="Support" />
          <div className="mt-auto flex flex-col items-center gap-2">
            {platformAllowed && (
              <RailLink href="/app/platform" active={pathname.startsWith("/app/platform")} icon={<ShieldAlert size={18} />} label="Platform" />
            )}
            <button
              onClick={() => setSidebarOpen((value) => !value)}
              aria-label={sidebarOpen ? "Réduire la navigation" : "Ouvrir la navigation"}
              className="flex h-8 w-8 items-center justify-center rounded-[5px] text-[#57575a] hover:bg-[#eeeeec]"
            >
              {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>
          </div>
        </div>

        <div
          className={`flex shrink-0 flex-col overflow-hidden border-r border-[#d9d9d6] bg-[#fbfbfa] transition-[width] ${
            sidebarOpen ? "w-[208px]" : "w-0"
          }`}
        >
          <div className="flex h-[58px] shrink-0 items-center gap-2 border-b border-[#d9d9d6] px-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Image src="/slaivio-icon-official.png" width={24} height={24} alt="" className="rounded-[4px]" />
                <span className="truncate text-[14px] font-semibold">Slaivio</span>
              </div>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Fermer"
              className="rounded-[4px] p-1.5 text-[#555] lg:hidden"
            >
              <X size={16} />
            </button>
          </div>

          <div className="border-b border-[#d9d9d6] px-2 py-2">
            <OrganizationSwitcher variant="light" />
          </div>

          <nav aria-label="Navigation principale" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <Link
              href="/app"
              onClick={() => setMobileOpen(false)}
              aria-current={pathname === "/app" ? "page" : undefined}
              className={`mb-1 flex h-[34px] items-center gap-2 rounded-[4px] px-2 text-[14px] ${
                pathname === "/app" ? "bg-[#dcdafa] font-medium text-[#27234f]" : "text-[#333] hover:bg-[#eeeeec]"
              }`}
            >
              <Grid2X2 size={16} />
              Vue d’ensemble
            </Link>

            <div className="mt-3 px-2 text-[12px] font-medium text-[#666]">Modules</div>
            <div className="mt-1 space-y-0.5">
              {visibleRoutes.map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={pathname === route.href ? "page" : undefined}
                  className={`flex min-h-[34px] items-center gap-2 rounded-[4px] px-2 text-[13px] ${
                    pathname === route.href
                      ? "bg-[#dcdafa] font-medium text-[#343078]"
                      : "text-[#3d3d40] hover:bg-[#eeeeec]"
                  }`}
                >
                  <route.icon size={15} strokeWidth={1.9} />
                  <span className="truncate">{route.label}</span>
                </Link>
              ))}
            </div>
          </nav>

          <div className="border-t border-[#d9d9d6] p-2">
            {!permissionsLoading && !permissionsAvailable && (
              <div className="mb-2 rounded-[5px] border border-amber-200 bg-amber-50 p-2 text-[11px] leading-4 text-amber-800">
                Droits indisponibles. Les API restent l’autorité finale.
              </div>
            )}
            <button className="flex min-h-[34px] w-full items-center gap-2 rounded-[4px] px-2 text-left text-[13px] text-[#3d3d40] hover:bg-[#eeeeec]">
              <Plus size={15} />
              Nouveau module
            </button>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-[50px] shrink-0 items-center bg-[#30302f] px-3 text-white">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
            className="mr-2 rounded-[4px] p-2 text-white/75 hover:bg-white/10 lg:hidden"
          >
            <Menu size={18} />
          </button>

          <button
            onClick={() => {
              setSearchOpen(true);
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
            className="absolute left-1/2 flex h-[34px] w-[min(360px,46vw)] -translate-x-1/2 items-center rounded-[5px] border border-white/10 bg-white/[0.16] px-3 text-left hover:bg-white/[0.2]"
            aria-label="Ouvrir la recherche"
          >
            <Search size={15} className="text-white/65" />
            <span className="ml-2 min-w-0 flex-1 truncate text-[13px] text-white/70">
              Search organization...
            </span>
            <kbd className="rounded-[4px] bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-[#333]">⌘ /</kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-[4px] bg-[#5f5af6] px-3 py-1.5 text-[13px] font-semibold shadow-sm md:inline-flex">
              7 jours d’essai
            </span>
            <Link
              href="/app/dossiers"
              className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-[#625df5] px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-[#514ce8]"
            >
              <Plus size={16} />
              Créer
            </Link>
            <Link
              href="/app/settings"
              aria-label="Profil"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#625df5] text-[13px] font-semibold text-white shadow-sm"
            >
              B
            </Link>
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#f7f7f5]">{children}</main>
      </section>

      {searchOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/35 px-4 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Recherche Slaivio"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSearchOpen(false);
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-[7px] border border-[#d0d0cc] bg-white shadow-2xl">
            <label className="flex h-12 items-center border-b border-[#e1e1de] px-4">
              <Search size={17} className="text-[#777]" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && results[0]) openRoute(results[0].href);
                }}
                placeholder="Rechercher clients, dossiers, tracking, finance..."
                className="ml-3 min-w-0 flex-1 bg-transparent text-[14px] outline-none"
                autoComplete="off"
              />
              <kbd className="text-xs text-[#888]">Échap</kbd>
            </label>
            <div className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-[#777]">
                  Aucune section disponible ne correspond à cette recherche.
                </p>
              )}
              {results.map((route) => (
                <button
                  key={route.href}
                  onClick={() => openRoute(route.href)}
                  className="flex w-full items-center gap-3 rounded-[4px] px-3 py-2.5 text-left text-sm text-[#343434] hover:bg-[#eeeeec] focus:bg-[#eeeeec] focus:outline-none"
                >
                  <route.icon size={16} className="text-[#666]" />
                  <span>{route.label}</span>
                  <span className="ml-auto text-xs text-[#888]">{route.href}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sessionExpired && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="session-expired-title"
        >
          <section className="w-full max-w-sm rounded-[7px] border border-[#d0d0cc] bg-white p-6 shadow-2xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-[5px] bg-amber-50 text-amber-700">
              <Sparkles size={19} />
            </div>
            <h2 id="session-expired-title" className="mt-4 text-lg font-semibold text-[#222]">
              Votre session a expiré
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#666]">
              Reconnectez-vous avant de poursuivre. Les données déjà affichées restent intactes.
            </p>
            <button
              onClick={() => {
                const returnTo = `${window.location.pathname}${window.location.search}`;
                window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
              }}
              className="mt-5 inline-flex h-9 w-full items-center justify-center rounded-[5px] bg-[#30302f] px-4 text-sm font-semibold text-white hover:bg-black"
            >
              Se reconnecter
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function RailLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={`mb-1 flex h-8 w-8 items-center justify-center rounded-[5px] ${
        active ? "bg-[#dcdafa] text-[#39347f]" : "text-[#555] hover:bg-[#eeeeec]"
      }`}
    >
      {icon}
    </Link>
  );
}
