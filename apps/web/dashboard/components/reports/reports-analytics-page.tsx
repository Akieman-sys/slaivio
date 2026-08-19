"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCcw, Save } from "lucide-react";
import {
  exportReport,
  getAnalytics,
  previewReport,
  saveReportView,
  type Analytics,
} from "@/services/reports";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import {
  OperationPageHeader,
  OperationTabs,
} from "@/components/ui/operation-page-header";
import { OperationMetrics } from "@/components/ui/operation-primitives";
import { OperationButton, OperationMetric, OperationMetricGrid, OperationTab, OperationTabMenu } from "@/components/ui/operation-controls";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
const button =
    "inline-flex h-9 items-center gap-2 rounded-[5px] border border-[#d8dddf] bg-white px-3 text-[13px] font-medium text-[#30363a] hover:bg-[#f5f7f6]",
  primary =
    "inline-flex h-9 items-center gap-2 rounded-[5px] bg-[#167d57] px-3 text-[13px] font-semibold text-white hover:bg-[#116b49]",
  input =
    "h-9 rounded-[5px] border border-[#cfd4d6] bg-white px-3 text-[13px] outline-none focus:border-[#167d57]";
const today = new Date().toISOString().slice(0, 10),
  monthAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
  reports = [
    ["clients", "Clients"],
    ["packages", "Colis"],
    ["shipments", "Expéditions"],
    ["finance", "Facturation"],
    ["pickups", "Retraits"],
  ] as const;
export function ReportsAnalyticsPage() {
  const [start, setStart] = useState(monthAgo),
    [end, setEnd] = useState(today),
    [data, setData] = useState<Analytics | null>(null),
    [tab, setTab] = useState("overview"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [allMetrics, setAllMetrics] = useState(false),
    [report, setReport] = useState("packages"),
    [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getAnalytics(start, end));
    } catch {
      setError("Les données analytiques sont indisponibles.");
    } finally {
      setLoading(false);
    }
  }, [start, end]);
  useEffect(() => {
    load();
  }, [load]);
  async function openReport(key: string) {
    setReport(key);
    setRows(await previewReport(key, start, end));
    setTab("reports");
  }
  async function download(key: string) {
    const blob = await exportReport(key, start, end),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `slaivio-${key}-${start}-${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const tabs = (
    <>
      {[
        ["overview", "Vue exécutive"],
        ["operations", "Opérations"],
        ["finance", "Finance"],
        ["routes", "Routes"],
      ].map(([id, label]) => (
        <OperationTab
          key={id}
          onClick={() => setTab(id)}
          active={tab === id}
        >
          {label}
        </OperationTab>
      ))}
    </>
  );
  const metricCards = data
    ? [
        ["Nouveaux clients", data.kpis.clients],
        ["Colis reçus", data.kpis.packages],
        ["Expéditions", data.kpis.shipments],
        ["Dossiers", data.kpis.dossiers],
        ["Retraits", data.kpis.pickups],
        [
          "Poids traité",
          `${Number(data.kpis.weight_kg).toLocaleString("fr-FR")} kg`,
        ],
      ]
    : [];
  return (
    <div className="min-h-full bg-[#f6f7f7]">
      <OperationPageHeader
        title="Rapports et Analytics"
        description="Mesurez les volumes, opérations, revenus et performances de l’agence."
        actions={
          <>
            <label className="text-[11px] text-[#697178]">
              Du
              <input
                type="date"
                className={`${input} ml-2`}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="text-[11px] text-[#697178]">
              Au
              <input
                type="date"
                className={`${input} ml-2`}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
            <OperationButton onClick={load}>
              <RefreshCcw size={14} />
              Actualiser
            </OperationButton>
          </>
        }
      />
      <OperationMetrics>
        <OperationMetricGrid>
          {(loading
            ? Array.from({ length: 4 }, (_, index) => [String(index), ""])
            : metricCards.slice(0, allMetrics ? metricCards.length : 4)
          ).map(([label, value]) => loading ? (
            <div key={String(label)} className="min-h-[72px] px-4 py-3.5">
              <div className="h-3 w-24 animate-pulse rounded bg-[#e8ecea]" />
              <div className="mt-3 h-7 w-16 animate-pulse rounded bg-[#e8ecea]" />
            </div>
          ) : (
            <OperationMetric key={String(label)} label={String(label)} value={value} />
          ))}
        </OperationMetricGrid>
        {!loading && metricCards.length > 4 && (
          <button
            type="button"
            onClick={() => setAllMetrics((current) => !current)}
            className="mt-3 text-[12px] font-medium text-[#08764b] hover:underline"
          >
            {allMetrics ? "Réduire les indicateurs" : "Voir tous les indicateurs"}
          </button>
        )}
      </OperationMetrics>
      <OperationTabs>
        {tabs}
        <OperationTabMenu
          items={[["warehouses", "Entrepôts"], ["reports", "Rapports exportables"]]}
          value={["warehouses", "reports"].includes(tab) ? tab : ""}
          onChange={setTab}
        />
      </OperationTabs>
      <main className="p-5 sm:p-6">
        {error && <ErrorState title="Analytics indisponibles" description={error} retry={load} />}
        {loading ? (
          <LoadingState label="Calcul des indicateurs…" />
        ) : !data ? (
          <section className="border border-[#dfe3e4] bg-white p-10 text-center">
            <h2 className="text-[15px] font-semibold text-[#293034]">
              Analytics temporairement indisponibles
            </h2>
            <p className="mt-1 text-[12px] text-[#697178]">
              Réessayez avec le bouton Actualiser. Aucun chargement infini n’est
              conservé.
            </p>
          </section>
        ) : (
          <>
            {tab === "overview" && <Overview data={data} />}{" "}
            {tab === "operations" && <Operations data={data} />}{" "}
            {tab === "finance" && <Finance data={data} />}{" "}
            {tab === "routes" && <Routes data={data} />}{" "}
            {tab === "warehouses" && <Warehouses data={data} />}{" "}
            {tab === "reports" && (
              <Reports
                report={report}
                rows={rows}
                open={openReport}
                download={download}
                start={start}
                end={end}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
function Overview({ data }: { data: Analytics }) {
  return (
    <div className="grid gap-4">
      <Card
        title="Activité quotidienne"
        subtitle="Nouveaux clients, colis et expéditions sur la période"
      >
        <Trend data={data.trend} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        {Object.entries(data.statuses).map(([key, items]) => (
          <Card
            key={key}
            title={`Statuts · ${key}`}
            subtitle="Répartition actuelle"
          >
            <Bars items={items} />
          </Card>
        ))}
      </div>
    </div>
  );
}
function Trend({ data }: { data: Analytics["trend"] }) {
  const max = Math.max(
    1,
    ...data.flatMap((x) => [x.clients, x.packages, x.shipments]),
  );
  return (
    <div className="flex h-56 items-end gap-1 overflow-x-auto border-b pb-1">
      {data.map((x) => (
        <div
          key={x.day}
          className="group flex h-full min-w-[20px] flex-1 items-end justify-center gap-[2px]"
          title={`${x.day}: ${x.clients} clients, ${x.packages} colis, ${x.shipments} expéditions`}
        >
          <i
            className="w-1/3 bg-[#b8d9ca]"
            style={{ height: `${Math.max(2, (x.clients / max) * 100)}%` }}
          />
          <i
            className="w-1/3 bg-[#167d57]"
            style={{ height: `${Math.max(2, (x.packages / max) * 100)}%` }}
          />
          <i
            className="w-1/3 bg-[#3d6f86]"
            style={{ height: `${Math.max(2, (x.shipments / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
function Operations({ data }: { data: Analytics }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {Object.entries(data.statuses).map(([key, items]) => (
        <Card key={key} title={key} subtitle="Charge opérationnelle actuelle">
          <Bars items={items} />
        </Card>
      ))}
    </div>
  );
}
function Finance({ data }: { data: Analytics }) {
  return (
    <Card
      title="Performance financière"
      subtitle="Les devises restent séparées afin d’éviter des totaux comptables incorrects."
    >
      <Table rows={data.finance} />
    </Card>
  );
}
function Routes({ data }: { data: Analytics }) {
  return (
    <Card
      title="Performance des routes"
      subtitle="Volumes et durée moyenne observée entre création et dernière mise à jour."
    >
      <Table rows={data.routes} />
    </Card>
  );
}
function Warehouses({ data }: { data: Analytics }) {
  return (
    <Card
      title="Inventaire par entrepôt"
      subtitle="Stock physique actuellement enregistré."
    >
      <Table rows={data.warehouses} />
    </Card>
  );
}
function Reports({
  report,
  rows,
  open,
  download,
  start,
  end,
}: {
  report: string;
  rows: Array<Record<string, unknown>>;
  open: (k: string) => void;
  download: (k: string) => void;
  start: string;
  end: string;
}) {
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await saveReportView({
      name: String(f.get("name")),
      report_key: report,
      filters: { start, end },
      is_shared: f.get("shared") === "on",
    });
    e.currentTarget.reset();
  }
  return (
    <div className="grid gap-4">
      <Card
        title="Bibliothèque de rapports"
        subtitle="Prévisualisez 200 lignes ou exportez jusqu’à 10 000 lignes filtrées."
      >
        <div className="flex flex-wrap gap-2">
          {reports.map(([k, l]) => (
            <button
              key={k}
              className={report === k ? primary : button}
              onClick={() => open(k)}
            >
              {l}
            </button>
          ))}
          <PermissionGuard permission="reports.export">
            <button
              className={`${button} ml-auto`}
              onClick={() => download(report)}
            >
              <Download size={14} />
              Exporter CSV
            </button>
          </PermissionGuard>
        </div>
      </Card>
      <PermissionGuard permission="reports.manage">
        <Card
          title="Enregistrer cette vue"
          subtitle="Retrouvez facilement la période et le rapport sélectionnés."
        >
          <form className="flex flex-wrap gap-2" onSubmit={save}>
            <input
              required
              name="name"
              className={`${input} min-w-[240px]`}
              placeholder="Ex. Rapport mensuel direction"
            />
            <label className="flex items-center gap-2 text-[12px]">
              <input name="shared" type="checkbox" />
              Partager à l’agence
            </label>
            <button className={button}>
              <Save size={14} />
              Enregistrer
            </button>
          </form>
        </Card>
      </PermissionGuard>
      <Card
        title={`Aperçu · ${report}`}
        subtitle={`${rows.length} ligne(s) chargée(s)`}
      >
        <Table rows={rows} />
      </Card>
    </div>
  );
}
function Bars({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...items.map((x) => x.value));
  return (
    <div className="space-y-3">
      {items.map((x) => (
        <div key={x.label}>
          <div className="mb-1 flex justify-between text-[12px]">
            <span>{x.label || "Non renseigné"}</span>
            <b>{x.value}</b>
          </div>
          <div className="h-2 bg-[#e9edeb]">
            <div
              className="h-2 bg-[#167d57]"
              style={{ width: `${(x.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
function Table({ rows }: { rows: Array<Record<string, unknown>> }) {
  const columns = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);
  if (!rows.length)
    return (
      <p className="py-12 text-center text-[13px] text-[#69707d]">
        Aucune donnée sur cette période.
      </p>
    );
  return (
    <div className="max-h-[520px] overflow-auto">
      <table className="w-full whitespace-nowrap text-left text-[12px]">
        <thead className="sticky top-0 bg-[#f1f1ef]">
          <tr>
            {columns.map((c) => (
              <th className="px-3 py-2 font-semibold" key={c}>
                {c.replaceAll("_", " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr className="border-t" key={i}>
              {columns.map((c) => (
                <td className="max-w-[300px] truncate px-3 py-2" key={c}>
                  {format(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function format(v: unknown) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("fr-FR");
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  return String(v);
}
function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden border border-[#dfe3e4] bg-white">
      <header className="border-b border-[#e5e8e9] bg-[#fafbfb] px-4 py-3">
        <h2 className="text-[14px] font-semibold text-[#293034]">{title}</h2>
        <p className="text-[11px] text-[#697178]">{subtitle}</p>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
