"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  RefreshCcw,
  Search,
  Ship,
} from "lucide-react";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { getReferenceCatalog, type ReferenceItem } from "@/services/references";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import { catalog, type Service } from "@/services/route-catalog";
import {
  addDeparturePackage,
  compatibleDeparturePackages,
  createDeparture,
  departure,
  departureStats,
  departures,
  downloadDepartureManifest,
  removeDeparturePackage,
  transitionDeparture,
  updateDepartureChecklist,
  type Departure,
  type DepartureStats,
} from "@/services/departures";
const btn =
    "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#d2d7dc] bg-white px-3 text-[12px] font-medium hover:bg-[#f5f6f7]",
  primary =
    "inline-flex h-9 items-center gap-2 rounded-md bg-[#12b866] px-4 text-[12px] font-semibold text-white hover:bg-[#0da65b]",
  input =
    "h-9 w-full rounded-md border border-[#d2d7dc] bg-white px-3 text-[13px] outline-none focus:border-[#1688e8]";
const labels: Record<string, string> = {
  DRAFT: "Brouillon",
  OPEN: "À confirmer",
  PLANNED: "Planifié",
  PENDING_CONFIRMATION: "À confirmer",
  CONFIRMED: "Confirmé",
  CLOSED: "Confirmé",
  LOADING: "Chargement",
  READY_TO_DEPART: "Prêt au départ",
  DEPARTED: "Parti",
  DELAYED: "Retardé",
  CANCELLED: "Annulé",
  ARRIVED: "Arrivé",
  COMPLETED: "Terminé",
};
type View =
  | "calendar"
  | "list"
  | "routes"
  | "capacity"
  | "delays"
  | "history"
  | "analytics"
  | "configuration";
export function DeparturesPage() {
  const [items, setItems] = useState<Departure[]>([]),
    [stats, setStats] = useState<DepartureStats | null>(null),
    [services, setServices] = useState<Service[]>([]),
    [view, setView] = useState<View>("calendar"),
    [selected, setSelected] = useState<Departure | null>(null),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [mode, setMode] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [cursor, setCursor] = useState(new Date());
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [a, b, c] = await Promise.all([
        departures(),
        departureStats(),
        catalog(),
      ]);
      setItems(a);
      setStats(b);
      setServices(c.services);
    } catch {
      setError("Le calendrier des départs est indisponible.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const filtered = useMemo(
    () =>
      items.filter(
        (x) =>
          (!query ||
            `${x.departure_code} ${x.route_name} ${x.service_name}`
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (!mode || x.shipping_mode === mode) &&
          (view !== "delays" || x.status === "DELAYED") &&
          (view !== "history" ||
            ["ARRIVED", "COMPLETED", "CANCELLED"].includes(x.status)),
      ),
    [items, query, mode, view],
  );
  async function choose(x: Departure) {
    setSelected(await departure(x.id));
  }
  async function move(x: Departure, status: string) {
    let reason;
    if (["CANCELLED", "DELAYED"].includes(status)) {
      reason = prompt("Motif obligatoire") || undefined;
      if (!reason) return;
    }
    try {
      await transitionDeparture(x.id, status, x.row_version, reason);
      setSelected(null);
      load();
    } catch {
      setError(
        "Transition refusée : vérifiez la checklist, la conformité ou la version du départ.",
      );
    }
  }
  const cards = [
    ["Aujourd’hui", stats?.today || 0],
    ["Cette semaine", stats?.this_week || 0],
    ["Confirmés", stats?.confirmed || 0],
    ["À confirmer", stats?.pending || 0],
    ["Retardés", stats?.delayed || 0],
    ["Complets", stats?.full || 0],
    ["Colis planifiés", stats?.packages || 0],
    [
      "Poids prévu",
      `${Number(stats?.weight_kg || 0).toLocaleString("fr-FR")} kg`,
    ],
  ];
  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <OperationPageHeader
        title="Calendrier des départs"
        description="Planifiez, suivez et coordonnez tous les départs de votre agence cargo."
        actions={
          <>
            <button className={btn} onClick={load}>
              <RefreshCcw size={14} />
              Actualiser
            </button>
            <button className={btn} onClick={() => exportPlanning(filtered)}>
              <Download size={14} />
              Exporter
            </button>
            <PermissionGuard permission="departures.manage">
              <button className={primary} onClick={() => setOpen(true)}>
                <Plus size={15} />
                Nouveau départ
              </button>
            </PermissionGuard>
          </>
        }
        tabs={
          <>
            {(
              [
                ["calendar", "Calendrier"],
                ["list", "Liste"],
                ["routes", "Routes"],
                ["capacity", "Capacité"],
                ["delays", "Retards"],
                ["history", "Historique"],
              ] as const
            ).slice(0,4).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`h-10 border-b-2 px-3 text-[12px] ${view === k ? "border-[#12c76f] font-semibold text-[#067a45]" : "border-transparent text-[#526071] hover:bg-[#f2f4f7]"}`}
              >
                {l}
              </button>
            ))}
            <select aria-label="Autres vues" value={["delays","history"].includes(view)?view:""} onChange={(e)=>setView(e.target.value as typeof view)} className="mb-1 ml-1 h-8 rounded-md bg-[#f3f4f5] px-2 text-[12px] text-[#59636e] outline-none"><option value="">Plus</option><option value="delays">Retards</option><option value="history">Historique</option></select>
          </>
        }
      />
      <main>
        <section className="bg-white px-5 py-4"><div className="grid grid-cols-2 lg:grid-cols-4">
          {cards.slice(0,4).map(([l, v]) => (
            <Metric key={l} label={String(l)} value={v} />
          ))}
        </div></section>
        <div className="flex flex-wrap gap-2 border-b bg-white p-4">
          <label className="flex h-9 min-w-[260px] flex-1 items-center rounded-md bg-[#f4f5f6] px-3 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#a9a3f1]">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un départ, une route..."
              className="ml-2 flex-1 bg-transparent text-[13px] outline-none"
            />
          </label>
          <select
            className={`${input} w-40`}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="">Tous services</option>
            <option>AIR</option>
            <option>SEA</option>
            <option>EXPRESS</option>
            <option>ROAD</option>
          </select>
        </div>
        {error && (
          <p className="m-4 border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
            {error}
          </p>
        )}
        {loading ? (
          <p className="p-16 text-center text-[13px]">Chargement…</p>
        ) : view === "calendar" ? (
          <Calendar
            items={filtered}
            cursor={cursor}
            setCursor={setCursor}
            select={choose}
          />
        ) : view === "routes" ? (
          <Routes items={filtered} />
        ) : view === "capacity" ? (
          <Capacity items={filtered} select={choose} />
        ) : (
          <List items={filtered} select={choose} />
        )}
      </main>
      {selected && (
        <Detail item={selected} close={() => setSelected(null)} move={move} />
      )}{" "}
      {open && (
        <Create
          services={services}
          close={() => setOpen(false)}
          done={() => {
            setOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
function exportPlanning(items: Departure[]) {
  const q = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`,
    rows = [
      [
        "Départ",
        "Route",
        "Service",
        "Date",
        "Cut-off",
        "ETA",
        "Colis",
        "Poids kg",
        "CBM",
        "Statut",
      ],
      ...items.map((x) => [
        x.departure_code,
        x.route_name,
        x.service_name,
        x.scheduled_at,
        x.cutoff_at,
        x.estimated_arrival_at,
        x.reserved_packages,
        x.reserved_weight_kg,
        x.reserved_cbm,
        labels[x.status] || x.status,
      ]),
    ];
  const blob = new Blob([rows.map((r) => r.map(q).join(",")).join("\n")], {
      type: "text/csv;charset=utf-8",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "planning-departs-slaivio.csv";
  a.click();
  URL.revokeObjectURL(url);
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-l border-[#eceef1] px-4 py-1 first:border-l-0">
      <small className="text-[#69727d]">{label}</small>
      <b className="mt-1 block text-[24px] font-medium tracking-[-.035em]">{value}</b>
    </div>
  );
}
function Calendar({
  items,
  cursor,
  setCursor,
  select,
}: {
  items: Departure[];
  cursor: Date;
  setCursor: (d: Date) => void;
  select: (x: Departure) => void;
}) {
  const [period, setPeriod] = useState<"day" | "week" | "month">("month"),
    [direction, setDirection] = useState<"departures" | "arrivals">(
      "departures",
    );
  const field =
    direction === "departures" ? "scheduled_at" : "estimated_arrival_at";
  const first =
      period === "month"
        ? new Date(cursor.getFullYear(), cursor.getMonth(), 1)
        : new Date(cursor),
    start = new Date(first);
  if (period !== "day") start.setDate(start.getDate() - start.getDay());
  const count = period === "month" ? 42 : period === "week" ? 7 : 1,
    days = Array.from({ length: count }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  function shift(delta: number) {
    const d = new Date(cursor);
    if (period === "month") d.setMonth(d.getMonth() + delta);
    else d.setDate(d.getDate() + delta * (period === "week" ? 7 : 1));
    setCursor(d);
  }
  return (
    <section className="m-4 border bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div className="flex gap-1">
          <button className={btn} onClick={() => shift(-1)}>
            <ChevronLeft size={14} />
          </button>
          <button className={btn} onClick={() => setCursor(new Date())}>
            Aujourd’hui
          </button>
          <button className={btn} onClick={() => shift(1)}>
            <ChevronRight size={14} />
          </button>
        </div>
        <b>
          {cursor.toLocaleDateString("fr-FR", {
            month: "long",
            year: "numeric",
            day: period === "day" ? "numeric" : undefined,
          })}
        </b>
        <div className="flex gap-1">
          <select
            className={input}
            value={direction}
            onChange={(e) =>
              setDirection(e.target.value as "departures" | "arrivals")
            }
          >
            <option value="departures">Départs</option>
            <option value="arrivals">Arrivées</option>
          </select>
          {(["day", "week", "month"] as const).map((p) => (
            <button
              key={p}
              className={`${btn} ${period === p ? "bg-[#edf8f2]" : ""}`}
              onClick={() => setPeriod(p)}
            >
              {p === "day" ? "Jour" : p === "week" ? "Semaine" : "Mois"}
            </button>
          ))}
        </div>
      </header>
      <div className={`grid ${count === 1 ? "grid-cols-1" : "grid-cols-7"}`}>
        {days.map((d) => {
          const list = items.filter((x) => {
            const value = x[field];
            return value && new Date(value).toDateString() === d.toDateString();
          });
          return (
            <div
              key={d.toISOString()}
              className={`min-h-36 border-b border-r p-2 ${period === "month" && d.getMonth() !== cursor.getMonth() ? "bg-[#fafafa] text-[#a1a7ae]" : ""}`}
            >
              <b className="text-[11px]">
                {d.toLocaleDateString("fr-FR", {
                  weekday: "short",
                  day: "numeric",
                })}
              </b>
              {list.map((x) => (
                <button
                  key={x.id}
                  onClick={() => select(x)}
                  className="mt-2 block w-full rounded bg-[#edf8f2] px-2 py-1.5 text-left text-[11px]"
                >
                  <b>
                    {new Date(x[field]!).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </b>{" "}
                  {x.route_name}
                  <small className="block">
                    {x.service_name} · {labels[x.status]}
                  </small>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
function List({
  items,
  select,
}: {
  items: Departure[];
  select: (x: Departure) => void;
}) {
  return (
    <div className="overflow-x-auto border-b bg-white">
      <table className="w-full min-w-[1100px] text-left text-[12px]">
        <thead className="bg-[#f6f7f7]">
          <tr>
            {[
              "Départ",
              "Route / Service",
              "Date / Cut-off",
              "ETA",
              "Colis",
              "Poids / CBM",
              "Capacité",
              "Statut",
              "Responsable",
            ].map((h) => (
              <th key={h} className="p-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr
              key={x.id}
              onClick={() => select(x)}
              className="cursor-pointer border-t hover:bg-[#fafafa]"
            >
              <td className="p-3 font-semibold">{x.departure_code}</td>
              <td>
                {x.route_name}
                <small className="block text-[#737b84]">{x.service_name}</small>
              </td>
              <td>
                {date(x.scheduled_at)}
                <small className="block text-[#737b84]">
                  Cut-off {date(x.cutoff_at)}
                </small>
              </td>
              <td>{date(x.estimated_arrival_at)}</td>
              <td>{x.reserved_packages || x.shipment_count}</td>
              <td>
                {x.reserved_weight_kg} kg
                <small className="block">{x.reserved_cbm} CBM</small>
              </td>
              <td>
                <Bar value={x.reserved_weight_kg} max={x.capacity_weight_kg} />
              </td>
              <td>
                <Badge value={x.status} />
              </td>
              <td>{x.responsible_name || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <Empty />}
    </div>
  );
}
function Routes({ items }: { items: Departure[] }) {
  const groups = Object.values(
    items.reduce<Record<string, { name: string; items: Departure[] }>>(
      (a, x) => {
        (a[x.route_name] ??= { name: x.route_name, items: [] }).items.push(x);
        return a;
      },
      {},
    ),
  );
  return (
    <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => (
        <section key={g.name} className="border bg-white p-4">
          <b>{g.name}</b>
          <p className="mt-3 text-[13px]">
            Prochain départ : {date(g.items[0]?.scheduled_at)}
          </p>
          <p className="text-[13px]">Départs planifiés : {g.items.length}</p>
          <Bar
            value={g.items.reduce((s, x) => s + x.reserved_weight_kg, 0)}
            max={g.items.reduce((s, x) => s + (x.capacity_weight_kg || 0), 0)}
          />
        </section>
      ))}
    </div>
  );
}
function Capacity({
  items,
  select,
}: {
  items: Departure[];
  select: (x: Departure) => void;
}) {
  return (
    <div className="grid gap-3 p-4 md:grid-cols-2">
      {items.map((x) => (
        <button
          key={x.id}
          onClick={() => select(x)}
          className="border bg-white p-4 text-left"
        >
          <div className="flex justify-between">
            <b>
              {x.departure_code} · {x.route_name}
            </b>
            <Badge value={x.status} />
          </div>
          <p className="mt-4 text-[12px]">Poids</p>
          <Bar value={x.reserved_weight_kg} max={x.capacity_weight_kg} />
          <p className="mt-3 text-[12px]">CBM</p>
          <Bar value={x.reserved_cbm} max={x.capacity_cbm} />
          <p className="mt-3 text-[12px]">Colis</p>
          <Bar value={x.reserved_packages} max={x.capacity_packages} />
        </button>
      ))}
    </div>
  );
}
function Detail({
  item,
  close,
  move,
}: {
  item: Departure;
  close: () => void;
  move: (x: Departure, s: string) => void;
}) {
  const [current, setCurrent] = useState(item);
  return (
    <OperationDrawer open title={current.departure_code} description={`${current.route_name} · ${current.service_name}`} close={close}>
        <div className="mb-4"><Badge value={current.status} /></div>
        <div className="grid gap-4 p-5">
          <section className="grid grid-cols-2 gap-3">
            <Info label="Départ" value={date(current.scheduled_at)} />
            <Info label="ETA" value={date(current.estimated_arrival_at)} />
            <Info label="Cut-off" value={date(current.cutoff_at)} />
            <Info label="Fuseau" value={current.timezone} />
            <Info label="Transporteur" value={current.carrier_name || "—"} />
            <Info
              label="Référence transport"
              value={current.transport_reference || "—"}
            />
          </section>
          <section className="border p-4">
            <h3 className="font-semibold">Capacité</h3>
            <p className="mt-3 text-[12px]">Poids</p>
            <Bar
              value={current.reserved_weight_kg}
              max={current.capacity_weight_kg}
            />
            <p className="mt-3 text-[12px]">CBM</p>
            <Bar value={current.reserved_cbm} max={current.capacity_cbm} />
            <p className="mt-3 text-[12px]">Colis</p>
            <Bar
              value={current.reserved_packages}
              max={current.capacity_packages}
            />
          </section>
          <DepartureOperations
            item={current}
            refresh={async () => setCurrent(await departure(current.id))}
          />
          <section className="border p-4">
            <h3 className="font-semibold">Audit</h3>
            {current.events?.map((e, i) => (
              <p key={i} className="mt-2 border-t pt-2 text-[12px]">
                {String(e.event_type)} · {date(String(e.created_at))}
              </p>
            ))}
          </section>
          <div className="flex flex-wrap gap-2">
            <PermissionGuard permission="departures.dispatch">
              {next(current.status).map(([s, l]) => (
                <button
                  key={s}
                  className={primary}
                  onClick={() => move(current, s)}
                >
                  {l}
                </button>
              ))}
            </PermissionGuard>
            <PermissionGuard permission="departures.cancel">
              <button
                className={btn}
                onClick={() => move(current, "CANCELLED")}
              >
                Annuler
              </button>
            </PermissionGuard>
          </div>
        </div>
    </OperationDrawer>
  );
}
function DepartureOperations({
  item,
  refresh,
}: {
  item: Departure;
  refresh: () => Promise<void>;
}) {
  const [candidates, setCandidates] = useState<Array<Record<string, unknown>>>(
      [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function toggle(key: string, value: boolean) {
    setBusy(true);
    try {
      await updateDepartureChecklist(item.id, key, value, item.row_version);
      await refresh();
    } catch {
      setError(
        "Checklist non mise à jour : la fiche a peut-être été modifiée.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function find() {
    setCandidates(await compatibleDeparturePackages(item.id));
  }
  async function add(id: string) {
    setBusy(true);
    try {
      await addDeparturePackage(item.id, id);
      await refresh();
      await find();
    } catch {
      setError("Affectation impossible : capacité, cut-off ou doublon.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      await removeDeparturePackage(item.id, id);
      await refresh();
    } catch {
      setError("Retrait impossible.");
    } finally {
      setBusy(false);
    }
  }
  async function manifest() {
    const blob = await downloadDepartureManifest(item.id),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `manifest-${item.departure_code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <section className="border p-4">
        <h3 className="font-semibold">Checklist avant départ</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(item.checklist || {}).map(([k, v]) => (
            <label key={k} className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={v}
                disabled={busy}
                onChange={() => toggle(k, !v)}
              />
              {k.replaceAll("_", " ")}
            </label>
          ))}
        </div>
      </section>
      <section className="border p-4">
        <div className="flex justify-between">
          <h3 className="font-semibold">
            Colis affectés · {item.packages?.length || 0}
          </h3>
          <div className="flex gap-2">
            <button className={btn} onClick={find}>
              Colis compatibles
            </button>
            <button className={btn} onClick={manifest}>
              Manifest CSV
            </button>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {item.packages?.map((p) => (
            <div
              key={String(p.package_id)}
              className="flex items-center justify-between border-t pt-2 text-[12px]"
            >
              <span>
                <b>{String(p.package_reference || "Colis")}</b> ·{" "}
                {String(p.client_name || "Client")} · {String(p.weight_kg || 0)}{" "}
                kg
              </span>
              <PermissionGuard permission="departures.allocate">
                <button
                  disabled={busy}
                  onClick={() => remove(String(p.package_id))}
                  className="text-red-600"
                >
                  Retirer
                </button>
              </PermissionGuard>
            </div>
          ))}
        </div>
        {candidates.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <b className="text-[12px]">Suggestions compatibles</b>
            {candidates.map((p) => (
              <div
                key={String(p.id)}
                className="mt-2 flex justify-between text-[12px]"
              >
                <span>
                  {String(p.package_reference)} ·{" "}
                  {String(p.client_name || "Client")} ·{" "}
                  {String(p.weight_kg || 0)} kg
                </span>
                <PermissionGuard permission="departures.allocate">
                  <button
                    disabled={busy}
                    onClick={() => add(String(p.id))}
                    className="text-emerald-700"
                  >
                    Ajouter
                  </button>
                </PermissionGuard>
              </div>
            ))}
          </div>
        )}
      </section>
      {error && (
        <p className="border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
function Create({
  services,
  close,
  done,
}: {
  services: Service[];
  close: () => void;
  done: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [routeId, setRouteId] = useState(""),
    [offices, setOffices] = useState<ReferenceItem[]>([]);
  useEffect(()=>{getReferenceCatalog().then((data)=>setOffices(data.offices)).catch(()=>setOffices([]))},[]);
  const routes = Array.from(
    new Map(
      services.map((service) => [
        service.route_id,
        { id: service.route_id, label: service.route_name },
      ]),
    ).values(),
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await createDeparture(
        Object.fromEntries(
          [...f].map(([k, v]) => [
            k,
            [
              "capacity_weight_kg",
              "capacity_cbm",
              "capacity_packages",
            ].includes(k)
              ? Number(v) || null
              : v || null,
          ]),
        ),
      );
      done();
    } catch {
      setError("Création impossible. Vérifiez le service et les dates.");
      setBusy(false);
    }
  }
  return (
    <OperationDrawer open title="Nouveau départ" description="Sélectionnez une route et un service déjà configurés par l’agence." close={close}>
      <form onSubmit={submit} className="bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            Route existante
            <select
              required
              value={routeId}
              onChange={(event) => setRouteId(event.target.value)}
              className={input}
            >
              <option value="">Choisir une route</option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Service disponible sur cette route
            <select
              required
              name="shipping_service_id"
              disabled={!routeId}
              className={input}
            >
              <option value="">Choisir un service</option>
              {services
                .filter((service) => service.route_id === routeId)
                .map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.service_name}
                  </option>
                ))}
            </select>
          </label>
          <Field
            name="scheduled_at"
            label="Date et heure"
            type="datetime-local"
            required
          />
          <Field name="cutoff_at" label="Date limite de réception des colis" type="datetime-local" />
          <Field
            name="estimated_arrival_at"
            label="Arrivée estimée"
            type="datetime-local"
          />
          <input type="hidden" name="timezone" value="UTC" />
          <Field
            name="capacity_weight_kg"
            label="Capacité poids kg"
            type="number"
          />
          <Field name="capacity_cbm" label="Capacité CBM" type="number" />
          <Field
            name="capacity_packages"
            label="Nombre maximal de colis"
            type="number"
          />
          <Field name="carrier_name" label="Transporteur" />
          <Field name="transport_reference" label="Vol / navire / véhicule" />
          <Field name="responsible_name" label="Responsable" />
          <label className="grid gap-1 text-[12px] font-medium text-[#555e58]">Bureau chargé de l’arrivée<select name="destination_office" className={input}><option value="">Aucun bureau sélectionné</option>{offices.map((office)=><option key={office.id} value={office.id}>{office.label}{office.secondary?` · ${office.secondary}`:""}</option>)}</select></label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="published" value="true" />
            Publier aux clients
          </label>
        </div>
        {error && <p className="mt-3 text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btn} onClick={close}>
            Annuler
          </button>
          <button disabled={busy || !routeId} className={primary}>
            {busy ? "Création…" : "Créer le départ"}
          </button>
        </div>
      </form>
    </OperationDrawer>
  );
}
function Field(p: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label>
      {p.label}
      <input {...p} className={input} />
    </label>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border p-3">
      <small className="text-[#6c747d]">{label}</small>
      <b className="mt-1 block text-[13px]">{value}</b>
    </div>
  );
}
function Bar({ value, max }: { value: number; max?: number }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[11px]">
        <span>
          {value} / {max || "∞"}
        </span>
        <b>{pct}%</b>
      </div>
      <div className="mt-1 h-2 bg-[#edf0f2]">
        <div
          className={`h-2 ${pct > 95 ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-[#12b866]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-medium ${value === "DELAYED" || value === "CANCELLED" ? "bg-red-50 text-red-700" : value === "CONFIRMED" || value === "DEPARTED" || value === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}
    >
      {labels[value] || value}
    </span>
  );
}
function Empty() {
  return (
    <div className="grid min-h-64 place-items-center text-center">
      <div>
        <Ship className="mx-auto text-[#9299a0]" />
        <p className="mt-3 text-[13px] font-medium">Aucun départ</p>
      </div>
    </div>
  );
}
function date(v?: string) {
  return v
    ? new Date(v).toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
}
function next(s: string): Array<[string, string]> {
  return (
    (
      {
        DRAFT: [["PLANNED", "Planifier"]],
        OPEN: [["CONFIRMED", "Confirmer"]],
        PLANNED: [
          ["CONFIRMED", "Confirmer"],
          ["DELAYED", "Retarder"],
        ],
        PENDING_CONFIRMATION: [["CONFIRMED", "Confirmer"]],
        CONFIRMED: [
          ["LOADING", "Commencer chargement"],
          ["DELAYED", "Retarder"],
        ],
        CLOSED: [["LOADING", "Charger"]],
        LOADING: [
          ["READY_TO_DEPART", "Prêt au départ"],
          ["DEPARTED", "Confirmer départ"],
        ],
        READY_TO_DEPART: [["DEPARTED", "Confirmer départ"]],
        DELAYED: [["CONFIRMED", "Reconfirmer"]],
        DEPARTED: [["ARRIVED", "Confirmer arrivée"]],
        ARRIVED: [["COMPLETED", "Terminer"]],
      } as Record<string, Array<[string, string]>>
    )[s] || []
  );
}
