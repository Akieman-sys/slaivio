"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ChevronRight, Download, Plus, RefreshCcw, Search } from "lucide-react";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { listClients, type ClientRecord } from "@/services/clients";
import {
  createFinance,
  exportFinance,
  financeStats,
  getFinance,
  issueFinance,
  listFinance,
  payFinance,
  voidFinance,
  type FinanceDocument,
  type FinanceStats,
} from "@/services/finance";
const button =
    "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] border border-[#d9dcdf] bg-white px-3 text-[13px] font-medium hover:bg-[#f5f6f6] disabled:opacity-50",
  primary =
    "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] bg-[#16855f] px-3 text-[13px] font-semibold text-white hover:bg-[#126f50] disabled:opacity-50",
  input =
    "h-9 rounded-[5px] border border-[#d8dce0] bg-white px-3 text-[13px] outline-none focus:border-[#16855f]";
const empty: FinanceStats = {
  invoices: 0,
  drafts: 0,
  overdue: 0,
  invoiced: 0,
  collected: 0,
  outstanding: 0,
};
const labels: Record<string, string> = {
  QUOTE: "Devis",
  INVOICE: "Facture",
  CREDIT_NOTE: "Avoir",
  DRAFT: "Brouillon",
  ISSUED: "Émise",
  ACCEPTED: "Accepté",
  PARTIALLY_PAID: "Partiellement payée",
  PAID: "Payée",
  OVERDUE: "En retard",
  VOID: "Annulée",
};
function cash(v: number, c = "USD") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: c,
  }).format(Number(v || 0));
}
function err(e: unknown) {
  return (
    (e as { response?: { data?: { detail?: string } } })?.response?.data
      ?.detail || "Une erreur est survenue."
  );
}
export function FinancePage() {
  const [items, setItems] = useState<FinanceDocument[]>([]),
    [stats, setStats] = useState(empty),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [kind, setKind] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [create, setCreate] = useState(false),
    [selected, setSelected] = useState<FinanceDocument | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [a, b] = await Promise.all([
        listFinance({
          q: q || undefined,
          status: status || undefined,
          document_type: kind || undefined,
        }),
        financeStats(),
      ]);
      setItems(a.items);
      setStats(b);
    } catch (e) {
      setError(err(e));
    } finally {
      setLoading(false);
    }
  }, [q, status, kind]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  async function open(id: string) {
    try {
      setSelected(await getFinance(id));
    } catch (e) {
      setError(err(e));
    }
  }
  async function download() {
    const b = await exportFinance(),
      u = URL.createObjectURL(b),
      a = document.createElement("a");
    a.href = u;
    a.download = "slaivio-facturation.csv";
    a.click();
    URL.revokeObjectURL(u);
  }
  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <OperationPageHeader
        title="Facturation"
        description="Devis, factures, avoirs, paiements et soldes clients dans un registre unique."
        actions={
          <>
            <PermissionGuard permission="finance.export">
              <button className={button} onClick={download}>
                <Download size={15} />
                Exporter
              </button>
            </PermissionGuard>
            <PermissionGuard permission="finance.create">
              <button className={primary} onClick={() => setCreate(true)}>
                <Plus size={15} />
                Nouveau document
              </button>
            </PermissionGuard>
          </>
        }
        tabs={
          <>
            {[
              ["", "Tous"],
              ["QUOTE", "Devis"],
              ["INVOICE", "Factures"],
              ["CREDIT_NOTE", "Avoirs"],
            ].map(([value, label]) => (
              <button
                key={value || "all"}
                onClick={() => setKind(value)}
                className={`h-10 shrink-0 border-b-2 px-3 text-[12px] ${
                  kind === value
                    ? "border-[#16855f] font-semibold text-[#145f49]"
                    : "border-transparent text-[#69717a]"
                }`}
              >
                {label}
              </button>
            ))}
          </>
        }
      />
      <main>
        <section className="grid border-b border-[#dfe1e3] bg-white sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Factures", stats.invoices],
            ["Brouillons", stats.drafts],
            ["En retard", stats.overdue],
            ["Facturé", cash(stats.invoiced)],
          ].map(([l, v]) => (
            <div
              key={l}
              className="border-b border-r border-[#eceeef] px-4 py-3"
            >
              <p className="text-[11px] text-[#68717d]">{l}</p>
              <b className="mt-1 block text-[20px] font-semibold">{v}</b>
            </div>
          ))}
        </section>
        <section className="overflow-x-auto border-b border-[#dfe1e3] bg-white">
          <div className="flex flex-wrap gap-2 border-b border-[#e5e7e8] p-3">
            <label className="flex h-9 min-w-64 flex-1 items-center rounded-[5px] border border-[#dfe1e3] bg-[#f7f7f6] px-3">
              <Search size={14} className="text-[#69717a]" />
              <input
                className="ml-2 min-w-0 flex-1 bg-transparent text-[12px] outline-none"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Numéro, client, téléphone…"
              />
            </label>
            <select
              className={input}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Tous les statuts</option>
              {[
                "DRAFT",
                "ISSUED",
                "PARTIALLY_PAID",
                "PAID",
                "OVERDUE",
                "VOID",
              ].map((x) => (
                <option key={x} value={x}>
                  {labels[x]}
                </option>
              ))}
            </select>
            <button className={button} onClick={load}>
              <RefreshCcw size={14} />
            </button>
          </div>
          {error && (
            <p className="m-4 rounded bg-red-50 p-3 text-[13px] text-red-700">
              {error}
            </p>
          )}
          {loading ? (
            <p className="p-8 text-center text-[13px] text-[#68717d]">
              Chargement…
            </p>
          ) : items.length ? (
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className="bg-[#f6f7f7] text-[#5f6976]">
                <tr>
                  {[
                    "Numéro",
                    "Type",
                    "Client",
                    "Statut",
                    "Total",
                    "Payé",
                    "Solde",
                    "Échéance",
                    "",
                  ].map((x) => (
                    <th key={x} className="px-4 py-3 font-medium">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr
                    key={x.id}
                    onClick={() => open(x.id)}
                    className="cursor-pointer border-t hover:bg-[#fafafa]"
                  >
                    <td className="px-4 py-3 font-semibold">
                      {x.document_number}
                    </td>
                    <td>{labels[x.document_type]}</td>
                    <td>{x.client_name}</td>
                    <td>
                      <span className="rounded-full bg-[#eef0f2] px-2 py-1 text-[11px]">
                        {labels[x.status] || x.status}
                      </span>
                    </td>
                    <td>{cash(x.total, x.currency)}</td>
                    <td>{cash(x.amount_paid, x.currency)}</td>
                    <td className="font-semibold">
                      {cash(x.balance_due, x.currency)}
                    </td>
                    <td>{x.due_date || "—"}</td>
                    <td className="w-10 pr-4 text-right text-[#8a929a]">
                      <ChevronRight className="ml-auto" size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-12 text-center text-[13px] text-[#68717d]">
              Aucun document. Créez le premier devis ou la première facture de
              l’agence.
            </p>
          )}
        </section>
      </main>
      {create && (
        <CreateModal
          close={() => setCreate(false)}
          done={() => {
            setCreate(false);
            load();
          }}
        />
      )}
      {selected && (
        <Detail
          item={selected}
          close={() => setSelected(null)}
          reload={async () => {
            setSelected(await getFinance(selected.id));
            load();
          }}
        />
      )}
    </div>
  );
}
function CreateModal({ close, done }: { close: () => void; done: () => void }) {
  const [clients, setClients] = useState<ClientRecord[]>([]),
    [lines, setLines] = useState([
      {
        description: "Transport cargo",
        quantity: 1,
        unit_price: 0,
        discount_rate: 0,
        tax_rate: 0,
      },
    ]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    listClients({ page_size: 100 }).then((r) => setClients(r.items));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      await createFinance({
        document_type: String(f.get("document_type")),
        client_id: String(f.get("client_id")),
        currency: String(f.get("currency")).toUpperCase(),
        due_date: String(f.get("due_date")) || null,
        notes: String(f.get("notes")) || null,
        terms: String(f.get("terms")) || null,
        lines,
      });
      done();
    } catch (e) {
      setError(err(e));
      setBusy(false);
    }
  }
  return (
    <OperationDrawer
      open
      title="Nouveau document"
      description="Créez un devis, une facture ou un avoir pour un client de l’agence."
      close={close}
      width="max-w-3xl"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <select required name="document_type" className={input}>
            <option value="QUOTE">Devis</option>
            <option value="INVOICE">Facture</option>
            <option value="CREDIT_NOTE">Avoir</option>
          </select>
          <select required name="client_id" className={input}>
            <option value="">Sélectionner un client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name || c.name || c.company_name || c.phone}
              </option>
            ))}
          </select>
          <input
            required
            name="currency"
            defaultValue="USD"
            maxLength={3}
            className={input}
          />
          <input name="due_date" type="date" className={input} />
        </div>
        <div>
          <div className="mb-2 flex justify-between">
            <b className="text-[13px]">Lignes</b>
            <button
              type="button"
              className={button}
              onClick={() =>
                setLines([
                  ...lines,
                  {
                    description: "",
                    quantity: 1,
                    unit_price: 0,
                    discount_rate: 0,
                    tax_rate: 0,
                  },
                ])
              }
            >
              Ajouter une ligne
            </button>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="mb-2 grid grid-cols-12 gap-2">
              <input
                required
                className={`${input} col-span-5`}
                value={l.description}
                onChange={(e) =>
                  setLines(
                    lines.map((x, j) =>
                      j === i ? { ...x, description: e.target.value } : x,
                    ),
                  )
                }
                placeholder="Description"
              />
              <input
                required
                type="number"
                step="0.001"
                min="0.001"
                className={`${input} col-span-2`}
                value={l.quantity}
                onChange={(e) =>
                  setLines(
                    lines.map((x, j) =>
                      j === i ? { ...x, quantity: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
              <input
                required
                type="number"
                step="0.01"
                min="0"
                className={`${input} col-span-2`}
                value={l.unit_price}
                onChange={(e) =>
                  setLines(
                    lines.map((x, j) =>
                      j === i
                        ? { ...x, unit_price: Number(e.target.value) }
                        : x,
                    ),
                  )
                }
              />
              <input
                type="number"
                min="0"
                max="100"
                className={`${input} col-span-1`}
                value={l.tax_rate}
                title="Taxe %"
                onChange={(e) =>
                  setLines(
                    lines.map((x, j) =>
                      j === i ? { ...x, tax_rate: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="col-span-2 text-[12px] text-red-600"
                onClick={() =>
                  lines.length > 1 && setLines(lines.filter((_, j) => j !== i))
                }
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
        <textarea
          name="notes"
          className="min-h-16 w-full rounded border p-3 text-[13px]"
          placeholder="Notes internes ou visibles sur le document"
        />
        <textarea
          name="terms"
          className="min-h-16 w-full rounded border p-3 text-[13px]"
          placeholder="Conditions de règlement"
        />
        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <button disabled={busy} className={`${primary} w-full`}>
          {busy ? "Création…" : "Créer le brouillon"}
        </button>
      </form>
    </OperationDrawer>
  );
}
function Detail({
  item,
  close,
  reload,
}: {
  item: FinanceDocument;
  close: () => void;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <OperationDrawer
      open
      title={item.document_number}
      description={`${labels[item.document_type]} · ${item.client_name} · ${labels[item.status]}`}
      close={close}
    >
      <div className="space-y-4 p-5">
        <section className="grid grid-cols-3 gap-3">
          {[
            ["Total", cash(item.total, item.currency)],
            ["Payé", cash(item.amount_paid, item.currency)],
            ["Solde", cash(item.balance_due, item.currency)],
          ].map(([l, v]) => (
            <div key={l} className="rounded bg-white p-4">
              <small>{l}</small>
              <b className="block text-lg">{v}</b>
            </div>
          ))}
        </section>
        <section className="rounded bg-white p-4">
          <h3 className="mb-3 font-semibold">Détail</h3>
          {item.lines?.map((l, i) => (
            <div
              key={i}
              className="flex justify-between border-t py-3 text-[13px]"
            >
              <span>
                {l.description} · {l.quantity} ×{" "}
                {cash(l.unit_price, item.currency)}
              </span>
              <b>{cash(l.line_total || 0, item.currency)}</b>
            </div>
          ))}
        </section>
        <div className="flex flex-wrap gap-2">
          {item.status === "DRAFT" && (
            <PermissionGuard permission="finance.issue">
              <button
                disabled={busy}
                className={primary}
                onClick={() =>
                  run(() => issueFinance(item.id, item.row_version))
                }
              >
                Émettre
              </button>
            </PermissionGuard>
          )}
          {item.document_type === "INVOICE" &&
            ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(item.status) && (
              <PermissionGuard permission="finance.payments">
                <button
                  disabled={busy}
                  className={primary}
                  onClick={() => {
                    const raw = window.prompt(
                      `Montant reçu (${item.currency})`,
                      String(item.balance_due),
                    );
                    if (!raw) return;
                    const method =
                      window.prompt("Mode de paiement", "CASH") || "CASH";
                    run(() =>
                      payFinance(item.id, {
                        amount: Number(raw),
                        currency: item.currency,
                        method,
                        paid_at: new Date().toISOString(),
                        idempotency_key: crypto.randomUUID(),
                      }),
                    );
                  }}
                >
                  Enregistrer un paiement
                </button>
              </PermissionGuard>
            )}
          {["DRAFT", "ISSUED"].includes(item.status) &&
            item.amount_paid === 0 && (
              <PermissionGuard permission="finance.void">
                <button
                  disabled={busy}
                  className={button}
                  onClick={() => {
                    const reason = window.prompt(
                      "Motif obligatoire de l’annulation",
                    );
                    if (reason)
                      run(() => voidFinance(item.id, item.row_version, reason));
                  }}
                >
                  Annuler
                </button>
              </PermissionGuard>
            )}
        </div>
        {item.payments?.length ? (
          <section className="rounded bg-white p-4">
            <h3 className="mb-2 font-semibold">Paiements et reçus</h3>
            {item.payments.map((p) => (
              <div
                key={p.id}
                className="flex justify-between border-t py-3 text-[13px]"
              >
                <span>
                  {p.receipt_number} · {p.method}
                </span>
                <b>{cash(p.amount, p.currency)}</b>
              </div>
            ))}
          </section>
        ) : null}
        {error && <p className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
      </div>
    </OperationDrawer>
  );
}
