"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, Plus, RefreshCcw, ScanLine, Trash2, X } from "lucide-react";
import { getReferenceCatalog, ReferenceCatalog } from "@/services/references";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import {
  addBatchPackages,
  Batch,
  BatchDetail,
  compatiblePackages,
  convertBatch,
  createBatch,
  exportBatches,
  getBatch,
  listBatches,
  removeBatchPackage,
  scanBatchPackage,
  transitionBatch,
  updateBatchChecklist,
} from "@/services/batch-center";

const button =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-[#d9dcda] bg-white px-3 text-[12px] font-medium hover:bg-[#f6f7f6]";
const primary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[6px] bg-[#197653] px-3 text-[12px] font-semibold text-white hover:bg-[#125f43]";
const input =
  "h-9 w-full rounded-[6px] border border-[#d9dcda] bg-white px-3 text-[13px] outline-none focus:border-[#197653]";
const labels: Record<string, string> = {
  DRAFT: "Brouillon",
  OPEN: "Ouvert",
  PREPARING: "En préparation",
  NEAR_CAPACITY: "Presque plein",
  FULL: "Complet",
  PENDING_VALIDATION: "À valider",
  READY_FOR_SHIPMENT: "Prêt à expédier",
  CONVERTED_TO_SHIPMENT: "Converti",
  BLOCKED: "Bloqué",
  CANCELLED: "Annulé",
  ARCHIVED: "Archivé",
};
const batchTypeLabels: Record<string, string> = {
  AIR_GROUPAGE: "Groupage aérien",
  SEA_LCL: "Groupage maritime (LCL)",
  EXPRESS_CONSOLIDATION: "Consolidation Express",
  CONTAINER_BATCH: "Conteneur",
  ROAD_CONSOLIDATION: "Groupage routier",
  CUSTOM: "Configuration personnalisée",
};
const checks: Record<string, string> = {
  compatibility: "Compatibilité vérifiée",
  weight_verified: "Poids vérifiés",
  cbm_verified: "CBM vérifiés",
  no_blocked_packages: "Aucun colis bloqué",
  documents_ready: "Documents prêts",
  payments_compliant: "Paiements conformes",
  capacity_compliant: "Capacité respectée",
  manager_approved: "Validation responsable",
};
const n = (v: unknown) =>
  Number(v || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const errorText = (e: unknown) => {
  const requestError = e as {
    response?: { data?: { detail?: unknown }; status?: number };
  };
  const detail = requestError?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const code = (detail as { code?: string }).code;
    return code ? `Action impossible : ${code}.` : JSON.stringify(detail);
  }
  if (!requestError.response && e instanceof Error) {
    return "Le serveur n’a pas répondu. Vérifiez que l’API est déployée, puis réessayez.";
  }
  return e instanceof Error ? e.message : "Une erreur est survenue.";
};

export function BatchCenterPage() {
  const [data, setData] = useState<{
      items: Batch[];
      stats: Record<string, number>;
    } | null>(null),
    [refs, setRefs] = useState<ReferenceCatalog | null>(null),
    [selected, setSelected] = useState<BatchDetail | null>(null),
    [compatible, setCompatible] = useState<Array<Record<string, unknown>>>([]),
    [createOpen, setCreateOpen] = useState(false),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [b, r] = await Promise.allSettled([
      listBatches({ q: q || undefined, status: status || undefined }),
      getReferenceCatalog(),
    ]);
    if (b.status === "fulfilled") setData(b.value);
    else setError(errorText(b.reason));
    if (r.status === "fulfilled") setRefs(r.value);
    setLoading(false);
  }, [q, status]);
  useEffect(() => {
    load();
  }, [load]);
  async function open(b: Batch) {
    setError("");
    try {
      const d = await getBatch(b.id);
      setSelected(d);
      try {
        setCompatible(await compatiblePackages(b.id));
      } catch {
        setCompatible([]);
      }
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function reloadDetail() {
    if (selected) await open(selected.batch);
  }
  async function download() {
    setError("");
    try {
      const blob = await exportBatches(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "batchs-groupages.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function showCreate() {
    setError("");
    if (refs) {
      setCreateOpen(true);
      return;
    }
    try {
      setRefs(await getReferenceCatalog());
      setCreateOpen(true);
    } catch (e) {
      setError(`Création indisponible : ${errorText(e)}`);
    }
  }
  const stats = data?.stats || {};
  return (
    <div className="min-h-full bg-[#f6f7f6] text-[#17201c]">
      <OperationPageHeader
        title="Batchs & Groupages"
        description="Regroupez les colis compatibles, contrôlez la capacité et préparez les expéditions."
        actions={
          <>
            <button className={button} onClick={download}>
              <Download size={14} />
              Exporter
            </button>
            <details className="relative">
              <summary className={`${button} cursor-pointer list-none`}>
                Plus
              </summary>
              <div className="absolute right-0 z-30 mt-1 w-44 rounded-md bg-white p-1 shadow-[0_8px_30px_rgba(15,23,42,.14)] ring-1 ring-[#e8eaed]">
                <button
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] hover:bg-[#f5f6f7]"
                  onClick={load}
                >
                  <RefreshCcw size={14} />
                  Actualiser
                </button>
              </div>
            </details>
            <button className={primary} onClick={showCreate}>
              <Plus size={15} />
              Nouveau batch
            </button>
          </>
        }
      />
      <main>
        <section className="bg-white px-5 py-4">
          <div className="grid grid-cols-2 xl:grid-cols-6">
            {[
              ["Batchs ouverts", stats.open_batches],
              ["Prêts au départ", stats.ready],
              ["En préparation", stats.preparing],
              ["Complets", stats.full],
              ["Bloqués", stats.blocked],
              ["Colis non groupés", stats.unassigned_packages],
            ].map(([l, v]) => (
              <div
                key={String(l)}
                className="border-l border-[#eceef1] px-4 py-1 first:border-l-0"
              >
                <p className="text-[11px] text-[#707872]">{l}</p>
                <b className="mt-2 block text-[23px]">{n(v)}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="bg-white">
          <div className="flex flex-wrap gap-2 border-b border-[#e7e9e7] p-3">
            <input
              className={`${input} max-w-sm`}
              placeholder="Rechercher un batch, une route…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className={`${input} max-w-52`}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Tous les statuts</option>
              {Object.entries(labels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {error ? (
            <p className="p-5 text-sm text-red-700">{error}</p>
          ) : loading ? (
            <p className="p-8 text-center text-sm text-[#707872]">
              Chargement des groupages…
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-[12px]">
                <thead className="bg-[#f7f8f7] text-[#68716c]">
                  <tr>
                    {[
                      "Batch",
                      "Route / service",
                      "Entrepôt",
                      "Colis / clients",
                      "Poids / CBM",
                      "Capacité",
                      "Cut-off",
                      "Statut",
                      "Responsable",
                    ].map((h) => (
                      <th className="px-4 py-3 font-medium" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() => open(b)}
                      className="cursor-pointer border-b border-[#edf0f3] hover:bg-[#f7faf9]"
                    >
                      <td className="px-4 py-3 font-semibold">
                        {b.batch_code}
                        <p className="font-normal text-[#7b837e]">
                          {b.batch_type}
                        </p>
                      </td>
                      <td>
                        {b.route_name}
                        <p className="text-[#7b837e]">{b.service_name}</p>
                      </td>
                      <td>{b.warehouse_name || "—"}</td>
                      <td>
                        {b.package_count} / {b.client_count}
                      </td>
                      <td>
                        {n(b.total_weight_kg)} kg
                        <p className="text-[#7b837e]">{n(b.total_cbm)} m³</p>
                      </td>
                      <td className="w-36">
                        <div className="h-1.5 overflow-hidden rounded bg-[#e7ebe8]">
                          <div
                            className="h-full bg-[#197653]"
                            style={{
                              width: `${Math.min(100, b.occupancy_percent || 0)}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1">{n(b.occupancy_percent)}%</p>
                      </td>
                      <td>
                        {b.cutoff_at
                          ? new Date(b.cutoff_at).toLocaleString("fr-FR")
                          : "—"}
                      </td>
                      <td>
                        <span className="rounded-full bg-[#edf5f0] px-2 py-1 text-[#176345]">
                          {labels[b.status] || b.status}
                        </span>
                      </td>
                      <td>{b.responsible_name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.items.length && (
                <p className="p-10 text-center text-sm text-[#707872]">
                  Aucun batch. Créez le premier à partir des routes et services
                  existants.
                </p>
              )}
            </div>
          )}
        </section>
      </main>
      {createOpen && refs && (
        <CreatePanel
          refs={refs}
          close={() => setCreateOpen(false)}
          done={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}
      {selected && (
        <DetailPanel
          data={selected}
          compatible={compatible}
          close={() => setSelected(null)}
          reload={async () => {
            await reloadDetail();
            await load();
          }}
        />
      )}
    </div>
  );
}

function CreatePanel({
  refs,
  close,
  done,
}: {
  refs: ReferenceCatalog;
  close: () => void;
  done: () => void;
}) {
  const [p, setP] = useState<Record<string, string>>({
      batch_type: "AIR_GROUPAGE",
      route_id: "",
      shipping_service_id: "",
      origin_warehouse_id: "",
      capacity_weight_kg: "",
      capacity_cbm: "",
      capacity_packages: "",
      cutoff_at: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (k: string, v: string) => setP((x) => ({ ...x, [k]: v }));
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await createBatch({
        ...p,
        origin_warehouse_id: p.origin_warehouse_id || null,
        capacity_weight_kg: p.capacity_weight_kg
          ? Number(p.capacity_weight_kg)
          : null,
        capacity_cbm: p.capacity_cbm ? Number(p.capacity_cbm) : null,
        capacity_packages: p.capacity_packages
          ? Number(p.capacity_packages)
          : null,
        cutoff_at: p.cutoff_at || null,
      });
      done();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl">
      <div className="flex justify-between">
        <div>
          <h2 className="text-xl font-semibold">Nouveau batch</h2>
          <p className="text-xs text-[#707872]">
            Les routes, services et entrepôts viennent des référentiels
            existants.
          </p>
        </div>
        <button onClick={close}>
          <X />
        </button>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Mode de groupage">
          <select
            className={input}
            value={p.batch_type}
            onChange={(e) => set("batch_type", e.target.value)}
          >
            {Object.entries(batchTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Route">
          <select
            className={input}
            value={p.route_id}
            onChange={(e) => set("route_id", e.target.value)}
          >
            <option value="">Sélectionner</option>
            {refs.routes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Service">
          <select
            className={input}
            value={p.shipping_service_id}
            onChange={(e) => set("shipping_service_id", e.target.value)}
          >
            <option value="">Sélectionner</option>
            {refs.services
              .filter(
                (x) => !p.route_id || !x.route_id || x.route_id === p.route_id,
              )
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Entrepôt origine">
          <select
            className={input}
            value={p.origin_warehouse_id}
            onChange={(e) => set("origin_warehouse_id", e.target.value)}
          >
            <option value="">Non défini</option>
            {refs.warehouses.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Capacité kg">
          <input
            className={input}
            type="number"
            value={p.capacity_weight_kg}
            onChange={(e) => set("capacity_weight_kg", e.target.value)}
          />
        </Field>
        <Field label="Capacité CBM">
          <input
            className={input}
            type="number"
            value={p.capacity_cbm}
            onChange={(e) => set("capacity_cbm", e.target.value)}
          />
        </Field>
        <Field label="Nombre max colis">
          <input
            className={input}
            type="number"
            value={p.capacity_packages}
            onChange={(e) => set("capacity_packages", e.target.value)}
          />
        </Field>
        <Field label="Cut-off">
          <input
            className={input}
            type="datetime-local"
            value={p.cutoff_at}
            onChange={(e) => set("cutoff_at", e.target.value)}
          />
        </Field>
      </div>
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button className={button} onClick={close}>
          Annuler
        </button>
        <button
          className={primary}
          disabled={busy || !p.route_id || !p.shipping_service_id}
          onClick={submit}
        >
          {busy ? "Création…" : "Créer le batch"}
        </button>
      </div>
    </aside>
  );
}

function DetailPanel({
  data,
  compatible,
  close,
  reload,
}: {
  data: BatchDetail;
  compatible: Array<Record<string, unknown>>;
  close: () => void;
  reload: () => Promise<void>;
}) {
  const [scan, setScan] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const b = data.batch;
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-3xl overflow-y-auto bg-[#f7f8f7] shadow-2xl">
      <header className="sticky top-0 z-10 border-b bg-white p-5">
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-semibold">{b.batch_code}</h2>
            <p className="text-xs text-[#707872]">
              {b.route_name} · {b.service_name} · {labels[b.status]}
            </p>
          </div>
          <button title="Fermer" onClick={close}>
            <X />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {b.status === "DRAFT" && (
            <button
              className={primary}
              disabled={busy}
              onClick={() =>
                act(() => transitionBatch(b.id, "OPEN", b.row_version))
              }
            >
              Ouvrir
            </button>
          )}
          {["OPEN", "PREPARING", "NEAR_CAPACITY", "FULL"].includes(
            b.status,
          ) && (
            <button
              className={primary}
              disabled={busy}
              onClick={() =>
                act(() =>
                  transitionBatch(b.id, "PENDING_VALIDATION", b.row_version),
                )
              }
            >
              Soumettre à validation
            </button>
          )}
          {b.status === "PENDING_VALIDATION" && (
            <button
              className={primary}
              disabled={busy}
              onClick={() =>
                act(() =>
                  transitionBatch(b.id, "READY_FOR_SHIPMENT", b.row_version),
                )
              }
            >
              Valider le batch
            </button>
          )}
          {b.status === "READY_FOR_SHIPMENT" && (
            <button
              className={primary}
              disabled={busy}
              onClick={() => act(() => convertBatch(b.id))}
            >
              Créer l’expédition
            </button>
          )}
        </div>
        {error && (
          <p className="mt-3 rounded-[6px] bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
      </header>
      <div className="space-y-4 p-5">
        <section className="grid gap-3 sm:grid-cols-4">
          {[
            ["Colis", b.package_count],
            ["Clients", b.client_count],
            ["Poids", `${n(b.total_weight_kg)} kg`],
            ["Occupation", `${n(b.occupancy_percent)}%`],
          ].map(([l, v]) => (
            <div className="rounded bg-white p-3" key={String(l)}>
              <p className="text-[11px] text-[#707872]">{l}</p>
              <b>{v}</b>
            </div>
          ))}
        </section>
        <section className="rounded bg-white p-4">
          <h3 className="font-semibold">Scan de chargement</h3>
          <div className="mt-3 flex gap-2">
            <input
              className={input}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder="Tracking ou code colis"
            />
            <button
              className={button}
              disabled={!scan || busy}
              onClick={() =>
                act(async () => {
                  await scanBatchPackage(b.id, scan);
                  setScan("");
                })
              }
            >
              <ScanLine size={14} />
              Scanner
            </button>
          </div>
        </section>
        <section className="rounded bg-white p-4">
          <div className="flex justify-between">
            <h3 className="font-semibold">Colis compatibles</h3>
            <span className="text-xs text-[#707872]">
              {compatible.length} disponible(s)
            </span>
          </div>
          {compatible.length > 0 && (
            <button
              className={`${primary} mt-3`}
              disabled={busy}
              onClick={() =>
                act(() =>
                  addBatchPackages(
                    b.id,
                    compatible.map((x) => String(x.id)),
                  ),
                )
              }
            >
              Ajouter tous les colis compatibles
            </button>
          )}
          <div className="mt-3 divide-y">
            {compatible.slice(0, 12).map((x) => (
              <div
                className="flex justify-between py-2 text-xs"
                key={String(x.id)}
              >
                <span>
                  {String(x.package_reference)} ·{" "}
                  {String(x.client_name || "Client")}
                </span>
                <button
                  className="text-[#176345]"
                  disabled={busy}
                  onClick={() =>
                    act(() => addBatchPackages(b.id, [String(x.id)]))
                  }
                >
                  Ajouter
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded bg-white p-4">
          <h3 className="font-semibold">Checklist avant départ</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(checks).map(([k, l]) => (
              <label className="flex gap-2 text-xs" key={k}>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={Boolean(data.checklist[k])}
                  onChange={(e) =>
                    act(() =>
                      updateBatchChecklist(b.id, { [k]: e.target.checked }),
                    )
                  }
                />
                {l}
              </label>
            ))}
          </div>
        </section>
        <section className="rounded bg-white p-4">
          <h3 className="font-semibold">Colis affectés</h3>
          <div className="mt-2 divide-y">
            {data.packages.map((x) => (
              <div
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-2 text-xs"
                key={String(x.package_id)}
              >
                <span>
                  {String(x.package_reference)} ·{" "}
                  {String(x.client_name || "Client")}
                </span>
                <span>{n(x.weight_kg)} kg</span>
                <span>{String(x.scan_status)}</span>
                <button
                  title="Retirer du batch"
                  className="rounded p-1.5 text-[#68716c] hover:bg-red-50 hover:text-red-700"
                  disabled={busy}
                  onClick={() =>
                    act(() =>
                      removeBatchPackage(
                        b.id,
                        String(x.package_id),
                        "Retrait manuel depuis le centre de groupage",
                      ),
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!data.packages.length && (
              <p className="py-4 text-xs text-[#707872]">
                Aucun colis affecté.
              </p>
            )}
          </div>
        </section>
        <section className="rounded bg-white p-4">
          <h3 className="font-semibold">Timeline & audit</h3>
          {data.events.slice(0, 20).map((x) => (
            <div
              className="border-l border-[#b8d5c8] py-2 pl-3 text-xs"
              key={String(x.id)}
            >
              <b>{String(x.event_type)}</b>
              <p className="text-[#707872]">
                {new Date(String(x.created_at)).toLocaleString("fr-FR")} ·{" "}
                {String(x.actor_name || "Système")}
              </p>
            </div>
          ))}
        </section>
      </div>
    </aside>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs text-[#5f6862]">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
