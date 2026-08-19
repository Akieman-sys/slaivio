"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import {
  Bell,
  BookOpen,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  CreditCard,
  FileQuestion,
  Home,
  Keyboard,
  Languages,
  LogOut,
  Menu,
  Megaphone,
  MessageSquareText,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TicketCheck,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { usePermissions } from "@/components/permissions/permission-provider";
import { OrganizationSwitcher } from "@/components/tenant/organization-switcher";
import { appNavigation, canAccessRoute, searchableAppRoutes, type AppRoute } from "@/config/app-navigation";
import { SESSION_EXPIRED_EVENT } from "@/services/api";
import { listNotifications, notificationAction, type CenterItem } from "@/services/notification-center";
import { SlaivioBrand } from "@/components/ui/slaivio-brand";

type FloatingPanel = "account" | "notifications" | "help" | null;
const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const utilityRoutes: readonly AppRoute[] = [
  { label: "Assistant Slaivio", href: "/app/assistant", icon: Sparkles, keywords: ["assistant", "ia", "automatisation", "escalade"] },
  { label: "Paramètres", href: "/app/settings", icon: Settings, permission: "organization.read", keywords: ["organisation", "équipe", "rôle", "sécurité", "paramètres"] },
  { label: "Notifications", href: "/app/notifications", icon: Bell, permission: "notifications.read", keywords: ["notification", "alerte", "préférence"] },
  { label: "Centre d’aide", href: "/app/support", icon: CircleHelp, permission: "support.read", keywords: ["aide", "support", "ticket", "documentation"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const { permissions, loading: permissionsLoading, available: permissionsAvailable } = usePermissions();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [floatingPanel, setFloatingPanel] = useState<FloatingPanel>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Clients: false,
    "Opérations": true,
    "Offre commerciale": false,
    Communication: false,
    Pilotage: false,
  });

  const groupedRoutes = useMemo(
    () => appNavigation.map((group) => ({
      ...group,
      routes: group.routes.filter((route) => canAccessRoute(route, permissions, permissionsAvailable)),
    })).filter((group) => group.routes.length),
    [permissions, permissionsAvailable],
  );

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    const routes = [...searchableAppRoutes, ...utilityRoutes].filter((route) =>
      canAccessRoute(route, permissions, permissionsAvailable),
    );
    if (!normalized) return routes;
    return routes.filter((route) =>
      [route.label, ...route.keywords].some((term) => term.toLocaleLowerCase("fr").includes(normalized)),
    );
  }, [query, permissions, permissionsAvailable]);

  useEffect(() => {
    const savedCollapsed = window.localStorage.getItem("slaivio.sidebar.collapsed");
    const savedGroups = window.localStorage.getItem("slaivio.sidebar.groups");
    setSidebarCollapsed(savedCollapsed === "1");
    if (savedGroups) {
      try {
        const parsed = JSON.parse(savedGroups) as Record<string, boolean>;
        const selected = appNavigation.find((group) => parsed[group.label])?.label || "Opérations";
        setOpenGroups(Object.fromEntries(appNavigation.map((group) => [group.label, group.label === selected])));
      } catch { /* Ignore stale preferences. */ }
    }
  }, []);

  useEffect(() => {
    const activeGroup = groupedRoutes.find((group) =>
      group.routes.some((route) => pathname === route.href || pathname.startsWith(`${route.href}/`)),
    );
    if (!activeGroup) return;
    setOpenGroups((current) => {
      const next = Object.fromEntries(groupedRoutes.map((group) => [group.label, group.label === activeGroup.label]));
      return Object.keys(next).every((key) => current[key] === next[key]) ? current : next;
    });
  }, [groupedRoutes, pathname]);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setFloatingPanel(null);
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    const onSessionExpired = () => setSessionExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  function openRoute(href: string) {
    setSearchOpen(false);
    setQuery("");
    setMobileOpen(false);
    router.push(href);
  }

  function togglePanel(panel: Exclude<FloatingPanel, null>) {
    setFloatingPanel((current) => current === panel ? null : panel);
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("slaivio.sidebar.collapsed", next ? "1" : "0");
      return next;
    });
  }

  function toggleGroup(label: string) {
    setOpenGroups((current) => {
      const willOpen = current[label] === false;
      const next = Object.fromEntries(groupedRoutes.map((group) => [group.label, willOpen && group.label === label]));
      window.localStorage.setItem("slaivio.sidebar.groups", JSON.stringify(next));
      return next;
    });
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
      window.localStorage.setItem("slaivio.sidebar.collapsed", "0");
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f5f6f6] text-[#25292e]">
      <button
        aria-label="Fermer la navigation"
        onClick={() => setMobileOpen(false)}
        className={`fixed inset-0 z-40 bg-black/25 lg:hidden ${mobileOpen ? "block" : "hidden"}`}
      />

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-[#dfe1e3] bg-white transition-[width,transform] duration-200 lg:relative lg:z-auto lg:translate-x-0 ${sidebarCollapsed ? "lg:w-[56px]" : "lg:w-[272px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className={`flex h-[60px] shrink-0 items-center border-b border-[#e3e4e5] ${sidebarCollapsed ? "lg:justify-center lg:px-1" : "px-4"}`}>
          <Link href="/app" className="flex items-center" onClick={() => setMobileOpen(false)}>
            <SlaivioBrand compact iconOnly={sidebarCollapsed} />
          </Link>
          <button onClick={() => setMobileOpen(false)} aria-label="Fermer" className="ml-auto rounded-[4px] p-1.5 text-[#555] hover:bg-[#f0f1f1] lg:hidden">
            <X size={17} />
          </button>
          <button onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Agrandir la navigation" : "Réduire la navigation"} title={sidebarCollapsed ? "Agrandir la navigation" : "Réduire la navigation"} className={`ml-auto hidden h-8 w-8 place-items-center rounded-[5px] text-[#656c74] hover:bg-[#f0f1f1] lg:grid ${sidebarCollapsed ? "lg:fixed lg:left-[44px] lg:top-[14px] lg:z-[60] lg:ml-0 lg:border lg:border-[#dfe1e3] lg:bg-white lg:shadow-sm" : ""}`}>
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav className={`min-h-0 flex-1 overflow-y-auto py-2.5 lg:overflow-hidden ${sidebarCollapsed ? "lg:px-2" : "px-3"}`} aria-label="Navigation Slaivio">
          <SidebarLink href="/app" icon={<Home size={18} />} active={pathname === "/app"} label="Accueil" collapsed={sidebarCollapsed} />
          {groupedRoutes.map((group) => (
            <section key={group.label} className={sidebarCollapsed ? "mt-1" : "mt-3"}>
              <button type="button" onClick={() => toggleGroup(group.label)} title={sidebarCollapsed ? group.label : undefined} aria-expanded={!sidebarCollapsed && openGroups[group.label] !== false} className={`flex w-full items-center text-[#53606c] hover:text-[#20252b] ${sidebarCollapsed ? "h-10 justify-center rounded-[6px] hover:bg-[#f0f2f3]" : "h-9 gap-2.5 px-2"}`}>
                <group.icon size={16} strokeWidth={1.8} className="shrink-0 text-[#69747f]" />
                {!sidebarCollapsed && <><span className="truncate text-[13px] font-[650] tracking-[-0.01em]">{group.label}</span><ChevronDown size={14} className={`ml-auto text-[#8a939c] transition-transform ${openGroups[group.label] === false ? "-rotate-90" : ""}`} /></>}
              </button>
              <div className={`ml-[17px] space-y-1 border-l border-[#e2e6e9] pl-2.5 ${sidebarCollapsed || openGroups[group.label] === false ? "hidden" : ""}`}>
                {group.routes.map((route) => (
                  <SidebarLink
                    key={route.href}
                    href={route.href}
                    icon={<route.icon size={16} />}
                    active={pathname === route.href || pathname.startsWith(`${route.href}/`)}
                    label={route.label}
                    collapsed={sidebarCollapsed}
                    nested
                  />
                ))}
              </div>
            </section>
          ))}
        </nav>

        <div className={`shrink-0 border-t border-[#e3e4e5] ${sidebarCollapsed ? "lg:p-1.5" : "p-3"}`}>
          {!permissionsLoading && !permissionsAvailable && (
            <div className="mb-2 rounded-[5px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
              Les droits n’ont pas pu être chargés. Les API continuent de protéger les actions.
            </div>
          )}
          <OrganizationSwitcher collapsed={sidebarCollapsed} />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-[60px] shrink-0 items-center border-b border-[#dfe1e3] bg-white px-3 sm:px-4">
          <button onClick={() => setMobileOpen(true)} aria-label="Ouvrir la navigation" className="mr-2 rounded-[5px] p-2 text-[#5f666e] hover:bg-[#f0f1f1] lg:hidden">
            <Menu size={19} />
          </button>

          <button
            onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }}
            className="absolute left-1/2 hidden h-9 w-[min(420px,42vw)] -translate-x-1/2 items-center rounded-[6px] border border-[#d7dade] bg-[#f8f8f7] px-3 text-left hover:border-[#bfc3c7] md:flex"
            aria-label="Ouvrir la recherche"
          >
            <Search size={15} className="text-[#656c74]" />
            <span className="ml-2 min-w-0 flex-1 truncate text-[13px] text-[#777e86]">Rechercher dans Slaivio</span>
            <kbd className="rounded border border-[#d8dade] bg-white px-1.5 py-0.5 text-[10px] text-[#737981]">Ctrl K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <HeaderButton label="Assistant" icon={<Sparkles size={16} />} onClick={() => router.push("/app/assistant")} active={pathname.startsWith("/app/assistant")} showLabel />
            <HeaderButton label="Aide" icon={<CircleHelp size={16} />} onClick={() => togglePanel("help")} active={floatingPanel === "help"} showLabel />
            <HeaderButton label="Notifications" icon={<Bell size={16} />} onClick={() => togglePanel("notifications")} active={floatingPanel === "notifications"} />
            <AccountTrigger onClick={() => togglePanel("account")} />
          </div>

          {floatingPanel && <button aria-label="Fermer le menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setFloatingPanel(null)} />}
          {floatingPanel === "help" && <div className="absolute right-[82px] top-[52px] z-50"><HelpMenu close={() => setFloatingPanel(null)} /></div>}
          {floatingPanel === "notifications" && <div className="absolute right-[48px] top-[52px] z-50"><NotificationsMenu close={() => setFloatingPanel(null)} /></div>}
          {floatingPanel === "account" && <div className="absolute right-3 top-[52px] z-50"><AccountMenu close={() => setFloatingPanel(null)} /></div>}
        </header>

        <main className="slaivio-operations min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#f5f6f6]">{children}</main>
      </section>

      {searchOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/25 px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Recherche Slaivio" onMouseDown={(event) => { if (event.currentTarget === event.target) setSearchOpen(false); }}>
          <div className="w-full max-w-xl overflow-hidden rounded-[8px] border border-[#cfd2d5] bg-white shadow-2xl">
            <label className="flex h-12 items-center border-b border-[#e6e7e8] px-4">
              <Search size={17} className="text-[#6b727a]" />
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && results[0]) openRoute(results[0].href); }} placeholder="Clients, dossiers, colis, expéditions..." className="ml-3 min-w-0 flex-1 bg-transparent text-[14px] outline-none" autoComplete="off" />
              <kbd className="text-[11px] text-[#7a8087]">Esc</kbd>
            </label>
            <div className="max-h-80 overflow-y-auto p-2">
              {!results.length && <p className="px-3 py-8 text-center text-sm text-[#777]">Aucun résultat.</p>}
              {results.map((route) => (
                <button key={route.href} onClick={() => openRoute(route.href)} className="flex w-full items-center gap-3 rounded-[5px] px-3 py-2.5 text-left text-sm hover:bg-[#f0f1f1] focus:bg-[#f0f1f1] focus:outline-none">
                  <route.icon size={16} className="text-[#606871]" />
                  <span>{route.label}</span>
                  <ChevronRight size={14} className="ml-auto text-[#9aa0a6]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sessionExpired && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4" role="alertdialog" aria-modal="true">
          <section className="w-full max-w-sm rounded-[8px] border border-[#d0d3d6] bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold">Votre session a expiré</h2>
            <p className="mt-2 text-sm leading-6 text-[#666d75]">Reconnectez-vous avant de poursuivre.</p>
            <button onClick={() => { const returnTo = `${window.location.pathname}${window.location.search}`; window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`); }} className="mt-5 inline-flex h-9 w-full items-center justify-center rounded-[5px] bg-[#272a2f] px-4 text-sm font-semibold text-white hover:bg-black">
              Se reconnecter
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function SidebarLink({ href, icon, active, label, collapsed = false, nested = false }: { href: string; icon: ReactNode; active: boolean; label: string; collapsed?: boolean; nested?: boolean }) {
  return (
    <Link data-ui="sidebar-link" data-active={active ? "true" : "false"} href={href} title={collapsed ? label : undefined} aria-current={active ? "page" : undefined} className={`flex min-h-[38px] items-center rounded-[6px] text-[14px] tracking-[-0.005em] ${collapsed ? "justify-center px-1" : nested ? "px-3" : "gap-2.5 px-2.5"} ${active ? "bg-[#e4f4ee] font-[630] text-[#145f49]" : "font-[460] text-[#3f474f] hover:bg-[#f2f4f4] hover:text-[#20252b]"}`}>
      {(!nested || collapsed) && <span className={active ? "text-[#16855f]" : "text-[#656c74]"}>{icon}</span>}
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function HeaderButton({ label, icon, onClick, active, showLabel = false }: { label: string; icon: ReactNode; onClick: () => void; active: boolean; showLabel?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-expanded={active} className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[5px] px-2 text-[13px] ${active ? "bg-[#eceeef]" : "hover:bg-[#f0f1f1]"}`}>
      {icon}{showLabel && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

function AccountTrigger({ onClick }: { onClick: () => void }) {
  if (!clerkEnabled) {
    return <FallbackAccountTrigger onClick={onClick} />;
  }
  return <ClerkAccountTrigger onClick={onClick} />;
}

function ClerkAccountTrigger({ onClick }: { onClick: () => void }) {
  const { user } = useUser();
  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Compte";
  return (
    <button type="button" onClick={onClick} aria-label="Compte" className="ml-1 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#087a46] text-[12px] font-semibold text-white ring-1 ring-black/5">
      <UserAvatar imageUrl={user?.imageUrl} name={name} size={32} />
    </button>
  );
}

function AccountMenu({ close }: { close: () => void }) {
  if (!clerkEnabled) {
    return <FallbackAccountMenu close={close} />;
  }
  return <ClerkAccountMenu close={close} />;
}

function ClerkAccountMenu({ close }: { close: () => void }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const name = user?.fullName || user?.firstName || "Utilisateur Slaivio";
  const email = user?.primaryEmailAddress?.emailAddress || "";
  return <AccountMenuContent close={close} name={name} email={email} imageUrl={user?.imageUrl} logout={() => signOut({ redirectUrl: "/sign-in" })} />;
}

function FallbackAccountTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Compte" className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#087a46] text-white ring-1 ring-black/5">
      <UserRound size={16} aria-hidden="true" />
    </button>
  );
}

function FallbackAccountMenu({ close }: { close: () => void }) {
  return <AccountMenuContent close={close} name="Utilisateur Slaivio" email="Session locale" logout={() => { window.location.assign("/sign-in"); }} />;
}

function AccountMenuContent({ close, name, email, imageUrl, logout }: { close: () => void; name: string; email: string; imageUrl?: string | null; logout: () => void | Promise<unknown> }) {
  const { permissions, available } = usePermissions();
  const canOpenPlatform = !available || permissions.some((permission) => permission.startsWith("platform."));
  return (
    <div className="w-[300px] overflow-hidden rounded-[7px] border border-[#d1d4d7] bg-white shadow-[0_16px_44px_rgba(15,23,42,.18)]">
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#087a46] text-sm font-semibold text-white"><UserAvatar imageUrl={imageUrl} name={name} size={40} /></div>
        <div className="min-w-0"><div className="truncate text-[13px] font-semibold">{name}</div><div className="truncate text-[11px] text-[#737a82]">{email}</div></div>
      </div>
      <MenuDivider />
      <MenuLink href="/app/settings?section=general" icon={<UserRound size={15} />} label="Compte et profil" close={close} />
      <MenuLink href="/app/settings?section=agency" icon={<Settings size={15} />} label="Organisation" close={close} />
      <MenuLink href="/app/settings?section=workspaces" icon={<Home size={15} />} label="Espaces et agences" close={close} />
      <MenuLink href="/app/settings?section=team" icon={<Users size={15} />} label="Équipe et accès" close={close} />
      <MenuLink href="/app/settings?section=roles" icon={<ShieldCheck size={15} />} label="Rôles et permissions" close={close} />
      <MenuLink href="/app/notifications?preferences=1" icon={<SlidersHorizontal size={15} />} label="Préférences de notifications" close={close} />
      <MenuLink href="/app/settings?section=general" icon={<Languages size={15} />} label="Langue et formats" close={close} />
      <MenuDisabled icon={<Palette size={15} />} label="Apparence" status="Bientôt" />
      <MenuDivider />
      <MenuLink href="/app/settings?section=integrations" icon={<Plug size={15} />} label="Intégrations" close={close} />
      <MenuLink href="/app/settings?section=billing" icon={<CreditCard size={15} />} label="Abonnement et facturation" close={close} />
      <MenuLink href="/app/settings?section=security" icon={<ShieldCheck size={15} />} label="Sécurité" close={close} />
      {canOpenPlatform && <MenuLink href="/app/platform" icon={<ShieldCheck size={15} />} label="Console Super Admin" close={close} />}
      <MenuDivider />
      <MenuDisabled icon={<Trash2 size={15} />} label="Corbeille" status="Bientôt" />
      <button type="button" onClick={async () => { close(); await logout(); }} className={menuClass}>
        <LogOut size={15} /> Se déconnecter
      </button>
    </div>
  );
}

function UserAvatar({ imageUrl, name, size }: { imageUrl?: string | null; name: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return <Image src={imageUrl} width={size} height={size} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />;
  }
  const initial = name.trim().slice(0, 1).toUpperCase();
  return initial ? <span aria-hidden="true">{initial}</span> : <UserRound size={Math.round(size * 0.5)} aria-hidden="true" />;
}

function HelpMenu({ close }: { close: () => void }) {
  return (
    <div className="w-[264px] overflow-hidden rounded-[7px] border border-[#d1d4d7] bg-white py-2 shadow-[0_16px_44px_rgba(15,23,42,.18)]">
      <div className="px-4 pb-1.5 pt-1 text-[10px] font-semibold uppercase text-[#8a9097]">Aide et assistance</div>
      <MenuLink href="/app/support?view=articles" icon={<BookOpen size={15} />} label="Centre d’aide" close={close} />
      <MenuLink href="/app/support?new=1" icon={<MessageSquareText size={15} />} label="Contacter le support" close={close} />
      <MenuLink href="/app/support?view=tickets" icon={<TicketCheck size={15} />} label="Mes tickets" close={close} />
      <MenuDivider />
      <MenuDisabled icon={<Keyboard size={15} />} label="Raccourcis clavier" status="Bientôt" />
      <MenuDisabled icon={<Megaphone size={15} />} label="Nouveautés produit" status="Bientôt" />
      <MenuDisabled icon={<Code2 size={15} />} label="Documentation API" status="Non publiée" />
      <MenuDisabled icon={<FileQuestion size={15} />} label="Guides opérationnels" status="Bientôt" />
    </div>
  );
}

function NotificationsMenu({ close }: { close: () => void }) {
  const [items, setItems] = useState<CenterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"unread" | "read">("unread");
  const [query, setQuery] = useState("");

  useEffect(() => {
    listNotifications({ status: tab === "unread" ? "UNREAD" : "READ", page_size: 20 })
      .then((result) => setItems(result.items))
      .catch(() => setError("Notifications indisponibles."))
      .finally(() => setLoading(false));
  }, [tab]);

  const filtered = items.filter((item) => `${item.title} ${item.message}`.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")));

  async function markRead(item: CenterItem) {
    if (!item.read_at) {
      await notificationAction(item, "read").catch(() => undefined);
    }
    close();
  }

  return (
    <div className="flex h-[560px] w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[7px] border border-[#d1d4d7] bg-white shadow-[0_16px_44px_rgba(15,23,42,.18)]">
      <div className="flex h-12 shrink-0 items-center border-b border-[#e5e6e7] px-4">
        <div className="text-[13px] font-semibold">Notifications</div>
        <div className="ml-auto flex rounded-[5px] bg-[#f0f1f1] p-0.5">
          <button type="button" onClick={() => { setLoading(true); setTab("unread"); }} className={`h-7 rounded-[4px] px-2.5 text-[11px] ${tab === "unread" ? "bg-white shadow-sm" : ""}`}>Non lues</button>
          <button type="button" onClick={() => { setLoading(true); setTab("read"); }} className={`h-7 rounded-[4px] px-2.5 text-[11px] ${tab === "read" ? "bg-white shadow-sm" : ""}`}>Lues</button>
        </div>
      </div>
      <div className="border-b border-[#eceeef] p-3">
        <label className="flex h-8 items-center gap-2 rounded-[5px] border border-[#d7dade] bg-[#f8f8f7] px-2 focus-within:border-[#7771ed]">
          <Search size={14} className="text-[#737a82]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" placeholder="Rechercher" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full min-h-36 items-center justify-center" aria-label="Chargement des notifications">
            <span className="flex items-center gap-1.5">
              {[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#169c68]" style={{ animationDelay: `${dot * 140}ms` }} />)}
            </span>
          </div>
        ) : error ? <p className="p-6 text-center text-[12px] text-red-600">{error}</p> : !filtered.length ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center"><CheckCheck size={24} className="text-[#a1a7ad]" /><p className="mt-3 text-[13px] font-medium">Aucune notification {tab === "unread" ? "non lue" : "lue"}</p><p className="mt-1 text-[11px] leading-5 text-[#858b92]">Les mises à jour opérationnelles apparaîtront ici.</p></div>
        ) : filtered.map((item) => (
          <Link key={`${item.source}-${item.id}`} href={notificationTarget(item)} onClick={() => markRead(item)} className="flex gap-3 border-b border-[#eceeef] px-4 py-3 hover:bg-[#f7f8f8]">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.priority === "CRITICAL" ? "bg-red-500" : item.priority === "HIGH" ? "bg-amber-500" : "bg-[#5b55e7]"}`} />
            <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold">{item.title}</span><span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-[#666e77]">{item.message}</span><span className="mt-1.5 block text-[10px] text-[#959ba1]">{new Date(item.created_at).toLocaleString("fr-FR")}</span></span>
          </Link>
        ))}
      </div>
      <div className="grid shrink-0 grid-cols-2 border-t border-[#e5e6e7] p-2">
        <Link href="/app/notifications" onClick={close} className="flex h-8 items-center justify-center rounded-[5px] text-[11px] font-medium hover:bg-[#f0f1f1]">Tout afficher</Link>
        <Link href="/app/notifications?preferences=1" onClick={close} className="flex h-8 items-center justify-center gap-1.5 rounded-[5px] text-[11px] font-medium hover:bg-[#f0f1f1]"><Settings size={13} />Préférences</Link>
      </div>
    </div>
  );
}

function notificationTarget(item: CenterItem) {
  const category = item.category.toUpperCase();
  if (category.includes("PACKAGE")) return "/app/packages";
  if (category.includes("SHIPMENT")) return "/app/shipments";
  if (category.includes("PAYMENT") || category.includes("FINANCE")) return "/app/finance";
  if (category.includes("COMPLIANCE") || category.includes("DOCUMENT")) return "/app/documents";
  return "/app/notifications";
}

const menuClass = "flex min-h-9 w-full items-center gap-2.5 px-4 text-left text-[12px] text-[#353b42] hover:bg-[#f2f3f3]";

function MenuLink({ href, icon, label, close }: { href: string; icon: ReactNode; label: string; close: () => void }) {
  return <Link href={href} onClick={close} className={menuClass}>{icon}<span className="truncate">{label}</span><ChevronRight size={13} className="ml-auto text-[#a0a5aa]" /></Link>;
}

function MenuDisabled({ icon, label, status }: { icon: ReactNode; label: string; status: string }) {
  return <button type="button" disabled title={`${label} : ${status}`} className="flex min-h-9 w-full cursor-not-allowed items-center gap-2.5 px-4 text-left text-[12px] text-[#a3a8ad]">{icon}<span className="truncate">{label}</span><span className="ml-auto rounded bg-[#f0f1f1] px-1.5 py-0.5 text-[9px] font-medium text-[#8a9096]">{status}</span></button>;
}

function MenuDivider() {
  return <div className="mx-4 my-2 h-px bg-[#eceeef]" />;
}
