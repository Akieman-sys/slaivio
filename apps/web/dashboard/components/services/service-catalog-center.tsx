"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Copy,
  Download,
  Plus,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { OperationPageHeader, OperationTabs } from "@/components/ui/operation-page-header";
import { OperationDrawer, OperationDrawerTabs } from "@/components/ui/operation-drawer";
import { OperationMetrics, OperationSearch, OperationToolbar } from "@/components/ui/operation-primitives";
import { OperationMetric, OperationMetricGrid, OperationTab, OperationTabMenu } from "@/components/ui/operation-controls";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/page-state";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import {
  addServiceCondition,
  addServiceDocument,
  addServiceOption,
  addServiceRoute,
  createService,
  duplicateService,
  listServices,
  recommendServices,
  serviceAnalytics,
  serviceCatalog,
  serviceDetail,
  serviceStats,
  transitionService,
  updateService,
  type Catalog,
  type Service,
} from "@/services/service-catalog";
const btn =
    "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] border border-[#d6dadd] bg-white px-3 text-[13px] font-medium hover:bg-[#f5f6f6]",
  primary =
    "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] bg-[#16855f] px-4 text-[13px] font-semibold text-white hover:bg-[#126f50]",
  input =
    "h-9 w-full rounded-[5px] border border-[#d6dadd] bg-white px-3 text-[13px] outline-none focus:border-[#16855f]";
const serviceTypeLabels: Record<string, string> = {
  TRANSPORT: "Transport",
  WAREHOUSE: "Entrepôt et stockage",
  INSPECTION: "Inspection",
  PURCHASE: "Achat fournisseur",
  CUSTOMS: "Dédouanement",
  DELIVERY: "Livraison locale",
  INSURANCE: "Assurance",
  PACKAGING: "Emballage",
  DOCUMENTATION: "Documents",
  OTHER: "Autre",
};
const modeLabels: Record<string, string> = {
  AIR: "Avion",
  SEA: "Bateau",
  EXPRESS: "Express",
  ROAD: "Route",
  RAIL: "Rail",
  MULTIMODAL: "Plusieurs modes",
  LOCAL: "Livraison locale",
  NONE: "Non applicable",
};
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-[12px] font-medium text-[#353b42]">
      <span>{label}</span>
      {children}
      {hint && <small className="font-normal text-[#737b84]">{hint}</small>}
    </label>
  );
}
type View =
  | "ALL"
  | "TRANSPORT"
  | "COMPLEMENTARY"
  | "ACTIVE"
  | "LIMITED"
  | "SUSPENDED"
  | "ARCHIVED"
  | "BUNDLES"
  | "COMPARE"
  | "RECOMMEND"
  | "ANALYTICS"
  | "SETTINGS";
type Detail = Awaited<ReturnType<typeof serviceDetail>>;
export function ServiceCatalogCenter() {
  const [items, setItems] = useState<Service[]>([]),
    [stats, setStats] = useState<Record<string, number>>({}),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [view, setView] = useState<View>("ALL"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Detail | null>(null),
    [createOpen, setCreateOpen] = useState(false),
    [allMetrics, setAllMetrics] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b, c] = await Promise.all([
        listServices(),
        serviceStats(),
        serviceCatalog(),
      ]);
      setItems(a.items);
      setStats(b);
      setCatalog(c);
      setError("");
    } catch {
      setError(
        "Le catalogue Services est indisponible. Exécutez la migration 085 puis redéployez l’API.",
      );
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
        (s) =>
          (!query ||
            `${s.service_code} ${s.service_name} ${s.shipping_mode} ${s.category}`
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (view === "ALL" ||
            (view === "TRANSPORT" && s.category === "TRANSPORT") ||
            (view === "COMPLEMENTARY" && s.category !== "TRANSPORT") ||
            view === s.status),
      ),
    [items, query, view],
  );
  const cards = [
    ["Services actifs", stats.active || 0],
    ["Air", stats.air || 0],
    ["Sea", stats.sea || 0],
    ["Express", stats.express || 0],
    ["Complémentaires", stats.complementary || 0],
    ["Suspendus", stats.suspended || 0],
    ["Colis ce mois", stats.packages_month || 0],
    ["Catalogue", items.length],
  ];
  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <OperationPageHeader
        title="Services"
        description="Configurez et pilotez tous les services proposés par votre agence cargo."
        actions={
          <>
            <a className={btn} href="/api/service-catalog/export.csv">
              <Download size={14} />
              Exporter
            </a>
            <PermissionGuard permission="services.create">
              <button className={primary} onClick={() => setCreateOpen(true)}>
                <Plus size={14} />
                Nouveau service
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
                ["ALL", "Tous"],
                ["TRANSPORT", "Transport"],
                ["COMPLEMENTARY", "Complémentaires"],
                ["ACTIVE", "Actifs"],
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
                ["LIMITED", "Capacité limitée"],
                ["SUSPENDED", "Suspendus"],
                ["ARCHIVED", "Archivés"],
                ["BUNDLES", "Bundles"],
                ["COMPARE", "Comparateur"],
                ["RECOMMEND", "Recommandation"],
                ["ANALYTICS", "Analytics"],
                ["SETTINGS", "Paramètres"],
              ]}
              value={["LIMITED", "SUSPENDED", "ARCHIVED", "BUNDLES", "COMPARE", "RECOMMEND", "ANALYTICS", "SETTINGS"].includes(view) ? view : ""}
              onChange={setView}
            />
          </>
      </OperationTabs>
      {error && <ErrorState title="Services indisponibles" description={error} retry={load} />}
      {view === "RECOMMEND" ? (
        <Recommendation />
      ) : view === "COMPARE" ? (
        <Compare items={items} />
      ) : view === "ANALYTICS" ? (
        <Analytics />
      ) : view === "SETTINGS" ? (
        <Settings />
      ) : (
        <>
          <OperationToolbar search={<OperationSearch value={query} onChange={setQuery} placeholder="Service, type, route, pays, responsable…" />}>
            <button className={btn} onClick={load}>
              <RefreshCcw size={14} />
              Actualiser
            </button>
          </OperationToolbar>
          {loading ? (
            <TableSkeleton rows={7} columns={10} label="Chargement des services…" />
          ) : filtered.length ? (
            <Table
              items={filtered}
              open={async (s) => setSelected(await serviceDetail(s.id))}
            />
          ) : (
            <EmptyState title="Aucun service dans cette vue" description="Modifiez les filtres ou ajoutez un service au catalogue de votre agence." />
          )}
        </>
      )}
      {selected && catalog && (
        <DetailDrawer
          item={selected}
          catalog={catalog}
          close={() => setSelected(null)}
          changed={async () => {
            setSelected(await serviceDetail(selected.id));
            await load();
          }}
        />
      )}
      {createOpen && (
        <OperationDrawer
          open
          title="Nouveau service"
          description="Définissez ce que l’agence vend. Les routes et tarifs seront liés sans être recopiés."
          close={() => setCreateOpen(false)}
        >
          <Create
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
function Table({
  items,
  open,
}: {
  items: Service[];
  open: (s: Service) => void;
}) {
  return (
    <div className="min-h-[460px] overflow-x-auto bg-white">
      <table className="w-full min-w-[1120px] border-collapse text-left text-[13px]">
        <thead className="bg-[#fbfcfd] text-[#5f6b7a]">
          <tr className="border-b border-[#e6e9ee]">
            {[
              "Service",
              "Type",
              "Routes",
              "Mode",
              "Délai annoncé / réel",
              "Tarification",
              "Disponibilité",
              "Utilisation",
              "SLA",
              "Responsable",
              "Statut",
              "",
            ].map((x) => (
              <th key={x} className="px-4 py-3 font-medium">
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr
              key={s.id}
              onClick={() => open(s)}
              className="cursor-pointer border-b border-[#edf0f3] hover:bg-[#f7faf9]"
            >
              <td className="px-4 py-3">
                <b>{s.service_name}</b>
                <small className="block text-[#737b84]">{s.service_code}</small>
              </td>
              <td>
                {s.category}
                <small className="block">{s.service_type}</small>
              </td>
              <td>{s.route_count}</td>
              <td>{s.shipping_mode}</td>
              <td>
                {s.eta_min_days ?? "—"}–{s.eta_max_days ?? "—"} j
                <small className="block">
                  réel {s.real_delay_days ?? "—"} j
                </small>
              </td>
              <td>
                {s.quote_only ? "Sur devis" : s.pricing_method || "Sans grille"}
                <small className="block">
                  {s.starting_price
                    ? `À partir de ${s.starting_price} ${s.pricing_currency}`
                    : ""}
                </small>
              </td>
              <td>{s.availability}</td>
              <td>{s.package_count} colis</td>
              <td>{s.sla_target_percent}%</td>
              <td>{s.owner_name || "Non assigné"}</td>
              <td>
                <Badge value={s.status} />
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
          Aucun service dans cette vue.
        </p>
      )}
    </div>
  );
}
function Create({ done }: { done: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await createService({
        service_code: f.get("code"),
        service_name: f.get("name"),
        description: f.get("description"),
        category: f.get("category"),
        service_type: f.get("type"),
        shipping_mode: f.get("mode"),
        eta_min_days: Number(f.get("eta_min")) || null,
        eta_max_days: Number(f.get("eta_max")) || null,
        volumetric_divisor: Number(f.get("divisor")) || 6000,
        maximum_weight_kg: Number(f.get("max_weight")) || null,
        maximum_volume_cbm: Number(f.get("max_cbm")) || null,
        currency_code: "USD",
        priority: 100,
        public_visible: f.get("public") === "on",
        quote_only: f.get("quote_only") === "on",
        minimum_weight_kg: Number(f.get("min_weight")) || null,
        cutoff_hours: Number(f.get("cutoff")) || null,
        sla_target_percent: Number(f.get("sla")) || 90,
        maximum_dimensions_cm: {},
        workflow: [
          "REQUESTED",
          "ACCEPTED",
          "IN_PROGRESS",
          "COMPLETED",
          "CANCELLED",
        ],
        metadata: {},
      });
      await done();
    } catch {
      setError(
        "Le service n’a pas été créé. Vérifiez son nom, son code et ses conditions.",
      );
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field
        label="Nom visible par les clients"
        hint="Exemple : Air Cargo Standard"
      >
        <input
          required
          name="name"
          className={input}
          placeholder="Nom du service"
        />
      </Field>
      <Field
        label="Code interne"
        hint="Une référence courte utilisée dans les documents"
      >
        <input
          required
          name="code"
          className={input}
          placeholder="Ex. AIR-STD"
        />
      </Field>
      <Field label="Description du service">
        <textarea
          name="description"
          className="min-h-24 w-full rounded-[5px] border border-[#d6dadd] p-3 text-[12px] outline-none focus:border-[#16855f]"
          placeholder="Expliquez simplement ce que ce service propose aux clients."
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Famille">
          <select name="category" className={input}>
            <option value="TRANSPORT">Transport de marchandises</option>
            <option value="COMPLEMENTARY">Service complémentaire</option>
          </select>
        </Field>
        <Field label="Type de service">
          <select name="type" className={input}>
            {Object.entries(serviceTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mode de transport">
          <select name="mode" className={input}>
            {Object.entries(modeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Délai annoncé">
          <div className="grid grid-cols-2 gap-2">
            <input
              name="eta_min"
              type="number"
              className={input}
              placeholder="Minimum (jours)"
            />
            <input
              name="eta_max"
              type="number"
              className={input}
              placeholder="Maximum (jours)"
            />
          </div>
        </Field>
        <Field label="Poids accepté">
          <div className="grid grid-cols-2 gap-2">
            <input
              name="min_weight"
              type="number"
              step="0.01"
              className={input}
              placeholder="Minimum kg"
            />
            <input
              name="max_weight"
              type="number"
              step="0.01"
              className={input}
              placeholder="Maximum kg"
            />
          </div>
        </Field>
        <Field label="Volume maximum">
          <input
            name="max_cbm"
            type="number"
            step="0.01"
            className={input}
            placeholder="Maximum en m³"
          />
        </Field>
        <Field label="Délai avant fermeture">
          <input
            name="cutoff"
            type="number"
            className={input}
            placeholder="Nombre d’heures avant le départ"
          />
        </Field>
        <Field label="Objectif de ponctualité">
          <input
            name="sla"
            type="number"
            defaultValue="90"
            className={input}
            placeholder="Pourcentage"
          />
        </Field>
        <input name="divisor" type="hidden" value="6000" />
      </div>
      <label className="flex items-center gap-2 text-[12px]">
        <input name="quote_only" type="checkbox" /> Le prix doit être confirmé
        par un agent
      </label>
      <label className="flex items-center gap-2 text-[12px]">
        <input name="public" type="checkbox" /> Ce service peut être présenté
        aux clients
      </label>
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-[12px] text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end border-t border-[#eceef1] pt-4">
        <button disabled={busy} className={primary}>
          {busy ? "Création…" : "Créer le service"}
        </button>
      </div>
    </form>
  );
}
function DetailDrawer({
  item,
  catalog,
  close,
  changed,
}: {
  item: Detail;
  catalog: Catalog;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const [tab, setTab] = useState("overview");
  const detailTabs = [
    ["overview", "Vue d’ensemble"], ["routes", "Routes"], ["pricing", "Tarification"], ["conditions", "Conditions"],
    ["options", "Options"], ["documents", "Documents"], ["performance", "Performance"], ["departures", "Départs"], ["timeline", "Historique"], ["audit", "Audit"],
  ] as const;
  return (
    <OperationDrawer
      open
      title={item.service_name}
      description={`${item.service_code} · ${item.category} · ${item.shipping_mode} · ${item.eta_min_days}–${item.eta_max_days} jours`}
      close={close}
      width="max-w-[920px]"
      headerMeta={<Badge value={item.status} />}
      headerActions={<>
        <PermissionGuard permission="services.suspend"><button className={btn} onClick={async () => { await transitionService(item.id, item.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED", "Décision opérationnelle"); await changed(); }}>{item.status === "SUSPENDED" ? "Réactiver" : "Suspendre"}</button></PermissionGuard>
        <PermissionGuard permission="services.create"><button className={btn} onClick={async () => { await duplicateService(item.id); await changed(); }}><Copy size={13} />Dupliquer</button></PermissionGuard>
      </>}
      tabsVariant="segmented"
      tabs={<OperationDrawerTabs items={detailTabs.map(([key, label]) => ({ key, label }))} value={tab} primaryKeys={["overview", "routes", "pricing", "conditions", "performance"]} onChange={setTab} />}
    >
      <main>
        {tab === "overview" ? (
          <Overview item={item} />
        ) : tab === "routes" ? (
          <Section
            title="Routes liées"
            rows={item.routes}
            action={
              <AddRoute id={item.id} catalog={catalog} changed={changed} />
            }
          />
        ) : tab === "pricing" ? (
          <Section
            title="Grilles tarifaires — source Tarification"
            rows={item.pricing}
            action={
              <Link className={btn} href="/app/pricing">
                Ouvrir Tarification
              </Link>
            }
          />
        ) : tab === "conditions" ? (
          <Section
            title="Marchandises et restrictions"
            rows={item.conditions}
            action={<AddCondition id={item.id} changed={changed} />}
          />
        ) : tab === "options" ? (
          <Section
            title="Options et add-ons"
            rows={item.options}
            action={<AddOption id={item.id} changed={changed} />}
          />
        ) : tab === "documents" ? (
          <Section
            title="Documents requis"
            rows={item.documents}
            action={<AddDocument id={item.id} changed={changed} />}
          />
        ) : tab === "departures" ? (
          <Section title="Calendrier lié" rows={item.departures} />
        ) : tab === "timeline" || tab === "audit" ? (
          <Section title="Historique audité" rows={item.audit} />
        ) : (
          <Performance item={item} />
        )}
        <PermissionGuard permission="services.update">
          <button
            className={`${btn} mt-4`}
            onClick={async () => {
              const eta = prompt(
                "Nouveau délai maximum",
                String(item.eta_max_days || ""),
              );
              if (eta) {
                await updateService(item.id, {
                  eta_max_days: Number(eta),
                  change_reason: "Révision du délai annoncé",
                });
                await changed();
              }
            }}
          >
            Modifier le délai
          </button>
        </PermissionGuard>
      </main>
    </OperationDrawer>
  );
}
function Overview({ item }: { item: Detail }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Identité">
        <Info l="Type" v={item.service_type} />
        <Info l="Catégorie" v={item.category} />
        <Info l="Responsable" v={item.owner_name} />
        <Info
          l="Visibilité client"
          v={item.public_visible ? "Publique" : "Interne"}
        />
      </Card>
      <Card title="Promesse">
        <Info l="Mode" v={item.shipping_mode} />
        <Info l="Délai" v={`${item.eta_min_days}–${item.eta_max_days} jours`} />
        <Info l="SLA cible" v={`${item.sla_target_percent}%`} />
        <Info l="Cut-off" v={`${item.cutoff_hours || "—"} h`} />
      </Card>
      <Card title="Couverture">
        <Info l="Routes" v={item.routes.length} />
        <Info l="Disponibilité" v={item.availability} />
        <Info l="Départs" v={item.departures.length} />
      </Card>
      <Card title="Commercial">
        <Info
          l="Grilles actives"
          v={item.pricing.filter((x) => x.status === "ACTIVE").length}
        />
        <Info
          l="Mode tarifaire"
          v={item.quote_only ? "Sur devis" : "Pricing Engine"}
        />
        <Info l="Options" v={item.options.length} />
      </Card>
    </div>
  );
}
function AddRoute({
  id,
  catalog,
  changed,
}: {
  id: string;
  catalog: Catalog;
  changed: () => Promise<void>;
}) {
  const [route, setRoute] = useState("");
  return (
    <PermissionGuard permission="services.routes">
      <div className="flex flex-wrap gap-2">
        <select
          className={`${input} min-w-56 flex-1`}
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
        <button
          disabled={!route}
          className={btn}
          onClick={async () => {
            await addServiceRoute(id, {
              route_id: route,
              availability: "AVAILABLE",
              effective_from: new Date().toISOString(),
              public_visible: false,
              metadata: {},
            });
            setRoute("");
            await changed();
          }}
        >
          <Plus size={13} />
          Ajouter cette route
        </button>
      </div>
    </PermissionGuard>
  );
}
function AddCondition({
  id,
  changed,
}: {
  id: string;
  changed: () => Promise<void>;
}) {
  return (
    <PermissionGuard permission="services.conditions">
      <button
        className={btn}
        onClick={async () => {
          const goods_category = prompt("Catégorie marchandise");
          if (goods_category) {
            await addServiceCondition(id, {
              goods_category,
              decision: "REVIEW_REQUIRED",
              required_documents: [],
            });
            await changed();
          }
        }}
      >
        <Plus size={13} />
        Condition
      </button>
    </PermissionGuard>
  );
}
function AddDocument({
  id,
  changed,
}: {
  id: string;
  changed: () => Promise<void>;
}) {
  return (
    <PermissionGuard permission="services.conditions">
      <button
        className={btn}
        onClick={async () => {
          const document_type = prompt("Type de document requis");
          if (document_type) {
            await addServiceDocument(id, {
              document_type,
              mandatory: true,
              conditions: {},
            });
            await changed();
          }
        }}
      >
        <Plus size={13} />
        Document
      </button>
    </PermissionGuard>
  );
}
function AddOption({
  id,
  changed,
}: {
  id: string;
  changed: () => Promise<void>;
}) {
  return (
    <PermissionGuard permission="services.bundles">
      <button
        className={btn}
        onClick={async () => {
          const name = prompt("Nom de l’option");
          if (name) {
            await addServiceOption(id, {
              option_code: `OPT-${Date.now()}`,
              name,
              mandatory: false,
              configuration: {},
            });
            await changed();
          }
        }}
      >
        <Plus size={13} />
        Option
      </button>
    </PermissionGuard>
  );
}
function Recommendation() {
  const [result, setResult] = useState<Array<Record<string, unknown>>>([]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setResult(
      (
        await recommendServices({
          origin_country: f.get("origin"),
          destination_country: f.get("destination"),
          shipping_mode: f.get("mode") || null,
          goods_category: f.get("goods"),
          weight_kg: Number(f.get("weight")) || 0,
          volume_cbm: Number(f.get("cbm")) || 0,
          urgency: f.get("urgency"),
        })
      ).items,
    );
  }
  return (
    <main className="grid gap-4 p-4 lg:grid-cols-[380px_1fr]">
      <form onSubmit={submit} className="grid gap-3 bg-white p-4">
        <h2 className="font-semibold">Service Recommendation Engine</h2>
        {[
          ["origin", "Pays origine"],
          ["destination", "Pays destination"],
          ["goods", "Marchandise"],
          ["weight", "Poids kg"],
          ["cbm", "CBM"],
          ["urgency", "Urgence / budget"],
        ].map(([n, p]) => (
          <input
            key={n}
            required={n === "destination"}
            name={n}
            className={input}
            placeholder={p}
          />
        ))}
        <select name="mode" className={input}>
          <option value="">Tous les modes</option>
          <option>AIR</option>
          <option>SEA</option>
          <option>EXPRESS</option>
        </select>
        <button className={primary}>
          <Sparkles size={14} />
          Proposer
        </button>
      </form>
      <Card title="Services compatibles">
        {result.map((x, i) => (
          <Row key={i} x={x} />
        ))}
        {!result.length && (
          <p className="text-[12px] text-[#69717a]">
            Le moteur vérifie route, disponibilité, poids, volume, restrictions
            et grille active.
          </p>
        )}
      </Card>
    </main>
  );
}
function Compare({ items }: { items: Service[] }) {
  const chosen = items.slice(0, 4);
  return (
    <main className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
      {chosen.map((x) => (
        <Card key={x.id} title={x.service_name}>
          <Info l="Mode" v={x.shipping_mode} />
          <Info l="Délai" v={`${x.eta_min_days}–${x.eta_max_days} j`} />
          <Info l="Routes" v={x.route_count} />
          <Info
            l="Tarif"
            v={x.quote_only ? "Sur devis" : x.pricing_method || "Non configuré"}
          />
          <Info l="SLA" v={`${x.sla_target_percent}%`} />
        </Card>
      ))}
    </main>
  );
}
function Analytics() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof serviceAnalytics>
  > | null>(null);
  useEffect(() => {
    serviceAnalytics()
      .then(setData)
      .catch(() => undefined);
  }, []);
  return (
    <main className="grid gap-4 p-4 md:grid-cols-2">
      <Section title="Adoption par service" rows={data?.by_service || []} />
      <Section title="Performance par route" rows={data?.by_route || []} />
    </main>
  );
}
function Settings() {
  return (
    <main className="p-4">
      <Card title="Paramètres du catalogue">
        <p className="text-[12px]">
          Les types, SLA, seuils de performance, règles de disponibilité et
          visibilité publique sont propres à l’agence. Les prix détaillés
          restent exclusivement dans Tarification.
        </p>
      </Card>
    </main>
  );
}
function Performance({ item }: { item: Detail }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card title="Utilisation">
        <b className="text-2xl">{item.package_count || 0}</b>
        <p className="text-[11px]">colis</p>
      </Card>
      <Card title="Délai réel">
        <b className="text-2xl">{item.real_delay_days || "—"} j</b>
      </Card>
      <Card title="Alertes">
        <b className="text-2xl">{item.alerts.length}</b>
      </Card>
    </div>
  );
}
function Section({
  title,
  rows,
  action,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  action?: React.ReactNode;
}) {
  return (
    <Card title={title}>
      {rows.map((x, i) => (
        <Row key={i} x={x} />
      ))}
      {!rows.length && (
        <p className="mb-3 text-[12px] text-[#69717a]">Aucune configuration.</p>
      )}
      {action}
    </Card>
  );
}
function Row({ x }: { x: Record<string, unknown> }) {
  return (
    <div className="border-t py-2 text-[11px]">
      <b>
        {String(
          x.route_name ||
            x.grid_code ||
            x.goods_category ||
            x.option_code ||
            x.document_type ||
            x.departure_code ||
            x.event_type ||
            x.label ||
            "Élément",
        )}
      </b>
      <small className="block text-[#69717a]">
        {Object.entries(x)
          .filter(([k]) =>
            [
              "availability",
              "status",
              "decision",
              "calculation_method",
              "scheduled_at",
              "packages",
              "weight_kg",
              "average_days",
            ].includes(k),
          )
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(" · ")}
      </small>
    </div>
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
      <span className="text-[#69717a]">{l}</span>
      <b>{String(v ?? "—")}</b>
    </p>
  );
}
function Badge({ value }: { value: string }) {
  const labels: Record<string, string> = {
    DRAFT: "Brouillon",
    ACTIVE: "Actif",
    LIMITED: "Capacité limitée",
    SUSPENDED: "Suspendu",
    INACTIVE: "Inactif",
    ARCHIVED: "Archivé",
  };
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-medium ${value === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : value === "SUSPENDED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
    >
      {labels[value] || value}
    </span>
  );
}
