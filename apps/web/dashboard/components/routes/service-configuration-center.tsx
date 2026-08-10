"use client";

import { FormEvent, useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import {
  addAdjustment,
  addDeparture,
  addPolicy,
  addStop,
  catalog,
  serviceConfiguration,
  type Service,
} from "@/services/route-catalog";

const primary = "h-9 rounded-[5px] bg-[#167d57] px-3 text-[13px] font-semibold text-white hover:bg-[#116b49]";
const input = "h-9 w-full rounded-[5px] border border-[#cfd4d6] bg-white px-3 text-[13px] outline-none focus:border-[#167d57] focus:ring-2 focus:ring-[#167d57]/10";

const sections = [
  ["stop", "Escales"],
  ["departure", "Départs"],
  ["policy", "Restrictions"],
  ["adjustment", "Ajustements"],
] as const;

export function ServiceConfigurationCenter() {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [service, setService] = useState("");
  const [kind, setKind] = useState<(typeof sections)[number][0]>("stop");
  const [summary, setSummary] = useState<Record<string, unknown[]> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) catalog().then((value) => setServices(value.services)).catch(() => setError("Les services sont indisponibles."));
  }, [open]);

  async function load(id: string) {
    setService(id);
    setError("");
    setSummary(id ? await serviceConfiguration(id) : null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "");
    const number = (key: string) => Number(form.get(key) || 0);
    try {
      if (kind === "stop") await addStop(service, { position: number("position"), country_code: value("country") || null, city: value("city") || null, location_name: value("name"), stop_type: value("type"), planned_duration_hours: number("hours") });
      if (kind === "departure") await addDeparture(service, { weekday: number("weekday"), cutoff_time: value("cutoff") || null, departure_time: value("departure") || null, capacity_weight_kg: number("weight") || null, capacity_cbm: number("cbm") || null });
      if (kind === "policy") await addPolicy(service, { goods_category: value("category"), decision: value("decision"), required_documents: value("documents").split(",").map((item) => item.trim()).filter(Boolean), handling_instructions: value("instructions") || null });
      if (kind === "adjustment") await addAdjustment(service, { adjustment_code: value("code"), adjustment_name: value("name"), adjustment_type: value("adjustment_type"), amount_minor: Math.round(number("amount") * 100) || null, percentage: number("percentage") || null, client_id: value("client_id") || null, goods_category: value("category") || null, min_weight_kg: number("min_weight") || null, effective_from: new Date().toISOString(), effective_until: null, priority: 100 });
      await load(service);
      event.currentTarget.reset();
    } catch (cause) {
      setError((cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Configuration impossible.");
    }
  }

  return (
    <>
      <PermissionGuard permission="services.manage">
        <button className="fixed bottom-5 right-5 z-40 inline-flex h-10 items-center gap-2 rounded-[5px] bg-[#167d57] px-4 text-[13px] font-semibold text-white shadow-lg hover:bg-[#116b49]" onClick={() => setOpen(true)}>
          <Settings2 size={15} /> Configurer un service
        </button>
      </PermissionGuard>
      <OperationDrawer open={open} close={() => setOpen(false)} title="Configuration du service" description="Gérez les escales, départs, restrictions et ajustements tarifaires.">
        <div className="border-b border-[#e4e7e8] bg-[#fafbfb] p-5">
          <label className="mb-1.5 block text-[12px] font-medium text-[#4d555c]">Service à configurer</label>
          <select className={input} value={service} onChange={(event) => load(event.target.value)}>
            <option value="">Choisir un service</option>
            {services.map((item) => <option key={item.id} value={item.id}>{item.service_name}</option>)}
          </select>
        </div>
        {!service ? (
          <div className="grid min-h-[360px] place-items-center p-8 text-center"><div><Settings2 className="mx-auto mb-3 text-[#98a0a6]" size={28} /><p className="text-[14px] font-medium">Sélectionnez un service</p><p className="mt-1 text-[12px] text-[#6c747a]">Sa configuration opérationnelle apparaîtra ici.</p></div></div>
        ) : (
          <div className="p-5">
            <div className="mb-5 flex overflow-x-auto border-b border-[#dfe3e4]">
              {sections.map(([id, label]) => <button key={id} type="button" className={`h-10 shrink-0 border-b-2 px-3 text-[12px] ${kind === id ? "border-[#167d57] font-semibold text-[#145c43]" : "border-transparent text-[#687077] hover:text-[#2e3439]"}`} onClick={() => setKind(id)}>{label}</button>)}
            </div>
            {summary && <div className="mb-5 grid grid-cols-2 border border-[#e0e3e4] bg-white sm:grid-cols-4">{Object.entries(summary).map(([key, items], index) => <div key={key} className={`p-3 ${index ? "border-l border-[#e0e3e4]" : ""}`}><b className="block text-[18px] text-[#242a2e]">{items.length}</b><span className="text-[11px] capitalize text-[#737b81]">{key}</span></div>)}</div>}
            <form onSubmit={submit} className="grid gap-3 border border-[#dfe3e4] bg-white p-4">
              {kind === "stop" && <><input required name="position" type="number" min="1" className={input} placeholder="Position" /><input required name="name" className={input} placeholder="Hub ou escale" /><input name="country" className={input} placeholder="Pays" /><input name="city" className={input} placeholder="Ville" /><select name="type" className={input}><option>HUB</option><option>WAREHOUSE</option><option>OFFICE</option></select><input name="hours" type="number" className={input} placeholder="Durée prévue (heures)" /></>}
              {kind === "departure" && <><input required name="weekday" type="number" min="1" max="7" className={input} placeholder="Jour (1 = lundi)" /><input name="cutoff" type="time" className={input} /><input name="departure" type="time" className={input} /><input name="weight" type="number" className={input} placeholder="Capacité (kg)" /><input name="cbm" type="number" step=".001" className={input} placeholder="Capacité (CBM)" /></>}
              {kind === "policy" && <><input required name="category" className={input} placeholder="Catégorie de marchandise" /><select name="decision" className={input}><option>ALLOWED</option><option>REVIEW_REQUIRED</option><option>RESTRICTED</option><option>PROHIBITED</option></select><input name="documents" className={input} placeholder="Documents séparés par des virgules" /><input name="instructions" className={input} placeholder="Instructions" /></>}
              {kind === "adjustment" && <><input required name="code" className={input} placeholder="Code" /><input required name="name" className={input} placeholder="Nom" /><select name="adjustment_type" className={input}><option>FIXED</option><option>PERCENTAGE</option></select><input name="amount" type="number" step=".01" className={input} placeholder="Montant fixe" /><input name="percentage" type="number" step=".01" className={input} placeholder="Pourcentage" /><input name="client_id" className={input} placeholder="Client ID (optionnel)" /><input name="category" className={input} placeholder="Marchandise (optionnel)" /><input name="min_weight" type="number" className={input} placeholder="Poids minimum" /></>}
              <div className="flex justify-end border-t border-[#eceeef] pt-3"><button className={primary}>Enregistrer</button></div>
            </form>
            {error && <p className="mt-3 border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
          </div>
        )}
      </OperationDrawer>
    </>
  );
}
