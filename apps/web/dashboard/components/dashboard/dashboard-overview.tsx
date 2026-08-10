"use client";

import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import {
  Activity,
  CalendarDays,
  CheckSquare,
  Filter,
  Grid2X2,
  MoreVertical,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { getDashboardHome, type DashboardHome } from "@/services/dashboard";

type AgencyState = "loading" | "ready" | "none" | "error";

const monthDays = Array.from({ length: 35 }, (_, index) => index + 1);

export function DashboardOverviewPage() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) return <DashboardOverviewContent authUnavailable />;
  return <AuthenticatedDashboardOverview />;
}

function AuthenticatedDashboardOverview() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  return <DashboardOverviewContent getToken={getToken} isLoaded={isLoaded} isSignedIn={isSignedIn} />;
}

function DashboardOverviewContent({
  getToken,
  isLoaded = true,
  isSignedIn = false,
  authUnavailable = false,
}: {
  getToken?: ReturnType<typeof useAuth>["getToken"];
  isLoaded?: boolean;
  isSignedIn?: boolean;
  authUnavailable?: boolean;
}) {
  const [homeData, setHomeData] = useState<DashboardHome | null>(null);
  const [agencyState, setAgencyState] = useState<AgencyState>(authUnavailable ? "none" : "loading");
  const [agencyError, setAgencyError] = useState("");
  const [tab, setTab] = useState<"dashboard" | "calendar">("dashboard");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (authUnavailable) return;
    if (!isLoaded) return;
    if (!getToken) {
      setAgencyState("none");
      return;
    }
    if (!isSignedIn) {
      setAgencyState("none");
      return;
    }
    let active = true;
    getToken()
      .then((token) => getDashboardHome(token))
      .then((home) => {
        if (!active) return;
        setHomeData(home);
        setAgencyState(home.status === "no_workspace" || !home.workspace.org_id ? "none" : "ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAgencyState("error");
        if (!axios.isAxiosError(error) || !error.response) {
          setAgencyError("L’API Slaivio est momentanément injoignable.");
        } else if (error.response.status === 401) {
          setAgencyError("Votre session a expiré.");
        } else if ([403, 409].includes(error.response.status)) {
          setAgencyError("Cette agence n’est pas correctement provisionnée pour votre compte.");
        } else {
          setAgencyError(`Le service a répondu avec le statut ${error.response.status}.`);
        }
      });
    return () => {
      active = false;
    };
  }, [getToken, isLoaded, isSignedIn, authUnavailable]);

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <header className="border-b border-[#d9d9d6] bg-white">
        <div className="flex min-h-[48px] items-center justify-between px-6">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[#2f2f32]">Slaivio Overview</h1>
          <div className="flex items-center gap-2">
            <button className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-[#d1d1ce] bg-white px-3 text-[13px] text-[#333] hover:bg-[#f2f2ef]">
              <Grid2X2 size={15} />
              Cartes
            </button>
            <Link
              href="/app/dossiers"
              className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-[#625df5] px-3 text-[13px] font-semibold text-white hover:bg-[#514ce8]"
            >
              <Plus size={15} />
              Créer
            </Link>
          </div>
        </div>
        <div className="flex min-h-[48px] items-end justify-between px-6">
          <div className="flex h-full items-end gap-4">
            <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={<Grid2X2 size={17} />} label="Dashboard" />
            <TabButton active={tab === "calendar"} onClick={() => setTab("calendar")} icon={<CalendarDays size={17} />} label="Calendrier" />
          </div>
          <div className="relative flex h-[48px] items-center gap-2">
            <button
              onClick={() => setFiltersOpen((value) => !value)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-[#d1d1ce] bg-white px-3 text-[13px] text-[#333] hover:bg-[#f2f2ef]"
            >
              <Filter size={15} />
              Filtres
            </button>
            <button className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-[#d1d1ce] bg-white px-3 text-[13px] text-[#333] hover:bg-[#f2f2ef]">
              <CalendarDays size={15} />
              Date range
            </button>
            {filtersOpen && <FiltersPopover />}
          </div>
        </div>
      </header>

      {agencyState === "error" && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2.5 text-[13px] text-red-700">
          {agencyError}
        </div>
      )}

      {tab === "dashboard" ? (
        <div className="grid gap-4 p-4 xl:grid-cols-[1.15fr_1fr]">
          <DashboardPanel icon={<CalendarDays size={17} />} title="Éléments à venir" subtitle="Dossiers, départs et tâches planifiées">
            <PanelBody state={agencyState} empty="Nothing to show!">
              {homeData?.attention_items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-start gap-3 border-b border-[#ececea] px-3 py-2.5 text-[13px] last:border-0 hover:bg-[#fafaf9]"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      item.priority === "HIGH" ? "bg-red-500" : "bg-amber-400"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-[#272727]">{item.title}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-[#666]">{item.message}</span>
                  </span>
                </Link>
              ))}
            </PanelBody>
          </DashboardPanel>

          <DashboardPanel icon={<Activity size={17} />} title="Activité récente" subtitle="Derniers changements dans l’organisation">
            <PanelBody state={agencyState} empty="Aucune activité récente.">
              {homeData?.notifications.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-start gap-3 border-b border-[#ececea] px-3 py-2.5 text-[13px] last:border-0">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.is_read ? "bg-slate-300" : "bg-[#625df5]"}`} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-[#272727]">{item.title}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-[#666]">{item.message}</span>
                  </span>
                </div>
              ))}
            </PanelBody>
          </DashboardPanel>

          <DashboardPanel icon={<CheckSquare size={17} />} title="Travail assigné" subtitle="Actions de l’équipe opérationnelle">
            <PanelBody state={agencyState} empty="No data">
              {null}
            </PanelBody>
          </DashboardPanel>

          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <DashboardPanel icon={<Grid2X2 size={17} />} title="Modules par espace" subtitle="Volume par module métier">
              <PanelBody state={agencyState} empty="Chart placeholder">
                {homeData && homeData.resources.length > 0 ? (
                  <div className="grid grid-cols-2 gap-px bg-[#e5e5e2]">
                    {homeData.resources.slice(0, 6).map((resource) => (
                      <Link key={resource.key} href={resource.href} className="bg-white px-3 py-3 hover:bg-[#fafaf9]">
                        <span className="block truncate text-[13px] font-medium text-[#2b2b2b]">{resource.name}</span>
                        <span className="mt-1 block text-[12px] text-[#777]">
                          {resource.count === null ? resource.label : `${resource.count.toLocaleString("fr-FR")} ${resource.label}`}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </PanelBody>
            </DashboardPanel>

            <section className="rounded-[6px] border border-[#d2d2cf] bg-white p-4 shadow-sm">
              <div className="text-[13px] font-medium text-[#333]">Statuts</div>
              <div className="mt-4 grid gap-2">
                {["Non démarré", "Actif", "Terminé", "Fermé"].map((label, index) => (
                  <div key={label} className="rounded-[5px] border border-[#d9d9d6] bg-white p-3">
                    <div className="text-[12px] text-[#666]">{label}</div>
                    <div className="mt-1 text-[22px] font-semibold text-[#333]">{index === 1 ? homeData?.unread_count || 0 : 0}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <CalendarView />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-[48px] items-center gap-2 border-b-2 px-1 text-[14px] font-medium ${
        active ? "border-[#625df5] text-[#222]" : "border-transparent text-[#555] hover:text-[#222]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function DashboardPanel({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="min-h-[392px] overflow-hidden rounded-[6px] border border-[#d2d2cf] bg-white shadow-sm">
      <header className="flex items-start gap-2 px-5 py-4">
        <span className="mt-0.5 text-[#333]">{icon}</span>
        <div>
          <h2 className="text-[14px] font-medium text-[#252525]">{title}</h2>
          <p className="mt-0.5 text-[12px] text-[#666]">{subtitle}</p>
        </div>
        <button aria-label={`Filtrer ${title}`} className="ml-auto rounded-[4px] p-1 text-[#666] hover:bg-[#eeeeec]">
          <Filter size={15} />
        </button>
        <button aria-label={`Options ${title}`} className="rounded-[4px] p-1 text-[#666] hover:bg-[#eeeeec]">
          <MoreVertical size={15} />
        </button>
      </header>
      <div className="mx-4 mb-4 min-h-[312px] overflow-hidden rounded-[6px] border border-dashed border-[#d7d7d4]">{children}</div>
    </section>
  );
}

function PanelBody({ state, empty, children }: { state: AgencyState; empty: string; children: ReactNode }) {
  if (state === "loading") {
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-11 animate-pulse rounded-[4px] bg-[#f1f1ef]" />
        ))}
      </div>
    );
  }
  if (state === "error") return <CenteredText text="Données temporairement indisponibles." />;
  if (state === "none") return <CenteredText text="Associez une agence pour afficher ces données." />;
  return children ? <>{children}</> : <CenteredText text={empty} />;
}

function CenteredText({ text }: { text: string }) {
  return <div className="flex min-h-[312px] items-center justify-center px-6 text-center text-[14px] text-[#666]">{text}</div>;
}

function FiltersPopover() {
  return (
    <div className="absolute right-0 top-11 z-20 w-[510px] rounded-[5px] border border-[#d0d0cc] bg-white shadow-xl">
      <div className="border-b border-[#d9d9d6] px-4 py-3 text-[18px] font-medium">Filtres</div>
      <div className="space-y-6 p-4">
        <FilterSection title="Membres" placeholder="Search members..." value="Bawaba Akiemane" icon="B" />
        <FilterSection title="Espaces" placeholder="Search spaces..." value="New Social Space" icon="N" />
      </div>
    </div>
  );
}

function FilterSection({ title, placeholder, value, icon }: { title: string; placeholder: string; value: string; icon: string }) {
  return (
    <section>
      <h3 className="text-[15px] font-medium text-[#333]">{title}</h3>
      <label className="mt-3 flex h-9 items-center gap-2 rounded-[4px] border border-[#d1d1ce] px-2">
        <Search size={16} className="text-[#666]" />
        <input className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" placeholder={placeholder} />
      </label>
      <div className="mt-2 inline-flex min-w-[235px] items-center gap-2 rounded-[4px] border border-[#d1d1ce] px-3 py-2 text-[14px]">
        <span className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-[#625df5] text-[12px] font-semibold text-white">
          {icon}
        </span>
        {value}
      </div>
    </section>
  );
}

function CalendarView() {
  return (
    <div className="bg-white">
      <div className="flex min-h-[52px] items-center gap-3 border-b border-[#d9d9d6] px-4">
        <button className="rounded-[4px] border border-[#d1d1ce] px-3 py-1.5 text-[13px]">Today</button>
        <button className="rounded-[4px] bg-[#333] px-3 py-1.5 text-[13px] text-white">Month</button>
        <button className="rounded-[4px] px-3 py-1.5 text-[13px] hover:bg-[#eeeeec]">Week</button>
        <button className="rounded-[4px] px-3 py-1.5 text-[13px] hover:bg-[#eeeeec]">Day</button>
        <button className="rounded-[4px] px-3 py-1.5 text-[13px] hover:bg-[#eeeeec]">List</button>
        <div className="mx-2 h-8 w-px bg-[#d9d9d6]" />
        <button className="rounded-[4px] p-1.5 hover:bg-[#eeeeec]">‹</button>
        <div className="text-[22px] font-semibold tracking-[-0.02em]">August 2026</div>
        <button className="rounded-[4px] p-1.5 hover:bg-[#eeeeec]">›</button>
        <span className="rounded-[4px] border border-[#d1d1ce] px-2 py-1 text-[12px]">0 events</span>
        <Link href="/app/settings" className="ml-auto text-[14px] font-medium text-[#423dff]">
          Link Google Calendar
        </Link>
        <button className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#d1d1ce] px-3 py-1.5 text-[13px]">
          <Filter size={15} />
          Filter
        </button>
      </div>
      <div className="grid grid-cols-7 border-b border-[#d9d9d6] text-center text-[12px] text-[#555]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="border-r border-[#d9d9d6] py-2 last:border-r-0">
            {day}
          </div>
        ))}
      </div>
      <div className="grid min-h-[calc(100dvh-250px)] grid-cols-7">
        {monthDays.map((day) => (
          <div key={day} className="min-h-[150px] border-b border-r border-[#d9d9d6] p-2 text-[16px] last:border-r-0">
            <span className={day === 10 ? "rounded-[4px] bg-[#625df5] px-1.5 py-0.5 text-white" : ""}>{day}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
