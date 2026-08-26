"use client";

import { ArrowRight, Bell, Building2, CheckCircle2, Clock3, FolderOpen, MessageCircle, Plus, RefreshCcw, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { OperationButton, OperationMetric, OperationMetricGrid, OperationStatus } from "@/components/ui/operation-controls";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { ErrorState } from "@/components/ui/page-state";
import { isPilotV1, isPilotVisiblePath } from "@/config/product-profile";
import { getDashboardHome, type DashboardHome, type HomeAttentionItem, type PilotActivity, type PilotDossierSummary } from "@/services/dashboard";

const dashboardCacheKey = "slaivio:dashboard-home";

export function DashboardOverviewPage() {
  const pilot = isPilotV1();
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
  if (pilot && data) return <PilotDashboard data={data} loading={loading} error={error} reload={() => load(true)} />;

  const resources = (data?.resources || []).filter((resource) => !pilot || isPilotVisiblePath(resource.href));
  const attentionItems = (data?.attention_items || []).filter((item) => !pilot || isPilotVisiblePath(item.href));

  return <div className="min-h-full bg-[#f5f6f6]">
    <OperationPageHeader
      title={data?.workspace.name ? `Vue d’ensemble · ${data.workspace.name}` : "Vue d’ensemble de l’agence"}
      description={pilot ? "Les dossiers, conversations et relances à suivre aujourd’hui." : "Les priorités opérationnelles et les données réelles de votre agence, au même endroit."}
      actions={<OperationButton onClick={() => load(true)} disabled={loading}><RefreshCcw size={15} className={loading ? "animate-spin" : ""} />Actualiser</OperationButton>}
    />

    <main className="grid gap-5 p-5 sm:p-6">
      {error && <div className="flex items-center gap-3 rounded-[7px] border border-[#f1c7c3] bg-[#fff5f4] px-4 py-3 text-[12px] text-[#a52a22]"><span>{error} Les dernières données connues restent affichées.</span><button type="button" onClick={() => load(true)} className="ml-auto font-semibold">Réessayer</button></div>}

      <section aria-labelledby="dashboard-kpis">
        <div className="mb-2 flex items-center justify-between"><h2 id="dashboard-kpis" className="text-[13px] font-semibold text-[#30363d]">Activité de l’agence</h2><span className="text-[11px] text-[#7a838d]">Données opérationnelles</span></div>
        <OperationMetricGrid className={pilot ? "lg:grid-cols-3" : "lg:grid-cols-6"}>
          {resources.slice(0, 6).map((resource) => <Link key={resource.key} href={resource.href} className="group min-w-0"><OperationMetric label={resource.label || resource.name} value={resource.count ?? "—"} detail={resource.description} /></Link>)}
        </OperationMetricGrid>
      </section>

      <div className={pilot ? "grid gap-5" : "grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,.8fr)]"}>
        <DashboardSection title="À traiter maintenant" icon={<Clock3 size={16} />} count={attentionItems.length}>
          {attentionItems.length ? attentionItems.map((item) => <AttentionRow key={`${item.kind}-${item.id}`} item={item} />) : <DashboardEmpty icon={<CheckCircle2 size={23} />} title="Rien à reprendre pour le moment" description={pilot ? "Les dossiers, conversations et relances nécessitant votre attention apparaîtront ici." : "Les retards, suivis et paiements à traiter apparaîtront ici."} />}
        </DashboardSection>
        {!pilot && <DashboardSection title="Notifications récentes" icon={<Bell size={16} />} count={data?.unread_count || 0} action={<Link href="/app/notifications" className="text-[11px] font-medium text-[#087a46]">Tout voir</Link>}>
          {data?.notifications.length ? data.notifications.slice(0, 6).map((item) => <Link href="/app/notifications" key={item.id} className="flex gap-3 border-b border-[#eceff2] px-4 py-3 last:border-0 hover:bg-[#f7f8f8]"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.priority === "HIGH" ? "bg-amber-500" : item.is_read ? "bg-[#c4c8cc]" : "bg-[#12c76f]"}`} /><span className="min-w-0"><span className="block truncate text-[12px] font-medium">{item.title}</span><span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-[#727981]">{item.message}</span></span></Link>) : <DashboardEmpty title="Aucune notification récente" description="Les nouvelles activités de l’agence apparaîtront ici." />}
        </DashboardSection>}
      </div>

    </main>
  </div>;
}

function PilotDashboard({ data, loading, error, reload }: { data: DashboardHome; loading: boolean; error: string; reload: () => void }) {
  const pilot = data.pilot || { stats: {}, attention_dossiers: [], recent_dossiers: [], recent_clients: [], recent_activity: [] };
  const stats = pilot.stats || {};
  return <div className="min-h-full bg-[#f6f7f7] text-[#25292e]">
    <OperationPageHeader
      title="Accueil"
      description={`Suivez les dossiers et les communications de ${data.workspace.name}.`}
      actions={<>
        <OperationButton onClick={reload} disabled={loading} aria-label="Actualiser l’accueil"><RefreshCcw size={15} className={loading ? "animate-spin" : ""} />Actualiser</OperationButton>
        <Link href="/app/inbox" className="inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-[#d4d9df] bg-white px-3 text-[13px] font-semibold text-[#30363d] hover:bg-[#f6f7f7]"><MessageCircle size={15} />Boîte de réception</Link>
        <Link href="/app/dossiers?create=1" className="inline-flex h-9 items-center justify-center gap-2 rounded-[6px] bg-[#12c76f] px-3 text-[13px] font-semibold text-white hover:bg-[#0fb766]"><Plus size={15} />Nouveau dossier</Link>
      </>}
    />
    <main className="mx-auto grid w-full max-w-[1320px] gap-5 p-5 sm:p-6">
      {error && <div className="flex items-center gap-3 rounded-[7px] border border-[#f1c7c3] bg-[#fff5f4] px-4 py-3 text-[12px] text-[#a52a22]"><span>{error} Les dernières données connues restent affichées.</span><button type="button" onClick={reload} className="ml-auto font-semibold">Réessayer</button></div>}

      <section aria-label="Résumé de l’activité">
        <OperationMetricGrid>
          <Link href="/app/dossiers" className="min-w-0"><OperationMetric label="Dossiers actifs" value={stats.active_dossiers ?? 0} detail="Dossiers actuellement suivis" /></Link>
          <Link href="/app/dossiers" className="min-w-0"><OperationMetric label="Clients actifs" value={stats.active_clients ?? 0} detail="Présents dans les dossiers actifs" /></Link>
          <Link href="/app/dossiers" className="min-w-0"><OperationMetric label="À traiter" value={stats.attention_clients ?? 0} detail={`${stats.attention_dossiers ?? 0} dossier(s) concerné(s)`} tone={(stats.attention_clients ?? 0) > 0 ? "warning" : "default"} /></Link>
          <Link href="/app/inbox" className="min-w-0"><OperationMetric label="Conversations en attente" value={stats.waiting_conversations ?? 0} detail="Messages à reprendre" tone={(stats.waiting_conversations ?? 0) > 0 ? "warning" : "default"} /></Link>
        </OperationMetricGrid>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,.7fr)]">
        <PilotSection title="Dossiers nécessitant une attention" count={pilot.attention_dossiers.length} action={<Link href="/app/dossiers" className="text-[12px] font-semibold text-[#087a46]">Voir tous les dossiers</Link>}>
          {pilot.attention_dossiers.length ? pilot.attention_dossiers.map((item) => <PilotDossierRow key={item.id} item={item} attention />) : <PilotEmpty title="Aucun dossier à traiter" description="Les dossiers signalés apparaîtront ici." />}
        </PilotSection>
        <PilotSection title="À reprendre" count={(stats.waiting_conversations ?? 0) + (stats.pending_followups ?? 0)}>
          <PilotShortcut href="/app/inbox" icon={<MessageCircle size={17} />} label="Conversations en attente" value={stats.waiting_conversations ?? 0} />
          <PilotShortcut href="/app/followups" icon={<Clock3 size={17} />} label="Relances en attente" value={stats.pending_followups ?? 0} />
        </PilotSection>
      </div>

      <PilotSection title="Dernières activités" count={pilot.recent_activity.length}>
        {pilot.recent_activity.length ? pilot.recent_activity.map((item) => <PilotActivityRow key={item.id} item={item} />) : <PilotEmpty title="Aucune activité récente" description="Les créations et mises à jour importantes apparaîtront ici." />}
      </PilotSection>

      <div className="grid gap-5 lg:grid-cols-2">
        <PilotSection title="Dossiers récemment modifiés" count={pilot.recent_dossiers.length} action={<Link href="/app/dossiers" className="text-[12px] font-semibold text-[#087a46]">Tous les dossiers</Link>}>
          {pilot.recent_dossiers.length ? pilot.recent_dossiers.map((item) => <PilotDossierRow key={item.id} item={item} />) : <PilotEmpty title="Aucun dossier actif" description="Créez le premier dossier de l’agence." />}
        </PilotSection>
        <PilotSection title="Clients récemment ajoutés" count={pilot.recent_clients.length}>
          {pilot.recent_clients.length ? pilot.recent_clients.map((client) => <Link key={client.id} href={client.href} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#edf0f2] px-5 py-3.5 last:border-0 hover:bg-[#f8faf9]"><span className="min-w-0"><span className="block truncate text-[13px] font-semibold">{client.name}</span><span className="mt-1 block truncate text-[12px] text-[#737e88]">{client.client_reference} · {client.dossier_title}</span></span><span className="text-[12px] text-[#7a848e]">{relativeTime(client.created_at)}</span></Link>) : <PilotEmpty title="Aucun client récent" description="Les clients ajoutés depuis un dossier apparaîtront ici." />}
        </PilotSection>
      </div>
    </main>
  </div>;
}

function PilotSection({ title, count, action, children }: { title: string; count: number; action?: ReactNode; children: ReactNode }) { return <section className="overflow-hidden rounded-[9px] border border-[#e0e4e7] bg-white"><header className="flex min-h-13 items-center gap-2 border-b border-[#e6e9ec] px-5 py-3"><h2 className="text-[14px] font-semibold text-[#30373e]">{title}</h2><span className="rounded-full bg-[#f0f2f3] px-2 py-0.5 text-[11px] font-medium text-[#68727c]">{count}</span>{action && <span className="ml-auto">{action}</span>}</header>{children}</section>; }

function PilotDossierRow({ item, attention = false }: { item: PilotDossierSummary; attention?: boolean }) { return <Link href={item.href} className="grid min-h-[68px] grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-3 border-b border-[#edf0f2] px-5 py-3.5 last:border-0 hover:bg-[#f8faf9]"><span className="min-w-0"><span className="block truncate text-[13px] font-semibold">{item.title}</span><span className="mt-1 block truncate text-[12px] text-[#74808a]">{item.reference}{attention && item.reason ? ` · ${item.reason}` : ""}</span></span><span className="text-right"><span className={`block text-[12px] font-semibold ${attention ? "text-[#9a5b00]" : "text-[#59646e]"}`}>{attention ? `${item.attention_clients || 0} à traiter` : `${item.client_count || 0} client(s)`}</span><span className="mt-1 block text-[11px] text-[#89929a]">{relativeTime(item.updated_at)}</span></span><ArrowRight size={15} className="text-[#9aa2aa]" /></Link>; }

function PilotShortcut({ href, icon, label, value }: { href: string; icon: ReactNode; label: string; value: number }) { return <Link href={href} className="flex min-h-[76px] items-center gap-3 border-b border-[#edf0f2] px-5 py-4 last:border-0 hover:bg-[#f8faf9]"><span className="grid h-9 w-9 place-items-center rounded-[8px] bg-[#edf8f2] text-[#087a46]">{icon}</span><span className="min-w-0 flex-1 text-[13px] font-medium">{label}</span><strong className="text-[22px] font-semibold tracking-[-0.03em]">{value}</strong><ArrowRight size={15} className="text-[#9aa2aa]" /></Link>; }

function PilotActivityRow({ item }: { item: PilotActivity }) { return <Link href={item.href} className="grid min-h-16 grid-cols-[38px_minmax(0,1fr)_auto_18px] items-center gap-3 border-b border-[#edf0f2] px-5 py-3 last:border-0 hover:bg-[#f8faf9]"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#edf8f2] text-[#087a46]">{item.kind.includes("CLIENT") ? <Users size={15} /> : item.kind.includes("FOLLOWUP") ? <Clock3 size={15} /> : <FolderOpen size={15} />}</span><span className="min-w-0"><span className="block text-[13px] font-semibold">{item.label}</span><span className="mt-0.5 block truncate text-[12px] text-[#737e88]">{item.detail}</span></span><span className="text-[12px] text-[#7a848e]">{relativeTime(item.occurred_at)}</span><ArrowRight size={14} className="text-[#a1a7ad]" /></Link>; }

function PilotEmpty({ title, description }: { title: string; description: string }) { return <div className="grid min-h-36 place-items-center px-5 py-8 text-center"><div><CheckCircle2 size={21} className="mx-auto text-[#12a865]" /><p className="mt-2 text-[13px] font-semibold">{title}</p><p className="mt-1 text-[12px] text-[#78828c]">{description}</p></div></div>; }

function relativeTime(value: string) { const date = new Date(value); const seconds = Math.round((date.getTime() - Date.now()) / 1000); const formatter = new Intl.RelativeTimeFormat("fr", { numeric: "auto" }); const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]]; for (const [unit, size] of ranges) if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit); return "À l’instant"; }

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
