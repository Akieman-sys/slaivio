"use client";

import { ArrowRight, Bell, Building2, CheckCircle2, Clock3, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { OperationButton, OperationMetric, OperationMetricGrid, OperationStatus } from "@/components/ui/operation-controls";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { ErrorState } from "@/components/ui/page-state";
import { getDashboardHome, type DashboardHome, type HomeAttentionItem } from "@/services/dashboard";

const dashboardCacheKey = "slaivio:dashboard-home";

export function DashboardOverviewPage() {
  const [data, setData] = useState<DashboardHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (keepCurrent = true) => {
    if (!keepCurrent) setData(null);
    setLoading(true);
    setError("");
    try {
      const next = await getDashboardHome();
      setData(next);
      window.sessionStorage.setItem(dashboardCacheKey, JSON.stringify(next));
    } catch {
      setError("Le tableau de bord n’a pas pu être actualisé.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const cached = window.sessionStorage.getItem(dashboardCacheKey);
      if (cached) setData(JSON.parse(cached) as DashboardHome);
    } catch {
      window.sessionStorage.removeItem(dashboardCacheKey);
    }
    void load(true);
  }, [load]);

  if (!data && loading) return <DashboardSkeleton />;
  if (!data && error) return <ErrorState title="Accueil indisponible" description={error} retry={() => load(false)} />;
  if (data?.status === "no_workspace") return <NoWorkspace />;

  return <div className="min-h-full bg-[#f5f6f6]">
    <OperationPageHeader
      title={data?.workspace.name ? `Vue d’ensemble · ${data.workspace.name}` : "Vue d’ensemble de l’agence"}
      description="Les priorités opérationnelles et les données réelles de votre agence, au même endroit."
      actions={<OperationButton onClick={() => load(true)} disabled={loading}><RefreshCcw size={15} className={loading ? "animate-spin" : ""} />Actualiser</OperationButton>}
    />

    <main className="grid gap-5 p-5 sm:p-6">
      {error && <div className="flex items-center gap-3 rounded-[7px] border border-[#f1c7c3] bg-[#fff5f4] px-4 py-3 text-[12px] text-[#a52a22]"><span>{error} Les dernières données connues restent affichées.</span><button type="button" onClick={() => load(true)} className="ml-auto font-semibold">Réessayer</button></div>}

      <section aria-labelledby="dashboard-kpis">
        <div className="mb-2 flex items-center justify-between"><h2 id="dashboard-kpis" className="text-[13px] font-semibold text-[#30363d]">Activité de l’agence</h2><span className="text-[11px] text-[#7a838d]">Données opérationnelles</span></div>
        <OperationMetricGrid className="lg:grid-cols-6">
          {(data?.resources || []).slice(0, 6).map((resource) => <Link key={resource.key} href={resource.href} className="group min-w-0"><OperationMetric label={resource.label || resource.name} value={resource.count ?? "—"} detail={resource.description} /></Link>)}
        </OperationMetricGrid>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,.8fr)]">
        <DashboardSection title="À traiter maintenant" icon={<Clock3 size={16} />} count={data?.attention_items.length || 0}>
          {data?.attention_items.length ? data.attention_items.map((item) => <AttentionRow key={`${item.kind}-${item.id}`} item={item} />) : <DashboardEmpty icon={<CheckCircle2 size={23} />} title="Aucune urgence opérationnelle" description="Les retards, suivis et paiements à traiter apparaîtront ici." />}
        </DashboardSection>
        <DashboardSection title="Notifications récentes" icon={<Bell size={16} />} count={data?.unread_count || 0} action={<Link href="/app/notifications" className="text-[11px] font-medium text-[#087a46]">Tout voir</Link>}>
          {data?.notifications.length ? data.notifications.slice(0, 6).map((item) => <Link href="/app/notifications" key={item.id} className="flex gap-3 border-b border-[#eceff2] px-4 py-3 last:border-0 hover:bg-[#f7f8f8]"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.priority === "HIGH" ? "bg-amber-500" : item.is_read ? "bg-[#c4c8cc]" : "bg-[#12c76f]"}`} /><span className="min-w-0"><span className="block truncate text-[12px] font-medium">{item.title}</span><span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-[#727981]">{item.message}</span></span></Link>) : <DashboardEmpty title="Aucune notification récente" description="Les nouvelles activités de l’agence apparaîtront ici." />}
        </DashboardSection>
      </div>

    </main>
  </div>;
}

function DashboardSection({ title, icon, count, action, children }: { title: string; icon: ReactNode; count: number; action?: ReactNode; children: ReactNode }) {
  return <section className="overflow-hidden rounded-[8px] border border-[#e2e6e9] bg-white"><header className="flex h-12 items-center border-b border-[#e5e8eb] px-4"><span className="mr-2 text-[#65707b]">{icon}</span><h2 className="text-[13px] font-semibold">{title}</h2><span className="ml-2 rounded-full bg-[#f0f2f3] px-2 py-0.5 text-[10px] text-[#687079]">{count}</span><span className="ml-auto">{action}</span></header>{children}</section>;
}

function AttentionRow({ item }: { item: HomeAttentionItem }) {
  return <Link href={item.href} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-3 border-b border-[#eceff2] px-4 py-3 last:border-0 hover:bg-[#f7f8f8]"><span className="min-w-0"><span className="block truncate text-[12px] font-medium">{item.title}</span><span className="mt-0.5 line-clamp-1 block text-[11px] text-[#737a82]">{item.message}</span></span><OperationStatus label={item.status} tone={item.priority === "HIGH" ? "warning" : "neutral"} /><ArrowRight size={14} className="text-[#a1a6ac]" /></Link>;
}

function DashboardEmpty({ icon, title, description }: { icon?: ReactNode; title: string; description: string }) {
  return <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">{icon && <span className="text-[#12a865]">{icon}</span>}<p className="mt-3 text-[13px] font-medium">{title}</p><p className="mt-1 text-[11px] text-[#7a838d]">{description}</p></div>;
}

function NoWorkspace() {
  return <div className="grid min-h-full place-items-center bg-[#f5f6f6] p-6"><div className="max-w-md text-center"><Building2 size={28} className="mx-auto text-[#8a9097]" /><h2 className="mt-4 text-[16px] font-semibold">Aucun espace agence actif</h2><p className="mt-1 text-[12px] leading-5 text-[#737a82]">Sélectionnez ou configurez un espace pour accéder à ses opérations.</p><Link href="/app/settings" className="mt-5 inline-flex h-9 items-center rounded-[6px] bg-[#12c76f] px-3 text-[13px] font-medium text-white">Configurer l’agence</Link></div></div>;
}

function DashboardSkeleton() {
  return <div className="min-h-full bg-[#f5f6f6]" role="status" aria-label="Chargement de l’accueil"><div className="border-b border-[#dfe3e7] bg-white px-6 py-4"><Skeleton className="h-5 w-64" /><Skeleton className="mt-2 h-3 w-[420px] max-w-full" /></div><main className="grid gap-5 p-5 sm:p-6"><div><Skeleton className="mb-2 h-3 w-36" /><div className="grid grid-cols-2 overflow-hidden rounded-[8px] border border-[#e2e6e9] bg-white lg:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="border-r border-[#eceff2] p-4"><Skeleton className="h-2.5 w-20" /><Skeleton className="mt-3 h-6 w-14" /></div>)}</div></div><div className="grid gap-5 xl:grid-cols-[1.6fr_.8fr]"><Skeleton className="h-72 bg-white" /><Skeleton className="h-72 bg-white" /></div></main></div>;
}

function Skeleton({ className = "" }: { className?: string }) { return <div className={`animate-pulse rounded-[6px] bg-[#e9ecee] ${className}`} />; }
