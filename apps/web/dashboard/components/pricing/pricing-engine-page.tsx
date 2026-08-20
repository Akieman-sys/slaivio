"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Calculator,
  ChevronRight,
  Download,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationPageHeader, OperationTabs } from "@/components/ui/operation-page-header";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { OperationMetrics, OperationSearch, OperationToolbar } from "@/components/ui/operation-primitives";
import { OperationMetric, OperationMetricGrid, OperationTab, OperationTabMenu } from "@/components/ui/operation-controls";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/page-state";
import { businessLabel } from "@/components/ui/business-labels";
import {
  addGridFee,
  addGridRule,
  addGridTier,
  approveGrid,
  createGrid,
  gridDetail,
  pricingAnalytics,
  pricingCatalog,
  pricingDashboard,
  simulatePrice,
  transitionGrid,
  type Catalog,
  type Dashboard,
  type Grid,
} from "@/services/pricing-engine";
const btn =
    "inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-[#d4d9df] bg-white px-3 text-[13px] font-medium hover:bg-[#f5f6f6]",
  primary =
    "inline-flex h-9 items-center justify-center gap-2 rounded-[6px] bg-[#12c76f] px-4 text-[13px] font-medium text-white hover:bg-[#0fb766]",
  input =
    "h-9 w-full rounded-[6px] border border-[#d6dadd] bg-white px-3 text-[13px] outline-none focus:border-[#16855f]";
const calculationLabels: Record<string, string> = {
  PER_KG: "Par kilogramme",
  PER_CBM: "Par mètre cube (CBM)",
  PER_PACKAGE: "Par colis",
  PER_UNIT: "Par unité",
  PERCENT_VALUE: "Pourcentage de la valeur déclarée",
  FIXED: "Montant fixe",
  TIERED: "Selon des paliers",
};
type View =
  | "OVERVIEW"
  | "GRIDS"
  | "ROUTES"
  | "SERVICES"
  | "CATEGORIES"
  | "TIERS"
  | "FEES"
  | "DISCOUNTS"
  | "PROMOTIONS"
  | "CLIENTS"
  | "COSTS"
  | "SIMULATOR"
  | "HISTORY"
  | "ANALYTICS"
  | "SETTINGS";
export function PricingEnginePage() {
  const [data, setData] = useState<Dashboard | null>(null),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [view, setView] = useState<View>("OVERVIEW"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Awaited<
      ReturnType<typeof gridDetail>
    > | null>(null),
    [createOpen, setCreateOpen] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([pricingDashboard(), pricingCatalog()]);
      setData(d);
      setCatalog(c);
      setError("");
    } catch {
      setError(
        "Le moteur tarifaire est indisponible. Vérifiez la migration 084 et l’API.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const grids = useMemo(
    () =>
      (data?.grids || []).filter(
        (x) =>
          !query ||
          `${x.grid_code} ${x.name} ${x.route_name} ${x.service_name}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [data, query],
  );
  const stats = data?.stats || {};
  const cards = [
    ["Grilles actives", stats.active_grids || 0],
    ["Routes tarifées", stats.priced_routes || 0],
    ["Services tarifés", stats.priced_services || 0],
    ["Règles spéciales", stats.special_rules || 0],
    ["Promotions actives", stats.active_promotions || 0],
    ["À réviser", stats.expiring_soon || 0],
    ["Marge minimale", `${data?.settings.minimum_margin_percent || 0}%`],
    [
      "Dernière modification",
      stats.last_modified
        ? new Date(String(stats.last_modified)).toLocaleDateString("fr-FR")
        : "—",
    ],
  ];
  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <OperationPageHeader
        title="Tarification"
        description="Configurez vos prix, règles, paliers et frais pour toutes vos routes et services cargo."
        actions={
          <>
            <a className={btn} href="/api/pricing/export.csv">
              <Download size={14} />
              Exporter
            </a>
            <PermissionGuard permission="pricing.create">
              <button className={primary} onClick={() => setCreateOpen(true)}>
                <Plus size={14} />
                Nouvelle grille
              </button>
            </PermissionGuard>
          </>
        }
      />
      <OperationMetrics>
      <OperationMetricGrid>
        {cards.slice(0, 4).map(([l, v]) => (
          <OperationMetric key={String(l)} label={String(l)} value={v} />
        ))}
      </OperationMetricGrid>
      </OperationMetrics>
      <PricingTabs view={view} setView={setView} />
      {error && <ErrorState title="Tarification indisponible" description={error} retry={load} />}
      {view === "SIMULATOR" ? (
        <Simulator catalog={catalog} />
      ) : view === "ANALYTICS" ? (
        <Analytics />
      ) : view === "SETTINGS" ? (
        <Settings data={data} />
      ) : (
        <>
          <OperationToolbar search={<OperationSearch value={query} onChange={setQuery} placeholder="Grille, route, service, catégorie…" />}>
            <button className={btn} onClick={load}>
              <RefreshCcw size={14} />
              Actualiser
            </button>
          </OperationToolbar>
          {loading ? (
            <TableSkeleton rows={7} columns={9} label="Chargement des tarifs…" />
          ) : grids.length ? (
            <GridTable
              grids={grids}
              open={async (g) => setSelected(await gridDetail(g.id))}
            />
          ) : (
            <EmptyState title="Aucune grille tarifaire" description="Créez une grille en sélectionnant une route et un service déjà configurés dans l’agence." />
          )}
        </>
      )}
      {selected && (
        <GridDrawer
          detail={selected}
          close={() => setSelected(null)}
          changed={async () => {
            setSelected(await gridDetail(selected.grid.id));
            await load();
          }}
        />
      )}
      {createOpen && catalog && (
        <OperationDrawer
          open
          title="Nouvelle grille tarifaire"
          description="Une grille versionne les prix d’une combinaison Route + Service."
          close={() => setCreateOpen(false)}
        >
          <CreateGrid
            catalog={catalog}
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
function GridTable({
  grids,
  open,
}: {
  grids: Grid[];
  open: (g: Grid) => void;
}) {
  return (
    <div className="overflow-x-auto bg-white">
      <table className="w-full min-w-[1050px] text-left text-[12px]">
        <thead className="bg-[#f5f6f6]">
          <tr>
            {[
              "Grille",
              "Route",
              "Service",
              "Méthode",
              "Devise",
              "Règles",
              "Validité",
              "Version",
              "Statut",
              "",
            ].map((x) => (
              <th key={x} className="p-3 font-medium text-[#5d6670]">
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grids.map((g) => (
            <tr
              key={g.id}
              onClick={() => open(g)}
              className="cursor-pointer border-t hover:bg-[#fafafa]"
            >
              <td className="p-3">
                <b>{g.grid_code}</b>
                <small className="block text-[#737b84]">{g.name}</small>
              </td>
              <td>{g.route_name}</td>
              <td>
                {g.service_name}
                <small className="block">{g.shipping_mode}</small>
              </td>
              <td>{g.calculation_method}</td>
              <td>{g.currency_code}</td>
              <td>
                {g.rule_count} règles · {g.tier_count} paliers · {g.fee_count}{" "}
                frais
              </td>
              <td>
                {new Date(g.effective_from).toLocaleDateString("fr-FR")}
                <small className="block">
                  {g.effective_until
                    ? new Date(g.effective_until).toLocaleDateString("fr-FR")
                    : "Sans fin"}
                </small>
              </td>
              <td>v{g.version}</td>
              <td>
                <Badge value={g.status} />
              </td>
              <td className="w-10 pr-4 text-right text-[#8a929a]">
                <ChevronRight className="ml-auto" size={16} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!grids.length && (
        <p className="p-16 text-center text-[13px]">
          Aucune grille. Créez une grille, ses règles puis faites-la approuver
          et activer.
        </p>
      )}
    </div>
  );
}
function CreateGrid({
  catalog,
  done,
}: {
  catalog: Catalog;
  done: () => Promise<void>;
}) {
  const [route, setRoute] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await createGrid({
      grid_code: f.get("code"),
      name: f.get("name"),
      route_id: f.get("route"),
      shipping_service_id: f.get("service"),
      currency_code: f.get("currency"),
      calculation_method: f.get("method"),
      visibility: f.get("visibility"),
      effective_from: new Date(String(f.get("effective"))).toISOString(),
      volumetric_divisor: Number(f.get("divisor")),
      chargeable_weight_rule: "MAX",
      rounding_increment: Number(f.get("rounding")),
      minimum_weight_kg: Number(f.get("minimum")) || null,
      tax_inclusive: false,
      tax_rate: Number(f.get("tax")),
      requires_approval: true,
    });
    await done();
  }
  return (
    <form onSubmit={submit} className="grid gap-3 p-5">
      <input
        required
        name="code"
        className={input}
        placeholder="Code (AIR-CAN-FIH-2026)"
      />
      <input
        required
        name="name"
        className={input}
        placeholder="Nom de la grille"
      />
      <select
        required
        name="route"
        className={input}
        value={route}
        onChange={(e) => setRoute(e.target.value)}
      >
        <option value="">Choisir une route configurée</option>
        {catalog.routes.map((x) => (
          <option key={x.id} value={x.id}>
            {x.route_name}
          </option>
        ))}
      </select>
      <select required name="service" className={input}>
        <option value="">Choisir un service disponible sur cette route</option>
        {catalog.services
          .filter((x) => x.route_id === route)
          .map((x) => (
            <option key={x.id} value={x.id}>
              {x.service_name}
            </option>
          ))}
      </select>
      <div className="grid grid-cols-2 gap-3">
        <select name="method" className={input}>
          {Object.entries(calculationLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          name="currency"
          className={input}
          defaultValue="USD"
          maxLength={3}
        />
        <input
          name="effective"
          type="datetime-local"
          required
          className={input}
        />
        <select name="visibility" className={input}>
          <option value="INTERNAL">Réservé à l’équipe</option>
          <option value="PUBLIC">Communicable aux clients</option>
          <option value="CONTRACTUAL">Réservé aux clients sous contrat</option>
        </select>
        <input
          name="divisor"
          type="number"
          defaultValue="6000"
          className={input}
        />
        <input
          name="rounding"
          type="number"
          step="0.1"
          defaultValue="0.5"
          className={input}
        />
        <input
          name="minimum"
          type="number"
          step="0.1"
          placeholder="Minimum kg"
          className={input}
        />
        <input
          name="tax"
          type="number"
          step="0.01"
          defaultValue="0"
          placeholder="Taxe %"
          className={input}
        />
      </div>
      <button className={primary}>Créer la grille tarifaire</button>
    </form>
  );
}
function GridDrawer({
  detail,
  close,
  changed,
}: {
  detail: Awaited<ReturnType<typeof gridDetail>>;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const g = detail.grid;
  return (
    <OperationDrawer
      open
      close={close}
      width="max-w-[860px]"
      title={g.name}
      description={`${g.grid_code} · v${g.version} · ${g.route_name} · ${g.service_name}`}
      bodyClassName="bg-[#f7f7f6] p-5"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
            <Badge value={g.status} />
            <PermissionGuard permission="pricing.approve">
              <button
                className={btn}
                onClick={async () => {
                  await approveGrid(g.id, "Tarif vérifié");
                  await changed();
                }}
              >
                Approuver
              </button>
              <button
                className={primary}
                onClick={async () => {
                  await transitionGrid(g.id, "ACTIVE", "Publication tarifaire");
                  await changed();
                }}
              >
                Activer
              </button>
            </PermissionGuard>
        </div>
      }
    >
        <main className="grid gap-4 md:grid-cols-2">
          <Card title="Règles">
            {detail.rules.map((x, i) => (
              <Row key={i} x={x} />
            ))}
            <AddRule grid={g.id} changed={changed} />
          </Card>
          <Card title="Paliers">
            {detail.tiers.map((x, i) => (
              <Row key={i} x={x} />
            ))}
            <AddTier grid={g.id} changed={changed} />
          </Card>
          <Card title="Frais supplémentaires">
            {detail.fees.map((x, i) => (
              <Row key={i} x={x} />
            ))}
            <AddFee grid={g.id} changed={changed} />
          </Card>
          <Card title="Historique audité">
            {detail.audit.slice(0, 10).map((x, i) => (
              <Row key={i} x={x} />
            ))}
          </Card>
        </main>
    </OperationDrawer>
  );
}

function PricingTabs({ view, setView }: { view: View; setView: (next: View) => void }) {
  const primaryViews: Array<[View, string]> = [["OVERVIEW", "Vue d’ensemble"], ["GRIDS", "Grilles"], ["ROUTES", "Par route"], ["SERVICES", "Par service"]];
  const moreViews: Array<[View, string]> = [["CATEGORIES", "Catégories"], ["TIERS", "Paliers"], ["FEES", "Frais"], ["DISCOUNTS", "Remises"], ["PROMOTIONS", "Promotions"], ["CLIENTS", "Tarifs clients"], ["COSTS", "Coûts et marges"], ["SIMULATOR", "Simulateur"], ["HISTORY", "Historique"], ["ANALYTICS", "Analytics"], ["SETTINGS", "Paramètres"]];
  const moreSelected = moreViews.some(([key]) => key === view);
  return (
    <OperationTabs>
      {primaryViews.map(([key, label]) => <OperationTab key={key} onClick={() => setView(key)} active={view === key}>{label}</OperationTab>)}
      <OperationTabMenu items={moreViews} value={moreSelected ? view : ""} onChange={setView} />
    </OperationTabs>
  );
}
function AddRule({
  grid,
  changed,
}: {
  grid: string;
  changed: () => Promise<void>;
}) {
  return (
    <PermissionGuard permission="pricing.update">
      <button
        className={btn}
        onClick={async () => {
          const name = prompt("Nom de la règle");
          const amount = prompt("Prix unitaire");
          if (name && amount) {
            await addGridRule(grid, {
              rule_code: `RULE-${Date.now()}`,
              name,
              conditions: {},
              action_type: "SET_PRICE",
              calculation_method: "PER_KG",
              amount: Number(amount),
              priority: 100,
              stackable: false,
              effective_from: new Date().toISOString(),
            });
            await changed();
          }
        }}
      >
        <Plus size={13} />
        Règle de prix
      </button>
    </PermissionGuard>
  );
}
function AddTier({
  grid,
  changed,
}: {
  grid: string;
  changed: () => Promise<void>;
}) {
  return (
    <PermissionGuard permission="pricing.update">
      <button
        className={btn}
        onClick={async () => {
          const min = prompt("Quantité minimale");
          const price = prompt("Prix unitaire");
          if (min && price) {
            await addGridTier(grid, {
              basis: "WEIGHT",
              min_quantity: Number(min),
              unit_price: Number(price),
              priority: 100,
            });
            await changed();
          }
        }}
      >
        <Plus size={13} />
        Palier
      </button>
    </PermissionGuard>
  );
}
function AddFee({
  grid,
  changed,
}: {
  grid: string;
  changed: () => Promise<void>;
}) {
  return (
    <PermissionGuard permission="pricing.update">
      <button
        className={btn}
        onClick={async () => {
          const name = prompt("Nom du frais");
          const amount = prompt("Montant fixe");
          if (name && amount) {
            await addGridFee(grid, {
              fee_code: `FEE-${Date.now()}`,
              name,
              fee_type: "HANDLING",
              calculation_method: "FIXED",
              amount: Number(amount),
              conditions: {},
              taxable: false,
              priority: 100,
            });
            await changed();
          }
        }}
      >
        <Plus size={13} />
        Frais
      </button>
    </PermissionGuard>
  );
}
function Simulator({ catalog }: { catalog: Catalog | null }) {
  const [result, setResult] = useState<Awaited<
      ReturnType<typeof simulatePrice>
    > | null>(null),
    [route, setRoute] = useState(""),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      setResult(
        await simulatePrice({
          route_id: f.get("route"),
          shipping_service_id: f.get("service"),
          category_code: f.get("category"),
          weight_kg: Number(f.get("weight")),
          length_cm: Number(f.get("length")) || null,
          width_cm: Number(f.get("width")) || null,
          height_cm: Number(f.get("height")) || null,
          volume_cbm: Number(f.get("cbm")) || 0,
          units: Number(f.get("units")) || 1,
          declared_value: Number(f.get("value")) || 0,
          priced_at: new Date().toISOString(),
          freeze: false,
          exchange_rate: 1,
        }),
      );
      setError("");
    } catch {
      setError(
        "Aucune grille active compatible ou règle nécessitant un devis manuel.",
      );
    }
  }
  return (
    <main className="grid gap-4 p-4 xl:grid-cols-[400px_1fr]">
      <form onSubmit={submit} className="grid gap-3 bg-white p-4">
        <h2 className="font-semibold">Simuler un tarif explicable</h2>
        <select
          required
          name="route"
          className={input}
          value={route}
          onChange={(e) => setRoute(e.target.value)}
        >
          <option value="">Route</option>
          {catalog?.routes.map((x) => (
            <option key={x.id} value={x.id}>
              {x.route_name}
            </option>
          ))}
        </select>
        <select required name="service" className={input}>
          <option value="">Service</option>
          {catalog?.services
            .filter((x) => x.route_id === route)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.service_name}
              </option>
            ))}
        </select>
        <select required name="category" className={input}>
          <option value="">Marchandise</option>
          {catalog?.categories.map((x) => (
            <option key={x.id} value={x.code}>
              {x.name}
            </option>
          ))}
        </select>
        {[
          ["weight", "Poids réel kg"],
          ["cbm", "CBM (si connu)"],
          ["length", "Longueur cm"],
          ["width", "Largeur cm"],
          ["height", "Hauteur cm"],
          ["units", "Unités"],
          ["value", "Valeur déclarée"],
        ].map(([n, p]) => (
          <input
            key={n}
            name={n}
            type="number"
            step="0.01"
            className={input}
            placeholder={p}
          />
        ))}
        <button className={primary}>
          <Calculator size={14} />
          Calculer
        </button>
        {error && <p className="text-[12px] text-red-600">{error}</p>}
      </form>
      <section className="bg-white p-5">
        <h2 className="font-semibold">Explication du calcul</h2>
        {result ? (
          <>
            <OperationMetricGrid className="mt-4">
              <OperationMetric
                label="Poids réel"
                value={`${result.actual_weight_kg} kg`}
              />
              <OperationMetric
                label="Poids volumétrique"
                value={`${result.volumetric_weight_kg.toFixed(2)} kg`}
              />
              <OperationMetric
                label="Poids facturable"
                value={`${result.chargeable_weight_kg} kg`}
              />
              <OperationMetric
                label="Total"
                value={`${result.total} ${result.currency}`}
              />
            </OperationMetricGrid>
            <div className="mt-4">
              {result.breakdown.map((x, i) => (
                <p
                  key={i}
                  className="flex justify-between border-t py-3 text-[12px]"
                >
                  <span>{x.label}</span>
                  <b>
                    {x.amount} {result.currency}
                  </b>
                </p>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-[#69717a]">
              Grille {result.grid_code} v{result.grid_version} · marge{" "}
              {result.margin_percent}% · ce résultat peut être figé dans un
              devis ou dossier.
            </p>
          </>
        ) : (
          <p className="py-16 text-center text-[13px] text-[#69717a]">
            Renseignez le contexte réel pour obtenir un prix traçable.
          </p>
        )}
      </section>
    </main>
  );
}
function Analytics() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof pricingAnalytics>
  > | null>(null);
  useEffect(() => {
    pricingAnalytics()
      .then(setData)
      .catch(() => undefined);
  }, []);
  return (
    <main className="grid gap-4 p-4 md:grid-cols-2">
      <Card title="Simulations par route">
        {data?.by_route.map((x, i) => (
          <Row key={i} x={x} />
        ))}
      </Card>
      <Card title="Simulations par catégorie">
        {data?.by_category.map((x, i) => (
          <Row key={i} x={x} />
        ))}
      </Card>
    </main>
  );
}
function Settings({ data }: { data: Dashboard | null }) {
  return (
    <main className="p-4">
      <Card title="Garde-fous commerciaux">
        <Row x={data?.settings || {}} />
        <p className="mt-3 text-[12px] text-[#69717a]">
          Les remises, marges minimales, approbations et formules volumétriques
          sont contrôlées côté serveur. Les factures utilisent toujours un
          snapshot immuable.
        </p>
      </Card>
    </main>
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
    <section className="bg-white p-4">
      <h3 className="mb-3 text-[13px] font-semibold">{title}</h3>
      {children}
    </section>
  );
}
function Row({ x }: { x: Record<string, unknown> }) {
  return (
    <div className="border-t py-2 text-[11px]">
      <b>
        {String(
          x.name ||
            x.rule_code ||
            x.fee_code ||
            x.event_type ||
            x.label ||
            "Configuration",
        )}
      </b>
      <small className="block text-[#69717a]">
        {Object.entries(x)
          .filter(([k]) =>
            [
              "amount",
              "percentage",
              "unit_price",
              "status",
              "created_at",
              "simulations",
              "average_price",
              "average_margin",
            ].includes(k),
          )
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(" · ")}
      </small>
    </div>
  );
}
function Badge({ value }: { value: string }) {
  const labels: Record<string, string> = {
    DRAFT: "Brouillon",
    SCHEDULED: "Programmée",
    ACTIVE: "Active",
    EXPIRED: "Expirée",
    SUSPENDED: "Suspendue",
    ARCHIVED: "Archivée",
  };
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-medium ${value === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : value === "SUSPENDED" || value === "EXPIRED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
    >
      {labels[value] || businessLabel(value)}
    </span>
  );
}
