"use client";

import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { Activity, Building2, CircleUserRound, Grid2X2, MessageCircle, MoreVertical, PackageSearch, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { getDashboardHome, type DashboardHome } from "@/services/dashboard";

type AgencyState = "loading" | "ready" | "none" | "error";

export function DashboardOverviewPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [homeData, setHomeData] = useState<DashboardHome | null>(null);
  const [agencyState, setAgencyState] = useState<AgencyState>("loading");
  const [agencyError, setAgencyError] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { setAgencyState("error"); return; }
    let active = true;
    getToken().then((token) => getDashboardHome(token)).then((home) => {
      if (!active) return;
      setHomeData(home);
      setAgencyState(home.status === "no_workspace" || !home.workspace.org_id ? "none" : "ready");
    }).catch((error: unknown) => {
      if (!active) return;
      setAgencyState("error");
      if (!axios.isAxiosError(error) || !error.response) setAgencyError("L’API Slaivio est momentanément injoignable.");
      else if (error.response.status === 401) setAgencyError("Votre session a expiré.");
      else if ([403, 409].includes(error.response.status)) setAgencyError("Cette agence n’est pas correctement provisionnée pour votre compte.");
      else setAgencyError(`Le service a répondu avec le statut ${error.response.status}.`);
    });
    return () => { active = false; };
  }, [getToken, isLoaded, isSignedIn]);

  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <div className="flex min-h-[50px] items-center justify-between border-b border-[#d8d8d5] bg-white px-6">
        <h1 className="text-[20px] font-semibold tracking-[-0.025em] text-[#202020]">Vue d’ensemble Slaivio</h1>
      </div>
      <div className="flex min-h-[48px] items-end justify-between border-b border-[#d8d8d5] bg-white px-6">
        <div className="flex h-full items-end gap-1">
          <button className="flex h-[48px] items-center gap-2 border-b-2 border-[#615cf2] px-1 text-[14px] font-medium text-[#222]"><Grid2X2 size={17} /> Dashboard</button>
        </div>
        <div className="flex h-[48px] items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-[4px] border px-2.5 py-1.5 text-[12px] ${agencyState === "ready" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : agencyState === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-[#d8d8d5] bg-white text-[#666]"}`}><span className={`h-1.5 w-1.5 rounded-full ${agencyState === "ready" ? "bg-emerald-500" : agencyState === "error" ? "bg-red-500" : "bg-slate-400"}`} />{agencyState === "loading" ? "Connexion…" : agencyState === "ready" ? "Agence connectée" : agencyState === "none" ? "Agence requise" : "Service indisponible"}</span>
        </div>
      </div>

      {agencyState === "error" && <div className="border-b border-red-200 bg-red-50 px-6 py-2.5 text-[13px] text-red-700">{agencyError}</div>}

      <div className="grid gap-4 p-4 xl:grid-cols-2">
        <DashboardCard icon={<PackageSearch size={17} />} title="Éléments à traiter" subtitle="Actions qui demandent votre attention" count={homeData?.attention_items.length}>
          <CardBody state={agencyState} empty="Aucun élément ne demande votre attention.">
            {homeData?.attention_items.map((item) => <Link key={item.id} href={item.href} className="flex items-start gap-3 border-b border-[#ececea] px-3 py-2.5 text-[13px] last:border-0 hover:bg-[#fafaf9]"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.priority === "HIGH" ? "bg-red-500" : "bg-amber-400"}`} /><span className="min-w-0"><span className="block truncate font-medium text-[#272727]">{item.title}</span><span className="mt-0.5 block truncate text-[12px] text-[#666]">{item.message}</span></span></Link>)}
          </CardBody>
        </DashboardCard>

        <DashboardCard icon={<Activity size={17} />} title="Activité récente" subtitle="Derniers événements de votre agence" count={homeData?.notifications.length}>
          <CardBody state={agencyState} empty="Aucune activité récente.">
            {homeData?.notifications.slice(0, 6).map((item) => <div key={item.id} className="flex items-start gap-3 border-b border-[#ececea] px-3 py-2.5 text-[13px] last:border-0"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.is_read ? "bg-slate-300" : "bg-[#615cf2]"}`} /><span className="min-w-0"><span className="block truncate font-medium text-[#272727]">{item.title}</span><span className="mt-0.5 block truncate text-[12px] text-[#666]">{item.message}</span></span></div>)}
          </CardBody>
        </DashboardCard>

        <DashboardCard icon={<CircleUserRound size={17} />} title="Compte connecté" subtitle="Identité du membre actif">
          <IdentityGrid home={homeData} state={agencyState} />
        </DashboardCard>

        <DashboardCard icon={<Grid2X2 size={17} />} title="Modules de l’agence" subtitle="Données disponibles dans l’organisation active" count={homeData?.resources.length}>
          <CardBody state={agencyState} empty="Aucun module disponible pour cette agence.">
            {homeData && homeData.resources.length > 0 ? <div className="grid grid-cols-2 gap-px bg-[#e5e5e2]">
              {homeData?.resources.slice(0, 6).map((resource) => <Link key={resource.key} href={resource.href} className="bg-white px-3 py-3 hover:bg-[#fafaf9]"><span className="block truncate text-[13px] font-medium text-[#2b2b2b]">{resource.name}</span><span className="mt-1 block text-[12px] text-[#777]">{resource.count === null ? resource.label : `${resource.count.toLocaleString("fr-FR")} ${resource.label}`}</span></Link>)}
            </div> : null}
          </CardBody>
        </DashboardCard>
      </div>
    </div>
  );
}

function DashboardCard({ icon, title, subtitle, count, children }: { icon: ReactNode; title: string; subtitle: string; count?: number; children: ReactNode }) {
  return <section className="min-h-[300px] overflow-hidden rounded-[8px] border border-[#d4d4d1] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"><header className="flex items-start gap-2 px-5 py-4"><span className="mt-0.5 text-[#333]">{icon}</span><div><h2 className="text-[14px] font-medium text-[#252525]">{title}{typeof count === "number" && <span className="ml-2 text-[12px] font-normal text-[#888]">{count}</span>}</h2><p className="mt-0.5 text-[12px] text-[#666]">{subtitle}</p></div><button aria-label={`Options ${title}`} disabled className="ml-auto cursor-not-allowed rounded p-1 text-[#666] opacity-60"><SlidersHorizontal size={15} /></button><button aria-label={`Plus d’options ${title}`} disabled className="cursor-not-allowed rounded p-1 text-[#666] opacity-60"><MoreVertical size={15} /></button></header><div className="mx-4 mb-4 min-h-[210px] overflow-hidden rounded-[6px] border border-dashed border-[#d7d7d4]">{children}</div></section>;
}

function CardBody({ state, empty, children }: { state: AgencyState; empty: string; children: ReactNode }) {
  if (state === "loading") return <div className="space-y-2 p-3">{[0, 1, 2].map((item) => <div key={item} className="h-11 animate-pulse rounded bg-[#f1f1ef]" />)}</div>;
  if (state === "error") return <CenteredText text="Données temporairement indisponibles." />;
  if (state === "none") return <CenteredText text="Associez une agence pour afficher ces données." />;
  const hasContent = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return hasContent ? <>{children}</> : <CenteredText text={empty} />;
}

function IdentityGrid({ home, state }: { home: DashboardHome | null; state: AgencyState }) {
  if (state === "loading") return <div className="grid h-[210px] animate-pulse grid-cols-2 gap-px bg-[#e5e5e2]"><div className="bg-[#f5f5f3]" /><div className="bg-[#f5f5f3]" /></div>;
  const location = [home?.workspace.city, home?.workspace.country].filter(Boolean).join(", ") || "Localisation non renseignée";
  return <div className="grid min-h-[210px] grid-cols-1 gap-px bg-[#e5e5e2] sm:grid-cols-2"><InfoCell icon={<CircleUserRound size={17} />} label="Membre" value={home?.manager.name || "Compte Slaivio"} detail={home?.manager.email || "Email indisponible"} /><InfoCell icon={<Building2 size={17} />} label="Agence active" value={home?.workspace.name || "Aucune agence"} detail={location} /><InfoCell icon={<MessageCircle size={17} />} label="WhatsApp Business" value={home?.whatsapp.configured ? "Connecté" : "Non configuré"} detail={home?.whatsapp.phone || home?.whatsapp.status || "Aucun numéro actif"} /><InfoCell icon={<Activity size={17} />} label="Notifications" value={`${home?.unread_count || 0} non lue(s)`} detail="Événements de l’agence active" /></div>;
}

function InfoCell({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <div className="flex min-w-0 gap-3 bg-white p-4"><span className="mt-0.5 text-[#555]">{icon}</span><div className="min-w-0"><span className="block text-[11px] font-medium uppercase tracking-[0.04em] text-[#888]">{label}</span><span className="mt-1 block truncate text-[13px] font-medium text-[#282828]">{value}</span><span className="mt-0.5 block truncate text-[12px] text-[#777]">{detail}</span></div></div>;
}

function CenteredText({ text }: { text: string }) {
  return <div className="flex min-h-[210px] items-center justify-center px-6 text-center text-[13px] text-[#666]">{text}</div>;
}
