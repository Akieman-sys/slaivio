"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Copy,
  Download,
  Plus,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { OperationPageHeader, OperationTabs } from "@/components/ui/operation-page-header";
import { OperationMetrics, OperationSearch, OperationToolbar } from "@/components/ui/operation-primitives";
import { OperationMetric, OperationMetricGrid, OperationTab, OperationTabMenu } from "@/components/ui/operation-controls";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/page-state";
import {
  createRoute,
  routeAnalytics,
  routeDetail,
  routeEngine,
  routeIntelligence,
  routeStats,
  saveRouteView,
  suspendRoute,
  reactivateRoute,
  duplicateRoute,
  updateRoute,
  addRouteLeg,
  addRouteCarrier,
  addRouteRestriction,
  type Route,
} from "@/services/route-catalog";
const btn =
    "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] border border-[#d6dadd] bg-white px-3 text-[13px] font-medium hover:bg-[#f5f6f6]",
  primary =
    "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] bg-[#16855f] px-4 text-[13px] font-semibold text-white hover:bg-[#126f50]",
  input =
    "h-9 w-full rounded-[5px] border border-[#d6dadd] bg-white px-3 text-[13px] outline-none focus:border-[#16855f]";
type Detail = Awaited<ReturnType<typeof routeDetail>>;
type View =
  | "ALL"
  | "ACTIVE"
  | "AIR"
  | "SEA"
  | "EXPRESS"
  | "LIMITED"
  | "SUSPENDED"
  | "INACTIVE"
  | "ARCHIVED"
  | "ENGINE"
  | "ANALYTICS";
export function RouteIntelligenceCenter() {
  const [items, setItems] = useState<Route[]>([]),
    [stats, setStats] = useState<Record<string, number>>({}),
    [query, setQuery] = useState(""),
    [view, setView] = useState<View>("ALL"),
    [selected, setSelected] = useState<Detail | null>(null),
    [createOpen, setCreateOpen] = useState(false),
    [allMetrics, setAllMetrics] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [a, b] = await Promise.all([
        routeIntelligence({ limit: 500 }),
        routeStats(),
      ]);
      setItems(a.items);
      setStats(b);
    } catch {
      setError("Le réseau de routes est indisponible.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const filtered = useMemo(
    () =>
      items.filter(
        (r) =>
          (!query ||
            `${r.route_code} ${r.route_name} ${r.origin_country} ${r.origin_city} ${r.destination_country} ${r.destination_city}`
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (view === "ALL" ||
            (view === "ACTIVE" && r.status === "ACTIVE") ||
            (["AIR", "SEA", "EXPRESS"].includes(view) &&
              r.transport_mode === view) ||
            (view === "LIMITED" &&
              [r.status, r.availability].includes("LIMITED")) ||
            view === r.status),
      ),
    [items, query, view],
  );
  async function open(r: Route) {
    setSelected(await routeDetail(r.id));
  }
  const cards = [
    ["Routes actives", stats.active || 0],
    ["Pays desservis", stats.countries || 0],
    ["Villes desservies", stats.cities || 0],
    ["Air", stats.air || 0],
    ["Sea", stats.sea || 0],
    ["Suspendues", stats.suspended || 0],
    ["On-time moyen", `${stats.on_time_rate || 0}%`],
    ["Marge moyenne", `${stats.margin_percent || 0}%`],
  ];
  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <OperationPageHeader
        title="Routes"
        description="Configurez, exploitez et analysez toutes les routes cargo de votre agence."
        actions={
          <>
            <a className={btn} href="/api/route-catalog/routes/export.csv">
              <Download size={14} />
              Exporter
            </a>
            <PermissionGuard permission="routes.create">
              <button className={primary} onClick={() => setCreateOpen(true)}>
                <Plus size={14} />
                Nouvelle route
              </button>
            </PermissionGuard>
          </>
        }
      />
      <OperationMetrics>
        <OperationMetricGrid className={allMetrics ? "lg:grid-cols-8" : "lg:grid-cols-4"}>
          {cards.slice(0, allMetrics ? 8 : 4).map(([l, v]) => (
            <OperationMetric key={String(l)} label={String(l)} value={v} />
          ))}
        </OperationMetricGrid>
        <button
          onClick={() => setAllMetrics((current) => !current)}
          className="mt-3 text-[11px] font-medium text-[#087a46]"
        >
          {allMetrics ? "Réduire les indicateurs" : "Voir tous les indicateurs"}
        </button>
      </OperationMetrics>
      <OperationTabs>
          <>
            {(
              [
                ["ALL", "Toutes"],
                ["ACTIVE", "Actives"],
                ["AIR", "Air Cargo"],
                ["SEA", "Sea Cargo"],
              ] as const
            ).map(([k, l]) => (
              <OperationTab
                key={k}
                onClick={() => setView(k)}
                active={view === k}
              >
                {l}
              </OperationTab>
            ))}
            <OperationTabMenu
              items={[
                ["EXPRESS", "Express"],
                ["LIMITED", "Capacité limitée"],
                ["SUSPENDED", "Suspendues"],
                ["INACTIVE", "Inactives"],
                ["ARCHIVED", "Archivées"],
                ["ANALYTICS", "Analytics"],
                ["ENGINE", "Trouver une route"],
              ]}
              value={["EXPRESS", "LIMITED", "SUSPENDED", "INACTIVE", "ARCHIVED", "ANALYTICS", "ENGINE"].includes(view) ? view : ""}
              onChange={setView}
            />
          </>
      </OperationTabs>
      {view === "ENGINE" ? (
        <Engine />
      ) : view === "ANALYTICS" ? (
        <Analytics />
      ) : (
        <>
          <OperationToolbar search={<OperationSearch value={query} onChange={setQuery} placeholder="Route, pays, ville, entrepôt, bureau…" />}>
            <button
              className={btn}
              onClick={async () => {
                const name = prompt("Nom de cette vue");
                if (name) await saveRouteView(name, { view, query });
              }}
            >
              Enregistrer la vue
            </button>
            <button className={btn} onClick={load}>
              <RefreshCcw size={14} />
              Actualiser
            </button>
          </OperationToolbar>
          {error && <ErrorState title="Routes indisponibles" description={error} retry={load} />}
          {loading ? (
            <TableSkeleton rows={7} columns={12} label="Chargement du réseau…" />
          ) : filtered.length ? (
            <RouteTable items={filtered} open={open} />
          ) : (
            <EmptyState title="Aucune route dans cette vue" description="Modifiez les filtres ou configurez une route desservie par votre agence." />
          )}
        </>
      )}
      {selected && (
        <RouteDetail
          item={selected}
          close={() => setSelected(null)}
          changed={async () => {
            setSelected(await routeDetail(selected.id));
            await load();
          }}
        />
      )}
      {createOpen && (
        <OperationDrawer
          open
          title="Nouvelle route"
          description="La route décrit où transporter. Les services et tarifs restent dans leurs modules."
          close={() => setCreateOpen(false)}
        >
          <CreateRoute
            done={async () => {
              setCreateOpen(false);
              await load();
            }}
          />
        </OperationDrawer>
      )}
    </div>
  );
}
function RouteTable({
  items,
  open,
}: {
  items: Route[];
  open: (r: Route) => void;
}) {
  return (
    <div className="min-h-[460px] overflow-x-auto bg-white">
      <table className="w-full min-w-[1250px] border-collapse text-left text-[13px]">
        <thead className="bg-[#fbfcfd] text-[#5f6b7a]">
          <tr className="border-b border-[#e6e9ee]">
            {[
              "Route",
              "Origine",
              "Destination",
              "Mode",
              "Warehouse / bureau",
              "Délai",
              "Prochain départ",
              "Volume",
              "On-time",
              "Marge",
              "Statut",
              "",
            ].map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr
              key={r.id}
              onClick={() => open(r)}
              className="cursor-pointer border-b border-[#edf0f3] hover:bg-[#f7faf9]"
            >
              <td className="px-4 py-3">
                <b>{r.route_code}</b>
                <small className="block text-[#737b84]">{r.route_name}</small>
              </td>
              <td>
                {r.origin_city || r.origin_country}
                <small className="block text-[#737b84]">
                  {r.origin_country}
                </small>
              </td>
              <td>
                {r.destination_city || r.destination_country}
                <small className="block text-[#737b84]">
                  {r.destination_country}
                </small>
              </td>
              <td>{r.transport_mode}</td>
              <td>
                {r.origin_warehouse_name || "—"}
                <small className="block text-[#737b84]">
                  {r.destination_office_city || "Bureau non lié"}
                </small>
              </td>
              <td>
                {r.eta_min_days}–{r.eta_max_days} j
                <small className="block text-[#737b84]">
                  réel {r.real_eta_days || "—"} j
                </small>
              </td>
              <td>
                {r.next_departure_at
                  ? new Date(r.next_departure_at).toLocaleString("fr-FR")
                  : "Aucun"}
              </td>
              <td>
                {r.weight_kg || 0} kg
                <small className="block text-[#737b84]">{r.cbm || 0} CBM</small>
              </td>
              <td>{r.on_time_rate ?? "—"}%</td>
              <td>{r.margin_percent ?? "—"}%</td>
              <td>
                <Badge value={r.status} />
              </td>
              <td className="w-10 pr-4 text-right text-[#8a929a]">
                <ChevronRight className="ml-auto" size={16} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && (
        <p className="p-16 text-center text-[13px]">
          Aucune route dans cette vue.
        </p>
      )}
    </div>
  );
}
function RouteDetail({
  item,
  close,
  changed,
}: {
  item: Detail;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const [tab, setTab] = useState("overview");
  const detailTabs = [
    ["overview", "Vue d’ensemble"], ["services", "Services"], ["departures", "Départs"], ["shipments", "Expéditions"],
    ["performance", "Performance"], ["restrictions", "Restrictions"], ["carriers", "Transporteurs"], ["timeline", "Historique"], ["audit", "Audit"],
  ] as const;
  return (
    <OperationDrawer
      open
      title={`${item.origin_city || item.origin_country} → ${item.destination_city || item.destination_country}`}
      description={item.route_code}
      close={close}
      width="max-w-[920px]"
      headerMeta={<><Badge value={item.status} /><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700">{item.transport_mode}</span></>}
      tabs={<>{detailTabs.slice(0, 4).map(([key, label]) => <OperationTab key={key} active={tab === key} onClick={() => setTab(key)}>{label}</OperationTab>)}<OperationTabMenu items={detailTabs.slice(4)} value={detailTabs.slice(4).some(([key]) => key === tab) ? tab : ""} onChange={setTab} /></>}
    >
      <main>
        {tab === "overview" ? (
          <Overview item={item} />
        ) : tab === "restrictions" ? (
          <Children title="Restrictions" rows={item.restrictions} />
        ) : tab === "carriers" ? (
          <Children title="Transporteurs" rows={item.carriers} />
        ) : tab === "services" ? (
          <Children title="Services liés" rows={item.services} />
        ) : tab === "departures" ? (
          <Children title="Départs liés" rows={item.departures} />
        ) : tab === "shipments" ? (
          <Children title="Expéditions liées" rows={item.shipments} />
        ) : tab === "timeline" || tab === "audit" ? (
          <Children title="Historique audité" rows={item.events} />
        ) : (
          <Performance item={item} />
        )}
        <RouteActions item={item} changed={changed} />
      </main>
    </OperationDrawer>
  );
}
function Overview({ item }: { item: Detail }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Identité">
        <Info
          l="Origine"
          v={`${item.origin_city || ""}, ${item.origin_country}`}
        />
        <Info
          l="Destination"
          v={`${item.destination_city || ""}, ${item.destination_country}`}
        />
        <Info l="Direction" v={item.direction || "ONE_WAY"} />
        <Info l="Responsable" v={item.owner_name || "Non assigné"} />
      </Card>
      <Card title="Timing">
        <Info
          l="Délai annoncé"
          v={`${item.eta_min_days}–${item.eta_max_days} jours`}
        />
        <Info
          l="Traitement warehouse"
          v={`${item.processing_days || 0} jour(s)`}
        />
        <Info l="Douane" v={`${item.customs_days || 0} jour(s)`} />
        <Info
          l="Dernier kilomètre"
          v={`${item.final_delivery_days || 0} jour(s)`}
        />
      </Card>
      <Card title="Capacité">
        <Info
          l="Hebdomadaire"
          v={`${item.weekly_capacity_kg || "—"} kg · ${item.weekly_capacity_cbm || "—"} CBM`}
        />
        <Info
          l="Par départ"
          v={`${item.departure_capacity_kg || "—"} kg · ${item.departure_capacity_cbm || "—"} CBM`}
        />
        <Info l="Disponibilité" v={item.availability} />
      </Card>
      <Card title="Réseau multi-leg">
        {item.legs.length ? (
          item.legs.map((x, i) => (
            <p key={i} className="border-t py-2 text-[12px]">
              {String(x.origin_city || x.origin_hub || x.origin_country)} →{" "}
              {String(
                x.destination_city ||
                  x.destination_hub ||
                  x.destination_country,
              )}{" "}
              · {String(x.transport_mode)}
            </p>
          ))
        ) : (
          <p className="text-[12px] text-[#737b84]">
            Route directe. Aucune escale configurée.
          </p>
        )}
      </Card>
    </div>
  );
}
function Performance({ item }: { item: Detail }) {
  const revenue = item.shipments.reduce(
      (s, x) => s + Number(x.billed_total || 0),
      0,
    ),
    cost = item.shipments.reduce((s, x) => s + Number(x.cost_total || 0), 0),
    profit = item.shipments.reduce(
      (s, x) => s + Number(x.profit_total || 0),
      0,
    );
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card title="Expéditions">
        <b className="text-2xl">{item.shipments.length}</b>
      </Card>
      <Card title="Revenue">
        <b className="text-2xl">{revenue.toFixed(2)}</b>
      </Card>
      <Card title="Coûts / marge">
        <b className="text-2xl">
          {cost.toFixed(2)} / {profit.toFixed(2)}
        </b>
      </Card>
    </div>
  );
}
function RouteActions({
  item,
  changed,
}: {
  item: Detail;
  changed: () => Promise<void>;
}) {
  return (
    <section className="mt-5 flex flex-wrap gap-2 border-t pt-4">
      <PermissionGuard permission="routes.suspend">
        {item.status === "SUSPENDED" ? (
          <button
            className={primary}
            onClick={async () => {
              await reactivateRoute(item.id);
              await changed();
            }}
          >
            Réactiver
          </button>
        ) : (
          <button
            className={btn}
            onClick={async () => {
              const reason = prompt("Motif détaillé de suspension");
              if (reason) {
                await suspendRoute(item.id, {
                  reason_code: "OPERATIONAL",
                  reason,
                });
                await changed();
              }
            }}
          >
            <ShieldAlert size={13} />
            Suspendre
          </button>
        )}
      </PermissionGuard>
      <PermissionGuard permission="routes.create">
        <button
          className={btn}
          onClick={async () => {
            await duplicateRoute(item.id);
            await changed();
          }}
        >
          <Copy size={13} />
          Dupliquer
        </button>
      </PermissionGuard>
      <PermissionGuard permission="routes.update">
        <button
          className={btn}
          onClick={async () => {
            const eta = prompt(
              "Nouveau délai maximum (jours)",
              String(item.eta_max_days),
            );
            if (eta) {
              await updateRoute(item.id, {
                row_version: item.row_version,
                eta_max_days: Number(eta),
                change_reason: "Mise à jour opérationnelle",
              });
              await changed();
            }
          }}
        >
          Modifier délai
        </button>
        <button
          className={btn}
          onClick={async () => {
            const city = prompt("Ville de l’escale");
            if (city) {
              await addRouteLeg(item.id, {
                position: item.legs.length + 1,
                origin_city: item.origin_city,
                destination_city: city,
                transport_mode: item.transport_mode,
                planned_duration_hours: 24,
                metadata: {},
              });
              await changed();
            }
          }}
        >
          Ajouter escale
        </button>
      </PermissionGuard>
      <PermissionGuard permission="routes.carriers">
        <button
          className={btn}
          onClick={async () => {
            const carrier_name = prompt("Nom du transporteur");
            if (carrier_name) {
              await addRouteCarrier(item.id, {
                carrier_name,
                carrier_type: item.transport_mode,
                priority: 100,
                border_crossings: [],
              });
              await changed();
            }
          }}
        >
          Ajouter transporteur
        </button>
      </PermissionGuard>
      <PermissionGuard permission="routes.restrictions">
        <button
          className={btn}
          onClick={async () => {
            const goods_category = prompt("Catégorie de marchandise");
            if (goods_category) {
              await addRouteRestriction(item.id, {
                goods_category,
                decision: "CONDITIONAL",
                required_documents: [],
              });
              await changed();
            }
          }}
        >
          Ajouter restriction
        </button>
      </PermissionGuard>
    </section>
  );
}
function Engine() {
  const [result, setResult] = useState<Awaited<
      ReturnType<typeof routeEngine>
    > | null>(null),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      setResult(
        await routeEngine({
          origin_country: f.get("origin_country"),
          origin_city: f.get("origin_city"),
          destination_country: f.get("destination_country"),
          destination_city: f.get("destination_city"),
          transport_mode: f.get("transport_mode") || undefined,
          goods_category: f.get("goods_category"),
          weight_kg: Number(f.get("weight_kg")) || 0,
          volume_cbm: Number(f.get("volume_cbm")) || 0,
        }),
      );
      setError("");
    } catch {
      setError("Aucune proposition compatible.");
    }
  }
  return (
    <main className="grid gap-4 p-4 xl:grid-cols-[380px_1fr]">
      <form onSubmit={submit} className="grid gap-3 border bg-white p-4">
        <h2 className="font-semibold">Simulateur de route</h2>
        {[
          ["origin_country", "Pays origine"],
          ["origin_city", "Ville origine"],
          ["destination_country", "Pays destination"],
          ["destination_city", "Ville destination"],
          ["goods_category", "Marchandise"],
          ["weight_kg", "Poids kg"],
          ["volume_cbm", "CBM"],
        ].map(([n, p]) => (
          <input
            key={n}
            required={n === "destination_country"}
            className={input}
            name={n}
            placeholder={p}
          />
        ))}
        <select className={input} name="transport_mode">
          <option value="">Tous les modes</option>
          <option>AIR</option>
          <option>SEA</option>
          <option>EXPRESS</option>
          <option>ROAD</option>
        </select>
        <button className={primary}>
          <Sparkles size={14} />
          Proposer les routes compatibles
        </button>
        {error && <p className="text-red-600">{error}</p>}
      </form>
      <section className="border bg-white p-4">
        <h2 className="font-semibold">Propositions à confirmer</h2>
        {result?.items.map((x) => (
          <div key={`${x.id}-${x.service_id}`} className="mt-3 border-t p-3">
            <b>{x.route_name}</b>
            <p className="text-[12px]">
              {x.service_name} · {x.service_eta_min}–{x.service_eta_max} jours
            </p>
            <small>
              {x.next_departure_at
                ? `Prochain départ ${new Date(x.next_departure_at).toLocaleString("fr-FR")}`
                : "Départ non planifié"}
            </small>
          </div>
        ))}
      </section>
    </main>
  );
}
function Analytics() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof routeAnalytics>
  > | null>(null);
  useEffect(() => {
    routeAnalytics()
      .then(setData)
      .catch(() => undefined);
  }, []);
  return (
    <main className="grid gap-4 p-4 lg:grid-cols-3">
      <Card title="Routes par mode">
        {data?.by_mode.map((x) => (
          <Info key={x.label} l={x.label} v={x.count} />
        ))}
      </Card>
      <Card title="Top volume">
        {data?.top_volume.map((x) => (
          <Info key={x.label} l={x.label} v={`${x.value} kg`} />
        ))}
      </Card>
      <Card title="Retards">
        {data?.delays.map((x) => (
          <Info key={x.label} l={x.label} v={x.value} />
        ))}
      </Card>
    </main>
  );
}
function CreateRoute({ done }: { done: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await createRoute({
        route_code: f.get("route_code"),
        route_name: f.get("route_name"),
        origin_country: f.get("origin_country"),
        origin_city: f.get("origin_city"),
        destination_country: f.get("destination_country"),
        destination_city: f.get("destination_city"),
        transport_mode: f.get("transport_mode"),
        eta_min_days: Number(f.get("eta_min_days")),
        eta_max_days: Number(f.get("eta_max_days")),
        metadata: {},
      });
      await done();
    } catch {
      setError(
        "La route n’a pas été créée. Vérifiez les informations obligatoires.",
      );
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-5">
      <section className="grid gap-4 md:grid-cols-2">
        <RouteFormField label="Code interne" hint="Ex. CHN-KIN-AIR">
          <input
            required
            className={input}
            name="route_code"
            placeholder="Code court de la route"
          />
        </RouteFormField>
        <RouteFormField
          label="Nom visible"
          hint="Nom compris par l’équipe et les clients"
        >
          <input
            required
            className={input}
            name="route_name"
            placeholder="Guangzhou → Kinshasa — Air"
          />
        </RouteFormField>
      </section>
      <section className="grid gap-4 border-t border-[#eceef1] pt-5 md:grid-cols-2">
        <RouteFormField label="Pays de départ">
          <input
            required
            className={input}
            name="origin_country"
            placeholder="Choisir ou saisir le pays"
          />
        </RouteFormField>
        <RouteFormField label="Ville de départ">
          <input
            className={input}
            name="origin_city"
            placeholder="Ville d’origine"
          />
        </RouteFormField>
        <RouteFormField label="Pays de destination">
          <input
            required
            className={input}
            name="destination_country"
            placeholder="Choisir ou saisir le pays"
          />
        </RouteFormField>
        <RouteFormField label="Ville de destination">
          <input
            className={input}
            name="destination_city"
            placeholder="Ville de destination"
          />
        </RouteFormField>
      </section>
      <section className="grid gap-4 border-t border-[#eceef1] pt-5 md:grid-cols-3">
        <RouteFormField label="Mode de transport">
          <select className={input} name="transport_mode">
            <option value="AIR">Avion</option>
            <option value="SEA">Bateau</option>
            <option value="EXPRESS">Express</option>
            <option value="ROAD">Route</option>
            <option value="RAIL">Rail</option>
            <option value="MULTIMODAL">Plusieurs modes</option>
          </select>
        </RouteFormField>
        <RouteFormField label="Délai minimum">
          <input
            required
            min="0"
            type="number"
            className={input}
            name="eta_min_days"
            placeholder="Nombre de jours"
          />
        </RouteFormField>
        <RouteFormField label="Délai maximum">
          <input
            required
            min="0"
            type="number"
            className={input}
            name="eta_max_days"
            placeholder="Nombre de jours"
          />
        </RouteFormField>
      </section>
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-[12px] text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end border-t border-[#eceef1] pt-4">
        <button disabled={busy} className={primary}>
          {busy ? "Création…" : "Créer la route"}
        </button>
      </div>
    </form>
  );
}
function RouteFormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-[12px] font-medium text-[#414950]">
      <span>{label}</span>
      {children}
      {hint && <small className="font-normal text-[#7a838c]">{hint}</small>}
    </label>
  );
}
function Children({
  title,
  rows,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
}) {
  return (
    <Card title={title}>
      {rows.map((x, i) => (
        <div key={String(x.id || i)} className="border-t py-3 text-[12px]">
          <b>
            {String(
              x.carrier_name ||
                x.goods_category ||
                x.service_name ||
                x.departure_code ||
                x.expedition_reference ||
                x.event_type ||
                "Élément",
            )}
          </b>
          <small className="block text-[#737b84]">
            {String(
              x.status || x.decision || x.transport_mode || x.created_at || "",
            )}
          </small>
        </div>
      ))}
      {!rows.length && (
        <p className="text-[12px] text-[#737b84]">Aucune donnée liée.</p>
      )}
    </Card>
  );
}
function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-[#e4e7ea] bg-white p-4">
      <h3 className="mb-3 text-[13px] font-semibold">{title}</h3>
      {children}
    </section>
  );
}
function Info({ l, v }: { l: string; v: unknown }) {
  return (
    <p className="flex justify-between border-t py-2 text-[12px]">
      <span className="text-[#68717a]">{l}</span>
      <b>{String(v ?? "—")}</b>
    </p>
  );
}
function Badge({ value }: { value: string }) {
  const labels: Record<string, string> = {
    DRAFT: "Brouillon",
    ACTIVE: "Active",
    LIMITED: "Capacité limitée",
    SUSPENDED: "Suspendue",
    MAINTENANCE: "Maintenance",
    INACTIVE: "Inactive",
    ARCHIVED: "Archivée",
  };
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-medium ${value === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : value === "SUSPENDED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
    >
      {labels[value] || value}
    </span>
  );
}
