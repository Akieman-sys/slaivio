"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationDrawer, OperationDrawerAction } from "@/components/ui/operation-drawer";
import { getPilotReadiness, recordPilotReadinessReview, type PilotReadiness } from "@/services/organization-admin";

export function PilotReadinessPanel() {
  const [data, setData] = useState<PilotReadiness | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getPilotReadiness()); setError(""); } catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  async function recordReview() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await recordPilotReadinessReview();
      setNotice("Cette vérification a été enregistrée.");
    } catch {
      setError("La vérification n’a pas pu être enregistrée. Réessayez dans un instant.");
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => { void load(); }, [load]);

  if (!data && !loading) return null;
  const ready = data?.status === "READY";

  return <>
    <section className={`flex min-h-[76px] flex-col gap-3 rounded-[9px] border px-5 py-4 sm:flex-row sm:items-center ${ready ? "border-[#c9e6d7] bg-[#f4fbf7]" : "border-[#ead9b8] bg-[#fffaf0]"}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${ready ? "bg-[#dff3e8] text-[#087a46]" : "bg-[#f8e9c8] text-[#946000]"}`}>
        {ready ? <CheckCircle2 size={20}/> : <ClipboardCheck size={20}/>} 
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[14px] font-semibold text-[#2d363e]">{ready ? "Pilot prêt pour la mise en service" : "Préparation du Pilot à finaliser"}</h2>
        <p className="mt-1 text-[12px] leading-5 text-[#66727c]">{loading ? "Vérification des réglages de l’entreprise…" : `${data?.ready_count || 0} vérification(s) prête(s) sur ${data?.total_count || 0}${data?.action_required_count ? ` · ${data.action_required_count} action(s) nécessaire(s)` : ""}.`}</p>
      </div>
      <button type="button" onClick={()=>setOpen(true)} disabled={!data} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[6px] border border-[#d1d7db] bg-white px-3 text-[13px] font-semibold text-[#34404a] shadow-[0_1px_1px_rgba(15,23,42,.03)] hover:bg-[#f7f8f8] disabled:opacity-50">Voir les vérifications<ArrowRight size={14}/></button>
    </section>

    <OperationDrawer
      open={open}
      close={()=>setOpen(false)}
      title="Préparation à la mise en service"
      description="SLAIVIO vérifie les éléments indispensables depuis les données réelles de votre entreprise."
      width="max-w-[650px]"
      headerActions={<button type="button" onClick={()=>void load()} className="grid h-9 w-9 place-items-center rounded-[7px] text-[#59646e] hover:bg-[#f1f3f4]" aria-label="Actualiser les vérifications"><RefreshCcw size={15} className={loading ? "animate-spin" : ""}/></button>}
      footer={<div className="flex w-full items-center justify-between gap-3"><span className="text-[12px] text-[#75808a]">{data?.ready_count || 0} sur {data?.total_count || 0} vérifications prêtes</span><PermissionGuard permission="pilot.readiness.review"><OperationDrawerAction intent="primary" disabled={loading || saving || !data} onClick={()=>void recordReview()}>{saving ? "Enregistrement…" : "Enregistrer la vérification"}</OperationDrawerAction></PermissionGuard></div>}
    >
      <div className="p-6">
        {notice && <div className="mb-4 rounded-[8px] border border-[#bfe4d1] bg-[#f1faf5] px-4 py-3 text-[13px] text-[#176142]">{notice}</div>}
        {error && <div className="mb-4 rounded-[8px] border border-[#efd0cc] bg-[#fff6f5] px-4 py-3 text-[13px] text-[#9d352d]">{error}</div>}
        <div className="overflow-hidden rounded-[9px] border border-[#e0e4e7] bg-white">
          {data?.checks.map(check => {
            const ok=check.status === "READY";
            const warning=check.status === "WARNING";
            return <div key={check.key} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 border-b border-[#e9ecee] px-4 py-4 last:border-0">
              <span className={`mt-0.5 grid h-7 w-7 place-items-center rounded-full ${ok ? "bg-[#e5f5ec] text-[#0b8650]" : warning ? "bg-[#fff2d9] text-[#996100]" : "bg-[#fff0ed] text-[#b13d32]"}`}>{ok ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}</span>
              <span className="min-w-0"><strong className="block text-[13px] font-semibold text-[#303940]">{check.label}</strong><span className="mt-1 block text-[12px] leading-5 text-[#707b84]">{check.description}</span></span>
              <Link href={check.href} onClick={()=>setOpen(false)} className="mt-1 inline-flex h-8 items-center rounded-[6px] px-2.5 text-[12px] font-semibold text-[#087a46] hover:bg-[#edf8f2]">{check.action_label}</Link>
            </div>;
          })}
        </div>
        <p className="mt-4 text-[12px] leading-5 text-[#77828b]">Les avertissements n’empêchent pas l’utilisation manuelle. Les éléments à compléter doivent être réglés avant d’activer les réponses automatiques.</p>
      </div>
    </OperationDrawer>
  </>;
}
