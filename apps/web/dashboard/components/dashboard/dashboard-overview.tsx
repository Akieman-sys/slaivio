"use client";

import { AlertTriangle, ArrowRight, Bell, Building2, CheckCircle2, Clock3, MapPin, MessageCircleMore, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { getDashboardHome, type DashboardHome, type HomeAttentionItem, type HomeResource } from "@/services/dashboard";

export function DashboardOverviewPage() {
  const [data, setData] = useState<DashboardHome | null>(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(sessionStorage.getItem("slaivio:dashboard-home") || "null") as DashboardHome | null; } catch { return null; }
  });
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await getDashboardHome();
      setData(next);
      sessionStorage.setItem("slaivio:dashboard-home", JSON.stringify(next));
    } catch {
      setError("Le tableau de bord n’a pas pu être chargé.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <header className="border-b border-[#dfe1e3] bg-white px-5 py-3.5 sm:px-6">
        <div className="flex min-h-[44px] items-center justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold text-[#24282d]">
              {data?.workspace.name ? `Vue d’ensemble · ${data.workspace.name}` : "Vue d’ensemble de l’agence"}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#69717a]">
              <span>Les priorités opérationnelles de votre agence, au même endroit.</span>
              {(data?.workspace.city || data?.workspace.country) && <span className="inline-flex items-center gap-1"><MapPin size={12} />{[data.workspace.city, data.workspace.country].filter(Boolean).join(", ")}</span>}
            </div>
          </div>
          <button type="button" onClick={load} disabled={loading} className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-[#d2d5d8] bg-white px-3 text-[12px] hover:bg-[#f2f3f3] disabled:opacity-60">
            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} /> Actualiser
          </button>
        </div>
      </header>

      <main className="space-y-4 p-4 sm:p-5">
        {error && (
          <div className="flex items-center gap-3 rounded-[6px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            <AlertTriangle size={17} />{error}<button onClick={load} className="ml-auto font-medium underline">Réessayer</button>
          </div>
        )}

        {loading && !data ? <DashboardSkeleton /> : data?.status === "no_workspace" ? <NoWorkspace /> : (
          <>
            <section className="overflow-hidden border-y border-[#dfe1e3] bg-white" aria-labelledby="indicators-title">
              <div className="flex min-h-10 items-center justify-between border-b border-[#eceeef] px-4">
                <h2 id="indicators-title" className="text-[13px] font-semibold">Activité de l’agence</h2>
                <span className="text-[11px] text-[#858b92]">Données en temps réel</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {(data?.resources || []).slice(0, 6).map((resource) => <ResourceMetric key={resource.key} resource={resource} />)}
                {!data?.resources.length && <div className="col-span-full px-5 py-10 text-center text-[12px] text-[#858b92]">Aucun indicateur disponible.</div>}
              </div>
            </section>

            <section className="grid border-y border-[#dfe1e3] bg-white sm:grid-cols-3" aria-label="État opérationnel">
              <OperationalStatus label="Points à traiter" value={data?.attention_items.length || 0} detail="Retards, suivis et paiements" tone={(data?.attention_items.length || 0) > 0 ? "warning" : "success"} />
              <OperationalStatus label="Notifications non lues" value={data?.unread_count || 0} detail="Mises à jour de l’agence" tone={(data?.unread_count || 0) > 0 ? "info" : "success"} />
              <OperationalStatus label="Canal WhatsApp" value={data?.whatsapp.configured ? "Connecté" : "À configurer"} detail={data?.whatsapp.phone || "Communication client"} tone={data?.whatsapp.configured ? "success" : "neutral"} icon={<MessageCircleMore size={16} />} />
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,.8fr)]">
              <section className="overflow-hidden border-y border-[#d9dcdf] bg-white" aria-labelledby="attention-title">
                <div className="flex h-12 items-center border-b border-[#e3e5e7] px-4">
                  <Clock3 size={16} className="mr-2 text-[#646b73]" />
                  <h2 id="attention-title" className="text-[13px] font-semibold">À traiter maintenant</h2>
                  <span className="ml-2 rounded-full bg-[#f0f1f1] px-2 py-0.5 text-[10px] text-[#687079]">{data?.attention_items.length || 0}</span>
                </div>
                <div>
                  {data?.attention_items.length ? data.attention_items.map((item) => <AttentionRow key={`${item.kind}-${item.id}`} item={item} />) : (
                    <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
                      <CheckCircle2 size={24} className="text-emerald-600" />
                      <p className="mt-3 text-[13px] font-medium">Aucune urgence opérationnelle</p>
                      <p className="mt-1 text-[11px] text-[#858b92]">Les retards, suivis et paiements à traiter apparaîtront ici.</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="overflow-hidden border-y border-[#d9dcdf] bg-white" aria-labelledby="notifications-title">
                <div className="flex h-12 items-center border-b border-[#e3e5e7] px-4">
                  <Bell size={16} className="mr-2 text-[#646b73]" />
                  <h2 id="notifications-title" className="text-[13px] font-semibold">Notifications récentes</h2>
                  {data?.unread_count ? <span className="ml-2 rounded-full bg-[#5550d8] px-2 py-0.5 text-[10px] text-white">{data.unread_count}</span> : null}
                  <Link href="/app/notifications" className="ml-auto text-[11px] font-medium text-[#514bc5] hover:underline">Tout voir</Link>
                </div>
                <div>
                  {data?.notifications.length ? data.notifications.slice(0, 6).map((item) => (
                    <Link href="/app/notifications" key={item.id} className="flex gap-3 border-b border-[#eceeef] px-4 py-3 last:border-0 hover:bg-[#f7f8f8]">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.priority === "HIGH" ? "bg-amber-500" : item.is_read ? "bg-[#c4c8cc]" : "bg-[#5550d8]"}`} />
                      <span className="min-w-0"><span className="block truncate text-[12px] font-medium">{item.title}</span><span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-[#727981]">{item.message}</span></span>
                    </Link>
                  )) : <p className="px-5 py-12 text-center text-[12px] text-[#858b92]">Aucune notification récente.</p>}
                </div>
              </section>
            </div>

            <section aria-labelledby="modules-title">
              <h2 id="modules-title" className="mb-2.5 text-[13px] font-semibold">Accès rapide</h2>
              <div className="grid overflow-hidden border-y border-[#d9dcdf] bg-white sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {(data?.resources || []).map((resource) => (
                  <Link key={resource.key} href={resource.href} className="group flex min-h-16 items-center gap-3 border-b border-r border-[#eceeef] px-4 py-3 hover:bg-[#f7f8f8]">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] bg-[#eef1ff] text-[12px] font-semibold text-[#514bc5]">{resource.name.slice(0, 2).toUpperCase()}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium">{resource.name}</span><span className="block truncate text-[10px] text-[#858b92]">{resource.description}</span></span>
                    <ArrowRight size={14} className="text-[#a1a6ac] opacity-0 transition group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function ResourceMetric({ resource }: { resource: HomeResource }) {
  return (
    <Link href={resource.href} className="group border-b border-r border-[#e5e7e8] px-5 py-4 hover:bg-[#fafafa]">
      <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-[#6d747c]">{resource.label || resource.name}</span><ArrowRight size={14} className="text-[#a0a5aa] opacity-0 transition group-hover:opacity-100" /></div>
      <div className="mt-2 text-[25px] font-semibold text-[#25292e]">{resource.count ?? "—"}</div>
      <div className="mt-1 truncate text-[10px] text-[#8a9097]">{resource.description}</div>
    </Link>
  );
}

function OperationalStatus({ label, value, detail, tone, icon }: { label: string; value: number | string; detail: string; tone: "success" | "warning" | "info" | "neutral"; icon?: ReactNode }) {
  const colors = { success: "bg-emerald-500", warning: "bg-amber-500", info: "bg-sky-500", neutral: "bg-[#a4a9ae]" };
  return (
    <div className="flex min-h-[74px] items-center gap-3 border-b border-r border-[#eceeef] px-4 py-3 sm:border-b-0">
      <span className={`h-8 w-1 shrink-0 rounded-full ${colors[tone]}`} />
      <div className="min-w-0 flex-1"><p className="text-[11px] text-[#6d747c]">{label}</p><p className="mt-0.5 truncate text-[17px] font-semibold">{value}</p><p className="truncate text-[10px] text-[#8a9097]">{detail}</p></div>
      {icon && <span className="text-[#767d84]">{icon}</span>}
    </div>
  );
}

function AttentionRow({ item }: { item: HomeAttentionItem }) {
  return (
    <Link href={item.href} className="grid min-h-16 grid-cols-[minmax(0,1fr)_100px_20px] items-center gap-3 border-b border-[#eceeef] px-4 py-3 last:border-0 hover:bg-[#f7f8f8]">
      <span className="min-w-0"><span className="block truncate text-[12px] font-medium">{item.title}</span><span className="mt-0.5 line-clamp-1 block text-[11px] text-[#737a82]">{item.message}</span></span>
      <span className={`justify-self-start rounded-full px-2 py-1 text-[10px] font-medium ${item.priority === "HIGH" ? "bg-amber-50 text-amber-800" : "bg-[#f0f1f1] text-[#646b73]"}`}>{item.status}</span>
      <ChevronMarker />
    </Link>
  );
}

function ChevronMarker() { return <ArrowRight size={14} className="text-[#a1a6ac]" />; }

function NoWorkspace() {
  return <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[7px] border border-[#d9dcdf] bg-white px-6 text-center"><Building2 size={28} className="text-[#8a9097]" /><h2 className="mt-4 text-[15px] font-semibold">Aucune agence active</h2><p className="mt-1 max-w-md text-[12px] leading-5 text-[#737a82]">Sélectionnez ou configurez une agence pour accéder aux opérations.</p><Link href="/app/settings" className="mt-5 inline-flex h-8 items-center rounded-[5px] bg-[#5550d8] px-3 text-[12px] font-medium text-white">Configurer l’agence</Link></div>;
}

function DashboardSkeleton() {
  return <div className="space-y-4" aria-label="Chargement du tableau de bord"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{Array.from({length:6}).map((_,i)=><div key={i} className="h-[92px] rounded-[7px] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.06)]"><span className="block h-2.5 w-20 animate-pulse rounded bg-[#e6e9e7]"/><span className="mt-4 block h-6 w-12 animate-pulse rounded bg-[#dfe4e1]"/></div>)}</div><div className="grid gap-4 xl:grid-cols-[1.6fr_.8fr]"><div className="h-72 rounded-[7px] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.06)]"><LoadingDots/></div><div className="h-72 rounded-[7px] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.06)]"/></div></div>;
}
function LoadingDots(){return <span className="flex items-center gap-1" aria-hidden>{[0,1,2].map(i=><span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#16855f]" style={{animationDelay:`${i*120}ms`}}/>)}</span>}
