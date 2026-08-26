"use client";

import { CloudOff, RefreshCw, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { usePilotOffline } from "@/components/offline/pilot-offline-provider";

export function PilotOfflineIndicator() {
  const { online, syncing, pending, conflicts, rejected, issues, syncNow, dismissIssue } = usePilotOffline();
  const [open, setOpen] = useState(false);
  if (online && !syncing && pending === 0 && conflicts === 0 && rejected === 0) return null;
  const problemCount = conflicts + rejected;
  return <div className={`flex min-h-10 shrink-0 items-center gap-2 border-b px-4 text-[13px] ${problemCount ? "border-[#ead7b3] bg-[#fff9ee] text-[#74511f]" : online ? "border-[#cce4d7] bg-[#f2faf6] text-[#286148]" : "border-[#d8dde1] bg-[#f1f3f4] text-[#4e5963]"}`} role="status">
    {problemCount ? <TriangleAlert size={16} /> : online ? <RefreshCw size={15} className={syncing ? "animate-spin" : ""} /> : <CloudOff size={16} />}
    <span className="font-semibold">{problemCount ? `${problemCount} modification${problemCount > 1 ? "s" : ""} à vérifier` : !online ? "Travail hors connexion" : "Synchronisation en cours"}</span>
    <span className="hidden text-[12px] opacity-80 sm:inline">{!online ? "Vos modifications seront envoyées automatiquement au retour du réseau." : pending ? `${pending} élément${pending > 1 ? "s" : ""} en attente.` : "Mise à jour des données…"}</span>
    {problemCount > 0 && <button type="button" onClick={() => setOpen(true)} className="ml-auto rounded-[6px] border border-current/20 bg-white px-2.5 py-1 text-[12px] font-semibold hover:bg-white/60">Voir</button>}
    {problemCount === 0 && online && pending > 0 && !syncing && <button type="button" onClick={() => void syncNow()} className="ml-auto rounded-[6px] border border-current/20 bg-white px-2.5 py-1 text-[12px] font-semibold hover:bg-white/60">Synchroniser</button>}
    {open && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Modifications à vérifier">
      <section className="max-h-[80vh] w-full max-w-xl overflow-hidden rounded-[10px] border border-[#d9dde0] bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-[#e5e8ea] px-5 py-4"><div><h2 className="text-[16px] font-semibold text-[#252b31]">Modifications à vérifier</h2><p className="mt-1 text-[12px] text-[#6f7a83]">Slaivio n’écrase jamais une donnée modifiée pendant votre absence.</p></div><button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-[6px] text-[#65717a] hover:bg-[#f0f2f3]" aria-label="Fermer"><X size={17}/></button></header>
        <div className="max-h-[58vh] overflow-y-auto p-4">{issues.map((issue) => <article key={issue.id} className="mb-3 rounded-[8px] border border-[#e0e4e7] p-4 last:mb-0"><p className="text-[13px] font-semibold text-[#303840]">{operationLabel(issue.operation_type)}</p><p className="mt-1 text-[12px] leading-5 text-[#69747d]">{issue.state === "CONFLICT" ? "La version en ligne a changé. Consultez-la puis refaites seulement la modification encore nécessaire." : rejectionLabel(issue.error_code)}</p><div className="mt-3 flex flex-wrap justify-end gap-2">{issue.entity_id && <Link href={`/app/dossiers/${issue.entity_id}`} onClick={() => setOpen(false)} className="inline-flex h-8 items-center rounded-[6px] border border-[#d6dce0] px-3 text-[12px] font-semibold text-[#3f4a53] hover:bg-[#f5f7f7]">Ouvrir le dossier</Link>}<button type="button" onClick={() => void dismissIssue(issue.id)} className="h-8 rounded-[6px] bg-[#263139] px-3 text-[12px] font-semibold text-white hover:bg-[#182127]">{issue.state === "CONFLICT" ? "Garder la version en ligne" : "Fermer l’avertissement"}</button></div></article>)}</div>
      </section>
    </div>}
  </div>;
}

function operationLabel(value: string) { return ({ DOSSIER_CREATE: "Création d’un dossier", DOSSIER_UPDATE: "Modification d’un dossier", FOLLOWUP_DRAFT_SAVE: "Brouillon de relance" } as Record<string,string>)[value] || "Modification hors connexion"; }
function rejectionLabel(value?: string | null) { return ({ dossier_not_found: "Le dossier n’existe plus en ligne.", followup_title_and_message_required: "Le brouillon ne contient pas toutes les informations nécessaires.", operation_key_reused_with_different_data: "Cette modification ne peut pas être identifiée de manière sûre." } as Record<string,string>)[String(value)] || "Cette modification n’a pas pu être appliquée. Vérifiez les données puis recommencez."; }
