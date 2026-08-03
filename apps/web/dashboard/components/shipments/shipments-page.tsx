"use client";

import axios from "axios";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  MoreHorizontal,
  Plane,
  Plus,
  Search,
  Ship,
  Truck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "@/services/api";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import {PermissionGuard} from "@/components/permissions/permission-guard";
import {
  createShipment,
  exportShipments,
  getShipmentStats,
  getShipmentAnalytics,
  listShipments,
  notifyShipmentsBulk,
  type ExpeditionMode,
  type ExpeditionPayload,
  type ExpeditionRecord,
  type ExpeditionStats,
  type ShipmentAnalytics,
  type ExpeditionStatus,
  type RiskLevel,
} from "@/services/shipments";

const statusLabels: Record<ExpeditionStatus, string> = {
  DRAFT: "Brouillon",
  PREPARING: "Préparation",
  LOADING: "Chargement",
  READY_FOR_DEPARTURE: "Prêt départ",
  DISPATCHED: "Expédiée",
  IN_TRANSIT: "En transit",
  ARRIVED_DESTINATION: "Arrivée",
  CUSTOMS_CLEARANCE: "Douane",
  AVAILABLE_FOR_PICKUP: "Disponible",
  OUT_FOR_DELIVERY: "Livraison",
  DELIVERED: "Livrée",
  BLOCKED: "Bloquée",
  CANCELLED: "Annulée",
  ARCHIVED: "Archivée",
};

const statusStyles: Record<ExpeditionStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 ring-slate-200",
  PREPARING: "bg-amber-50 text-amber-700 ring-amber-100",
  LOADING: "bg-orange-50 text-orange-700 ring-orange-100",
  READY_FOR_DEPARTURE: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  DISPATCHED: "bg-blue-50 text-blue-700 ring-blue-100",
  IN_TRANSIT: "bg-blue-50 text-blue-700 ring-blue-100",
  ARRIVED_DESTINATION: "bg-purple-50 text-purple-700 ring-purple-100",
  CUSTOMS_CLEARANCE: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  AVAILABLE_FOR_PICKUP: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  OUT_FOR_DELIVERY: "bg-teal-50 text-teal-700 ring-teal-100",
  DELIVERED: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  BLOCKED: "bg-red-50 text-red-700 ring-red-100",
  CANCELLED: "bg-gray-100 text-gray-700 ring-gray-200",
  ARCHIVED: "bg-gray-100 text-gray-700 ring-gray-200",
};

const modeLabels: Record<ExpeditionMode, string> = {
  AIR: "Air",
  SEA: "Mer",
  ROAD: "Route",
  EXPRESS: "Express",
  GROUPAGE: "Groupage",
  OTHER: "Autre",
};

const riskLabels: Record<RiskLevel, string> = {
  LOW: "Faible",
  MEDIUM: "Moyen",
  HIGH: "Élevé",
  CRITICAL: "Critique",
};

const emptyStats: ExpeditionStats = {
  active: 0,
  today: 0,
  in_transit: 0,
  arrivals_today: 0,
  delayed: 0,
  delivery_rate: 0,
  total_weight_kg: 0,
  total_volume_cbm: 0,
};

const views: Array<{ key: string; label: string; status?: ExpeditionStatus }> = [
  { key: "all", label: "Toutes" },
  { key: "preparing", label: "Préparation", status: "PREPARING" },
  { key: "transit", label: "En transit", status: "IN_TRANSIT" },
  { key: "arrived", label: "Arrivées", status: "ARRIVED_DESTINATION" },
  { key: "customs", label: "Douane", status: "CUSTOMS_CLEARANCE" },
  { key: "delivered", label: "Livrées", status: "DELIVERED" },
  { key: "blocked", label: "Bloquées", status: "BLOCKED" },
];

const buttonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px] font-medium text-[#1f2328] shadow-sm transition hover:bg-[#f7f8fa]";
const primaryButtonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#12c76f] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0fb966]";
const pagerButtonClass = "flex h-8 w-8 items-center justify-center rounded-md border border-[#cfd5dd] bg-white text-[#334155] shadow-sm disabled:opacity-40";

type Pagination = { page: number; page_size: number; total: number; total_pages: number };

export function ShipmentsPage() {
  const router = useRouter();
  const [shipments, setShipments] = useState<ExpeditionRecord[]>([]);
  const [stats, setStats] = useState<ExpeditionStats>(emptyStats);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: 30, total: 0, total_pages: 0 });
  const [activeView, setActiveView] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ExpeditionStatus | "">("");
  const [mode, setMode] = useState<ExpeditionMode | "">("");
  const [risk, setRisk] = useState<RiskLevel | "">("");
  const [sort, setSort] = useState("updated_desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [allMetrics,setAllMetrics]=useState(false);
  const [analyticsOpen,setAnalyticsOpen]=useState(false);
  const [analytics,setAnalytics]=useState<ShipmentAnalytics|null>(null);
  const [selected,setSelected]=useState<string[]>([]);

  const currentView = views.find((view) => view.key === activeView) || views[0];
  const page = pagination.page || 1;

  useEffect(() => {
    const timeout = window.setTimeout(() => loadShipments(1), 180);
    return () => window.clearTimeout(timeout);
    // The listed filters intentionally define when the debounced request runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, mode, risk, sort, activeView]);

  useEffect(() => {
    loadStats();
    void getShipmentAnalytics().then(setAnalytics).catch(()=>setAnalytics(null));
  }, []);

  const statusParam = currentView.status || status || "";

  async function loadStats() {
    try {
      setStats(await getShipmentStats());
    } catch {
      setStats(emptyStats);
    }
  }

  async function loadShipments(nextPage = page) {
    setLoading(true);
    setError("");
    try {
      const response = await listShipments({
        q: query || undefined,
        status: statusParam,
        mode,
        risk_level: risk,
        sort,
        page: nextPage,
        page_size: 30,
      });
      setShipments(response.items);
      setPagination(response.pagination);
    } catch (err) {
      if (!API_BASE_URL) {
        setError("API injoignable. Configurez NEXT_PUBLIC_API_BASE_URL avec l'URL du backend.");
      } else if (axios.isAxiosError(err) && err.response?.status) {
        setError(`Erreur API (${err.response.status}). ${String(err.response.data?.detail || "Impossible de charger les expéditions.")}`);
      } else {
        setError("Erreur API réseau. Vérifiez le backend et la configuration CORS.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    const payload: ExpeditionPayload = {
      title: value(form, "title"),
      status: value(form, "status") as ExpeditionStatus,
      mode: value(form, "mode") as ExpeditionMode,
      service_type: value(form, "service_type"),
      risk_level: value(form, "risk_level") as RiskLevel,
      origin_country: value(form, "origin_country"),
      origin_city: value(form, "origin_city"),
      origin_warehouse: value(form, "origin_warehouse"),
      destination_country: value(form, "destination_country"),
      destination_city: value(form, "destination_city"),
      destination_warehouse: value(form, "destination_warehouse"),
      route_label: value(form, "route_label"),
      carrier_name: value(form, "carrier_name"),
      flight_number: value(form, "flight_number"),
      container_number: value(form, "container_number"),
      awb_number: value(form, "awb_number"),
      bl_number: value(form, "bl_number"),
      batch_reference: value(form, "batch_reference"),
      owner_name: value(form, "owner_name"),
      planned_departure_at: value(form, "planned_departure_at"),
      eta_at: value(form, "eta_at"),
      currency: value(form, "currency") || "USD",
      notes: value(form, "notes"),
    };
    try {
      const created = await createShipment(clean(payload));
      setFormOpen(false);
      await Promise.all([loadShipments(1), loadStats()]);
      router.push(`/app/shipments/${created.id}`);
    } catch (err) {
      setFormError(axios.isAxiosError(err) ? String(err.response?.data?.detail || "Création impossible.") : "Création impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    const blob = await exportShipments({ q: query || undefined, status: statusParam, mode, risk_level: risk, sort });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "expeditions.csv";
    link.click();
    URL.revokeObjectURL(href);
  }

  const kpis = useMemo(() => [
    { label: "Expéditions actives", value: stats.active, icon: Plane },
    { label: "Aujourd'hui", value: stats.today, icon: CalendarClock },
    { label: "En transit", value: stats.in_transit, icon: Truck },
    { label: "Arrivées aujourd'hui", value: stats.arrivals_today, icon: Ship },
    { label: "Retards", value: stats.delayed, icon: AlertCircle, warm: true },
    { label: "Taux livraison", value: `${stats.delivery_rate || 0}%`, icon: ArrowRight },
  ], [stats]);

  return (
    <div className="min-h-full bg-[#f7f7f6] text-[#1f2328]">
      <section className="overflow-hidden bg-white">
        <OperationPageHeader title="Expéditions" description="Pilotez les transports réels de vos colis : routes, ETA, statuts, clients concernés, documents, coûts et risques."
          actions={<><button className={buttonClass} onClick={()=>setAnalyticsOpen(value=>!value)}>{analyticsOpen?'Liste':'Analytics'}</button><details className="relative"><summary className={`${buttonClass} cursor-pointer list-none`}>Plus</summary><div className="absolute right-0 z-30 mt-1 w-44 rounded-md bg-white p-1 shadow-[0_8px_30px_rgba(15,23,42,.14)] ring-1 ring-[#e8eaed]"><PermissionGuard permission="shipments.read"><button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] hover:bg-[#f5f6f7]" onClick={handleExport}><Download size={14}/>Exporter CSV</button></PermissionGuard></div></details><PermissionGuard permission="shipments.create"><button className={primaryButtonClass} onClick={() => setFormOpen(true)}><Plus size={16} /> Nouvelle expédition</button></PermissionGuard></>}
        />

        <div className="bg-white px-5 py-4"><div className={`grid grid-cols-2 ${allMetrics?'lg:grid-cols-6':'lg:grid-cols-4'}`}>{kpis.slice(0,allMetrics?6:4).map((item,index)=><button type="button" onClick={()=>setAllMetrics(value=>!value)} className={`px-4 py-1 text-left ${index?'border-l border-[#eceef1]':''}`} key={item.label}><div className="text-[12px] text-[#6b7580]">{item.label}</div><div className={`mt-1 text-[24px] font-medium tracking-[-.035em] ${item.warm?'text-[#a65f00]':''}`}>{item.value}</div></button>)}</div><button onClick={()=>setAllMetrics(value=>!value)} className="mt-3 text-[11px] font-medium text-[#5b52c7]">{allMetrics?'Réduire les indicateurs':'Voir tous les indicateurs'}</button></div>

        {analyticsOpen?<ShipmentAnalyticsView data={analytics}/>:<><div className="border-y border-[#eceef1] px-4 pt-2">
          <div className="flex flex-wrap items-center gap-1">
            {views.slice(0,4).map((view) => (
              <button
                className={`rounded-t-md px-3 py-2 text-[13px] font-medium transition ${activeView === view.key ? "border-b-2 border-[#12c76f] bg-[#effaf4] text-[#067a45]" : "text-[#526071] hover:bg-[#f2f4f7]"}`}
                key={view.key}
                onClick={() => {
                  setActiveView(view.key);
                  setStatus("");
                }}
              >
                {view.label}
              </button>
            ))}
            <select aria-label="Autres vues" value={views.slice(4).some(view=>view.key===activeView)?activeView:""} onChange={event=>{setActiveView(event.target.value);setStatus("")}} className="ml-1 h-8 rounded-md bg-[#f3f4f5] px-2 text-[12px] text-[#59636e] outline-none"><option value="">Plus</option>{views.slice(4).map(view=><option key={view.key} value={view.key}>{view.label}</option>)}</select>
          </div>
        </div>

        <div className="border-b border-[#eceef1] px-4 py-2.5"><div className="flex flex-wrap items-center gap-2"><label className="flex h-9 min-w-[280px] flex-1 items-center rounded-md bg-[#f4f5f6] px-3 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#a9a3f1]"><Search className="text-[#7b8794]" size={16}/><input className="ml-2 flex-1 bg-transparent text-[13px] outline-none" placeholder="Rechercher une expédition…" value={query} onChange={event=>setQuery(event.target.value)}/></label><button className={buttonClass} onClick={()=>setFiltersOpen(value=>!value)}><Filter size={15}/>Filtres</button></div>{filtersOpen&&<div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-[#f6f7f8] p-3">
            <select className="h-9 rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px]" value={status} onChange={(event) => setStatus(event.target.value as ExpeditionStatus | "")} disabled={Boolean(currentView.status)}>
              <option value="">Statut</option>
              {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select className="h-9 rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px]" value={mode} onChange={(event) => setMode(event.target.value as ExpeditionMode | "")}>
              <option value="">Mode</option>
              {Object.entries(modeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select className="h-9 rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px]" value={risk} onChange={(event) => setRisk(event.target.value as RiskLevel | "")}>
              <option value="">Risque</option>
              {Object.entries(riskLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select className="h-9 rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px]" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="updated_desc">Mise à jour récente</option>
              <option value="eta_asc">ETA proche</option>
              <option value="created_desc">Création récente</option>
              <option value="reference_asc">Référence A-Z</option>
            </select>
          </div>}</div>

        {error ? (
          <div className="m-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</div>
        ) : null}

        {selected.length>0&&<div className="flex items-center justify-between bg-[#f0efff] px-4 py-2 text-[12px] text-[#5149bd]"><span>{selected.length} expédition(s) sélectionnée(s)</span><PermissionGuard permission="shipments.update"><button className={buttonClass} onClick={async()=>{const message=window.prompt("Message à envoyer aux clients concernés");if(message){await notifyShipmentsBulk(selected,message);setSelected([])}}}>Notifier les clients</button></PermissionGuard></div>}
        <div className="min-h-[460px] overflow-x-auto">
          {loading ? (
            <div className="flex h-[360px] items-center justify-center text-[#5f6b7a]"><Loader2 className="mr-2 animate-spin" size={18} /> Chargement des expéditions...</div>
          ) : shipments.length === 0 ? (
            <div className="flex h-[380px] flex-col items-center justify-center text-center">
              <Plane className="mb-3 text-[#8b96a5]" size={30} strokeWidth={1.6} />
              <h2 className="text-[18px] font-semibold">Aucune expédition trouvée</h2>
              <p className="mt-2 max-w-md text-[14px] leading-6 text-[#64748b]">Créez une expédition puis ajoutez les colis prêts à partir. Les indicateurs se recalculeront automatiquement.</p>
            </div>
          ) : (
            <table className="w-full min-w-[1180px] border-collapse text-left text-[13px]">
              <thead className="bg-[#fbfcfd] text-[#5f6b7a]">
                <tr className="border-b border-[#e6e9ee]">
                  <th className="w-10 px-4"><input type="checkbox" checked={shipments.length>0&&shipments.every(item=>selected.includes(item.id))} onChange={event=>setSelected(event.target.checked?shipments.map(item=>item.id):[])}/></th>
                  <th className="px-4 py-3 font-medium">Expédition</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 font-medium">Route</th>
                  <th className="px-4 py-3 font-medium">Clients</th>
                  <th className="px-4 py-3 font-medium">Colis</th>
                  <th className="px-4 py-3 font-medium">Poids</th>
                  <th className="px-4 py-3 font-medium">Volume</th>
                  <th className="px-4 py-3 font-medium">ETA</th>
                  <th className="px-4 py-3 font-medium">Responsable</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((shipment) => (
                  <tr className="cursor-pointer border-b border-[#edf0f3] hover:bg-[#f7faf9]" key={shipment.id} onClick={() => router.push(`/app/shipments/${shipment.id}`)}>
                    <td className="px-4" onClick={event=>event.stopPropagation()}><input type="checkbox" checked={selected.includes(shipment.id)} onChange={()=>setSelected(selected.includes(shipment.id)?selected.filter(id=>id!==shipment.id):[...selected,shipment.id])}/></td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#1f2328]">{shipment.expedition_reference}</div>
                      <div className="text-[#64748b]">{shipment.title || shipment.batch_reference || "Expédition cargo"}</div>
                    </td>
                    <td className="px-4 py-3"><Badge className={statusStyles[shipment.status]}>{statusLabels[shipment.status]}</Badge></td>
                    <td className="px-4 py-3">{modeLabels[shipment.mode]}</td>
                    <td className="px-4 py-3">
                      <div>{shipment.route_label || `${shipment.origin_country || "-"} → ${shipment.destination_country || "-"}`}</div>
                      <div className="text-[#64748b]">{shipment.origin_city || "-"} → {shipment.destination_city || "-"}</div>
                    </td>
                    <td className="px-4 py-3">{shipment.clients_count}</td>
                    <td className="px-4 py-3">{shipment.packages_count}</td>
                    <td className="px-4 py-3">{formatNumber(shipment.total_weight_kg)} kg</td>
                    <td className="px-4 py-3">{formatNumber(shipment.total_volume_cbm)} CBM</td>
                    <td className="px-4 py-3">{formatDate(shipment.eta_at)}</td>
                    <td className="px-4 py-3">{shipment.owner_name || "-"}</td>
                    <td className="px-4 py-3"><MoreHorizontal size={18} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#d8dce2] px-4 py-3 text-[13px] text-[#5f6b7a]">
          <span>{pagination.total ? `${(page - 1) * pagination.page_size + 1} – ${Math.min(page * pagination.page_size, pagination.total)} sur ${pagination.total} expéditions` : "0 expédition"}</span>
          <div className="flex items-center gap-2">
            <button className={pagerButtonClass} disabled={page <= 1} onClick={() => loadShipments(page - 1)}><ChevronLeft size={16} /></button>
            <span className="rounded-md bg-[#12c76f] px-3 py-1.5 font-semibold text-white">{page}</span>
            <button className={pagerButtonClass} disabled={!pagination.total_pages || page >= pagination.total_pages} onClick={() => loadShipments(page + 1)}><ChevronRight size={16} /></button>
          </div>
        </div></>}
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <form className="max-h-[88vh] w-full max-w-4xl overflow-auto rounded-lg border border-[#d8dce2] bg-white shadow-2xl" onSubmit={handleCreate}>
            <div className="flex items-center justify-between border-b border-[#d8dce2] px-5 py-4">
              <h2 className="text-[18px] font-semibold">Nouvelle expédition</h2>
              <button type="button" className={buttonClass} onClick={() => setFormOpen(false)}>Fermer</button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-3">
              <Field name="title" label="Titre" placeholder="China → Kinshasa Juin" />
              <Select name="status" label="Statut" options={statusLabels} defaultValue="PREPARING" />
              <Select name="mode" label="Mode" options={modeLabels} defaultValue="AIR" />
              <Field name="service_type" label="Service" placeholder="Air Cargo Premium" />
              <Select name="risk_level" label="Risque" options={riskLabels} defaultValue="LOW" />
              <Field name="currency" label="Devise" defaultValue="USD" />
              <Field name="origin_country" label="Pays départ" placeholder="Chine" />
              <Field name="origin_city" label="Ville départ" placeholder="Guangzhou" />
              <Field name="origin_warehouse" label="Entrepôt départ" placeholder="Entrepôt Guangzhou" />
              <Field name="destination_country" label="Pays arrivée" placeholder="RDC" />
              <Field name="destination_city" label="Ville arrivée" placeholder="Kinshasa" />
              <Field name="destination_warehouse" label="Entrepôt arrivée" placeholder="Agence Kinshasa" />
              <Field name="route_label" label="Route" placeholder="Chine → RDC" />
              <Field name="carrier_name" label="Transporteur" placeholder="Ethiopian Airlines" />
              <Field name="flight_number" label="Vol" placeholder="ET-840" />
              <Field name="container_number" label="Container" placeholder="MSCU..." />
              <Field name="awb_number" label="AWB" placeholder="157-..." />
              <Field name="bl_number" label="BL" placeholder="BL-..." />
              <Field name="batch_reference" label="Batch" placeholder="BATCH-CN-0626" />
              <Field name="owner_name" label="Responsable" placeholder="Country Manager" />
              <Field name="planned_departure_at" label="Départ prévu" type="datetime-local" />
              <Field name="eta_at" label="ETA" type="datetime-local" />
              <label className="md:col-span-3">
                <span className="mb-1 block text-[13px] font-medium text-[#334155]">Notes</span>
                <textarea name="notes" className="min-h-24 w-full rounded-md border border-[#cfd5dd] px-3 py-2 text-[14px] outline-none focus:border-[#12c76f]" placeholder="Notes internes pour l'équipe opérationnelle" />
              </label>
            </div>
            {formError ? <div className="mx-5 mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{formError}</div> : null}
            <div className="flex justify-end gap-2 border-t border-[#d8dce2] px-5 py-4">
              <button type="button" className={buttonClass} onClick={() => setFormOpen(false)}>Annuler</button>
              <button type="submit" className={primaryButtonClass} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Créer l&apos;expédition</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function ShipmentAnalyticsView({data}:{data:ShipmentAnalytics|null}){
 if(!data)return <div className="flex min-h-[420px] items-center justify-center text-[13px] text-[#687584]">Analytics indisponibles.</div>;
 const delivered=data.summary.delivered||0;const etaRate=Math.round(data.summary.on_time/delivered*100)||0;
 const groups:[[string,string|number],...Array<[string,string|number]>]=[["Respect des ETA",`${etaRate}%`],["Transit moyen",data.summary.average_transit_hours==null?"—":`${data.summary.average_transit_hours} h`],["Poids transporté",`${formatNumber(data.summary.total_weight_kg)} kg`],["Volume",`${formatNumber(data.summary.total_volume_cbm)} CBM`]];
 return <div className="space-y-4 bg-[#f7f7f6] p-5"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{groups.map(([label,value])=><div key={label} className="rounded-lg bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]"><p className="text-[12px] text-[#687584]">{label}</p><p className="mt-2 text-[25px] font-medium">{value}</p></div>)}</div><div className="grid gap-4 lg:grid-cols-2"><AnalyticsRows title="Par statut" rows={data.by_status}/><AnalyticsRows title="Par mode" rows={data.by_mode}/><AnalyticsRows title="Routes principales" rows={data.by_route}/><AnalyticsRows title="Retards par route" rows={data.delays_by_route}/><AnalyticsRows title="Livraisons mensuelles" rows={data.monthly_deliveries}/></div></div>
}
function AnalyticsRows({title,rows}:{title:string;rows:Array<{label:string;count:number}>}){return <section className="rounded-lg bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]"><h3 className="mb-2 text-[14px] font-semibold">{title}</h3>{rows.map(row=><div key={row.label} className="flex justify-between border-b border-[#f0f1f3] py-2 text-[12px]"><span>{row.label}</span><b>{row.count}</b></div>)}{!rows.length&&<p className="py-4 text-[12px] text-[#687584]">Aucune donnée.</p>}</section>}

function Field({ label, name, placeholder, type = "text", defaultValue }: { label: string; name: string; placeholder?: string; type?: string; defaultValue?: string }) {
  return (
    <label>
      <span className="mb-1 block text-[13px] font-medium text-[#334155]">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className="h-9 w-full rounded-md border border-[#cfd5dd] px-3 text-[14px] outline-none focus:border-[#12c76f]" />
    </label>
  );
}

function Select({ label, name, options, defaultValue }: { label: string; name: string; options: Record<string, string>; defaultValue?: string }) {
  return (
    <label>
      <span className="mb-1 block text-[13px] font-medium text-[#334155]">{label}</span>
      <select name={name} defaultValue={defaultValue} className="h-9 w-full rounded-md border border-[#cfd5dd] bg-white px-3 text-[14px] outline-none focus:border-[#12c76f]">
        {Object.entries(options).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
      </select>
    </label>
  );
}

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-[12px] font-medium ring-1 ${className}`}>{children}</span>;
}

function value(form: FormData, key: string) {
  const raw = String(form.get(key) || "").trim();
  return raw || undefined;
}

function clean<T extends Record<string, unknown>>(payload: T): T {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== "")) as T;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(value || 0));
}
