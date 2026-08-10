"use client";

import { CalendarClock, PlaneTakeoff, RefreshCcw, Ship, Weight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { departures, transitionDeparture, type Departure } from "@/services/departures";

const button = "inline-flex h-8 items-center justify-center gap-1.5 rounded-[5px] border border-[#d6dadd] bg-white px-3 text-[12px] font-medium hover:bg-[#f5f6f6]";

export function DeparturesPage() {
  const [items, setItems] = useState<Departure[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { setItems(await departures()); } catch { setError("Calendrier indisponible."); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function move(item: Departure, status: string) { const reason = status === "CANCELLED" ? prompt("Motif obligatoire") || undefined : undefined; await transitionDeparture(item.id, status, item.row_version, reason); await load(); }
  const active = items.filter((item) => !["ARRIVED", "CANCELLED"].includes(item.status)).length;
  const weight = items.reduce((total, item) => total + Number(item.reserved_weight_kg || 0), 0);

  return <div className="min-h-full bg-[#f7f7f6]"><OperationPageHeader title="Calendrier des départs" description="Planifiez les capacités, cut-offs, chargements et départs réels de l’agence." actions={<button className={button} onClick={load}><RefreshCcw size={14} />Actualiser</button>} /><main className="py-4"><section className="grid border-y border-[#dfe1e3] bg-white sm:grid-cols-3"><Metric label="Départs planifiés" value={items.length} icon={<CalendarClock size={16} />} /><Metric label="Opérations actives" value={active} icon={<PlaneTakeoff size={16} />} /><Metric label="Poids réservé" value={`${weight.toLocaleString("fr-FR")} kg`} icon={<Weight size={16} />} /></section>{error && <p className="m-4 bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}<section className="mt-4 overflow-x-auto border-y border-[#dfe1e3] bg-white">{loading ? <p className="p-12 text-center text-[13px] text-[#68717d]">Chargement...</p> : items.length ? <table className="w-full min-w-[900px] text-left text-[13px]"><thead className="bg-[#f6f7f7] text-[#5f6976]"><tr>{["Départ", "Route et service", "Date prévue", "Capacité réservée", "Expéditions", "Statut", "Action"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-[#eceeef] hover:bg-[#fafafa]"><td className="px-4 py-3 font-semibold">{item.departure_code}</td><td>{item.route_name}<small className="block text-[#7a8188]">{item.service_name}</small></td><td>{new Date(item.scheduled_at).toLocaleString("fr-FR")}</td><td>{item.reserved_weight_kg}/{item.capacity_weight_kg || "∞"} kg<small className="block text-[#7a8188]">{item.reserved_cbm}/{item.capacity_cbm || "∞"} CBM</small></td><td>{item.shipment_count}</td><td><Status value={item.status} /></td><td><DepartureAction item={item} move={move} /></td></tr>)}</tbody></table> : <div className="grid min-h-64 place-items-center text-center"><div><Ship className="mx-auto text-[#9299a0]" /><p className="mt-3 text-[13px] font-medium">Aucun départ planifié</p><p className="mt-1 text-[11px] text-[#7a8188]">Les prochains départs apparaîtront ici.</p></div></div>}</section></main></div>;
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) { return <div className="flex min-h-[76px] items-center gap-3 border-b border-r border-[#eceeef] px-4 py-3 sm:border-b-0"><span className="text-[#087a46]">{icon}</span><div><p className="text-[11px] text-[#6d747c]">{label}</p><p className="text-[20px] font-semibold">{value}</p></div></div>; }
function Status({ value }: { value: string }) { const active = ["OPEN", "LOADING", "DEPARTED"].includes(value); return <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${active ? "bg-sky-50 text-sky-700" : value === "CANCELLED" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{value}</span>; }
function DepartureAction({ item, move }: { item: Departure; move: (item: Departure, status: string) => Promise<void> }) { if (item.status === "OPEN") return <div className="flex gap-1"><button className={button} onClick={() => move(item, "CLOSED")}>Fermer</button><button className={button} onClick={() => move(item, "CANCELLED")}>Annuler</button></div>; if (item.status === "CLOSED") return <button className={button} onClick={() => move(item, "LOADING")}>Charger</button>; if (item.status === "LOADING") return <button className={button} onClick={() => move(item, "DEPARTED")}>Confirmer départ</button>; if (item.status === "DEPARTED") return <button className={button} onClick={() => move(item, "ARRIVED")}>Confirmer arrivée</button>; return <span className="text-[11px] text-[#8a9097]">Terminé</span>; }
