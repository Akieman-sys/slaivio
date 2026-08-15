"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Calculator,
  ChevronRight,
  Download,
  Plus,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { OperationDrawer } from "@/components/ui/operation-drawer";
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
    "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] border border-[#d6dadd] bg-white px-3 text-[12px] font-medium hover:bg-[#f5f6f6]",
  primary =
    "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] bg-[#16855f] px-4 text-[12px] font-semibold text-white hover:bg-[#126f50]",
  input =
    "h-9 w-full rounded-[5px] border border-[#d6dadd] bg-white px-3 text-[12px] outline-none focus:border-[#16855f]";
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
            <button className={btn} onClick={() => setView("SIMULATOR")}>
              <Calculator size={14} />
              Simuler
            </button>
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
        tabs={
          <>
            {(
              [
                ["OVERVIEW", "Vue d’ensemble"],
                ["GRIDS", "Grilles"],
                ["ROUTES", "Par route"],
                ["SERVICES", "Par service"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`h-10 shrink-0 border-b-2 px-3 text-[12px] ${view === k ? "border-[#16855f] font-semibold text-[#145f49]" : "border-transparent text-[#69717a]"}`}
              >
                {l}
              </button>
            ))}
            <select
              aria-label="Autres vues Tarification"
              value={
                [
                  "CATEGORIES",
                  "TIERS",
                  "FEES",
                  "DISCOUNTS",
                  "PROMOTIONS",
                  "CLIENTS",
                  "COSTS",
                  "SIMULATOR",
                  "HISTORY",
                  "ANALYTICS",
                  "SETTINGS",
                ].includes(view)
                  ? view
                  : ""
              }
              onChange={(event) =>
                event.target.value && setView(event.target.value as View)
              }
              className={`mb-1 h-8 rounded-[5px] border px-2 text-[12px] outline-none ${
                [
                  "CATEGORIES",
                  "TIERS",
                  "FEES",
                  "DISCOUNTS",
                  "PROMOTIONS",
                  "CLIENTS",
                  "COSTS",
                  "SIMULATOR",
                  "HISTORY",
                  "ANALYTICS",
                  "SETTINGS",
                ].includes(view)
                  ? "border-[#16855f] bg-[#edf7f2] font-semibold text-[#145f49]"
                  : "border-[#d6dadd] bg-white text-[#69717a]"
              }`}
            >
              <option value="">Plus</option>
              <option value="CATEGORIES">Catégories</option>
              <option value="TIERS">Paliers</option>
              <option value="FEES">Frais</option>
              <option value="DISCOUNTS">Remises</option>
              <option value="PROMOTIONS">Promotions</option>
              <option value="CLIENTS">Tarifs clients</option>
              <option value="COSTS">Coûts et marges</option>
              <option value="SIMULATOR">Simulateur</option>
              <option value="HISTORY">Historique</option>
              <option value="ANALYTICS">Analytics</option>
              <option value="SETTINGS">Paramètres</option>
            </select>
          </>
        }
      />
      <section className="grid border-b bg-white sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {cards.slice(0, 4).map(([l, v]) => (
          <Metric key={String(l)} label={String(l)} value={v} />
        ))}
      </section>
      {error && (
        <p className="m-4 border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
          {error}
        </p>
      )}
      {view === "SIMULATOR" ? (
        <Simulator catalog={catalog} />
      ) : view === "ANALYTICS" ? (
        <Analytics />
      ) : view === "SETTINGS" ? (
        <Settings data={data} />
      ) : (
        <>
          <div className="flex gap-2 border-b bg-white p-4">
            <label className="flex h-9 flex-1 items-center rounded-[5px] border border-[#dfe1e3] bg-[#f7f7f6] px-3">
              <Search size={14} />
              <input
                className="ml-2 flex-1 outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Grille, route, service, catégorie…"
              />
            </label>
            <button className={btn} onClick={load}>
              <RefreshCcw size={14} />
              Actualiser
            </button>
          </div>
          {loading ? (
            <p className="p-16 text-center text-[13px]">
              Chargement des tarifs…
            </p>
          ) : (
            <GridTable
              grids={grids}
              open={async (g) => setSelected(await gridDetail(g.id))}
            />
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
    <div className="fixed inset-0 z-50 bg-black/20" onClick={close}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="ml-auto h-full w-full max-w-[860px] overflow-y-auto bg-[#f7f7f6]"
      >
        <header className="border-b bg-white p-5">
          <div className="flex justify-between">
            <div>
              <small>
                {g.grid_code} · v{g.version}
              </small>
              <h2 className="text-xl font-semibold">{g.name}</h2>
              <p className="text-[12px]">
                {g.route_name} · {g.service_name}
              </p>
            </div>
            <button onClick={close}>
              <X />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
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
        </header>
        <main className="grid gap-4 p-5 md:grid-cols-2">
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
      </aside>
    </div>
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
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric
                label="Poids réel"
                value={`${result.actual_weight_kg} kg`}
              />
              <Metric
                label="Poids volumétrique"
                value={`${result.volumetric_weight_kg.toFixed(2)} kg`}
              />
              <Metric
                label="Poids facturable"
                value={`${result.chargeable_weight_kg} kg`}
              />
              <Metric
                label="Total"
                value={`${result.total} ${result.currency}`}
              />
            </div>
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
function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-h-[78px] border-r p-4">
      <small className="text-[#68717a]">{label}</small>
      <b className="mt-2 block text-xl">{String(value)}</b>
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
      {labels[value] || value}
    </span>
  );
}
