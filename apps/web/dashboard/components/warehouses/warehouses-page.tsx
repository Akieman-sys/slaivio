"use client";

import { ChevronRight, Download, Plus, RotateCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { PermissionGuard } from "@/components/permissions/permission-guard";
import {
  FormSection,
  OperationButton,
  OperationField,
  OperationMetric,
  OperationMetricGrid,
} from "@/components/ui/operation-controls";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { OperationMetrics, OperationSearch, OperationTable, OperationToolbar } from "@/components/ui/operation-primitives";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/page-state";
import { getAdmin } from "@/services/organization-admin";
import {
  createWarehouse,
  exportWarehouseInventory,
  getWarehouseStats,
  listWarehouses,
  type Warehouse,
  type WarehouseStats,
} from "@/services/warehouses";

const input = "h-9 w-full rounded-[6px] border border-[#cfd5dd] bg-white px-3 text-[13px] outline-none focus:border-[#12c76f]";

const initialStats: WarehouseStats = {
  warehouses: 0,
  packages: 0,
  weight_kg: 0,
  volume_cbm: 0,
  anomalies: 0,
  transfers: 0,
};

export function WarehousesPage() {
  const [items, setItems] = useState<Warehouse[]>([]);
  const [stats, setStats] = useState<WarehouseStats>(initialStats);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [allMetrics, setAllMetrics] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, kpis] = await Promise.all([
        listWarehouses(query ? { q: query } : undefined),
        getWarehouseStats(),
      ]);
      setItems(rows);
      setStats(kpis);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function download() {
    try {
      const blob = await exportWarehouseInventory();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "slaivio-inventaire-entrepots.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const metrics = [
    { label: "Entrepôts", value: stats.warehouses },
    { label: "Colis stockés", value: stats.packages },
    { label: "Poids total", value: `${formatNumber(stats.weight_kg)} kg` },
    { label: "Volume", value: `${formatNumber(stats.volume_cbm)} m³` },
    { label: "Transferts", value: stats.transfers },
    { label: "Anomalies", value: stats.anomalies, tone: stats.anomalies ? "warning" as const : "default" as const },
  ];

  return <div className="min-h-full bg-[#f7f7f6]">
    <OperationPageHeader
      title="Entrepôts"
      description="Pilotez le stock, les emplacements, les transferts et les contrôles physiques."
      actions={<>
        <PermissionGuard permission="warehouses.export"><OperationButton onClick={download}><Download size={15} />Exporter</OperationButton></PermissionGuard>
        <PermissionGuard permission="warehouses.create"><OperationButton variant="primary" onClick={() => setCreateOpen(true)}><Plus size={15} />Nouvel entrepôt</OperationButton></PermissionGuard>
      </>}
    />
    <main>
      <OperationMetrics>
        <OperationMetricGrid className={allMetrics ? "lg:grid-cols-6" : "lg:grid-cols-4"}>
          {metrics.slice(0, allMetrics ? 6 : 4).map((metric) => <OperationMetric key={metric.label} {...metric} />)}
        </OperationMetricGrid>
        <button type="button" onClick={() => setAllMetrics((current) => !current)} className="mt-3 text-[11px] font-medium text-[#087a46]">
          {allMetrics ? "Réduire les indicateurs" : "Voir tous les indicateurs"}
        </button>
      </OperationMetrics>
      <OperationToolbar
        search={<OperationSearch value={query} onChange={setQuery} placeholder="Rechercher un entrepôt, une ville…" />}
        filters={<OperationButton onClick={load}><RotateCw size={14} />Actualiser</OperationButton>}
      />
      <section className="overflow-hidden bg-white">
        {error && !items.length ? <ErrorState title="Entrepôts indisponibles" description={error} retry={load} /> : loading ? <TableSkeleton /> : items.length ? (
          <OperationTable>
            <table className="w-full min-w-[980px] border-collapse text-left text-[13px]">
              <thead><tr className="border-b border-[#e6e9ee]">{["Entrepôt", "Localisation", "Responsable", "Colis", "Poids", "Capacité", "Alertes", ""].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead>
              <tbody>{items.map((warehouse) => <tr key={warehouse.id} className="h-11 border-b border-[#edf0f3] hover:bg-[#f7faf9]">
                <td className="px-4 py-3"><Link href={`/app/warehouses/${warehouse.id}`} className="font-semibold text-[#292654]">{warehouse.warehouse_name}</Link><p className="text-[11px] text-[#7a838e]">{warehouse.warehouse_code} · {warehouse.warehouse_type}</p></td>
                <td>{[warehouse.city, warehouse.country_code].filter(Boolean).join(", ") || "—"}</td>
                <td>{warehouse.manager_name || "Non assigné"}</td>
                <td>{warehouse.package_count}</td>
                <td>{formatNumber(warehouse.weight_kg)} kg</td>
                <td><Capacity warehouse={warehouse} /></td>
                <td><span className={warehouse.open_anomalies ? "text-amber-700" : "text-emerald-700"}>{warehouse.open_anomalies}</span></td>
                <td><Link href={`/app/warehouses/${warehouse.id}`} aria-label={`Ouvrir ${warehouse.warehouse_name}`} className="inline-flex rounded p-2 hover:bg-[#eee]"><ChevronRight size={16} /></Link></td>
              </tr>)}</tbody>
            </table>
          </OperationTable>
        ) : <EmptyState title="Aucun entrepôt configuré" description="Créez le premier site réel de votre agence pour commencer à organiser le stock." />}
      </section>
    </main>
    <CreateWarehouseDrawer open={createOpen} close={() => setCreateOpen(false)} done={() => { setCreateOpen(false); load(); }} />
  </div>;
}

function CreateWarehouseDrawer({ open, close, done }: { open: boolean; close: () => void; done: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [locations, setLocations] = useState<Array<Record<string, unknown>>>([]);
  const [locationId, setLocationId] = useState("");
  useEffect(() => {
    if (!open) return;
    getAdmin().then((admin) => {
      setLocations(admin.locations);
      if (admin.locations.length === 1) setLocationId(String(admin.locations[0].id));
    }).catch(() => setLocations([]));
  }, [open]);
  const selectedLocation = locations.find((location) => String(location.id) === locationId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await createWarehouse({
        warehouse_code: form.get("code"),
        warehouse_name: form.get("name"),
        warehouse_type: form.get("type"),
        country_code: selectedLocation?.country || null,
        city: selectedLocation?.city || null,
        address: selectedLocation?.address || null,
        timezone: selectedLocation?.timezone || "UTC",
        capacity_packages: Number(form.get("capacity")) || null,
      });
      done();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return <OperationDrawer open={open} title="Nouvel entrepôt" description="Configurez un site physique de votre agence." close={close}>
    <form onSubmit={submit} className="grid gap-5">
      <FormSection title="Identification" description="Le nom et le code utilisés par votre équipe dans les opérations.">
        <div className="grid gap-4 sm:grid-cols-2">
          <OperationField label="Code interne" hint="Exemple : GZ-01" required><input required name="code" className={input} placeholder="GZ-01" /></OperationField>
          <OperationField label="Nom de l’entrepôt" required><input required name="name" className={input} placeholder="Entrepôt Guangzhou" /></OperationField>
          <OperationField label="Fonction du site" required><select name="type" className={input}><option value="STORAGE">Stockage</option><option value="HUB">Hub de groupage</option><option value="OFFICE">Bureau avec stockage</option><option value="TRANSIT">Zone de transit</option></select></OperationField>
          <OperationField label="Capacité en colis" hint="Laissez vide si elle n’est pas encore définie."><input name="capacity" type="number" min="0" className={input} placeholder="2 000" /></OperationField>
        </div>
      </FormSection>
      <FormSection title="Localisation" description="Adresse communiquée aux fournisseurs et utilisée pour orienter les colis.">
        {locations.length ? <div className="grid gap-4">
          <OperationField label="Établissement configuré" hint="La ville, le pays, l’adresse et le fuseau seront repris automatiquement." required>
            <select required value={locationId} onChange={(event) => setLocationId(event.target.value)} className={input}>
              <option value="">Choisir un établissement</option>
              {locations.map((location) => <option key={String(location.id)} value={String(location.id)}>{String(location.name)} · {String(location.city || "Ville non renseignée")}</option>)}
            </select>
          </OperationField>
          {selectedLocation && <div className="grid gap-3 rounded-[7px] bg-[#f6f8f8] p-4 text-[13px] sm:grid-cols-2">
            <p><span className="block text-[11px] text-[#737d87]">Pays et ville</span>{String(selectedLocation.country || "—")}, {String(selectedLocation.city || "—")}</p>
            <p><span className="block text-[11px] text-[#737d87]">Fuseau horaire</span>{String(selectedLocation.timezone || "UTC")}</p>
            <p className="sm:col-span-2"><span className="block text-[11px] text-[#737d87]">Adresse</span>{String(selectedLocation.address || "Adresse non renseignée")}</p>
          </div>}
        </div> : <div className="rounded-[7px] bg-amber-50 p-4 text-[13px] text-amber-900">Configurez d’abord un bureau ou établissement avec son pays, sa ville et son adresse. <Link className="font-semibold underline" href="/app/settings?section=locations">Configurer les établissements</Link></div>}
      </FormSection>
      {error && <p className="text-[12px] text-[#b42318]">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-[#e8ebee] pt-4"><OperationButton type="button" onClick={close}>Annuler</OperationButton><OperationButton type="submit" variant="primary" disabled={busy || !selectedLocation}>{busy ? "Création…" : "Créer l’entrepôt"}</OperationButton></div>
    </form>
  </OperationDrawer>;
}

function Capacity({ warehouse }: { warehouse: Warehouse }) {
  if (!warehouse.capacity_packages) return <span className="text-[#7a838e]">Non définie</span>;
  const percentage = Math.min(100, Math.round((warehouse.package_count / warehouse.capacity_packages) * 100));
  return <div className="w-28"><div className="flex justify-between text-[11px]"><span>{percentage}%</span><span>{warehouse.package_count}/{warehouse.capacity_packages}</span></div><div className="mt-1 h-1.5 rounded bg-[#e8eaed]"><div className={`h-full rounded ${percentage > 90 ? "bg-red-500" : percentage > 75 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${percentage}%` }} /></div></div>;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value || 0);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}
