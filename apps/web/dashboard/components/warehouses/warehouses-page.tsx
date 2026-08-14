"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Download,
  ChevronRight,
  Plus,
  Search,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
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
        <section className="bg-white px-5 py-4">
          <div className="grid grid-cols-2 xl:grid-cols-6">
            {[
              ["Entrepôts", stats.warehouses],
              ["Colis stockés", stats.packages],
              ["Poids total", `${num(stats.weight_kg)} kg`],
              ["Volume", `${num(stats.volume_cbm)} m³`],
              ["Transferts", stats.transfers],
              ["Anomalies", stats.anomalies],
            ].map(([label, value], i) => (
              <div
                key={label}
                className={`border-l border-[#eceef1] px-4 py-1 first:border-l-0 ${i === 5 && Number(value) > 0 ? "text-amber-700" : ""}`}
              >
                <p className="text-[12px] text-[#68717d]">{label}</p>
                <b className="mt-2 block text-[23px] font-semibold">{value}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="overflow-hidden bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#e6e7e8] p-3">
            <label className="flex h-9 min-w-[260px] flex-1 items-center rounded-[5px] bg-[#f4f5f5] px-3">
              <Search size={15} className="text-[#7a838e]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="ml-2 w-full bg-transparent text-[13px] outline-none"
                placeholder="Rechercher un entrepôt, une ville…"
              />
            </label>
            <button className={button} onClick={load}>
              Actualiser
            </button>
          </div>
          {error && (
            <p className="m-4 rounded bg-red-50 p-3 text-[13px] text-red-700">
              {error}
            </p>
          )}
          {loading ? (
            <Skeleton />
          ) : items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-[13px]">
                <thead className="bg-[#f8f8f7] text-[#5f6873]">
                  <tr>
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
                      className="border-t border-[#eceeed] hover:bg-[#fafafa]"
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
            </div>
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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) close();
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-[8px] bg-white p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold">Nouvel entrepôt</h2>
        <p className="mt-1 text-[13px] text-[#68717d]">
          Identité, localisation et capacité initiale.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <input
            required
            name="code"
            className={input}
            placeholder="Code (GZ-01)"
          />
          <input required name="name" className={input} placeholder="Nom" />
          <select name="type" className={input}>
            <option>STORAGE</option>
            <option>HUB</option>
            <option>OFFICE</option>
            <option>TRANSIT</option>
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
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={close} className={button}>
            Annuler
          </button>
          <button disabled={busy} className={primary}>
            {busy ? "Création…" : "Créer"}
          </button>
        </div>
      </form>
    </div>
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
function Skeleton() {
  return (
    <div className="space-y-2 p-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded bg-[#f0f1f2]" />
      ))}
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
