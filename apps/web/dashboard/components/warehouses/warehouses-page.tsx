"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Download,
  ChevronRight,
  Plus,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import {
  OperationMetrics,
  OperationSearch,
  OperationTable,
  OperationToolbar,
} from "@/components/ui/operation-primitives";
import { LoadingState } from "@/components/ui/page-state";
import {
  createWarehouse,
  exportWarehouseInventory,
  getWarehouseStats,
  listWarehouses,
  type Warehouse,
  type WarehouseStats,
} from "@/services/warehouses";
const input =
  "h-9 rounded-[5px] border border-[#d7dadd] bg-white px-3 text-[13px] outline-none focus:border-[#16855f]";
const button =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] bg-white px-3 text-[13px] shadow-[inset_0_0_0_1px_#d7dadd] hover:bg-[#f6f6f5]";
const primary =
  "inline-flex h-9 items-center gap-2 rounded-[5px] bg-[#16855f] px-3 text-[13px] font-medium text-white hover:bg-[#126f50]";
export function WarehousesPage() {
  const [items, setItems] = useState<Warehouse[]>([]),
    [stats, setStats] = useState<WarehouseStats>({
      warehouses: 0,
      packages: 0,
      weight_kg: 0,
      volume_cbm: 0,
      anomalies: 0,
      transfers: 0,
    }),
    [q, setQ] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [createOpen, setCreateOpen] = useState(false);
  const [allMetrics, setAllMetrics] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, kpis] = await Promise.all([
        listWarehouses(q ? { q } : undefined),
        getWarehouseStats(),
      ]);
      setItems(rows);
      setStats(kpis);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [q]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);
  async function download() {
    try {
      const blob = await exportWarehouseInventory(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "slaivio-inventaire-entrepots.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <OperationPageHeader
        title="Entrepôts"
        description="Pilotez le stock, les emplacements, les transferts et les contrôles physiques."
        actions={
          <>
            <PermissionGuard permission="warehouses.export">
              <button onClick={download} className={button}>
                <Download size={15} />
                Exporter
              </button>
            </PermissionGuard>
            <PermissionGuard permission="warehouses.create">
              <button onClick={() => setCreateOpen(true)} className={primary}>
                <Plus size={15} />
                Nouvel entrepôt
              </button>
            </PermissionGuard>
          </>
        }
      />
      <main>
        <OperationMetrics>
          <div
            className={`grid grid-cols-2 ${allMetrics ? "lg:grid-cols-6" : "lg:grid-cols-4"}`}
          >
            {[
              ["Entrepôts", stats.warehouses],
              ["Colis stockés", stats.packages],
              ["Poids total", `${num(stats.weight_kg)} kg`],
              ["Volume", `${num(stats.volume_cbm)} m³`],
              ["Transferts", stats.transfers],
              ["Anomalies", stats.anomalies],
            ]
              .slice(0, allMetrics ? 6 : 4)
              .map(([label, value], i) => (
                <button
                  type="button"
                  onClick={() => setAllMetrics((current) => !current)}
                  key={label}
                  className={`border-l border-[#eceef1] px-4 py-1 first:border-l-0 ${i === 5 && Number(value) > 0 ? "text-amber-700" : ""}`}
                >
                  <p className="text-[12px] text-[#68717d]">{label}</p>
                  <b className="mt-1 block text-[24px] font-medium tracking-[-.035em]">
                    {value}
                  </b>
                </button>
              ))}
          </div>
          <button
            onClick={() => setAllMetrics((current) => !current)}
            className="mt-3 text-[11px] font-medium text-[#087a46]"
          >
            {allMetrics
              ? "Réduire les indicateurs"
              : "Voir tous les indicateurs"}
          </button>
        </OperationMetrics>
        <OperationToolbar
          search={
            <OperationSearch
              value={q}
              onChange={setQ}
              placeholder="Rechercher un entrepôt, une ville…"
            />
          }
          filters={
            <button className={button} onClick={load}>
              Actualiser
            </button>
          }
        />
        <section className="overflow-hidden bg-white">
          {error && (
            <p className="m-4 rounded bg-red-50 p-3 text-[13px] text-red-700">
              {error}
            </p>
          )}
          {loading ? (
            <LoadingState label="Chargement des entrepôts…" />
          ) : items.length ? (
            <OperationTable>
              <table className="w-full min-w-[980px] border-collapse text-left text-[13px]">
                <thead className="bg-[#fbfcfd] text-[#5f6b7a]">
                  <tr className="border-b border-[#e6e9ee]">
                    {[
                      "Entrepôt",
                      "Localisation",
                      "Responsable",
                      "Colis",
                      "Poids",
                      "Capacité",
                      "Alertes",
                      "",
                    ].map((h) => (
                      <th key={h} className="px-4 py-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((w) => (
                    <tr
                      key={w.id}
                      className="h-11 border-b border-[#edf0f3] hover:bg-[#f7faf9]"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/app/warehouses/${w.id}`}
                          className="font-semibold text-[#292654]"
                        >
                          {w.warehouse_name}
                        </Link>
                        <p className="text-[11px] text-[#7a838e]">
                          {w.warehouse_code} · {w.warehouse_type}
                        </p>
                      </td>
                      <td>
                        {[w.city, w.country_code].filter(Boolean).join(", ") ||
                          "—"}
                      </td>
                      <td>{w.manager_name || "Non assigné"}</td>
                      <td>{w.package_count}</td>
                      <td>{num(w.weight_kg)} kg</td>
                      <td>
                        <Capacity w={w} />
                      </td>
                      <td>
                        <span
                          className={
                            w.open_anomalies
                              ? "text-amber-700"
                              : "text-emerald-700"
                          }
                        >
                          {w.open_anomalies}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/app/warehouses/${w.id}`}
                          aria-label="Ouvrir"
                          className="inline-flex rounded p-2 hover:bg-[#eee]"
                        >
                          <ChevronRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </OperationTable>
          ) : (
            <div className="grid min-h-64 place-items-center p-8 text-center">
              <div>
                <WarehouseIcon className="mx-auto text-[#8a929b]" />
                <h2 className="mt-3 font-semibold">Aucun entrepôt configuré</h2>
                <p className="mt-1 text-[13px] text-[#68717d]">
                  Créez le premier site réel de votre agence pour commencer le
                  stock.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
      {createOpen && (
        <CreateModal
          close={() => setCreateOpen(false)}
          done={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
function CreateModal({ close, done }: { close: () => void; done: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await createWarehouse({
        warehouse_code: f.get("code"),
        warehouse_name: f.get("name"),
        warehouse_type: f.get("type"),
        country_code: f.get("country"),
        city: f.get("city"),
        address: f.get("address"),
        timezone: f.get("timezone"),
        capacity_packages: Number(f.get("capacity")) || null,
      });
      done();
    } catch (x) {
      setError(message(x));
      setBusy(false);
    }
  }
  return (
    <OperationDrawer
      open
      title="Nouvel entrepôt"
      description="Identité, localisation et capacité initiale."
      close={close}
    >
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <input
            required
            name="code"
            className={input}
            placeholder="Code (GZ-01)"
          />
          <input required name="name" className={input} placeholder="Nom" />
          <select name="type" className={input} aria-label="Type d’entrepôt">
            <option value="STORAGE">Entrepôt de stockage</option>
            <option value="HUB">Hub de groupage</option>
            <option value="OFFICE">Bureau avec stockage</option>
            <option value="TRANSIT">Zone de transit</option>
          </select>
          <input name="country" className={input} placeholder="Pays (CN)" />
          <input name="city" className={input} placeholder="Ville" />
          <input name="timezone" defaultValue="UTC" className={input} />
          <input
            name="capacity"
            type="number"
            min="0"
            className={input}
            placeholder="Capacité colis"
          />
          <input name="address" className={input} placeholder="Adresse" />
        </div>
        {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-[#eceef1] pt-4">
          <button type="button" onClick={close} className={button}>
            Annuler
          </button>
          <button disabled={busy} className={primary}>
            {busy ? "Création…" : "Créer"}
          </button>
        </div>
      </form>
    </OperationDrawer>
  );
}
function Capacity({ w }: { w: Warehouse }) {
  if (!w.capacity_packages)
    return <span className="text-[#7a838e]">Non définie</span>;
  const pct = Math.min(
    100,
    Math.round((w.package_count / w.capacity_packages) * 100),
  );
  return (
    <div className="w-28">
      <div className="flex justify-between text-[11px]">
        <span>{pct}%</span>
        <span>
          {w.package_count}/{w.capacity_packages}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded bg-[#e8eaed]">
        <div
          className={`h-full rounded ${pct > 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
function num(v: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(
    v || 0,
  );
}
function message(e: unknown) {
  return e instanceof Error ? e.message : "Une erreur est survenue.";
}
