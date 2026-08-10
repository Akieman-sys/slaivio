"use client";

import {
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Globe2,
  Grid2X2,
  Home,
  Languages,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Star,
  Sun,
  Trash2,
  Upload,
  Users,
  Wand2,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { usePermissions } from "@/components/permissions/permission-provider";
import { appNavigation, canAccessRoute, searchableAppRoutes } from "@/config/app-navigation";
import { SESSION_EXPIRED_EVENT } from "@/services/api";

type FloatingPanel = "account" | "notifications" | "help" | null;
type AccountPanel = "main" | "notificationPrefs" | "language" | "appearance";

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
  const [accountPanel, setAccountPanel] = useState<AccountPanel>("main");

  const groupedRoutes = useMemo(
    () =>
      appNavigation.map((group) => ({
        ...group,
        routes: group.routes.filter((route) => canAccessRoute(route, permissions, permissionsAvailable)),
      })),
    [permissions, permissionsAvailable],
  );

  const allRoutes = useMemo(() => groupedRoutes.flatMap((group) => group.routes), [groupedRoutes]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    const allowed = searchableAppRoutes.filter((route) =>
      canAccessRoute(route, permissions, permissionsAvailable),
    );
    if (!normalized) return allowed;
    return allowed.filter((route) =>
      [route.label, ...route.keywords].some((term) => term.toLocaleLowerCase("fr").includes(normalized)),
    );
  }, [query, permissions, permissionsAvailable]);

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

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f8f8f7] text-[#1f2328]">
      <button
        aria-label="Fermer la navigation"
        onClick={() => setMobileOpen(false)}
        className={`fixed inset-0 z-40 bg-black/25 lg:hidden ${mobileOpen ? "block" : "hidden"}`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col border-r border-[#d9d9d6] bg-white transition-transform lg:relative lg:z-auto lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[58px] shrink-0 items-center gap-3 border-b border-[#d9d9d6] px-4">
          <Link href="/app" className="flex min-w-0 items-center gap-2" onClick={() => setMobileOpen(false)}>
            <Image src="/slaivio-icon-official.png" width={30} height={30} alt="" className="rounded-[4px]" />
            <Image
              src="/slaivio-logo-official-dark.png"
              width={104}
              height={34}
              alt="Slaivio"
              className="h-auto w-[96px]"
              priority
            />
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer"
            className="ml-auto rounded-[4px] p-1.5 text-[#555] hover:bg-[#f0f0ef] lg:hidden"
          >
            <X size={17} />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="Navigation Slaivio">
          <SidebarLink href="/app" icon={<Home size={18} />} active={pathname === "/app"} label="Home" />
          <SidebarLink href="/app/starred" icon={<Star size={18} />} active={pathname === "/app/starred"} label="Starred" />
          <SidebarLink href="/app/shared" icon={<Upload size={18} />} active={pathname === "/app/shared"} label="Shared" />

          <div className="mt-3">
            <div className="flex h-9 items-center px-2 text-[15px] text-[#2f3437]">
              <Users size={18} className="mr-2" />
              <span className="font-medium">Workspaces</span>
              <button aria-label="Ajouter un workspace" className="ml-auto rounded-[4px] p-1 text-[#666] hover:bg-[#f0f0ef]">
                <Plus size={17} />
              </button>
              <button aria-label="Ouvrir les workspaces" className="rounded-[4px] p-1 text-[#666] hover:bg-[#f0f0ef]">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="mt-1 space-y-0.5">
              {groupedRoutes.map((group) => (
                <div key={group.label}>
                  <div className="mt-2 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b8f94]">
                    {group.label}
                  </div>
                  {group.routes.map((route) => (
                    <SidebarLink
                      key={route.href}
                      href={route.href}
                      icon={<route.icon size={16} />}
                      active={pathname === route.href || pathname.startsWith(`${route.href}/`)}
                      label={route.label}
                      compact
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </nav>

        <div className="shrink-0 border-t border-[#e6e6e3] px-3 py-3">
          {!permissionsLoading && !permissionsAvailable && (
            <div className="mb-2 rounded-[5px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
              Droits indisponibles. Les API restent l’autorité finale.
            </div>
          )}
          <SidebarLink href="/app/support" icon={<BookOpen size={16} />} active={pathname.startsWith("/app/support")} label="Templates and apps" compact />
          <SidebarLink href="/app/reports" icon={<Globe2 size={16} />} active={pathname.startsWith("/app/reports")} label="Marketplace" compact />
          <button className="flex min-h-[34px] w-full items-center gap-2 rounded-[4px] px-2 text-left text-[14px] text-[#2f3437] hover:bg-[#f0f0ef]">
            <Upload size={16} />
            Import
          </button>
          <Link
            href={allRoutes[0]?.href ?? "/app/dossiers"}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-[5px] bg-[#1a73e8] px-3 text-[14px] font-medium text-white shadow-sm hover:bg-[#1768d1]"
          >
            <Plus size={17} />
            Create
          </Link>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-[58px] shrink-0 items-center border-b border-[#d9d9d6] bg-white px-3">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir la navigation"
            className="mr-2 rounded-[4px] p-2 text-[#5f6368] hover:bg-[#f0f0ef] lg:hidden"
          >
            <Menu size={19} />
          </button>

          <button
            onClick={() => {
              setSearchOpen(true);
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
            className="absolute left-1/2 flex h-[34px] w-[min(356px,45vw)] -translate-x-1/2 items-center rounded-full border border-[#d9d9d6] bg-white px-4 text-left shadow-sm hover:border-[#c6c6c3]"
            aria-label="Ouvrir la recherche"
          >
            <Search size={16} className="text-[#4f555a]" />
            <span className="ml-2 min-w-0 flex-1 truncate text-[13px] text-[#6b7075]">Search...</span>
            <kbd className="text-[12px] text-[#7a7f84]">ctrl K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setFloatingPanel(floatingPanel === "help" ? null : "help")}
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[14px] text-[#2f3437] hover:bg-[#f0f0ef]"
              >
                <CircleHelp size={16} />
                Help
              </button>
              {floatingPanel === "help" && <HelpMenu />}
            </div>
            <div className="relative">
              <button
                onClick={() => setFloatingPanel(floatingPanel === "notifications" ? null : "notifications")}
                aria-label="Notifications"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d9d9d6] text-[#2f3437] shadow-sm hover:bg-[#f0f0ef]"
              >
                <Bell size={16} />
              </button>
              {floatingPanel === "notifications" && <NotificationsMenu />}
            </div>
            <div className="relative">
              <button
                onClick={() => {
                  setFloatingPanel(floatingPanel === "account" ? null : "account");
                  setAccountPanel("main");
                }}
                aria-label="Compte"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0f9aaa] text-[14px] font-semibold text-white shadow-sm"
              >
                J
              </button>
              {floatingPanel === "account" && (
                <AccountMenu panel={accountPanel} setPanel={setAccountPanel} />
              )}
            </div>
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#f8f8f7]">{children}</main>
      </section>

      {searchOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/25 px-4 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Recherche Slaivio"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSearchOpen(false);
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-[7px] border border-[#cfd1d4] bg-white shadow-2xl">
            <label className="flex h-12 items-center border-b border-[#e6e6e3] px-4">
              <Search size={17} className="text-[#6b7075]" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && results[0]) openRoute(results[0].href);
                }}
                placeholder="Search..."
                className="ml-3 min-w-0 flex-1 bg-transparent text-[14px] outline-none"
                autoComplete="off"
              />
              <kbd className="text-[12px] text-[#7a7f84]">Esc</kbd>
            </label>
            <div className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-[#777]">Aucune section disponible.</p>
              )}
              {results.map((route) => (
                <button
                  key={route.href}
                  onClick={() => openRoute(route.href)}
                  className="flex w-full items-center gap-3 rounded-[4px] px-3 py-2.5 text-left text-sm text-[#2f3437] hover:bg-[#f0f0ef] focus:bg-[#f0f0ef] focus:outline-none"
                >
                  <route.icon size={16} className="text-[#5f6368]" />
                  <span>{route.label}</span>
                  <span className="ml-auto text-xs text-[#8b8f94]">{route.href}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sessionExpired && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4" role="alertdialog" aria-modal="true">
          <section className="w-full max-w-sm rounded-[7px] border border-[#d0d0cc] bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-[#222]">Votre session a expiré</h2>
            <p className="mt-2 text-sm leading-6 text-[#666]">Reconnectez-vous avant de poursuivre.</p>
            <button
              onClick={() => {
                const returnTo = `${window.location.pathname}${window.location.search}`;
                window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
              }}
              className="mt-5 inline-flex h-9 w-full items-center justify-center rounded-[5px] bg-[#1f2328] px-4 text-sm font-semibold text-white hover:bg-black"
            >
              Se reconnecter
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function SidebarLink({
  href,
  icon,
  active,
  label,
  compact = false,
}: {
  href: string;
  icon: ReactNode;
  active: boolean;
  label: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-[39px] items-center gap-2 rounded-[2px] px-3 text-[15px] ${
        compact ? "min-h-[34px] text-[14px]" : ""
      } ${
        active
          ? "border border-[#9aa0a6] bg-[#f2f3f7] font-medium text-[#202124]"
          : "text-[#2f3437] hover:bg-[#f5f5f3]"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

function AccountMenu({
  panel,
  setPanel,
}: {
  panel: AccountPanel;
  setPanel: (panel: AccountPanel) => void;
}) {
  if (panel === "notificationPrefs") return <AccountSubPanel title="Notification preferences" back={() => setPanel("main")} />;
  if (panel === "language") {
    return (
      <AccountSubPanel title="Language preferences" back={() => setPanel("main")}>
        {["Automatic", "English (United States)", "Français", "Deutsch", "Español"].map((language) => (
          <button key={language} className="flex h-9 w-full items-center justify-between px-5 text-left text-[13px] hover:bg-[#f5f5f3]">
            {language}
            {language === "Français" && <span>✓</span>}
          </button>
        ))}
      </AccountSubPanel>
    );
  }
  if (panel === "appearance") {
    return (
      <AccountSubPanel title="Appearance" back={() => setPanel("main")} badge="Beta">
        <p className="px-5 py-2 text-[12px] leading-5 text-[#6b7075]">
          Choose if Slaivio should be light, dark, or sync with your system.
        </p>
        <button className="flex h-9 w-full items-center justify-between px-5 text-left text-[13px] hover:bg-[#f5f5f3]">
          <span className="flex items-center gap-2"><Sun size={15} />Light</span>✓
        </button>
        <button className="flex h-9 w-full items-center gap-2 px-5 text-left text-[13px] hover:bg-[#f5f5f3]">
          <Moon size={15} />Dark
        </button>
        <button className="flex h-9 w-full items-center gap-2 px-5 text-left text-[13px] hover:bg-[#f5f5f3]">
          <Settings size={15} />Use system setting
        </button>
      </AccountSubPanel>
    );
  }
  return (
    <div className="absolute right-0 top-10 z-50 w-[298px] overflow-hidden rounded-[5px] border border-[#d3d3d0] bg-white text-[#2f3437] shadow-2xl">
      <div className="px-5 py-4 text-[13px]">
        <div>Jérémie Bawaba</div>
        <div className="mt-1">bawabajeremie@gmail.com</div>
      </div>
      <MenuDivider />
      <MenuButton href="/app/settings" icon={<Users size={15} />} label="Account" />
      <MenuButton icon={<Users size={15} />} label="Manage groups" right={<Badge>Business</Badge>} />
      <MenuButton icon={<Bell size={15} />} label="Notification preferences" right={<ChevronRight size={15} />} onClick={() => setPanel("notificationPrefs")} />
      <MenuButton icon={<Languages size={15} />} label="Language preferences" right={<ChevronRight size={15} />} onClick={() => setPanel("language")} />
      <MenuButton icon={<Sun size={15} />} label="Appearance" right={<><Badge>Beta</Badge><ChevronRight size={15} /></>} onClick={() => setPanel("appearance")} />
      <MenuDivider />
      <MenuButton href="/app/support" icon={<BookOpen size={15} />} label="Contact sales" />
      <MenuButton icon={<Wand2 size={15} />} label="Upgrade" />
      <MenuButton icon={<Upload size={15} />} label="Tell a friend" />
      <MenuDivider />
      <MenuButton href="/app/settings" icon={<Settings size={15} />} label="Integrations" />
      <MenuButton href="/app/reports" icon={<Grid2X2 size={15} />} label="Builder hub" />
      <MenuDivider />
      <MenuButton icon={<Trash2 size={15} />} label="Trash" />
      <MenuButton href="/sign-in" icon={<LogOut size={15} />} label="Log out" />
    </div>
  );
}

function AccountSubPanel({
  title,
  badge,
  back,
  children,
}: {
  title: string;
  badge?: string;
  back: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="absolute right-0 top-10 z-50 w-[298px] overflow-hidden rounded-[5px] border border-[#d3d3d0] bg-white text-[#2f3437] shadow-2xl">
      <div className="flex h-[60px] items-center gap-3 border-b border-[#eeeeeb] px-5 text-[13px]">
        <button onClick={back} aria-label="Retour" className="rounded-[4px] p-1 hover:bg-[#f0f0ef]">
          <ChevronLeft size={16} />
        </button>
        <span>{title}</span>
        {badge && <Badge>{badge}</Badge>}
      </div>
      {children ?? (
        <div className="p-5">
          <label className="flex items-start gap-3 border-b border-[#eeeeeb] py-4 text-[13px]">
            <input type="checkbox" defaultChecked className="mt-1 h-4 w-4 accent-[#1a73e8]" />
            <span>
              <span className="block font-medium">Mobile push notifications</span>
              <span className="mt-1 block text-[12px] leading-5 text-[#6b7075]">
                Receive mobile push notifications for comments, mentions and access requests.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 py-4 text-[13px]">
            <input type="checkbox" defaultChecked className="mt-1 h-4 w-4 accent-[#1a73e8]" />
            <span>
              <span className="block font-medium">Email</span>
              <span className="mt-1 block text-[12px] leading-5 text-[#6b7075]">
                Receive email notifications for operational updates.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function NotificationsMenu() {
  return (
    <div className="absolute right-0 top-10 z-50 h-[535px] w-[360px] overflow-hidden rounded-[5px] border border-[#d3d3d0] bg-white shadow-2xl">
      <div className="flex h-[52px] items-center gap-2 px-5">
        <div className="text-[13px] font-medium">Notifications</div>
        <button className="ml-auto rounded-[5px] bg-[#f0f0ef] px-3 py-1.5 text-[13px]">Unread</button>
        <button className="rounded-[5px] px-3 py-1.5 text-[13px] hover:bg-[#f0f0ef]">Read</button>
      </div>
      <div className="px-5">
        <label className="flex h-[34px] items-center gap-2 rounded-[3px] border-2 border-[#1a73e8] px-2">
          <Search size={15} className="text-[#6b7075]" />
          <input className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" placeholder="Search notifications" />
        </label>
      </div>
      <div className="flex h-[420px] items-center justify-center text-[13px] text-[#9aa0a6]">
        No unread notifications
      </div>
    </div>
  );
}

function HelpMenu() {
  return (
    <div className="absolute right-0 top-10 z-50 w-[242px] overflow-hidden rounded-[5px] border border-[#d3d3d0] bg-white py-3 shadow-2xl">
      <div className="px-5 pb-2 text-[12px] text-[#6b7075]">Support</div>
      <MenuButton href="/app/support" icon={<BookOpen size={15} />} label="Help center" />
      <MenuButton icon={<Globe2 size={15} />} label="Ask the community" />
      <MenuButton href="/app/support" icon={<CircleHelp size={15} />} label="Message support" />
      <MenuButton href="/app/support" icon={<Upload size={15} />} label="Contact sales" active />
      <div className="px-5 pb-2 pt-3 text-[12px] text-[#6b7075]">Education</div>
      <MenuButton icon={<Settings size={15} />} label="Keyboard shortcuts" />
      <MenuButton icon={<ChevronRight size={15} />} label="Webinars" />
      <MenuButton icon={<Wand2 size={15} />} label="What's new" />
      <MenuButton icon={<Grid2X2 size={15} />} label="API documentation" />
      <div className="px-5 pb-2 pt-3 text-[12px] text-[#6b7075]">Upgrade</div>
      <MenuButton icon={<Wand2 size={15} />} label="Plans and pricing" />
    </div>
  );
}

function MenuButton({
  href,
  icon,
  label,
  right,
  onClick,
  active,
}: {
  href?: string;
  icon: ReactNode;
  label: string;
  right?: ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
      {icon}
      <span className="truncate">{label}</span>
      {right && <span className="ml-auto flex items-center gap-1">{right}</span>}
    </>
  );
  const className = `flex h-[34px] w-full items-center gap-3 px-5 text-left text-[13px] ${
    active ? "bg-[#f0f0ef]" : "hover:bg-[#f5f5f3]"
  }`;
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function MenuDivider() {
  return <div className="mx-5 my-2 h-px bg-[#eeeeeb]" />;
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-[#d6efff] px-2 py-0.5 text-[11px] text-[#1772a6]">{children}</span>;
}
