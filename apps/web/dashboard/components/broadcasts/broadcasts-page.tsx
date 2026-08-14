"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Download, Megaphone, Plus, Search, X } from "lucide-react";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { OperationDrawer } from "@/components/ui/operation-drawer";
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
const btn = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#d5d9dc] bg-white px-3 text-[12px] font-medium hover:bg-[#f5f6f7]",
  primary = "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#12b866] px-4 text-[12px] font-semibold text-white hover:bg-[#0da65b]",
  field = "h-9 rounded-md border border-[#d2d7dc] bg-white px-3 text-[12px] outline-none focus:border-[#16855f] focus:ring-1 focus:ring-[#b9e5d2]";
const tabs = [
  ["", "Toutes"],
  ["DRAFT", "Brouillons"],
  ["PENDING_APPROVAL", "À approuver"],
  ["SCHEDULED", "Programmées"],
  ["SENDING", "En cours"],
  ["COMPLETED", "Terminées"],
  ["FAILED", "Échouées"],
];
export function BroadcastsPage() {
  const [items, setItems] = useState<Campaign[]>([]),
    [stats, setStats] = useState<Record<string, number>>({}),
    [status, setStatus] = useState(""),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState<Campaign | null>(null),
    [modal, setModal] = useState<"campaign" | "audience" | null>(null),
    [resources, setResources] = useState<Record<string, unknown>>({}),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      listCampaigns({ q, status })
        .then((r) => {
          setItems(r.items);
          setStats(r.stats);
        })
        .catch(() => setError("Campaign Engine indisponible.")),
    [q, status],
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
            <button className={btn} onClick={() => exportCampaigns(items)}>
              <Download size={14} className="inline" /> Exporter
            </button>
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
            <button className={primary} onClick={() => setModal("campaign")}>
              <Plus size={14} className="inline" /> Nouvelle campagne
            </button>
          </>
        }
        tabs={
          <div className="flex items-end gap-1">
            {tabs.slice(0, 4).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setStatus(v)}
                className={`h-10 border-b-2 px-3 text-[12px] ${status === v ? "border-[#16855f] font-semibold text-[#126744]" : "border-transparent text-[#68717d]"}`}
              >
                {l}
              </button>
            ))}
            <select aria-label="Autres vues" value={tabs.slice(4).some(([v])=>v===status)?status:""} onChange={(e)=>setStatus(e.target.value)} className="mb-1 ml-1 h-8 rounded-md bg-[#f3f4f5] px-2 text-[12px] text-[#59636e] outline-none"><option value="">Plus</option>{tabs.slice(4).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
          </div>
        }
      />
      <section className="bg-white px-5 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
          {cards.map(([l, v]) => (
            <div
              key={l}
              className="border-l border-[#eceef1] px-4 py-1 first:border-l-0"
            >
              <small>{l}</small>
              <b className="mt-2 block text-xl">{v || 0}</b>
            </div>
          ))}
        </div>
      </section>
      <div className="flex gap-2 border-b bg-white p-4">
        <label className="flex h-9 flex-1 items-center rounded-md bg-[#f4f5f6] px-3 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#a9a3f1]">
          <Search size={14} />
          <input
            className="ml-2 flex-1 bg-transparent text-[13px] outline-none"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une campagne..."
          />
        </label>
      </div>
      {error && <p className="m-4 bg-red-50 p-3 text-red-700">{error}</p>}
      <table className="w-full bg-white text-left text-[12px]">
        <thead>
          <tr>
            {[
              "Campagne",
              "Canaux",
              "Audience",
              "Statut",
              "Programmation",
              "Performance",
            ].map((x) => (
              <th className="border-b p-3" key={x}>
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr
              onClick={() => open(x)}
              className="cursor-pointer border-b hover:bg-[#fafafa]"
              key={x.id}
            >
              <td className="p-3">
                <b>{x.title}</b>
                <small className="block">{x.reference}</small>
              </td>
              <td>{x.channels?.join(" + ")}</td>
              <td>{x.recipients || 0}</td>
              <td>{x.status}</td>
              <td>
                {x.scheduled_at
                  ? new Date(x.scheduled_at).toLocaleString("fr-FR")
                  : "—"}
              </td>
              <td>
                {x.reads || 0} lus · {x.replies || 0} réponses
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && (
        <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl">
          <button className="float-right" onClick={() => setSelected(null)}>
            <X />
          </button>
          <Megaphone />
          <h2 className="mt-3 text-xl font-semibold">{selected.title}</h2>
          <p>
            {selected.reference} · {selected.status}
          </p>
          <div className="my-5 border p-4 whitespace-pre-wrap">
            {selected.message}
          </div>
          <div className="flex flex-wrap gap-2">
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
        </aside>
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
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
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
  }
  return (
    <Modal title="Nouvelle campagne" close={close}>
      <form className="grid gap-3" onSubmit={submit}>
        <input
          required
          name="title"
          className={field}
          placeholder="Titre campagne"
        />
        <select name="objective" className={field}>
          <option value="INFORM">Informer les clients</option>
          <option value="PROMOTE">Présenter une offre</option>
          <option value="REACTIVATE">Recontacter des clients inactifs</option>
          <option value="ANNOUNCE">Faire une annonce importante</option>
        </select>
        <select name="type" className={field}>
          <option value="INFORMATIONAL">Information opérationnelle</option>
          <option value="COMMERCIAL">
            Commerciale — consentement obligatoire
          </option>
          <option value="ENGAGEMENT">Engagement</option>
        </select>
        <select name="channel" className={field}>
          <option value="WHATSAPP">WhatsApp Business connecté</option>
        </select>
        <select name="audience" className={field}>
          <option value="">Choisir les clients concernés</option>
          {((resources.audiences || []) as Array<Record<string, unknown>>).map(
            (x) => (
              <option key={String(x.id)} value={String(x.id)}>
                {String(x.name)}
              </option>
            ),
          )}
        </select>
        <textarea
          required
          name="message"
          className="min-h-36 rounded-md border border-[#d2d7dc] bg-white p-3 text-[13px] outline-none focus:border-[#16855f] focus:ring-1 focus:ring-[#b9e5d2]"
          placeholder="Écrivez le message au nom de votre agence. Le prénom du client sera ajouté automatiquement lorsqu’il est disponible."
        />
        <input name="date" type="datetime-local" className={field} />
        <button className={primary}>Créer la campagne</button>
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
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
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
  }
  return (
    <Modal title="Créer un groupe de destinataires" close={close}>
      <form className="grid gap-3" onSubmit={submit}>
        <input
          required
          name="name"
          className={field}
          placeholder="Nom interne, ex. Clients Air Cargo récents"
        />
        <label className="text-[12px] text-[#5f6873]">
          Pays des clients
          <input
            name="country"
            className={`${field} mt-1 w-full`}
            placeholder="Ex. RDC"
          />
        </label>
        <select name="language" className={field}>
          <option value="">Toutes les langues</option>
          <option>FR</option>
          <option>EN</option>
        </select>
        <select name="status" className={field}>
          <option value="">Tous les clients autorisés</option>
          <option value="ACTIVE">Clients avec activité</option>
          <option value="LEAD">Nouveaux contacts</option>
        </select>
        <button className={primary}>Enregistrer</button>
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
  return <OperationDrawer open title={title} description="Renseignez uniquement les informations utiles à l’agence." close={close}>{children}</OperationDrawer>;
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
