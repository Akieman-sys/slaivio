"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ChevronRight, Download, Plus } from "lucide-react";
import {
  OperationPageHeader,
  OperationTabs,
} from "@/components/ui/operation-page-header";
import { OperationMetrics, OperationSearch, OperationTable, OperationToolbar } from "@/components/ui/operation-primitives";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { OperationButton, OperationMetric, OperationMetricGrid, OperationTab } from "@/components/ui/operation-controls";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/page-state";
import { listClients } from "@/services/clients";
import {
  campaignAction,
  campaignResources,
  createCampaign,
  getCampaign,
  listCampaigns,
  saveAudience,
  snapshotCampaign,
  type Campaign,
} from "@/services/broadcasts";
const btn =
    "inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-[#d4d9df] bg-white px-3 text-[13px] font-medium hover:bg-[#f5f6f7]",
  primary =
    "inline-flex h-9 items-center justify-center gap-2 rounded-[6px] bg-[#12c76f] px-4 text-[13px] font-medium text-white hover:bg-[#0fb766]",
  field =
    "h-9 rounded-[6px] border border-[#d2d7dc] bg-white px-3 text-[13px] outline-none focus:border-[#16855f] focus:ring-1 focus:ring-[#b9e5d2]";
const tabs = [
  ["", "Toutes"],
  ["DRAFT", "Brouillons"],
  ["PENDING_APPROVAL", "À approuver"],
  ["SCHEDULED", "Programmées"],
  ["SENDING", "En cours"],
  ["COMPLETED", "Terminées"],
  ["FAILED", "Échouées"],
];
const campaignStatusLabels: Record<string, string> = {
  DRAFT: "Brouillon",
  PENDING_APPROVAL: "À approuver",
  SCHEDULED: "Programmée",
  QUEUED: "En file",
  SENDING: "En cours",
  PAUSED: "En pause",
  COMPLETED: "Terminée",
  PARTIALLY_FAILED: "Partiellement échouée",
  FAILED: "Échouée",
  CANCELLED: "Annulée",
  ARCHIVED: "Archivée",
};
const channelLabels: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  SMS: "SMS",
  PUSH: "Notification mobile",
};
export function BroadcastsPage() {
  const [items, setItems] = useState<Campaign[]>([]),
    [stats, setStats] = useState<Record<string, number>>({}),
    [status, setStatus] = useState(""),
    [channel, setChannel] = useState(""),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState<Campaign | null>(null),
    [modal, setModal] = useState<"campaign" | "audience" | null>(null),
    [allMetrics, setAllMetrics] = useState(false),
    [loading, setLoading] = useState(true),
    [resources, setResources] = useState<Record<string, unknown>>({}),
    [error, setError] = useState("");
  const load = useCallback(
    () => {
      setLoading(true);
      setError("");
      return listCampaigns({ q, status, channel })
        .then((r) => {
          setItems(r.items);
          setStats(r.stats);
        })
        .catch(() => setError("Le centre de campagnes est indisponible."))
        .finally(() => setLoading(false));
    },
    [q, status, channel],
  );
  useEffect(() => {
    load();
    campaignResources().then(setResources);
  }, [load]);
  async function open(x: Campaign) {
    setSelected((await getCampaign(x.id)).campaign);
  }
  async function act(a: string) {
    if (!selected) return;
    try {
      await campaignAction(selected.id, a, selected.row_version);
      setSelected(null);
      load();
    } catch {
      setError(
        "Pré-check refusé, droits insuffisants ou campagne déjà modifiée.",
      );
    }
  }
  const cards = [
    ["Actives", stats.active],
    ["Programmées", stats.scheduled],
    ["Envoyées ce mois", stats.sent_month],
    ["Destinataires", stats.recipients],
    ["Délivrés", stats.delivered],
    ["Lus", stats.read],
    ["Réponses", stats.replies],
    ["Taux lecture", `${stats.read_rate || 0}%`],
  ];
  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <OperationPageHeader
        title="Broadcasts"
        description="Créez, programmez et analysez vos campagnes WhatsApp et email auprès de vos clients et prospects."
        actions={
          <>
            <OperationButton onClick={() => exportCampaigns(items)}>
              <Download size={14} className="inline" /> Exporter
            </OperationButton>
            <details className="relative">
              <summary className={`${btn} cursor-pointer list-none`}>
                Plus
              </summary>
              <div className="absolute right-0 z-30 mt-1 w-52 rounded-md bg-white p-1 shadow-[0_8px_30px_rgba(15,23,42,.14)] ring-1 ring-[#e8eaed]">
                <button
                  className="flex w-full rounded px-3 py-2 text-left text-[13px] hover:bg-[#f5f6f7]"
                  onClick={() => setModal("audience")}
                >
                  Créer un groupe de destinataires
                </button>
                <button
                  className="flex w-full rounded px-3 py-2 text-left text-[13px] hover:bg-[#f5f6f7]"
                  onClick={load}
                >
                  Actualiser
                </button>
              </div>
            </details>
            <OperationButton variant="primary" onClick={() => setModal("campaign")}>
              <Plus size={14} className="inline" /> Nouvelle campagne
            </OperationButton>
          </>
        }
      />
      <OperationMetrics>
        <OperationMetricGrid className={allMetrics ? "lg:grid-cols-8" : "lg:grid-cols-4"}>
          {cards.slice(0, allMetrics ? 8 : 4).map(([l, v]) => (
            <OperationMetric key={String(l)} label={String(l)} value={v || 0} />
          ))}
        </OperationMetricGrid>
        <button
          onClick={() => setAllMetrics((current) => !current)}
          className="mt-3 text-[11px] font-medium text-[#5b52c7]"
        >
          {allMetrics ? "Réduire les indicateurs" : "Voir tous les indicateurs"}
        </button>
      </OperationMetrics>
      <OperationTabs>
        <div className="flex items-end gap-1">
            {tabs.slice(0, 4).map(([v, l]) => (
              <OperationTab
                key={v}
                onClick={() => setStatus(v)}
                active={status === v}
              >
                {l}
              </OperationTab>
            ))}
            <select
              aria-label="Autres vues"
              value={tabs.slice(4).some(([v]) => v === status) ? status : ""}
              onChange={(e) => setStatus(e.target.value)}
              className="mb-1 ml-1 h-8 rounded-md bg-[#f3f4f5] px-2 text-[13px] text-[#59636e] outline-none"
            >
              <option value="">Plus</option>
              {tabs.slice(4).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
        </div>
      </OperationTabs>
      <OperationToolbar search={<OperationSearch value={q} onChange={setQ} placeholder="Rechercher une campagne…" />} filters={<select
          className={`${field} w-44`}
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
        >
          <option value="">Tous les canaux</option>
          {Array.from(
            new Set(items.flatMap((item) => item.channels || [])),
          ).map((value) => (
            <option key={value} value={value}>
              {channelLabels[value] || value}
            </option>
          ))}
        </select>} />
      {error && <ErrorState title="Campagnes indisponibles" description={error} retry={load} />}
      {loading ? <TableSkeleton rows={7} columns={7} label="Chargement des campagnes…" /> : items.length ? <OperationTable className="min-h-[460px]">
        <table className="w-full min-w-[980px] border-collapse bg-white text-left text-[13px]">
          <thead className="bg-[#fbfcfd] text-[#5f6b7a]">
            <tr className="border-b border-[#e6e9ee]">
              {[
                "Campagne",
                "Canaux",
                "Audience",
                "Statut",
                "Programmation",
                "Performance",
                "",
              ].map((x) => (
                <th className="px-4 py-3 font-medium" key={x}>
                  {x}
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
                <td className="px-4 py-3">
                  <b>{x.title}</b>
                  <small className="block">{x.reference}</small>
                </td>
                <td>
                  {x.channels
                    ?.map((channel) => channelLabels[channel] || channel)
                    .join(" + ")}
                </td>
                <td>{x.recipients || 0}</td>
                <td>
                  <span className="rounded-full bg-[#eef2f1] px-2 py-1 text-[11px] font-medium">
                    {campaignStatusLabels[x.status] || x.status}
                  </span>
                </td>
                <td>
                  {x.scheduled_at
                    ? new Date(x.scheduled_at).toLocaleString("fr-FR")
                    : "—"}
                </td>
                <td>
                  {x.reads || 0} lus · {x.replies || 0} réponses
                </td>
                <td className="pr-4 text-right text-[#7b848d]">
                  <ChevronRight size={17} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </OperationTable> : <EmptyState title="Aucune campagne dans cette vue" description="Créez une campagne ou modifiez vos filtres pour afficher les communications de l’agence." />}
      {selected && (
        <OperationDrawer
          open
          title={selected.title}
          description={`${selected.reference} · ${campaignStatusLabels[selected.status] || selected.status}`}
          close={() => setSelected(null)}
        >
          <div className="rounded-md bg-white p-4 whitespace-pre-wrap">
            {selected.message}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className={btn}
              onClick={async () => {
                await snapshotCampaign(selected.id);
                setSelected((await getCampaign(selected.id)).campaign);
              }}
            >
              Calculer & figer audience
            </button>
            <button className={btn} onClick={() => act("APPROVE")}>
              Approuver
            </button>
            <button className={primary} onClick={() => act("START")}>
              Lancer
            </button>
            <button className={btn} onClick={() => act("PAUSE")}>
              Pause
            </button>
            <button className={btn} onClick={() => act("RESUME")}>
              Reprendre
            </button>
            <button className={btn} onClick={() => act("CANCEL")}>
              Annuler
            </button>
          </div>
        </OperationDrawer>
      )}
      {modal === "campaign" && (
        <CampaignModal
          resources={resources}
          close={() => setModal(null)}
          done={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === "audience" && (
        <AudienceModal
          close={() => setModal(null)}
          done={() => {
            setModal(null);
            campaignResources().then(setResources);
          }}
        />
      )}
    </div>
  );
}
function CampaignModal({
  resources,
  close,
  done,
}: {
  resources: Record<string, unknown>;
  close: () => void;
  done: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await createCampaign({
        title: f.get("title"),
        message: f.get("message"),
        campaign_type: f.get("type"),
        objective: f.get("objective"),
        channels: [f.get("channel")],
        audience_id: f.get("audience") || null,
        scheduled_at: f.get("date")
          ? new Date(String(f.get("date"))).toISOString()
          : null,
        timezone_mode: "WORKSPACE",
        language_versions: {},
        media: [],
        variable_defaults: { client_name: "Client" },
      });
      done();
    } catch {
      setError(
        "La campagne n’a pas été enregistrée. Vérifiez le groupe de destinataires et les informations obligatoires.",
      );
      setBusy(false);
    }
  }
  return (
    <Modal title="Nouvelle campagne" close={close}>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="grid gap-1 text-[12px] font-medium">
          Nom interne de la campagne
          <input
            required
            name="title"
            className={field}
            placeholder="Ex. Annonce du départ de vendredi"
          />
        </label>
        <label className="grid gap-1 text-[12px] font-medium">
          Que souhaitez-vous faire ?
          <select name="objective" className={field}>
            <option value="INFORM">Informer les clients</option>
            <option value="PROMOTE">Présenter une offre</option>
            <option value="REACTIVATE">Recontacter des clients inactifs</option>
            <option value="ANNOUNCE">Faire une annonce importante</option>
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-medium">
          Nature du message
          <select name="type" className={field}>
            <option value="INFORMATIONAL">Information opérationnelle</option>
            <option value="COMMERCIAL">
              Commerciale — consentement obligatoire
            </option>
            <option value="ENGAGEMENT">Engagement</option>
          </select>
          <small className="font-normal text-[#727b84]">
            Les offres commerciales sont envoyées uniquement aux clients ayant
            donné leur accord.
          </small>
        </label>
        <label className="grid gap-1 text-[12px] font-medium">
          Canal d’envoi
          <select name="channel" className={field}>
            <option value="WHATSAPP">WhatsApp Business connecté</option>
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-medium">
          Clients destinataires
          <select name="audience" className={field}>
            <option value="">Choisir les clients concernés</option>
            {(
              (resources.audiences || []) as Array<Record<string, unknown>>
            ).map((x) => (
              <option key={String(x.id)} value={String(x.id)}>
                {String(x.name)}
              </option>
            ))}
          </select>
          <small className="font-normal text-[#727b84]">
            Le groupe applique automatiquement ses pays, statuts et
            consentements.
          </small>
        </label>
        <label className="grid gap-1 text-[12px] font-medium">
          Message envoyé au nom de l’agence
          <textarea
            required
            name="message"
            className="min-h-36 rounded-md border border-[#d2d7dc] bg-white p-3 text-[13px] outline-none focus:border-[#16855f] focus:ring-1 focus:ring-[#b9e5d2]"
            placeholder="Écrivez le message au nom de votre agence. Le prénom du client sera ajouté automatiquement lorsqu’il est disponible."
          />
        </label>
        <label className="grid gap-1 text-[12px] font-medium">
          Programmer l’envoi (facultatif)
          <input name="date" type="datetime-local" className={field} />
        </label>
        {error && (
          <p className="rounded-md bg-red-50 p-3 text-[12px] text-red-700">
            {error}
          </p>
        )}
        <button disabled={busy} className={primary}>
          {busy ? "Enregistrement…" : "Créer la campagne"}
        </button>
      </form>
    </Modal>
  );
}
function AudienceModal({
  close,
  done,
}: {
  close: () => void;
  done: () => void;
}) {
  const [countries, setCountries] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    listClients({ page_size: 500 })
      .then((data) =>
        setCountries(
          Array.from(
            new Set(
              data.items
                .map((client) => client.country)
                .filter((country): country is string => Boolean(country)),
            ),
          ).sort(),
        ),
      )
      .catch(() => setCountries([]));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await saveAudience({
        name: f.get("name"),
        audience_type: "DYNAMIC",
        workspace_id: null,
        filter_config: {
          country: f.get("country") || undefined,
          language: f.get("language") || undefined,
          status: f.get("status") || undefined,
        },
      });
      done();
    } catch {
      setError(
        "Ce groupe n’a pas été enregistré. Vérifiez son nom et les filtres choisis.",
      );
      setBusy(false);
    }
  }
  return (
    <Modal title="Créer un groupe de destinataires" close={close}>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="text-[12px] text-[#5f6873]">Nom du groupe de destinataires<input required name="name" className={`${field} mt-1 w-full`} placeholder="Ex. Clients Air Cargo récents" /></label>
        <label className="text-[12px] text-[#5f6873]">
          Pays des clients
          <select name="country" className={`${field} mt-1 w-full`}>
            <option value="">Tous les pays configurés</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-[#5f6873]">Langue préférée des clients<select name="language" className={`${field} mt-1 w-full`}><option value="">Toutes les langues</option><option value="FR">Français</option><option value="EN">Anglais</option></select></label>
        <label className="text-[12px] text-[#5f6873]">Relation actuelle avec l’agence<select name="status" className={`${field} mt-1 w-full`}><option value="">Tous les clients autorisés</option><option value="ACTIVE">Clients ayant une opération en cours</option><option value="LEAD">Nouveaux contacts à convertir</option></select></label>
        {error && (
          <p className="rounded-md bg-red-50 p-3 text-[12px] text-red-700">
            {error}
          </p>
        )}
        <button disabled={busy} className={primary}>
          {busy ? "Enregistrement…" : "Enregistrer le groupe"}
        </button>
      </form>
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
      description="Renseignez uniquement les informations utiles à l’agence."
      close={close}
    >
      {children}
    </OperationDrawer>
  );
}
function exportCampaigns(items: Campaign[]) {
  const rows = [
    ["Campagne", "Canal", "Destinataires", "Statut", "Programmation"],
    ...items.map((item) => [
      item.title,
      item.channels?.join(" + ") || "",
      item.recipients || 0,
      item.status,
      item.scheduled_at || "",
    ]),
  ];
  const blob = new Blob(
    [
      rows
        .map((row) =>
          row
            .map((value) => `"${String(value).replaceAll('"', '""')}"`)
            .join(","),
        )
        .join("\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = "broadcasts.csv";
  link.click();
  URL.revokeObjectURL(url);
}
