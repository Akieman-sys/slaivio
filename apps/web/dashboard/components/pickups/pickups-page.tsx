/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Download,
  HandCoins,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { businessLabel } from "@/components/ui/business-labels";
import { OperationMetrics, OperationSearch, OperationToolbar } from "@/components/ui/operation-primitives";
import { OperationActionMenu, OperationButton, OperationField, OperationFilterPopover, OperationMetric, OperationMetricGrid } from "@/components/ui/operation-controls";
import { ErrorState, LoadingState, TableSkeleton } from "@/components/ui/page-state";
import {
  checkInPickup,
  createPickup,
  eligiblePickupPackages,
  exportPickups,
  getPickup,
  getPickupAnalytics,
  getPickupReceipt,
  getPickupSettings,
  getPickupStats,
  listPickups,
  markPickupVerified,
  notifyPickup,
  releasePickup,
  runPickupReminders,
  savePickupSettings,
  uploadPickupProof,
  verifyPickupIdentity,
  verifyPickupOtp,
  verifyPickupPayment,
  type EligiblePackage,
  type Pickup,
  type PickupAnalytics,
  type PickupDetail,
  type PickupSettings,
  type PickupStats,
} from "@/services/pickups";
const input =
  "h-9 rounded-[5px] border border-[#d7dadd] bg-white px-3 text-[13px] outline-none focus:border-[#16855f]";
const button =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] bg-white px-3 text-[13px] shadow-[inset_0_0_0_1px_#d7dadd] hover:bg-[#f5f5f4]";
const primary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] bg-[#16855f] px-3 text-[13px] font-medium text-white disabled:opacity-50";
const labels: Record<string, string> = {
  READY: "Prêt",
  NOTIFIED: "Notifié",
  CHECKED_IN: "Au guichet",
  VERIFIED: "Vérifié",
  RELEASED: "Remis",
  REFUSED: "Refusé",
  CANCELLED: "Annulé",
};
export function PickupsPage() {
  const [items, setItems] = useState<Pickup[]>([]),
    [stats, setStats] = useState<PickupStats>({
      waiting: 0,
      at_counter: 0,
      verified: 0,
      released_today: 0,
      overdue: 0,
      storage_fees_due: 0,
      average_counter_minutes: 0,
    }),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [createOpen, setCreateOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [analyticsOpen, setAnalyticsOpen] = useState(false),
    [allMetrics, setAllMetrics] = useState(false),
    [selected, setSelected] = useState<PickupDetail | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, kpis] = await Promise.all([
        listPickups({ q: q || undefined, status: status || undefined }),
        getPickupStats(),
      ]);
      setItems(list.items);
      setStats(kpis);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [q, status]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  async function open(id: string) {
    try {
      setSelected(await getPickup(id));
    } catch (e) {
      setError(message(e));
    }
  }
  async function download() {
    const blob = await exportPickups(),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "slaivio-retraits.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function reminders() {
    try {
      const r = await runPickupReminders();
      window.alert(
        `${r.pickups} retrait(s) relancé(s), ${r.notifications} notification(s) mise(s) en file.`,
      );
      load();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <OperationPageHeader
        title="Retraits en agence"
        description="Vérifiez le client, le paiement et le code avant toute remise physique."
        actions={
          <>
            <OperationActionMenu>
                <button
                  onClick={() => setAnalyticsOpen(true)}
                >
                  Analytics
                </button>
                <PermissionGuard permission="pickups.notify">
                  <button
                    onClick={reminders}
                  >
                    Relancer les retraits en attente
                  </button>
                </PermissionGuard>
                <PermissionGuard permission="pickups.settings">
                  <button
                    onClick={() => setSettingsOpen(true)}
                  >
                    Paramètres des retraits
                  </button>
                </PermissionGuard>
            </OperationActionMenu>
            <PermissionGuard permission="pickups.export">
              <OperationButton onClick={download}>
                <Download size={14} />
                Exporter
              </OperationButton>
            </PermissionGuard>
            <PermissionGuard permission="pickups.create">
              <OperationButton variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus size={14} />
                Préparer un retrait
              </OperationButton>
            </PermissionGuard>
          </>
        }
      />
      <main>
        <OperationMetrics>
          <OperationMetricGrid className={allMetrics ? "lg:grid-cols-6" : "lg:grid-cols-4"}>
            {[
              ["En attente", stats.waiting],
              ["Au guichet", stats.at_counter],
              ["Vérifiés", stats.verified],
              ["Remis aujourd’hui", stats.released_today],
              ["Non retirés > 7 j", stats.overdue],
              ["Frais de garde", money(stats.storage_fees_due, "USD")],
            ]
              .slice(0, allMetrics ? 6 : 4)
              .map(([l, v]) => <OperationMetric key={String(l)} label={String(l)} value={v} />)}
          </OperationMetricGrid>
          <button
            onClick={() => setAllMetrics((current) => !current)}
            className="mt-3 text-[11px] font-medium text-[#087a46]"
          >
            {allMetrics
              ? "Réduire les indicateurs"
              : "Voir tous les indicateurs"}
          </button>
        </OperationMetrics>
        <section className="overflow-hidden bg-white">
          <OperationToolbar search={<OperationSearch value={q} onChange={setQ} placeholder="Téléphone, nom, colis ou tracking…" />} filters={<><OperationFilterPopover activeCount={status ? 1 : 0} onReset={() => setStatus("")} title="Filtrer les retraits"><OperationField label="Étape du retrait"><select value={status} onChange={(e) => setStatus(e.target.value)} className={`${input} w-full`}><option value="">Toutes les étapes</option>{Object.entries(labels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></OperationField></OperationFilterPopover><OperationButton onClick={load}>
              <RefreshCcw size={14} />
              Actualiser
            </OperationButton></>} />
          {error && <ErrorState title="Retraits indisponibles" description={error} retry={load} />}
          {loading ? <TableSkeleton rows={7} columns={8} label="Chargement des retraits…" /> : <Table items={items} open={open} />}
        </section>
      </main>
      {createOpen && (
        <CreatePickup
          close={() => setCreateOpen(false)}
          done={async (id) => {
            setCreateOpen(false);
            await load();
            await open(id);
          }}
        />
      )}
      {settingsOpen && <SettingsModal close={() => setSettingsOpen(false)} />}{" "}
      {analyticsOpen && (
        <AnalyticsModal close={() => setAnalyticsOpen(false)} />
      )}{" "}
      {selected && (
        <PickupPanel
          item={selected}
          close={() => setSelected(null)}
          reload={async () => {
            setSelected(await getPickup(selected.id));
            await load();
          }}
        />
      )}
    </div>
  );
}
function Table({
  items,
  open,
}: {
  items: Pickup[];
  open: (id: string) => void;
}) {
  if (!items.length) return <Empty />;
  return (
    <div className="min-h-[460px] overflow-x-auto">
      <table className="w-full min-w-[1050px] border-collapse text-left text-[13px]">
        <thead className="bg-[#fbfcfd] text-[#5f6b7a]">
          <tr className="border-b border-[#e6e9ee]">
            {[
              "Retrait",
              "Client",
              "Colis",
              "Paiement",
              "Frais garde",
              "Statut",
              "Attente",
              "",
            ].map((h, i) => (
              <th key={`${h}${i}`} className="p-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr
              key={p.id}
              onClick={() => open(p.id)}
              className="cursor-pointer border-b border-[#edf0f3] hover:bg-[#f7faf9]"
            >
              <td className="p-3 font-semibold">{p.pickup_reference}</td>
              <td>
                {p.client_name || p.recipient_name}
                <small className="block text-[#76808b]">
                  {p.recipient_phone}
                </small>
              </td>
              <td>
                {p.package_count}
                <small className="block max-w-56 truncate text-[#76808b]">
                  {p.package_references}
                </small>
              </td>
              <td>
                <Badge ok={["PAID", "CLEARED"].includes(p.payment_status)}>
                  {p.payment_status} · {money(p.required_amount, p.currency)}
                </Badge>
              </td>
              <td>{money(p.storage_fee, p.currency)}</td>
              <td>
                <Badge ok={p.status === "RELEASED"}>
                  {labels[p.status] || p.status}
                </Badge>
              </td>
              <td>{age(p.ready_at)}</td>
              <td className="pr-4 text-right text-[#7b848d]">
                <ChevronRight size={17} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function CreatePickup({
  close,
  done,
}: {
  close: () => void;
  done: (id: string) => void;
}) {
  const [q, setQ] = useState(""),
    [rows, setRows] = useState<EligiblePackage[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const t = setTimeout(
      () =>
        eligiblePickupPackages(q)
          .then(setRows)
          .catch((e) => setError(message(e))),
      200,
    );
    return () => clearTimeout(t);
  }, [q]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const item = await createPickup({
        package_ids: selected,
        notes: new FormData(e.currentTarget).get("notes") || null,
      });
      done(item.id);
    } catch (x) {
      setError(message(x));
    }
  }
  const client = rows.find((r) => selected.includes(r.id))?.client_id;
  return (
    <Modal title="Préparer un retrait" close={close} wide>
      <form onSubmit={submit} className="space-y-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${input} w-full`}
          placeholder="Rechercher par téléphone, client, colis ou tracking"
        />
        <div className="max-h-[45vh] overflow-y-auto rounded-[6px] bg-[#f6f7f7] p-2">
          {rows.map((p) => {
            const disabled = Boolean(client && client !== p.client_id);
            return (
              <label
                key={p.id}
                className={`flex items-center gap-3 rounded p-3 text-[13px] ${disabled ? "opacity-40" : "hover:bg-white"}`}
              >
                <input
                  disabled={disabled}
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={() =>
                    setSelected((v) =>
                      v.includes(p.id)
                        ? v.filter((id) => id !== p.id)
                        : [...v, p.id],
                    )
                  }
                />
                <div className="flex-1">
                  <b>{p.package_reference}</b>
                  <p className="text-[12px] text-[#68717d]">
                    {p.client_name} · {p.client_phone}
                  </p>
                </div>
                <Badge ok={["PAID", "CLEARED"].includes(p.payment_status)}>
                  {p.payment_status}
                </Badge>
              </label>
            );
          })}
          {!rows.length && (
            <p className="p-8 text-center text-[13px] text-[#68717d]">
              Aucun colis prêt au retrait.
            </p>
          )}
        </div>
        <textarea
          name="notes"
          className="min-h-20 w-full rounded-[5px] border p-3 text-[13px]"
          placeholder="Note guichet"
        />
        {error && <p className="text-red-600">{error}</p>}
        <button disabled={!selected.length} className={`${primary} w-full`}>
          Préparer {selected.length} colis
        </button>
      </form>
    </Modal>
  );
}
function PickupPanel({
  item,
  close,
  reload,
}: {
  item: PickupDetail;
  close: () => void;
  reload: () => Promise<void>;
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
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function receipt() {
    const page = await getPickupReceipt(item.id),
      win = window.open("", "_blank");
    if (win) {
      win.document.write(page);
      win.document.close();
    }
  }
  return (
    <OperationDrawer
      open
      title={item.pickup_reference}
      description="Retrait en agence"
      close={close}
    >
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge ok={item.status === "RELEASED"}>{labels[item.status]}</Badge>
        <Badge ok={["PAID", "CLEARED"].includes(item.payment_status)}>
          {businessLabel(item.payment_status)}
        </Badge>
        {item.release_blocked_reason && (
          <Badge>{item.release_blocked_reason}</Badge>
        )}
        {item.status === "RELEASED" && (
          <button onClick={receipt} className={button}>
            Reçu / PDF
          </button>
        )}
      </div>
      <div className="space-y-4 pt-4">
        {error && (
          <p className="bg-red-50 p-3 text-[13px] text-red-700">{error}</p>
        )}
        <Section title="Résumé">
          <Grid
            rows={[
              ["Client", item.recipient_name],
              ["Téléphone", item.recipient_phone],
              ["Colis", item.packages.length],
              ["À payer", money(item.required_amount, item.currency)],
              ["Payé", money(item.paid_amount, item.currency)],
              ["Frais de garde", money(item.storage_fee, item.currency)],
            ]}
          />
        </Section>
        <Section title="Colis">
          <div>
            {item.packages.map((p) => (
              <div
                key={p.id}
                className="flex justify-between border-b py-3 text-[13px]"
              >
                <div>
                  <b>{p.package_reference}</b>
                  <p className="text-[#68717d]">
                    {p.description || p.tracking_id}
                  </p>
                </div>
                <span>{p.weight_kg || 0} kg</span>
              </div>
            ))}
          </div>
        </Section>
        <Workflow item={item} busy={busy} run={run} />
        {["CHECKED_IN", "VERIFIED", "RELEASED"].includes(item.status) && (
          <Section title="Preuves privées">
            <ProofUpload item={item} busy={busy} run={run} />
            <p className="mt-3 text-[12px] text-[#68717d]">
              {item.proofs.length} preuve(s) enregistrée(s).
            </p>
          </Section>
        )}
        <Section title="Contrôles effectués">
          <div className="grid gap-2 sm:grid-cols-3">
            {item.verifications.map((v) => (
              <div
                key={v.id}
                className="rounded-[6px] bg-[#f5f6f6] p-3 text-[12px]"
              >
                <b>{businessLabel(v.verification_type)}</b>
                <p
                  className={
                    v.verification_status === "PASSED"
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }
                >
                  {businessLabel(v.verification_status)}
                </p>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Historique">
          <div>
            {item.events.map((e) => (
              <div
                key={e.id}
                className="border-l border-[#cbd2d9] py-2 pl-4 text-[12px]"
              >
                <b>{businessLabel(e.event_type)}</b>
                <p className="text-[#68717d]">
                  {e.actor_name} · {date(e.created_at)}
                </p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </OperationDrawer>
  );
}
function ProofUpload({
  item,
  busy,
  run,
}: {
  item: PickupDetail;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          file = f.get("file");
        if (file instanceof File && file.size)
          run(() =>
            uploadPickupProof(
              item.id,
              file,
              String(f.get("proof_type")),
              String(f.get("notes") || ""),
            ),
          );
      }}
      className="grid gap-2 sm:grid-cols-2"
    >
      <select name="proof_type" className={input}>
        <option value="PHOTO">Photo de remise</option>
        <option value="SIGNATURE">Signature tactile</option>
        <option value="IDENTITY">Pièce présentée</option>
      </select>
      <input
        required
        name="file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className={input}
      />
      <input name="notes" className={input} placeholder="Note facultative" />
      <button disabled={busy} className={button}>
        Ajouter la preuve
      </button>
    </form>
  );
}
function Workflow({
  item,
  busy,
  run,
}: {
  item: PickupDetail;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => void;
}) {
  if (item.status === "RELEASED")
    return (
      <Section title="Retrait clôturé">
        <div className="flex items-center gap-3 text-emerald-700">
          <CheckCircle2 />
          <span>Les colis ont été remis et sortis du stock.</span>
        </div>
      </Section>
    );
  return (
    <Section title="Parcours guichet">
      <div className="space-y-4">
        {item.status === "READY" && (
          <PermissionGuard permission="pickups.notify">
            <button
              disabled={busy}
              onClick={() => run(() => notifyPickup(item.id))}
              className={`${primary} w-full`}
            >
              Notifier le client et générer l’OTP
            </button>
          </PermissionGuard>
        )}
        {["READY", "NOTIFIED"].includes(item.status) && (
          <PermissionGuard permission="pickups.verify">
            <button
              disabled={busy}
              onClick={() =>
                run(() => checkInPickup(item.id, item.row_version))
              }
              className={`${button} w-full`}
            >
              Le client est au guichet
            </button>
          </PermissionGuard>
        )}
        {item.status === "CHECKED_IN" && (
          <VerificationForms item={item} busy={busy} run={run} />
        )}{" "}
        {item.status === "VERIFIED" && (
          <ReleaseForm item={item} busy={busy} run={run} />
        )}
      </div>
    </Section>
  );
}
function VerificationForms({
  item,
  busy,
  run,
}: {
  item: PickupDetail;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => void;
}) {
  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const code = String(new FormData(e.currentTarget).get("code"));
          run(() => verifyPickupOtp(item.id, code));
        }}
        className="flex gap-2"
      >
        <input
          required
          name="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          className={`${input} flex-1`}
          placeholder="Code OTP à 6 chiffres"
        />
        <button disabled={busy} className={button}>
          Vérifier OTP
        </button>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() =>
            verifyPickupIdentity(item.id, {
              recipient_type: f.get("recipient_type"),
              authorized_person_name: f.get("authorized_person_name") || null,
              authorized_person_phone: f.get("authorized_person_phone") || null,
              identity_type: f.get("identity_type"),
              identity_reference: f.get("identity_reference"),
            }),
          );
        }}
        className="grid gap-2 sm:grid-cols-2"
      >
        <select name="recipient_type" className={input}>
          <option value="CLIENT">Client</option>
          <option value="AUTHORIZED_PERSON">Mandataire</option>
        </select>
        <select name="identity_type" className={input}>
          <option>Carte d’identité</option>
          <option>Passeport</option>
          <option>Permis</option>
        </select>
        <input
          name="identity_reference"
          required
          className={input}
          placeholder="Numéro de pièce"
        />
        <input
          name="authorized_person_name"
          className={input}
          placeholder="Nom du mandataire"
        />
        <input
          name="authorized_person_phone"
          className={input}
          placeholder="Téléphone mandataire"
        />
        <button disabled={busy} className={button}>
          Valider l’identité
        </button>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() =>
            verifyPickupPayment(item.id, {
              payment_status: f.get("payment_status"),
              paid_amount: Number(f.get("paid_amount")),
            }),
          );
        }}
        className="flex flex-wrap gap-2"
      >
        <select name="payment_status" className={input}>
          <option value="PAID">Payé</option>
          <option value="PARTIAL">Partiel</option>
          <option value="PENDING">En attente</option>
        </select>
        <input
          name="paid_amount"
          type="number"
          min="0"
          step="0.01"
          defaultValue={item.paid_amount}
          className={input}
        />
        <button disabled={busy} className={button}>
          Valider le paiement
        </button>
      </form>
      <button
        disabled={busy}
        onClick={() => run(() => markPickupVerified(item.id, item.row_version))}
        className={`${primary} w-full`}
      >
        Terminer toutes les vérifications
      </button>
    </div>
  );
}
function ReleaseForm({
  item,
  busy,
  run,
}: {
  item: PickupDetail;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() =>
          releasePickup(item.id, {
            expected_version: item.row_version,
            signed_by: f.get("signed_by"),
            signature_text: f.get("signature_text") || null,
          }),
        );
      }}
      className="space-y-3"
    >
      <input
        required
        name="signed_by"
        defaultValue={item.authorized_person_name || item.recipient_name || ""}
        className={`${input} w-full`}
        placeholder="Nom de la personne qui reçoit"
      />
      <textarea
        required
        name="signature_text"
        className="min-h-20 w-full rounded-[5px] border p-3 text-[13px]"
        placeholder="Confirmation/signature : Je reconnais avoir reçu les colis…"
      />
      <PermissionGuard permission="pickups.release">
        <button disabled={busy} className={`${primary} w-full`}>
          <HandCoins size={15} />
          Remettre les colis et clôturer
        </button>
      </PermissionGuard>
    </form>
  );
}
function SettingsModal({ close }: { close: () => void }) {
  const [value, setValue] = useState<PickupSettings | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    getPickupSettings()
      .then(setValue)
      .catch((e) => setError(message(e)));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await savePickupSettings({
      grace_days: Number(f.get("grace_days")),
      daily_storage_fee: Number(f.get("daily_storage_fee")),
      currency: String(f.get("currency")),
      otp_ttl_minutes: Number(f.get("otp_ttl_minutes")),
      max_otp_attempts: Number(f.get("max_otp_attempts")),
      require_payment: f.get("require_payment") === "on",
      require_identity: f.get("require_identity") === "on",
      require_signature: f.get("require_signature") === "on",
    });
    close();
  }
  return (
    <Modal title="Paramètres des retraits" close={close}>
      {value ? (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <label className="text-[12px]">
            Délai de grâce
            <input
              name="grace_days"
              type="number"
              min="0"
              defaultValue={value.grace_days}
              className={`${input} mt-1 w-full`}
            />
          </label>
          <label className="text-[12px]">
            Frais par jour et colis
            <input
              name="daily_storage_fee"
              type="number"
              min="0"
              step="0.01"
              defaultValue={value.daily_storage_fee}
              className={`${input} mt-1 w-full`}
            />
          </label>
          <label className="text-[12px]">
            Devise
            <input
              name="currency"
              maxLength={3}
              defaultValue={value.currency}
              className={`${input} mt-1 w-full`}
            />
          </label>
          <label className="text-[12px]">
            Validité OTP (minutes)
            <input
              name="otp_ttl_minutes"
              type="number"
              min="2"
              max="120"
              defaultValue={value.otp_ttl_minutes}
              className={`${input} mt-1 w-full`}
            />
          </label>
          <label className="text-[12px]">
            Tentatives OTP
            <input
              name="max_otp_attempts"
              type="number"
              min="1"
              max="20"
              defaultValue={value.max_otp_attempts}
              className={`${input} mt-1 w-full`}
            />
          </label>
          <div className="space-y-2 text-[13px]">
            {[
              [
                "require_payment",
                "Paiement obligatoire",
                value.require_payment,
              ],
              [
                "require_identity",
                "Identité obligatoire",
                value.require_identity,
              ],
              [
                "require_signature",
                "Signature obligatoire",
                value.require_signature,
              ],
            ].map(([n, l, v]) => (
              <label key={String(n)} className="flex gap-2">
                <input
                  name={String(n)}
                  type="checkbox"
                  defaultChecked={Boolean(v)}
                />
                {String(l)}
              </label>
            ))}
          </div>
          <button className={`${primary} sm:col-span-2`}>Enregistrer</button>
        </form>
      ) : error ? (
        <p className="rounded-[5px] bg-red-50 p-3 text-[12px] text-red-700">{error}</p>
      ) : (
        <LoadingState label="Chargement des paramètres…" />
      )}
    </Modal>
  );
}
function AnalyticsModal({ close }: { close: () => void }) {
  const [data, setData] = useState<PickupAnalytics | null>(null);
  useEffect(() => {
    getPickupAnalytics().then(setData);
  }, []);
  return (
    <Modal title="Performance des retraits" close={close} wide>
      {data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ["Retraits", data.summary.total],
              ["Remis", data.summary.released],
              ["Refusés", data.summary.refused],
              [
                "Attente moyenne",
                `${data.summary.average_wait_hours.toFixed(1)} h`,
              ],
              [
                "Temps guichet",
                `${data.summary.average_counter_minutes.toFixed(1)} min`,
              ],
              [
                "Frais encaissés",
                money(data.summary.storage_fees_collected, "USD"),
              ],
            ].map(([l, v]) => (
              <div key={l} className="rounded bg-[#f5f6f6] p-3">
                <small>{l}</small>
                <b className="block text-lg">{v}</b>
              </div>
            ))}
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-semibold">
              Performance par agent
            </h3>
            {data.operators.map((o) => (
              <div
                key={o.label}
                className="flex justify-between border-b py-2 text-[13px]"
              >
                <span>{o.label}</span>
                <b>
                  {o.released} remis · {o.average_minutes} min
                </b>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <LoadingState label="Chargement des performances…" />
      )}
    </Modal>
  );
}
function Modal({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <OperationDrawer
      open
      title={title}
      close={close}
      width={wide ? "max-w-2xl" : "max-w-lg"}
    >
      {children}
    </OperationDrawer>
  );
}
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[7px] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,.07)]">
      <h3 className="mb-4 text-[14px] font-semibold">{title}</h3>
      {children}
    </section>
  );
}
function Grid({ rows }: { rows: any[][] }) {
  return (
    <div className="grid gap-x-6 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between border-b py-2 text-[13px]">
          <span className="text-[#68717d]">{k}</span>
          <b>{v ?? "—"}</b>
        </div>
      ))}
    </div>
  );
}
function Badge({
  children,
  ok = false,
}: {
  children: React.ReactNode;
  ok?: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
    >
      {children}
    </span>
  );
}
function Empty() {
  return (
    <div className="grid min-h-60 place-items-center text-center">
      <div>
        <HandCoins className="mx-auto text-[#89929c]" />
        <b className="mt-3 block">Aucun retrait dans cette vue</b>
        <p className="mt-1 text-[13px] text-[#68717d]">
          Les colis prêts au retrait peuvent être regroupés par client.
        </p>
      </div>
    </div>
  );
}
function money(v: number, c: string) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: c || "USD",
  }).format(v || 0);
}
function date(v: string) {
  return new Date(v).toLocaleString("fr-FR");
}
function age(v: string) {
  const days = Math.floor((Date.now() - new Date(v).getTime()) / 86400000);
  return days ? `${days} j` : "Aujourd’hui";
}
function message(e: unknown) {
  return e instanceof Error ? e.message : "Erreur API";
}
