"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ChevronRight, Download, Plus, Search, Send } from "lucide-react";
import {
  OperationPageHeader,
  OperationTabs,
} from "@/components/ui/operation-page-header";
import { LoadingState } from "@/components/ui/page-state";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import {
  getReferenceCatalog,
  type ReferenceCatalog,
} from "@/services/references";
import {
  createFollowup,
  executeFollowup,
  followupRules,
  getFollowup,
  listFollowups,
  mutateFollowup,
  saveFollowupRule,
  saveFollowupSequence,
  type Followup,
  type FollowupStats,
} from "@/services/followups";
const btn =
    "inline-flex h-9 items-center gap-2 rounded-md border border-[#d5d9dc] bg-white px-3 text-[12px] font-medium",
  primary =
    "inline-flex h-9 items-center gap-2 rounded-md bg-[#16855f] px-3 text-[12px] font-semibold text-white",
  input =
    "h-9 rounded-md border border-[#d7dbde] bg-white px-3 text-[12px] outline-none";
const views = [
  ["all", "Vue d’ensemble", {}],
  ["today", "Aujourd’hui", { date_scope: "TODAY" }],
  ["upcoming", "À venir", { date_scope: "UPCOMING" }],
  ["overdue", "En retard", { date_scope: "OVERDUE" }],
  ["waiting", "En attente", { status: "WAITING_RESPONSE" }],
  ["responded", "Répondues", { status: "RESPONDED" }],
  ["escalated", "Escalées", { status: "ESCALATED" }],
  ["completed", "Terminées", { status: "COMPLETED" }],
  ["payments", "Paiements", { followup_type: "PAYMENT" }],
  ["quotes", "Devis", { followup_type: "QUOTE" }],
  ["packages", "Dépôt colis", { followup_type: "PACKAGE_DROP_REMINDER" }],
  ["pickups", "Retraits", { followup_type: "PICKUP" }],
] as const;
const followupTypeLabels: Record<string, string> = {
  PAYMENT_DUE: "Paiement",
  QUOTE_FOLLOWUP: "Devis",
  PACKAGE_DROP_REMINDER: "Dépôt de colis",
  PICKUP_REMINDER: "Retrait",
  DOCUMENT_MISSING: "Document manquant",
  CLIENT_INACTIVE: "Client inactif",
};
const followupChannelLabels: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  IN_APP: "Tâche interne",
  PHONE: "Appel manuel",
};
const priorityLabels: Record<string, string> = {
  LOW: "Faible",
  NORMAL: "Normale",
  HIGH: "Haute",
  URGENT: "Urgente",
};
export function FollowupsPage() {
  const [items, setItems] = useState<Followup[]>([]),
    [stats, setStats] = useState<FollowupStats | null>(null),
    [view, setView] = useState("all"),
    [q, setQ] = useState(""),
    [channel, setChannel] = useState(""),
    [priority, setPriority] = useState(""),
    [selected, setSelected] = useState<Followup | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [create, setCreate] = useState(false),
    [allMetrics, setAllMetrics] = useState(false),
    [rules, setRules] = useState(false);
  const current = views.find((x) => x[0] === view) || views[0];
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listFollowups({
        q,
        channel: channel || undefined,
        priority: priority || undefined,
        ...current[2],
      });
      setItems(r.items);
      setStats(r.stats);
      setError("");
    } catch {
      setError("Le moteur de relances est indisponible.");
    } finally {
      setLoading(false);
    }
  }, [q, channel, priority, current]);
  useEffect(() => {
    const t = setTimeout(load, 180);
    return () => clearTimeout(t);
  }, [load]);
  async function open(x: Followup) {
    setSelected(await getFollowup(x.id));
  }
  async function action(x: Followup, action: string) {
    const reason = ["PAUSE", "CANCEL", "ESCALATE"].includes(action)
      ? prompt("Motif obligatoire") || undefined
      : undefined;
    if (["PAUSE", "CANCEL", "ESCALATE"].includes(action) && !reason) return;
    try {
      if (action === "SEND") await executeFollowup(x.id);
      else
        await mutateFollowup(x.id, {
          action,
          expected_version: x.row_version,
          reason,
        });
      setSelected(null);
      load();
    } catch {
      setError(
        "Action refusée : la condition est résolue, la fiche a changé ou le destinataire manque.",
      );
    }
  }
  const cards = [
    ["À relancer aujourd’hui", stats?.due_today || 0],
    ["En retard", stats?.overdue || 0],
    ["Automatiques", stats?.automatic || 0],
    ["En attente réponse", stats?.waiting_response || 0],
    ["Réponses reçues", stats?.responded || 0],
    ["Escalades humaines", stats?.escalated || 0],
    ["Terminées aujourd’hui", stats?.completed_today || 0],
    ["Taux de réponse", `${stats?.response_rate || 0}%`],
  ];
  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <OperationPageHeader
        title="Relances"
        description="Automatisez vos rappels, suivez les réponses et évitez les paiements, dossiers ou clients oubliés."
        actions={
          <>
            <button className={btn} onClick={() => download(items)}>
              <Download size={14} />
              Exporter
            </button>
            <details className="relative">
              <summary className={`${btn} cursor-pointer list-none`}>
                Plus
              </summary>
              <div className="absolute right-0 z-30 mt-1 w-52 rounded-md bg-white p-1 shadow-[0_8px_30px_rgba(15,23,42,.14)] ring-1 ring-[#e8eaed]">
                <button
                  className="flex w-full rounded px-3 py-2 text-left text-[13px] hover:bg-[#f5f6f7]"
                  onClick={() => setRules(true)}
                >
                  Règles et séquences
                </button>
                <button
                  className="flex w-full rounded px-3 py-2 text-left text-[13px] hover:bg-[#f5f6f7]"
                  onClick={load}
                >
                  Actualiser
                </button>
              </div>
            </details>
            <button className={primary} onClick={() => setCreate(true)}>
              <Plus size={14} />
              Nouvelle relance
            </button>
          </>
        }
      />
      <section className="bg-white px-5 py-4">
        <div
          className={`grid grid-cols-2 ${allMetrics ? "lg:grid-cols-8" : "lg:grid-cols-4"}`}
        >
          {cards.slice(0, allMetrics ? 8 : 4).map(([l, v], index) => (
            <button
              type="button"
              onClick={() => setAllMetrics((current) => !current)}
              className={`px-4 py-1 text-left ${index ? "border-l border-[#eceef1]" : ""}`}
              key={l}
            >
              <span className="text-[12px] text-[#6b7580]">{l}</span>
              <b className="mt-1 block text-[24px] font-medium tracking-[-.035em]">
                {v}
              </b>
            </button>
          ))}
        </div>
        <button
          onClick={() => setAllMetrics((current) => !current)}
          className="mt-3 text-[11px] font-medium text-[#5b52c7]"
        >
          {allMetrics ? "Réduire les indicateurs" : "Voir tous les indicateurs"}
        </button>
      </section>
      <OperationTabs>
        <div className="flex items-end gap-1">
            {views.slice(0, 4).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`h-10 whitespace-nowrap border-b-2 px-3 text-[12px] ${view === k ? "border-[#16855f] font-semibold text-[#126744]" : "border-transparent text-[#68717d]"}`}
              >
                {l}
              </button>
            ))}
            <select
              aria-label="Autres vues"
              value={views.slice(4).some(([k]) => k === view) ? view : ""}
              onChange={(e) => setView(e.target.value)}
              className="mb-1 ml-1 h-8 rounded-md bg-[#f3f4f5] px-2 text-[12px] text-[#59636e] outline-none"
            >
              <option value="">Plus</option>
              {views.slice(4).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
        </div>
      </OperationTabs>
      <div className="flex gap-2 border-b bg-white p-4">
        <label className="flex h-9 min-w-[280px] flex-1 items-center rounded-md bg-[#f4f5f6] px-3 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#a9a3f1]">
          <Search size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="ml-2 flex-1 bg-transparent text-[13px] outline-none"
            placeholder="Client, téléphone, dossier, facture, colis..."
          />
        </label>
        <select
          className={`${input} w-44`}
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
        >
          <option value="">Tous les canaux</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="IN_APP">Tâches internes</option>
          <option value="PHONE">Appels manuels</option>
        </select>
        <select
          className={`${input} w-40`}
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value="">Toutes priorités</option>
          {Object.entries(priorityLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="m-4 border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <LoadingState label="Chargement des relances…" />
      ) : (
        <Table items={items} open={open} />
      )}{" "}
      {selected && (
        <Detail
          item={selected}
          close={() => setSelected(null)}
          action={action}
        />
      )}{" "}
      {create && (
        <Create
          close={() => setCreate(false)}
          done={() => {
            setCreate(false);
            load();
          }}
        />
      )}
      {rules && <Rules close={() => setRules(false)} />}
    </div>
  );
}
function Table({
  items,
  open,
}: {
  items: Followup[];
  open: (x: Followup) => void;
}) {
  return (
    <div className="min-h-[460px] overflow-x-auto bg-white">
      <table className="w-full min-w-[1100px] border-collapse text-left text-[13px]">
        <thead className="bg-[#fbfcfd] text-[#5f6b7a]">
          <tr className="border-b border-[#e6e9ee]">
            {[
              "Client",
              "Objet / motif",
              "Référence",
              "Canal",
              "Prochaine relance",
              "Étape",
              "Priorité",
              "Responsable",
              "Statut",
              "",
            ].map((h) => (
              <th className="px-4 py-3 font-medium" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr
              onClick={() => open(x)}
              className="cursor-pointer border-b border-[#edf0f3] hover:bg-[#f7faf9]"
              key={x.id}
            >
              <td className="px-4 py-3 font-semibold">
                {x.client_name || "Client"}
              </td>
              <td>
                {followupTypeLabels[x.followup_type] || x.followup_type}
                <small className="block text-[#6b7280]">{x.reason}</small>
              </td>
              <td>{x.subject_reference || x.reference}</td>
              <td>{followupChannelLabels[x.channel] || x.channel}</td>
              <td>{date(x.due_at)}</td>
              <td>
                {x.current_step}/{x.max_steps}
              </td>
              <td>{priorityLabels[x.priority] || x.priority}</td>
              <td>{x.responsible_name || "—"}</td>
              <td>
                <Badge value={x.status} />
              </td>
              <td className="pr-4 text-right text-[#7b848d]">
                <ChevronRight size={17} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && (
        <p className="p-16 text-center text-[13px] text-[#707780]">
          Aucune relance dans cette vue.
        </p>
      )}
    </div>
  );
}
function Detail({
  item,
  close,
  action,
}: {
  item: Followup;
  close: () => void;
  action: (x: Followup, a: string) => void;
}) {
  return (
    <OperationDrawer
      open
      title={item.reference}
      description={`${item.client_name} · ${item.followup_type}`}
      close={close}
    >
      <div className="mb-4">
        <Badge value={item.status} />
      </div>
      <div className="grid gap-4">
        <section className="grid grid-cols-2 gap-3">
          {[
            ["Motif", item.reason],
            ["Objet", item.subject_reference],
            ["Prochaine tentative", date(item.due_at)],
            ["Responsable", item.responsible_name],
            ["Étape", `${item.current_step}/${item.max_steps}`],
            [
              "Montant",
              item.amount_context
                ? `${item.amount_context} ${item.currency || ""}`
                : "—",
            ],
          ].map(([l, v]) => (
            <div
              className="rounded-md border border-[#e4e7ea] bg-[#fbfcfd] p-3"
              key={l}
            >
              <small>{l}</small>
              <b className="mt-1 block">{v || "—"}</b>
            </div>
          ))}
        </section>
        <section className="rounded-md border border-[#e4e7ea] bg-white p-4">
          <h3 className="font-semibold">Message</h3>
          <p className="mt-2 whitespace-pre-wrap text-[13px]">{item.message}</p>
        </section>
        <section className="rounded-md border border-[#e4e7ea] bg-white p-4">
          <h3 className="font-semibold">Tentatives & réponses</h3>
          {[...(item.attempts || []), ...(item.responses || [])].map((x, i) => (
            <p key={i} className="mt-2 border-t pt-2 text-[12px]">
              {String(x.status || x.classification || "Réponse")} ·{" "}
              {String(x.message || x.body || "")}
            </p>
          ))}
        </section>
        <section className="rounded-md border border-[#e4e7ea] bg-white p-4">
          <h3 className="font-semibold">Timeline & audit</h3>
          {item.events?.map((x, i) => (
            <p key={i} className="mt-2 border-t pt-2 text-[12px]">
              {String(x.event_type)} · {date(String(x.created_at))}
            </p>
          ))}
        </section>
        <div className="flex flex-wrap gap-2">
          <button className={primary} onClick={() => action(item, "SEND")}>
            <Send size={14} />
            Envoyer maintenant
          </button>
          <button className={btn} onClick={() => action(item, "PAUSE")}>
            Pause
          </button>
          <button className={btn} onClick={() => action(item, "RESUME")}>
            Reprendre
          </button>
          <button className={btn} onClick={() => action(item, "ESCALATE")}>
            Escalader
          </button>
          <button className={btn} onClick={() => action(item, "COMPLETE")}>
            Terminer
          </button>
          <button className={btn} onClick={() => action(item, "CANCEL")}>
            Annuler
          </button>
        </div>
      </div>
    </OperationDrawer>
  );
}
function Create({ close, done }: { close: () => void; done: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [references, setReferences] = useState<ReferenceCatalog | null>(null);
  const [clientId, setClientId] = useState("");
  useEffect(() => {
    getReferenceCatalog()
      .then(setReferences)
      .catch(() =>
        setError("Impossible de charger les clients et dossiers de l’agence."),
      );
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await createFollowup({
        client_id: f.get("client_id"),
        dossier_id: f.get("dossier_id") || null,
        followup_type: f.get("type"),
        subject_type: f.get("dossier_id") ? "DOSSIER" : "CLIENT",
        subject_id: f.get("dossier_id") || f.get("client_id"),
        subject_reference: null,
        reason: f.get("reason"),
        channel: f.get("channel"),
        message: f.get("message"),
        due_at: new Date(String(f.get("due_at"))).toISOString(),
        priority: f.get("priority"),
        consent_type: "OPERATIONAL",
      });
      done();
    } catch {
      setError(
        "Création impossible. Vérifiez le client, la date et les permissions.",
      );
      setBusy(false);
    }
  }
  return (
    <Modal title="Nouvelle relance" close={close}>
      <form onSubmit={submit} className="grid gap-3">
        <label className="text-[12px] text-[#5f6873]">
          Client à relancer
          <select
            required
            name="client_id"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className={`${input} mt-1 w-full`}
          >
            <option value="">Choisir un client</option>
            {references?.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.label}
                {client.secondary ? ` · ${client.secondary}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-[#5f6873]">
          Dossier concerné (facultatif)
          <select
            name="dossier_id"
            className={`${input} mt-1 w-full`}
            disabled={!clientId}
          >
            <option value="">Relance générale du client</option>
            {references?.dossiers
              .filter(
                (dossier) =>
                  !dossier.client_id || dossier.client_id === clientId,
              )
              .map((dossier) => (
                <option key={dossier.id} value={dossier.id}>
                  {dossier.label}
                </option>
              ))}
          </select>
        </label>
        <select name="type" className={input}>
          <option value="PAYMENT_DUE">Paiement</option>
          <option value="QUOTE_FOLLOWUP">Devis</option>
          <option value="PACKAGE_DROP_REMINDER">Dépôt colis</option>
          <option value="PICKUP_REMINDER">Retrait</option>
          <option value="DOCUMENT_MISSING">Document</option>
          <option value="CLIENT_INACTIVE">Inactivité</option>
        </select>
        <label className="text-[12px] text-[#5f6873]">
          Pourquoi relancer ?
          <input
            required
            name="reason"
            className={`${input} mt-1 w-full`}
            placeholder="Ex. document manquant ou solde à payer"
          />
        </label>
        <label className="text-[12px] text-[#5f6873]">
          Quand effectuer la relance ?
          <input
            required
            type="datetime-local"
            name="due_at"
            className={`${input} mt-1 w-full`}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <select name="channel" className={input}>
            <option value="WHATSAPP">WhatsApp connecté</option>
            <option value="IN_APP">Tâche interne pour un agent</option>
            <option value="PHONE">Appel manuel</option>
          </select>
          <select name="priority" className={input}>
            <option value="NORMAL">Priorité normale</option>
            <option value="HIGH">Priorité haute</option>
            <option value="URGENT">Priorité urgente</option>
            <option value="LOW">Priorité faible</option>
          </select>
        </div>
        <textarea
          required
          name="message"
          className="min-h-28 rounded-md border border-[#d2d7dc] bg-white p-3 text-[13px] outline-none focus:border-[#16855f] focus:ring-1 focus:ring-[#b9e5d2]"
          placeholder="Message au nom de l’agence"
        />
        <button disabled={busy} className={primary}>
          {busy ? "Programmation…" : "Programmer la relance"}
        </button>
        {error && <p className="text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
function Rules({ close }: { close: () => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null),
    [tab, setTab] = useState<"sequence" | "rule">("sequence"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    followupRules().then(setData);
  }, []);
  async function submitSequence(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await saveFollowupSequence({
        name: f.get("name"),
        followup_type: f.get("type"),
        exit_conditions: ["CLIENT_RESPONDED", "BUSINESS_CONDITION_RESOLVED"],
        steps: [
          {
            delay_minutes: Number(f.get("delay_days")) * 1440,
            channel: f.get("channel"),
            message_template: f.get("message"),
            condition_config: {},
            action_type: "SEND",
          },
        ],
      });
      setData(await followupRules());
    } catch {
      setError(
        "La séquence n’a pas été enregistrée. Vérifiez le délai, le canal et le message.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submitRule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await saveFollowupRule({
        name: f.get("name"),
        followup_type: f.get("type"),
        trigger_type: f.get("trigger"),
        trigger_config: { delay_minutes: Number(f.get("delay_days")) * 1440 },
        condition_config: {},
        sequence_id: f.get("sequence") || null,
        priority: f.get("priority"),
        responsible_team: f.get("team") || null,
      });
      setData(await followupRules());
    } catch {
      setError(
        "La règle n’a pas été enregistrée. Vérifiez la situation et la séquence choisies.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Règles & séquences" close={close}>
      <div className="mb-4 flex gap-2">
        <button
          className={tab === "sequence" ? primary : btn}
          onClick={() => setTab("sequence")}
        >
          Séquences
        </button>
        <button
          className={tab === "rule" ? primary : btn}
          onClick={() => setTab("rule")}
        >
          Règles
        </button>
      </div>
      {tab === "sequence" ? (
        <form onSubmit={submitSequence} className="grid gap-2">
          <input
            required
            name="name"
            className={input}
            placeholder="Séquence paiement standard"
          />
          <label className="grid gap-1 text-[12px] font-medium">
            Situation concernée
            <select required name="type" className={input}>
              {Object.entries(followupTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <input
            required
            type="number"
            name="delay_days"
            className={input}
            placeholder="Attendre combien de jours ?"
          />
          <select name="channel" className={input}>
            <option value="WHATSAPP">WhatsApp connecté</option>
            <option value="EMAIL">Email connecté</option>
            <option value="IN_APP">Créer une tâche pour un agent</option>
          </select>
          <textarea
            required
            name="message"
            className="min-h-24 rounded-md border border-[#d2d7dc] bg-white p-3 text-[13px] outline-none focus:border-[#16855f]"
            placeholder="Écrivez le message au nom de l’agence. Le prénom sera ajouté automatiquement."
          />
          <button disabled={busy} className={primary}>
            {busy ? "Enregistrement…" : "Enregistrer la séquence"}
          </button>
        </form>
      ) : (
        <form onSubmit={submitRule} className="grid gap-2">
          <input
            required
            name="name"
            className={input}
            placeholder="Facture échue J+1"
          />
          <label className="grid gap-1 text-[12px] font-medium">
            Situation à surveiller
            <select required name="type" className={input}>
              {Object.entries(followupTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <select name="trigger" className={input}>
            <option value="DATE">Une date est atteinte</option>
            <option value="STATUS">Une situation reste non résolue</option>
            <option value="INACTIVITY">
              Le client ou dossier reste sans activité
            </option>
            <option value="EVENT">Un événement métier se produit</option>
          </select>
          <input
            type="number"
            name="delay_days"
            className={input}
            placeholder="Attendre combien de jours ?"
          />
          <select name="sequence" className={input}>
            <option value="">Sans séquence</option>
            {((data?.sequences || []) as Array<Record<string, unknown>>).map(
              (x) => (
                <option value={String(x.id)} key={String(x.id)}>
                  {String(x.name)}
                </option>
              ),
            )}
          </select>
          <select name="priority" className={input}>
            <option value="NORMAL">Priorité normale</option>
            <option value="HIGH">Priorité haute</option>
            <option value="URGENT">Priorité urgente</option>
          </select>
          <input
            name="team"
            className={input}
            placeholder="Équipe responsable"
          />
          <button disabled={busy} className={primary}>
            {busy ? "Enregistrement…" : "Enregistrer la règle"}
          </button>
        </form>
      )}
      {error && (
        <p className="mt-3 rounded-md bg-red-50 p-3 text-[12px] text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 text-[12px] text-[#68717a]">
        {((data?.rules || []) as unknown[]).length} règle(s) ·{" "}
        {((data?.sequences || []) as unknown[]).length} séquence(s)
      </div>
    </Modal>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <OperationDrawer
      open
      title={title}
      description="Choisissez les informations existantes de l’agence puis confirmez."
      close={close}
    >
      {children}
    </OperationDrawer>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span className="rounded bg-[#eef2f1] px-2 py-1 text-[11px] font-medium">
      {value.replaceAll("_", " ")}
    </span>
  );
}
function date(v: string) {
  return v ? new Date(v).toLocaleString("fr-FR") : "—";
}
function download(items: Followup[]) {
  const rows = [
      ["Référence", "Client", "Type", "Motif", "Canal", "Échéance", "Statut"],
      ...items.map((x) => [
        x.reference,
        x.client_name,
        x.followup_type,
        x.reason,
        x.channel,
        x.due_at,
        x.status,
      ]),
    ],
    blob = new Blob(
      [
        rows
          .map((r) =>
            r
              .map((v) => `"${String(v || "").replaceAll('"', '""')}"`)
              .join(","),
          )
          .join("\n"),
      ],
      { type: "text/csv" },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "relances.csv";
  a.click();
  URL.revokeObjectURL(url);
}
