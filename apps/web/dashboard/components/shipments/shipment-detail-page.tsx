"use client";

import axios from "axios";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  MapPin,
  Package,
  Plus,
  RefreshCcw,
  Save,
  StickyNote,
  Truck,
  X,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { listPackages, type PackageRecord } from "@/services/packages";
import {
  addShipmentDocument,
  addShipmentFinancialLine,
  addShipmentNote,
  addShipmentPackage,
  createShipmentAnomaly,
  createShipmentNotification,
  getShipment,
  removeShipmentPackage,
  resolveShipmentAnomaly,
  updateShipment,
  updateShipmentCheckpoint,
  type ExpeditionDetail,
  type ExpeditionMode,
  type ExpeditionPayload,
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

const tabs = ["Overview", "Colis", "Clients", "Tracking", "Timeline", "Documents", "Finance", "Risques", "Notes", "Settings"] as const;
type Tab = (typeof tabs)[number];

const buttonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#cfd5dd] bg-white px-3 text-[13px] font-medium text-[#1f2328] shadow-sm transition hover:bg-[#f7f8fa]";
const primaryButtonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#12c76f] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0fb966]";

export function ShipmentDetailPage({ shipmentId }: { shipmentId: string }) {
  const [shipment, setShipment] = useState<ExpeditionDetail | null>(null);
  const [availablePackages, setAvailablePackages] = useState<PackageRecord[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, [shipmentId]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [detail, packageList] = await Promise.all([
        getShipment(shipmentId),
        listPackages({ page_size: 100, sort: "updated_desc" }),
      ]);
      setShipment(detail);
      setAvailablePackages(packageList.items);
    } catch (err) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail || `Erreur API (${err.response?.status || "réseau"})`) : "Impossible de charger cette expédition.");
    } finally {
      setLoading(false);
    }
  }

  async function mutate(action: () => Promise<ExpeditionDetail>) {
    setSaving(true);
    setError("");
    try {
      const next = await action();
      setShipment(next);
    } catch (err) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail || "Action impossible.") : "Action impossible.");
    } finally {
      setSaving(false);
    }
  }

  const progress = useMemo(() => {
    const checkpoints = shipment?.checkpoints || [];
    if (!checkpoints.length) return 0;
    return Math.round((checkpoints.filter((item) => item.status === "COMPLETED").length / checkpoints.length) * 100);
  }, [shipment]);

  if (loading) {
    return <div className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-[#f7f8fa] text-[#64748b]"><Loader2 className="mr-2 animate-spin" size={18} /> Chargement de l'expédition...</div>;
  }

  if (!shipment) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-[#f7f8fa] p-8">
        <Link className={buttonClass} href="/app/shipments"><ArrowLeft size={16} /> Retour</Link>
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-red-700">{error || "Expédition introuvable."}</div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#f7f8fa] px-8 py-6 text-[#1f2328]">
      <section className="mx-auto overflow-hidden rounded-lg border border-[#d8dce2] bg-white shadow-sm">
        <header className="border-b border-[#d8dce2] px-6 py-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <Link className={buttonClass} href="/app/shipments"><ArrowLeft size={16} /> Expéditions</Link>
            <div className="flex items-center gap-2">
              <button className={buttonClass} onClick={load}><RefreshCcw size={16} /> Actualiser</button>
              <button className={primaryButtonClass} onClick={() => setActiveTab("Colis")}><Plus size={16} /> Ajouter colis</button>
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="mb-2 text-[13px] text-[#5f6b7a]">Operations <span className="mx-1">›</span> Expéditions <span className="mx-1">›</span> {shipment.expedition_reference}</div>
              <h1 className="text-[34px] font-semibold tracking-[-0.02em]">{shipment.expedition_reference}</h1>
              <p className="mt-2 text-[15px] text-[#5f6b7a]">
                {shipment.title || "Expédition cargo"} · {modeLabels[shipment.mode]} · {shipment.route_label || `${shipment.origin_country || "-"} → ${shipment.destination_country || "-"}`}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-right">
              <HeaderMetric label="ETA" value={formatDate(shipment.eta_at)} />
              <HeaderMetric label="Colis" value={shipment.packages_count} />
              <HeaderMetric label="Clients" value={shipment.clients_count} />
            </div>
          </div>
        </header>

        {error ? <div className="m-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</div> : null}

        <div className="flex overflow-x-auto border-b border-[#d8dce2] px-4">
          {tabs.map((tab) => (
            <button key={tab} className={`px-3 py-3 text-[13px] font-medium ${activeTab === tab ? "border-b-2 border-[#12c76f] text-[#067a45]" : "text-[#526071] hover:text-[#1f2328]"}`} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === "Overview" ? <Overview shipment={shipment} progress={progress} setTab={setActiveTab} /> : null}
          {activeTab === "Colis" ? (
            <PackagesTab
              shipment={shipment}
              availablePackages={availablePackages}
              saving={saving}
              onAdd={(packageId) => mutate(() => addShipmentPackage(shipment.id, packageId))}
              onRemove={(packageId) => mutate(() => removeShipmentPackage(shipment.id, packageId, "Retiré depuis la fiche expédition"))}
            />
          ) : null}
          {activeTab === "Clients" ? <ClientsTab shipment={shipment} /> : null}
          {activeTab === "Tracking" ? <TrackingTab shipment={shipment} saving={saving} onComplete={(key) => mutate(() => updateShipmentCheckpoint(shipment.id, key, { status: "COMPLETED", completed_at: new Date().toISOString() }))} /> : null}
          {activeTab === "Timeline" ? <TimelineTab shipment={shipment} /> : null}
          {activeTab === "Documents" ? <DocumentsTab shipment={shipment} saving={saving} onSubmit={(payload) => mutate(() => addShipmentDocument(shipment.id, payload))} /> : null}
          {activeTab === "Finance" ? <FinanceTab shipment={shipment} saving={saving} onSubmit={(payload) => mutate(() => addShipmentFinancialLine(shipment.id, payload))} /> : null}
          {activeTab === "Risques" ? (
            <RisksTab
              shipment={shipment}
              saving={saving}
              onSubmit={(payload) => mutate(() => createShipmentAnomaly(shipment.id, payload))}
              onResolve={(id) => mutate(() => resolveShipmentAnomaly(shipment.id, id, "Résolu depuis le dashboard"))}
              onNotify={(message) => mutate(() => createShipmentNotification(shipment.id, { message, audience: "ALL_CLIENTS", channel: "whatsapp" }))}
            />
          ) : null}
          {activeTab === "Notes" ? <NotesTab shipment={shipment} saving={saving} onSubmit={(note) => mutate(() => addShipmentNote(shipment.id, { note }))} /> : null}
          {activeTab === "Settings" ? <SettingsTab shipment={shipment} saving={saving} onSubmit={(payload) => mutate(() => updateShipment(shipment.id, payload))} /> : null}
        </div>
      </section>
    </div>
  );
}

function Overview({ shipment, progress, setTab }: { shipment: ExpeditionDetail; progress: number; setTab: (tab: Tab) => void }) {
  const riskText = shipment.open_anomalies ? `${shipment.open_anomalies} anomalie(s) ouverte(s)` : "Risque opérationnel maîtrisé";
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <Card title="Route opérationnelle">
          <div className="flex items-center justify-between gap-5">
            <RoutePoint label="Départ" city={shipment.origin_city} country={shipment.origin_country} warehouse={shipment.origin_warehouse} />
            <ArrowLine />
            <RoutePoint label="Transit" city={shipment.carrier_name || shipment.mode} country={shipment.service_type} warehouse={shipment.flight_number || shipment.container_number} />
            <ArrowLine />
            <RoutePoint label="Destination" city={shipment.destination_city} country={shipment.destination_country} warehouse={shipment.destination_warehouse} />
          </div>
        </Card>
        <Card title="Progression">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[14px] text-[#64748b]">Progression logistique</span>
            <span className="font-semibold text-[#067a45]">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#edf1f5]"><div className="h-full rounded-full bg-[#12c76f]" style={{ width: `${progress}%` }} /></div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {shipment.checkpoints.map((checkpoint) => (
              <div key={checkpoint.id} className="rounded-md border border-[#e1e6ec] bg-[#fbfcfd] p-3">
                <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full ${checkpoint.status === "COMPLETED" ? "bg-[#12c76f] text-white" : "bg-white text-[#64748b] ring-1 ring-[#d8dce2]"}`}>
                  {checkpoint.status === "COMPLETED" ? <CheckCircle2 size={16} /> : checkpoint.position}
                </div>
                <div className="font-medium">{checkpoint.title}</div>
                <div className="mt-1 text-[12px] text-[#64748b]">{checkpoint.location || formatDate(checkpoint.completed_at || checkpoint.planned_at)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="space-y-5">
        <Card title="Résumé expédition">
          <SummaryLine label="Colis" value={shipment.packages_count} />
          <SummaryLine label="Clients" value={shipment.clients_count} />
          <SummaryLine label="Poids total" value={`${formatNumber(shipment.total_weight_kg)} kg`} />
          <SummaryLine label="Volume" value={`${formatNumber(shipment.total_volume_cbm)} CBM`} />
          <SummaryLine label="Risque" value={riskText} />
          <SummaryLine label="Profit estimé" value={`${formatMoney(shipment.profit_total, shipment.currency)}`} />
        </Card>
        <Card title="Actions rapides">
          <div className="grid gap-2">
            <button className={buttonClass} onClick={() => setTab("Colis")}><Package size={16} /> Ajouter des colis</button>
            <button className={buttonClass} onClick={() => setTab("Tracking")}><Truck size={16} /> Mettre à jour tracking</button>
            <button className={buttonClass} onClick={() => setTab("Risques")}><Bell size={16} /> Notifier les clients</button>
            <button className={buttonClass} onClick={() => setTab("Finance")}><DollarSign size={16} /> Ajouter coûts/revenus</button>
          </div>
        </Card>
        <Card title="Synthèse opérationnelle">
          <p className="text-[14px] leading-6 text-[#526071]">
            Cette expédition contient {shipment.packages_count} colis pour {shipment.clients_count} client(s). Le mode est {modeLabels[shipment.mode]} avec une ETA au {formatDate(shipment.eta_at)}. {shipment.is_delayed ? "Un retard est marqué, une communication client est recommandée." : "Aucun retard n'est marqué pour le moment."}
          </p>
        </Card>
      </div>
    </div>
  );
}

function PackagesTab({ shipment, availablePackages, saving, onAdd, onRemove }: { shipment: ExpeditionDetail; availablePackages: PackageRecord[]; saving: boolean; onAdd: (id: string) => void; onRemove: (id: string) => void }) {
  const attached = new Set(shipment.packages.map((item) => item.id));
  const candidates = availablePackages.filter((item) => !attached.has(item.id));
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const packageId = String(new FormData(event.currentTarget).get("package_id") || "");
    if (packageId) onAdd(packageId);
    event.currentTarget.reset();
  }
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-3 rounded-md border border-[#d8dce2] bg-[#fbfcfd] p-4" onSubmit={handleSubmit}>
        <label className="min-w-[320px] flex-1">
          <span className="mb-1 block text-[13px] font-medium text-[#334155]">Colis à ajouter</span>
          <select name="package_id" className="h-9 w-full rounded-md border border-[#cfd5dd] bg-white px-3 text-[14px]">
            <option value="">Sélectionner un colis</option>
            {candidates.map((item) => <option key={item.id} value={item.id}>{item.package_reference || item.tracking_id} · {item.client_name || "Client non renseigné"}</option>)}
          </select>
        </label>
        <button className={primaryButtonClass} disabled={saving}><Plus size={16} /> Ajouter</button>
      </form>
      <DataTable headers={["Colis", "Client", "Dossier", "Statut", "Poids", "Volume", "Paiement", ""]}>
        {shipment.packages.map((item) => (
          <tr className="border-b border-[#edf0f3]" key={item.id}>
            <td className="px-4 py-3 font-semibold">{item.package_reference || item.tracking_id}</td>
            <td className="px-4 py-3">{item.client_name || "-"}</td>
            <td className="px-4 py-3">{item.dossier_reference || "-"}</td>
            <td className="px-4 py-3">{item.status}</td>
            <td className="px-4 py-3">{formatNumber(item.weight_kg)} kg</td>
            <td className="px-4 py-3">{formatNumber(item.volume_cbm)} CBM</td>
            <td className="px-4 py-3">{item.payment_status}</td>
            <td className="px-4 py-3 text-right"><button className={buttonClass} onClick={() => onRemove(item.id)}><X size={15} /> Retirer</button></td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

function ClientsTab({ shipment }: { shipment: ExpeditionDetail }) {
  return (
    <DataTable headers={["Client", "Téléphone", "Email", "Colis", "Poids", "Valeur", "Paiement"]}>
      {shipment.clients.map((client) => (
        <tr className="border-b border-[#edf0f3]" key={client.id || client.name || "unknown"}>
          <td className="px-4 py-3 font-semibold">{client.name || "Client non renseigné"}</td>
          <td className="px-4 py-3">{client.phone || "-"}</td>
          <td className="px-4 py-3">{client.email || "-"}</td>
          <td className="px-4 py-3">{client.packages_count}</td>
          <td className="px-4 py-3">{formatNumber(client.total_weight_kg)} kg</td>
          <td className="px-4 py-3">{formatMoney(client.declared_value_total, shipment.currency)}</td>
          <td className="px-4 py-3">{client.unpaid_packages ? `${client.unpaid_packages} à vérifier` : "OK"}</td>
        </tr>
      ))}
    </DataTable>
  );
}

function TrackingTab({ shipment, saving, onComplete }: { shipment: ExpeditionDetail; saving: boolean; onComplete: (key: string) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <Card title="Timeline tracking">
        <div className="space-y-3">
          {shipment.checkpoints.map((checkpoint) => (
            <div key={checkpoint.id} className="flex gap-4 rounded-md border border-[#e1e6ec] bg-white p-4">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${checkpoint.status === "COMPLETED" ? "bg-[#12c76f] text-white" : "bg-[#f2f4f7] text-[#64748b]"}`}>
                {checkpoint.status === "COMPLETED" ? <CheckCircle2 size={18} /> : <Clock size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{checkpoint.title}</div>
                    <div className="mt-1 text-[13px] text-[#64748b]">{checkpoint.location || "Position non renseignée"} · {formatDate(checkpoint.completed_at || checkpoint.planned_at)}</div>
                  </div>
                  {checkpoint.status !== "COMPLETED" ? <button className={buttonClass} disabled={saving} onClick={() => onComplete(checkpoint.checkpoint_key)}><CheckCircle2 size={16} /> Terminer</button> : null}
                </div>
                {checkpoint.notes ? <p className="mt-2 text-[13px] text-[#526071]">{checkpoint.notes}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Dernière position">
        <MapPin className="mb-3 text-[#12c76f]" size={24} />
        <div className="text-[18px] font-semibold">{lastLocation(shipment)}</div>
        <p className="mt-2 text-[14px] leading-6 text-[#64748b]">Mettez à jour les étapes dès qu'un événement opérationnel est confirmé. La timeline servira ensuite aux notifications client.</p>
      </Card>
    </div>
  );
}

function TimelineTab({ shipment }: { shipment: ExpeditionDetail }) {
  return (
    <div className="space-y-3">
      {shipment.events.map((event) => (
        <div className="rounded-md border border-[#e1e6ec] bg-white p-4" key={event.id}>
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold">{event.title}</div>
            <div className="text-[12px] text-[#64748b]">{formatDateTime(event.occurred_at)}</div>
          </div>
          <div className="mt-1 text-[13px] text-[#64748b]">{event.description || event.event_type}</div>
        </div>
      ))}
    </div>
  );
}

function DocumentsTab({ shipment, saving, onSubmit }: { shipment: ExpeditionDetail; saving: boolean; onSubmit: (payload: { document_type?: string; file_url: string; file_name?: string; notes?: string }) => void }) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file_url = value(form, "file_url");
    if (!file_url) return;
    onSubmit({ document_type: value(form, "document_type"), file_url, file_name: value(form, "file_name"), notes: value(form, "notes") });
    event.currentTarget.reset();
  }
  return (
    <div className="space-y-4">
      <InlineForm onSubmit={handleSubmit} saving={saving} submitLabel="Ajouter document">
        <Field name="document_type" label="Type" placeholder="Manifest, AWB, BL..." />
        <Field name="file_name" label="Nom" placeholder="manifest-juillet.pdf" />
        <Field name="file_url" label="URL fichier" placeholder="https://..." required />
        <Field name="notes" label="Notes" placeholder="Document douane" />
      </InlineForm>
      <DataTable headers={["Type", "Nom", "URL", "Visibilité", "Ajouté le"]}>
        {shipment.documents.map((doc) => (
          <tr className="border-b border-[#edf0f3]" key={doc.id}>
            <td className="px-4 py-3 font-semibold">{doc.document_type}</td>
            <td className="px-4 py-3">{doc.file_name || "-"}</td>
            <td className="px-4 py-3"><a className="text-[#067a45] hover:underline" href={doc.file_url} target="_blank">Ouvrir</a></td>
            <td className="px-4 py-3">{doc.visibility}</td>
            <td className="px-4 py-3">{formatDate(doc.created_at)}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

function FinanceTab({ shipment, saving, onSubmit }: { shipment: ExpeditionDetail; saving: boolean; onSubmit: (payload: { line_type?: string; amount: number; direction?: "COST" | "REVENUE"; category?: string; description?: string; currency?: string }) => void }) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount") || 0);
    if (!amount) return;
    onSubmit({ line_type: value(form, "line_type"), category: value(form, "category"), description: value(form, "description"), direction: String(form.get("direction") || "COST") as "COST" | "REVENUE", amount, currency: value(form, "currency") || shipment.currency });
    event.currentTarget.reset();
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Revenus" value={formatMoney(shipment.billed_total, shipment.currency)} />
        <MetricCard label="Coûts" value={formatMoney(shipment.cost_total, shipment.currency)} warm />
        <MetricCard label="Profit" value={formatMoney(shipment.profit_total, shipment.currency)} />
      </div>
      <InlineForm onSubmit={handleSubmit} saving={saving} submitLabel="Ajouter ligne">
        <Field name="line_type" label="Type" placeholder="Transport, douane..." />
        <Field name="category" label="Catégorie" placeholder="Air freight" />
        <Select name="direction" label="Direction" options={{ COST: "Coût", REVENUE: "Revenu" }} />
        <Field name="amount" label="Montant" type="number" required />
        <Field name="currency" label="Devise" defaultValue={shipment.currency} />
        <Field name="description" label="Description" placeholder="Détail de la ligne" />
      </InlineForm>
      <DataTable headers={["Direction", "Type", "Catégorie", "Montant", "Statut", "Créé le"]}>
        {shipment.financial_lines.map((line) => (
          <tr className="border-b border-[#edf0f3]" key={line.id}>
            <td className="px-4 py-3">{line.direction}</td>
            <td className="px-4 py-3 font-semibold">{line.line_type}</td>
            <td className="px-4 py-3">{line.category || "-"}</td>
            <td className="px-4 py-3">{formatMoney(line.amount, line.currency)}</td>
            <td className="px-4 py-3">{line.status}</td>
            <td className="px-4 py-3">{formatDate(line.created_at)}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

function RisksTab({ shipment, saving, onSubmit, onResolve, onNotify }: { shipment: ExpeditionDetail; saving: boolean; onSubmit: (payload: { title: string; severity?: RiskLevel; anomaly_type?: string; description?: string }) => void; onResolve: (id: string) => void; onNotify: (message: string) => void }) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = value(form, "title");
    if (!title) return;
    onSubmit({ title, severity: String(form.get("severity") || "MEDIUM") as RiskLevel, anomaly_type: value(form, "anomaly_type"), description: value(form, "description") });
    event.currentTarget.reset();
  }
  return (
    <div className="space-y-4">
      <InlineForm onSubmit={handleSubmit} saving={saving} submitLabel="Signaler">
        <Field name="title" label="Titre" placeholder="Retard douane, colis manquant..." required />
        <Select name="severity" label="Sévérité" options={riskLabels} defaultValue="MEDIUM" />
        <Field name="anomaly_type" label="Type" placeholder="Douane, retard, document..." />
        <Field name="description" label="Description" placeholder="Contexte opérationnel" />
      </InlineForm>
      <div className="flex justify-end">
        <button className={buttonClass} onClick={() => onNotify(`Mise à jour expédition ${shipment.expedition_reference}: votre cargaison est actuellement au statut ${statusLabels[shipment.status]}.`)}>
          <Bell size={16} /> Préparer notification client
        </button>
      </div>
      <DataTable headers={["Anomalie", "Sévérité", "Statut", "Détectée", ""]}>
        {shipment.anomalies.map((anomaly) => (
          <tr className="border-b border-[#edf0f3]" key={anomaly.id}>
            <td className="px-4 py-3"><div className="font-semibold">{anomaly.title}</div><div className="text-[#64748b]">{anomaly.description || anomaly.anomaly_type}</div></td>
            <td className="px-4 py-3">{riskLabels[anomaly.severity]}</td>
            <td className="px-4 py-3">{anomaly.status}</td>
            <td className="px-4 py-3">{formatDate(anomaly.detected_at)}</td>
            <td className="px-4 py-3 text-right">{anomaly.status !== "RESOLVED" ? <button className={buttonClass} onClick={() => onResolve(anomaly.id)}><CheckCircle2 size={16} /> Résoudre</button> : null}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

function NotesTab({ shipment, saving, onSubmit }: { shipment: ExpeditionDetail; saving: boolean; onSubmit: (note: string) => void }) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = value(new FormData(event.currentTarget), "note");
    if (!note) return;
    onSubmit(note);
    event.currentTarget.reset();
  }
  return (
    <div className="space-y-4">
      <form className="rounded-md border border-[#d8dce2] bg-[#fbfcfd] p-4" onSubmit={handleSubmit}>
        <textarea name="note" className="min-h-24 w-full rounded-md border border-[#cfd5dd] px-3 py-2 text-[14px]" placeholder="Note privée pour cette expédition..." />
        <div className="mt-3 flex justify-end"><button className={primaryButtonClass} disabled={saving}><StickyNote size={16} /> Ajouter note</button></div>
      </form>
      <div className="grid gap-3 md:grid-cols-2">
        {shipment.notes_list.map((note) => (
          <div className="rounded-md border border-[#e1e6ec] bg-white p-4" key={note.id}>
            <div className="mb-2 text-[12px] text-[#64748b]">{formatDateTime(note.created_at)} · {note.priority}</div>
            <p className="text-[14px] leading-6">{note.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsTab({ shipment, saving, onSubmit }: { shipment: ExpeditionDetail; saving: boolean; onSubmit: (payload: ExpeditionPayload) => void }) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit(clean({
      title: value(form, "title"),
      status: value(form, "status") as ExpeditionStatus,
      mode: value(form, "mode") as ExpeditionMode,
      risk_level: value(form, "risk_level") as RiskLevel,
      eta_at: value(form, "eta_at"),
      is_delayed: form.get("is_delayed") === "on",
      delay_reason: value(form, "delay_reason"),
      owner_name: value(form, "owner_name"),
      notes: value(form, "notes"),
    }));
  }
  return (
    <form className="grid gap-4 md:grid-cols-3" onSubmit={handleSubmit}>
      <Field name="title" label="Titre" defaultValue={shipment.title || ""} />
      <Select name="status" label="Statut" options={statusLabels} defaultValue={shipment.status} />
      <Select name="mode" label="Mode" options={modeLabels} defaultValue={shipment.mode} />
      <Select name="risk_level" label="Risque" options={riskLabels} defaultValue={shipment.risk_level} />
      <Field name="eta_at" label="ETA" type="datetime-local" defaultValue={toDatetimeLocal(shipment.eta_at)} />
      <Field name="owner_name" label="Responsable" defaultValue={shipment.owner_name || ""} />
      <label className="flex items-center gap-2 text-[14px]">
        <input name="is_delayed" type="checkbox" defaultChecked={shipment.is_delayed} /> Marquer en retard
      </label>
      <Field name="delay_reason" label="Raison retard" defaultValue={shipment.delay_reason || ""} />
      <label className="md:col-span-3">
        <span className="mb-1 block text-[13px] font-medium text-[#334155]">Notes</span>
        <textarea name="notes" defaultValue={shipment.notes || ""} className="min-h-24 w-full rounded-md border border-[#cfd5dd] px-3 py-2 text-[14px]" />
      </label>
      <div className="md:col-span-3"><button className={primaryButtonClass} disabled={saving}><Save size={16} /> Enregistrer</button></div>
    </form>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[#d8dce2] bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-[16px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#d8dce2] bg-white">
      <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
        <thead className="bg-[#fbfcfd] text-[#5f6b7a]">
          <tr className="border-b border-[#e6e9ee]">{headers.map((header) => <th className="px-4 py-3 font-medium" key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function InlineForm({ children, saving, submitLabel, onSubmit }: { children: ReactNode; saving: boolean; submitLabel: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="grid gap-3 rounded-md border border-[#d8dce2] bg-[#fbfcfd] p-4 md:grid-cols-4" onSubmit={onSubmit}>
      {children}
      <div className="flex items-end"><button className={primaryButtonClass} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} {submitLabel}</button></div>
    </form>
  );
}

function Field({ label, name, placeholder, type = "text", defaultValue, required }: { label: string; name: string; placeholder?: string; type?: string; defaultValue?: string; required?: boolean }) {
  return (
    <label>
      <span className="mb-1 block text-[13px] font-medium text-[#334155]">{label}</span>
      <input name={name} required={required} type={type} defaultValue={defaultValue} placeholder={placeholder} className="h-9 w-full rounded-md border border-[#cfd5dd] bg-white px-3 text-[14px] outline-none focus:border-[#12c76f]" />
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

function HeaderMetric({ label, value }: { label: string; value: ReactNode }) {
  return <div><div className="text-[12px] text-[#64748b]">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;
}

function MetricCard({ label, value, warm }: { label: string; value: string; warm?: boolean }) {
  return <div className={`rounded-md border p-4 ${warm ? "border-amber-200 bg-amber-50" : "border-[#d8dce2] bg-white"}`}><div className="text-[13px] text-[#64748b]">{label}</div><div className="mt-2 text-[24px] font-medium">{value}</div></div>;
}

function SummaryLine({ label, value }: { label: string; value: ReactNode }) {
  return <div className="flex items-center justify-between border-b border-[#edf0f3] py-2 last:border-0"><span className="text-[#64748b]">{label}</span><span className="font-semibold">{value}</span></div>;
}

function RoutePoint({ label, city, country, warehouse }: { label: string; city?: string | null; country?: string | null; warehouse?: string | null }) {
  return <div className="min-w-0 flex-1 rounded-md border border-[#e1e6ec] bg-[#fbfcfd] p-4"><div className="text-[12px] text-[#64748b]">{label}</div><div className="mt-1 font-semibold">{city || "-"}</div><div className="text-[13px] text-[#64748b]">{country || ""}</div><div className="mt-2 truncate text-[12px] text-[#526071]">{warehouse || "Entrepôt non renseigné"}</div></div>;
}

function ArrowLine() {
  return <div className="hidden h-px min-w-12 bg-[#d8dce2] md:block" />;
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

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatMoney(value?: number | null, currency = "USD") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(Number(value || 0));
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function lastLocation(shipment: ExpeditionDetail) {
  const completed = [...shipment.checkpoints].reverse().find((item) => item.status === "COMPLETED" && item.location);
  return completed?.location || shipment.origin_city || shipment.destination_city || "Position non renseignée";
}
