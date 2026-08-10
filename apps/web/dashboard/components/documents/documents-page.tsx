"use client";

import { FileCheck2, FilePlus2, FolderOpen, Search, ShieldCheck, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";

import { docs, downloadDoc, reviewDoc, uploadDoc, type Doc } from "@/services/documents";
import { OperationPageHeader } from "@/components/ui/operation-page-header";

const button = "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] border border-[#d6dadd] bg-white px-3 text-[12px] font-medium hover:bg-[#f5f6f6]";
const primary = "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] bg-[#12a861] px-3 text-[12px] font-semibold text-white hover:bg-[#0d9455]";
const input = "h-9 rounded-[5px] border border-[#d6dadd] bg-white px-3 text-[13px] outline-none focus:border-[#12a861]";

export function DocumentsPage() {
  const [items, setItems] = useState<Doc[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setItems(await docs()); } catch { setError("Les documents sont indisponibles."); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter((item) => `${item.document_code} ${item.title} ${item.file_name}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const valid = items.filter((item) => item.status === "VALID").length;
  const pending = items.filter((item) => item.status === "PENDING_REVIEW").length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await uploadDoc(new FormData(event.currentTarget)); setOpen(false); await load(); } catch { setError("Téléversement impossible."); }
  }

  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <OperationPageHeader title="Documents et conformité" description="Centralisez les pièces cargo, contrôlez leur validité et suivez les échéances." actions={<button className={primary} onClick={() => setOpen(true)}><FilePlus2 size={15} />Ajouter un document</button>} />
      <main className="py-4">
        <section className="grid border-y border-[#dfe1e3] bg-white sm:grid-cols-3">
          <Metric label="Documents" value={items.length} icon={<FolderOpen size={16} />} />
          <Metric label="À contrôler" value={pending} icon={<FileCheck2 size={16} />} />
          <Metric label="Conformes" value={valid} icon={<ShieldCheck size={16} />} />
        </section>
        <section className="mt-4 overflow-x-auto border-y border-[#dfe1e3] bg-white">
          <div className="flex items-center border-b border-[#e5e7e8] p-3"><label className="flex h-9 min-w-[260px] max-w-xl flex-1 items-center rounded-[5px] bg-[#f3f4f4] px-3"><Search size={15} className="text-[#757c84]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="ml-2 w-full bg-transparent text-[13px] outline-none" placeholder="Rechercher un document..." /></label></div>
          {error && <p className="m-4 bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
          {loading ? <p className="p-12 text-center text-[13px] text-[#68717d]">Chargement...</p> : filtered.length ? (
            <table className="w-full min-w-[800px] text-left text-[13px]"><thead className="bg-[#f6f7f7] text-[#5f6976]"><tr>{["Code", "Document", "Entité", "Statut", "Expiration", "Actions"].map((label) => <th className="px-4 py-3 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map((item) => <tr className="border-t border-[#eceeef] hover:bg-[#fafafa]" key={item.id}><td className="px-4 py-3 font-semibold">{item.document_code}</td><td>{item.title}<small className="block text-[#7a8188]">{item.file_name}</small></td><td>{item.entity_type}</td><td><Status value={item.status} /></td><td>{item.expires_at || "—"}</td><td className="space-x-3"><button className="font-medium text-[#087a46]" onClick={async () => window.open(await downloadDoc(item.id), "_blank")}>Ouvrir</button>{item.status === "PENDING_REVIEW" && <><button onClick={() => reviewDoc(item.id, "VALID").then(load)}>Valider</button><button className="text-red-600" onClick={() => { const reason = prompt("Motif du rejet"); if (reason) reviewDoc(item.id, "REJECTED", reason).then(load); }}>Rejeter</button></>}</td></tr>)}</tbody></table>
          ) : <div className="grid min-h-64 place-items-center text-center"><div><FolderOpen className="mx-auto text-[#9299a0]" /><p className="mt-3 text-[13px] font-medium">Aucun document dans cette vue</p><p className="mt-1 text-[11px] text-[#7a8188]">Les pièces liées aux opérations apparaîtront ici.</p></div></div>}
        </section>
      </main>
      {open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}><form onSubmit={submit} className="w-full max-w-xl rounded-[8px] border border-[#d7dade] bg-white shadow-2xl"><div className="flex h-14 items-center border-b px-5"><h2 className="font-semibold">Ajouter un document</h2><button type="button" aria-label="Fermer" onClick={() => setOpen(false)} className="ml-auto"><X size={18} /></button></div><div className="grid gap-3 p-5 sm:grid-cols-2"><input required name="document_code" className={input} placeholder="Code document" /><input required name="document_type" className={input} placeholder="Type" /><input required name="title" className={`${input} sm:col-span-2`} placeholder="Titre" /><select name="entity_type" className={input}><option>SHIPMENT</option><option>DOSSIER</option><option>PACKAGE</option><option>CLIENT</option><option>DEPARTURE</option><option>ORGANIZATION</option></select><input required name="entity_id" className={input} placeholder="ID de l’entité" /><input name="issued_at" type="date" className={input} /><input name="expires_at" type="date" className={input} /><input name="issuer" className={`${input} sm:col-span-2`} placeholder="Émetteur" /><input required name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sm:col-span-2 text-[12px]" /></div><div className="flex justify-end gap-2 border-t p-4"><button type="button" className={button} onClick={() => setOpen(false)}>Annuler</button><button className={primary}>Enregistrer</button></div></form></div>}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) { return <div className="flex min-h-[76px] items-center gap-3 border-b border-r border-[#eceeef] px-4 py-3 sm:border-b-0"><span className="text-[#087a46]">{icon}</span><div><p className="text-[11px] text-[#6d747c]">{label}</p><p className="text-[20px] font-semibold">{value}</p></div></div>; }
function Status({ value }: { value: string }) { const style = value === "VALID" ? "bg-emerald-50 text-emerald-700" : value === "REJECTED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"; return <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${style}`}>{value}</span>; }
