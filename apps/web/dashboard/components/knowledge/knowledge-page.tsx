/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileUp,
  Languages,
  Link2,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { PermissionGuard } from "@/components/permissions/permission-guard";
import {
  addKnowledgeRelation,
  createKnowledge,
  createKnowledgeConnector,
  deleteKnowledgeView,
  detectKnowledgeConflicts,
  embedKnowledge,
  generateKnowledgeSuggestions,
  getKnowledgeConflicts,
  getKnowledgeConnectors,
  getKnowledgeLiveCatalog,
  getKnowledgeSettings,
  getKnowledgeSuggestions,
  importKnowledgeFile,
  knowledgeAction,
  knowledgeAnalytics,
  knowledgeDetail,
  knowledgeStats,
  listKnowledge,
  listKnowledgeFiles,
  listKnowledgeViews,
  removeKnowledgeRelation,
  resolveKnowledgeConflict,
  restoreKnowledgeVersion,
  saveKnowledgeView,
  syncKnowledgeConnector,
  testKnowledge,
  translateKnowledge,
  updateKnowledge,
  updateKnowledgeSettings,
  uploadKnowledgeFile,
  type KnowledgeEntry,
  type KnowledgeFile,
  type KnowledgeStats,
} from "@/services/knowledge";
const btn =
    "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#d2d7dc] bg-white px-3 text-[12px] font-medium hover:bg-[#f5f6f7]",
  primary =
    "inline-flex h-9 items-center gap-2 rounded-md bg-[#12b866] px-4 text-[12px] font-semibold text-white hover:bg-[#0da65b]",
  input =
    "h-9 w-full rounded-md border border-[#d2d7dc] bg-white px-3 text-[13px] outline-none focus:border-[#1688e8]";
const statusLabels: Record<string, string> = {
  DRAFT: "Brouillon",
  PENDING_REVIEW: "À vérifier",
  APPROVED: "Validé",
  PUBLISHED: "Publié",
  NEEDS_REVIEW: "À réviser",
  EXPIRED: "Expiré",
  ARCHIVED: "Archivé",
};
const aiScopeLabels: Record<string, string> = {
  NONE: "Non utilisé par l’assistant",
  INTERNAL: "Aide réservée à l’équipe",
  CLIENT: "Réponses aux clients",
  BOTH: "Équipe et clients",
};
const categories = [
  "ALL",
  "AGENCY",
  "CONTACTS",
  "OFFICES",
  "WAREHOUSES",
  "ROUTES",
  "SERVICES",
  "PRICING",
  "GOODS",
  "RESTRICTIONS",
  "PAYMENTS",
  "INVOICING",
  "DOCUMENTS",
  "CUSTOMS",
  "DELIVERY",
  "PICKUP",
  "SUPPORT",
  "PROCEDURES",
  "SECURITY",
  "OTHER",
];
const categoryLabels: Record<string, string> = {
  ALL: "Toutes les catégories",
  AGENCY: "Informations de l’agence",
  CONTACTS: "Contacts",
  OFFICES: "Bureaux",
  WAREHOUSES: "Entrepôts",
  ROUTES: "Routes et destinations",
  SERVICES: "Services",
  PRICING: "Tarifs et conditions",
  GOODS: "Marchandises",
  RESTRICTIONS: "Produits interdits ou conditionnels",
  PAYMENTS: "Paiements",
  INVOICING: "Facturation",
  DOCUMENTS: "Documents requis",
  CUSTOMS: "Douane",
  DELIVERY: "Livraison",
  PICKUP: "Retrait",
  SUPPORT: "Service client",
  PROCEDURES: "Procédures internes",
  SECURITY: "Sécurité",
  OTHER: "Autre",
};
const typeLabels: Record<string, string> = {
  TEXT: "Information pratique",
  FAQ: "Question fréquente",
  RULE: "Règle de l’agence",
  PROCEDURE: "Procédure interne",
  POLICY: "Politique de l’agence",
  DOCUMENT: "Document",
  LIVE_REFERENCE: "Information synchronisée",
};
const audienceLabels: Record<string, string> = {
  PUBLIC: "Clients",
  CLIENT: "Clients",
  EMPLOYEES: "Toute l’équipe",
  OPERATIONS: "Opérations",
  WAREHOUSE: "Entrepôt",
  FINANCE: "Finance",
  MANAGERS: "Responsables",
  ADMINS: "Administrateurs",
};
const aiLabels: Record<string, string> = {
  NONE: "Non utilisée par l’assistant",
  INTERNAL: "Assistant interne uniquement",
  CLIENT: "Réponses aux clients",
  BOTH: "Équipe et clients",
};
const sourceLabels: Record<string, string> = {
  MANUAL: "Saisie par l’agence",
  ROUTE: "Module Routes",
  SERVICE: "Module Services",
  PRICING: "Module Tarification",
  WAREHOUSE: "Module Entrepôts",
  OFFICE: "Bureaux",
  DOCUMENT: "Document importé",
  API: "Donnée synchronisée",
  IMPORT: "Fichier importé",
};
const splitList = (value: FormDataEntryValue | null) =>
  String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const dateValue = (value?: string) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";
type View =
  | "overview"
  | "all"
  | "faq"
  | "procedures"
  | "policies"
  | "files"
  | "review"
  | "expired"
  | "trash"
  | "governance"
  | "connectors"
  | "suggestions"
  | "playground"
  | "settings"
  | "analytics";
export function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeEntry[]>([]),
    [stats, setStats] = useState<KnowledgeStats | null>(null),
    [files, setFiles] = useState<KnowledgeFile[]>([]),
    [view, setView] = useState<View>("overview"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("ALL"),
    [selected, setSelected] = useState<KnowledgeEntry | null>(null),
    [createOpen, setCreateOpen] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [a, b, c] = await Promise.all([
        listKnowledge({ limit: 200 }),
        knowledgeStats(),
        listKnowledgeFiles(),
      ]);
      setItems(a.items);
      setStats(b);
      setFiles(c);
    } catch {
      setError("La base de connaissances est indisponible.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const filtered = useMemo(
    () =>
      items.filter(
        (x) =>
          (!query ||
            `${x.title} ${x.content} ${x.tags.join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (category === "ALL" || x.category === category) &&
          (view !== "faq" || x.knowledge_type === "FAQ") &&
          (view !== "procedures" || x.knowledge_type === "PROCEDURE") &&
          (view !== "policies" ||
            ["POLICY", "RULE"].includes(x.knowledge_type)) &&
          (view !== "review" ||
            ["PENDING_REVIEW", "NEEDS_REVIEW"].includes(x.status)) &&
          (view !== "expired" || x.status === "EXPIRED"),
      ),
    [items, query, category, view],
  );
  async function choose(item: KnowledgeEntry) {
    setSelected(await knowledgeDetail(item.id));
  }
  const cards = [
    ["Knowledge Health", `${stats?.health || 0}%`],
    ["Connaissances actives", stats?.active || 0],
    ["FAQ", stats?.faq || 0],
    ["Procédures", stats?.procedures || 0],
    ["Règles métier", stats?.rules || 0],
    ["À vérifier", stats?.needs_review || 0],
    ["Expirées", stats?.expired || 0],
    ["Questions sans réponse", stats?.unanswered || 0],
  ];
  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <OperationPageHeader
        title="Base de connaissances"
        description="Centralisez les informations utilisées par vos équipes et l’IA Slaivio, sans dupliquer les données métier."
        actions={
          <>
            <button className={btn} onClick={load}>
              <RefreshCcw size={14} />
              Synchroniser
            </button>
            <PermissionGuard permission="knowledge.create">
              <button className={btn} onClick={() => setImportOpen(true)}>
                <FileUp size={14} />
                Importer
              </button>
              <button className={primary} onClick={() => setCreateOpen(true)}>
                <Plus size={15} />
                Ajouter une connaissance
              </button>
            </PermissionGuard>
          </>
        }
        tabs={
          <>
            {(
              [
                ["overview", "Vue d’ensemble"],
                ["all", "Toutes"],
                ["faq", "FAQ clients"],
                ["procedures", "Procédures"],
                ["policies", "Règles"],
                ["files", "Fichiers"],
                ["review", "À vérifier"],
                ["expired", "Expirées"],
                ["playground", "Tester mon IA"],
                ["analytics", "Analytics"],
              ] as const
            )
              .slice(0, 4)
              .map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setView(k)}
                  className={`h-10 shrink-0 border-b-2 px-3 text-[12px] ${view === k ? "border-[#12c76f] font-semibold text-[#067a45]" : "border-transparent text-[#526071] hover:bg-[#f2f4f7]"}`}
                >
                  {l}
                </button>
              ))}
            <select
              aria-label="Autres vues"
              value={
                [
                  "policies",
                  "files",
                  "review",
                  "expired",
                  "playground",
                  "analytics",
                ].includes(view)
                  ? view
                  : ""
              }
              onChange={(e) => setView(e.target.value as View)}
              className="mb-1 ml-1 h-8 rounded-md bg-[#f3f4f5] px-2 text-[12px] text-[#59636e] outline-none"
            >
              <option value="">Plus</option>
              <option value="policies">Règles</option>
              <option value="files">Fichiers</option>
              <option value="review">À vérifier</option>
              <option value="expired">Expirées</option>
              <option value="playground">Tester mon IA</option>
              <option value="analytics">Analytics</option>
            </select>
          </>
        }
      />
      <section className="bg-white px-5 py-4">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {cards.slice(0, 4).map(([l, v]) => (
            <Metric key={String(l)} label={String(l)} value={v} />
          ))}
        </div>
      </section>
      {error && (
        <p className="m-4 border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
          {error}
        </p>
      )}
      {view === "playground" ? (
        <Playground />
      ) : view === "analytics" ? (
        <Analytics />
      ) : view === "files" ? (
        <Files items={files} />
      ) : (
        <main>
          <section>
            <div className="flex flex-wrap gap-2 border-b bg-white p-4">
              <label className="flex h-9 min-w-[280px] flex-1 items-center rounded-md bg-[#f4f5f6] px-3 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#a9a3f1]">
                <Search size={15} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Titre, contenu, tag, route, service…"
                  className="ml-2 flex-1 bg-transparent text-[13px] outline-none"
                />
              </label>
              <select
                className={`${input} w-52`}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "ALL"
                      ? "Toutes les catégories"
                      : categoryLabels[c] || c}
                  </option>
                ))}
              </select>
            </div>
            {loading ? (
              <p className="p-16 text-center text-[13px]">Chargement…</p>
            ) : (
              <KnowledgeTable items={filtered} select={choose} />
            )}
          </section>
        </main>
      )}
      {selected && (
        <Detail
          item={selected}
          close={() => setSelected(null)}
          changed={async () => {
            setSelected(null);
            await load();
          }}
        />
      )}
      {createOpen && (
        <Create
          close={() => setCreateOpen(false)}
          done={async () => {
            setCreateOpen(false);
            await load();
          }}
        />
      )}
      {importOpen && (
        <Import
          close={() => setImportOpen(false)}
          done={async () => {
            setImportOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}
function KnowledgeTable({
  items,
  select,
}: {
  items: KnowledgeEntry[];
  select: (i: KnowledgeEntry) => void;
}) {
  return (
    <div className="min-h-[460px] overflow-x-auto bg-white">
      <table className="w-full min-w-[1050px] border-collapse text-left text-[13px]">
        <thead className="bg-[#fbfcfd] text-[#5f6b7a]">
          <tr className="border-b border-[#e6e9ee]">
            {[
              "Connaissance",
              "Type / catégorie",
              "Source",
              "Visible par",
              "Statut",
              "Utilisation par l’assistant",
              "Responsable",
              "Mise à jour",
              "",
            ].map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr
              key={x.id}
              onClick={() => select(x)}
              className="cursor-pointer border-b border-[#edf0f3] hover:bg-[#f7faf9]"
            >
              <td className="max-w-[330px] px-4 py-3">
                <b className="block truncate">{x.title}</b>
                <small className="block truncate text-[#737b84]">
                  {x.content}
                </small>
              </td>
              <td>
                {typeLabels[x.knowledge_type] || x.knowledge_type}
                <small className="block text-[#737b84]">
                  {categoryLabels[x.category] || x.category}
                </small>
              </td>
              <td>{sourceLabels[x.source_type] || x.source_type}</td>
              <td>
                {x.audiences.map((a) => audienceLabels[a] || a).join(", ")}
              </td>
              <td>
                <Badge value={x.status} />
              </td>
              <td>{aiLabels[x.ai_scope] || x.ai_scope}</td>
              <td>{x.owner_name || "Non assigné"}</td>
              <td>
                {new Date(x.updated_at).toLocaleDateString("fr-FR")}
                <small className="block text-[#737b84]">
                  Version {x.version}
                </small>
              </td>
              <td className="pr-4 text-right text-[#7b848d]">
                <ChevronRight size={17} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && (
        <div className="grid min-h-72 place-items-center text-center">
          <div>
            <BookOpen className="mx-auto text-[#8e969e]" />
            <p className="mt-3 text-[13px] font-medium">
              Aucune connaissance dans cette vue
            </p>
            <p className="text-[12px] text-[#737b84]">
              Ajoutez un contenu officiel ou changez vos filtres.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
function Detail({
  item,
  close,
  changed,
}: {
  item: KnowledgeEntry;
  close: () => void;
  changed: () => Promise<void>;
}) {
  async function action(name: string) {
    const reason = ["archive", "request-review"].includes(name)
      ? prompt("Motif") || undefined
      : undefined;
    try {
      await knowledgeAction(item.id, name, reason);
      await changed();
    } catch {
      alert("Cette transition n’est pas autorisée dans l’état actuel.");
    }
  }
  return (
    <OperationDrawer
      open
      title={item.title}
      description={item.reference}
      close={close}
    >
      <div className="mb-4 flex gap-2">
        <Badge value={item.status} />
        <span className="rounded-full bg-[#f0f2f3] px-2 py-1 text-[10px]">
          {aiScopeLabels[item.ai_scope] || item.ai_scope}
        </span>
      </div>
      <div className="space-y-4">
        <section className="rounded-md bg-white p-4">
          <h3 className="text-[13px] font-semibold">Contenu officiel</h3>
          <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6">
            {item.content || "Référence vers une donnée métier structurée."}
          </p>
        </section>
        <section className="grid grid-cols-2 gap-3">
          <Info
            label="Type"
            value={typeLabels[item.knowledge_type] || item.knowledge_type}
          />
          <Info
            label="Catégorie"
            value={categoryLabels[item.category] || item.category}
          />
          <Info
            label="Source de vérité"
            value={sourceLabels[item.source_type] || item.source_type}
          />
          <Info label="Langue" value={item.language} />
          <Info
            label="Audience"
            value={item.audiences
              .map((audience) => audienceLabels[audience] || audience)
              .join(", ")}
          />
          <Info label="Responsable" value={item.owner_name || "Non assigné"} />
        </section>
        {item.sensitive && (
          <p className="border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
            <ShieldCheck size={14} className="mr-2 inline" />
            Contenu sensible : jamais accessible à l’IA client.
          </p>
        )}
        <section className="rounded-md bg-white p-4">
          <h3 className="text-[13px] font-semibold">Versions</h3>
          {item.versions?.map((v) => (
            <p key={v.id} className="mt-2 border-t pt-2 text-[12px]">
              v{v.version} · {v.change_reason || "Modification"}
              <small className="block text-[#737b84]">
                {v.created_by_name || "Système"} ·{" "}
                {new Date(v.created_at).toLocaleString("fr-FR")}
              </small>
            </p>
          ))}
        </section>
        <div className="flex flex-wrap gap-2">
          <PermissionGuard permission="knowledge.update">
            {["DRAFT", "NEEDS_REVIEW"].includes(item.status) && (
              <button className={primary} onClick={() => action("submit")}>
                Soumettre
              </button>
            )}
          </PermissionGuard>
          <PermissionGuard permission="knowledge.review">
            {["PENDING_REVIEW", "NEEDS_REVIEW"].includes(item.status) && (
              <button className={primary} onClick={() => action("approve")}>
                <CheckCircle2 size={14} />
                Valider
              </button>
            )}
          </PermissionGuard>
          <PermissionGuard permission="knowledge.publish">
            {item.status === "APPROVED" && (
              <button className={primary} onClick={() => action("publish")}>
                Publier
              </button>
            )}
            {item.status === "PUBLISHED" && (
              <button className={btn} onClick={() => action("unpublish")}>
                Dépublier
              </button>
            )}
          </PermissionGuard>
          <PermissionGuard permission="knowledge.archive">
            {item.status !== "ARCHIVED" ? (
              <button className={btn} onClick={() => action("archive")}>
                <Archive size={14} />
                Archiver
              </button>
            ) : (
              <button className={btn} onClick={() => action("restore")}>
                Restaurer
              </button>
            )}
          </PermissionGuard>
        </div>
      </div>
    </OperationDrawer>
  );
}
function Create({ close, done }: { close: () => void; done: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sourceType, setSourceType] = useState("MANUAL"),
    [liveCatalog, setLiveCatalog] = useState<
      Record<string, Array<Record<string, unknown>>>
    >({});
  useEffect(() => {
    getKnowledgeLiveCatalog()
      .then(setLiveCatalog)
      .catch(() => setLiveCatalog({}));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await createKnowledge({
        title: f.get("title"),
        knowledge_type: f.get("knowledge_type"),
        category: f.get("category"),
        content: f.get("content"),
        language: f.get("language"),
        audiences: [String(f.get("audiences") || "EMPLOYEES")],
        ai_scope: f.get("ai_scope"),
        source_type: f.get("source_type"),
        source_entity_type: f.get("source_entity_type") || null,
        source_entity_id: f.get("source_entity_id") || null,
        tags: String(f.get("tags") || "")
          .split(",")
          .filter(Boolean)
          .map((x) => x.trim()),
        owner_name: f.get("owner_name"),
        sensitive: f.get("sensitive") === "on",
      });
      done();
    } catch {
      setError(
        "La connaissance n’a pas été enregistrée. Vérifiez les champs obligatoires.",
      );
      setBusy(false);
    }
  }
  return (
    <Modal title="Ajouter une connaissance" close={close}>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <Field name="title" label="Titre visible par l’équipe" required />
        <label className="text-[12px] font-medium">
          Quel contenu ajoutez-vous ?
          <select name="knowledge_type" className={`${input} mt-1`}>
            {Object.entries(typeLabels)
              .filter(([k]) => k !== "DOCUMENT")
              .map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
          </select>
        </label>
        <label className="text-[12px] font-medium">
          Sujet concerné
          <select name="category" className={`${input} mt-1`}>
            {categories.slice(1).map((x) => (
              <option key={x} value={x}>
                {categoryLabels[x] || x}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-medium">
          D’où vient cette information ?
          <select
            name="source_type"
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value)}
            className={`${input} mt-1`}
          >
            {[
              "MANUAL",
              "ROUTE",
              "SERVICE",
              "PRICING",
              "WAREHOUSE",
              "OFFICE",
              "DOCUMENT",
            ].map((x) => (
              <option key={x} value={x}>
                {sourceLabels[x]}
              </option>
            ))}
          </select>
        </label>
        {["ROUTE", "SERVICE", "WAREHOUSE", "OFFICE"].includes(sourceType) && (
          <label className="text-[12px] font-medium">
            Information configurée dans l’agence
            <input type="hidden" name="source_entity_type" value={sourceType} />
            <select
              required
              name="source_entity_id"
              className={`${input} mt-1`}
            >
              <option value="">Choisir l’élément existant</option>
              {(
                liveCatalog[
                  (
                    {
                      ROUTE: "routes",
                      SERVICE: "services",
                      WAREHOUSE: "warehouses",
                      OFFICE: "offices",
                    } as Record<string, string>
                  )[sourceType]
                ] || []
              ).map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {String(
                    row.route_name ||
                      row.service_name ||
                      row.name ||
                      row.title ||
                      row.code ||
                      "Élément configuré",
                  )}
                </option>
              ))}
            </select>
          </label>
        )}
        {sourceType === "PRICING" && (
          <p className="rounded-md bg-blue-50 p-3 text-[11px] text-blue-800">
            Le tarif ne sera pas copié ici. L’assistant consultera toujours le
            moteur Tarification au moment de calculer un prix.
          </p>
        )}
        <label className="text-[12px] font-medium">
          Qui peut la consulter ?
          <select className={`${input} mt-1`} name="audiences">
            <option value="EMPLOYEES">Toute l’équipe</option>
            <option value="PUBLIC">Clients et équipe</option>
            <option value="OPERATIONS">Équipe opérations</option>
            <option value="WAREHOUSE">Équipe entrepôt</option>
            <option value="FINANCE">Équipe finance</option>
            <option value="MANAGERS">Responsables uniquement</option>
          </select>
        </label>
        <label className="text-[12px] font-medium">
          L’assistant peut-il l’utiliser ?
          <select className={`${input} mt-1`} name="ai_scope">
            <option value="NONE">Non</option>
            <option value="INTERNAL">Pour aider les employés</option>
            <option value="CLIENT">Pour répondre aux clients</option>
            <option value="BOTH">Pour les employés et les clients</option>
          </select>
        </label>
        <label className="text-[12px] font-medium">
          Langue
          <select className={`${input} mt-1`} name="language">
            <option value="FR">Français</option>
            <option value="EN">English</option>
          </select>
        </label>
        <Field
          name="owner_name"
          label="Personne responsable de la mise à jour"
        />
        <Field name="tags" label="Mots-clés pour la recherche" />
        <label className="flex items-center gap-2 pt-6 text-[12px]">
          <input type="checkbox" name="sensitive" />
          Information interne confidentielle
        </label>
        <label className="md:col-span-2 text-[12px] font-medium">
          Information officielle
          <textarea
            name="content"
            rows={8}
            className="mt-1 w-full rounded-md border border-[#d2d7dc] p-3 text-[13px] outline-none focus:border-[#16855f]"
            placeholder="Écrivez ici la réponse, la règle ou la procédure telle que l’équipe doit l’appliquer."
          />
        </label>
        {error && <p className="md:col-span-2 text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 md:col-span-2">
          <button type="button" className={btn} onClick={close}>
            Annuler
          </button>
          <button disabled={busy} className={primary}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Import({ close, done }: { close: () => void; done: () => void }) {
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload() {
    if (!file) {
      setError("Sélectionnez un fichier.");
      return;
    }
    setBusy(true);
    try {
      await uploadKnowledgeFile(file);
      done();
    } catch {
      setError(
        "Import refusé : type, taille, doublon, stockage ou extraction.",
      );
      setBusy(false);
    }
  }
  return (
    <Modal title="Importer une source" close={close}>
      <div className="border border-dashed p-8 text-center">
        <FileUp className="mx-auto text-[#77808a]" />
        <p className="mt-3 text-[13px]">
          PDF, Word, Excel, CSV, TXT, JPG, PNG ou WebP · 20 Mo maximum
        </p>
        <input
          className="mt-4 text-[12px]"
          type="file"
          accept=".pdf,.docx,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <p className="mt-3 text-[11px] text-[#737b84]">
          PDF et images restent à vérifier avant toute indexation IA. Aucun
          import n’est publié automatiquement.
        </p>
      </div>
      {error && <p className="mt-3 text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={btn} onClick={close}>
          Annuler
        </button>
        <button className={primary} disabled={busy} onClick={upload}>
          {busy ? "Téléversement…" : "Importer"}
        </button>
      </div>
    </Modal>
  );
}
function Files({ items }: { items: KnowledgeFile[] }) {
  const [selected, setSelected] = useState<KnowledgeFile | null>(null);
  return (
    <div className="p-4">
      <section className="overflow-hidden border bg-white">
        <header className="border-b p-4">
          <h2 className="text-[14px] font-semibold">Sources importées</h2>
          <p className="text-[12px] text-[#737b84]">
            Contrôle antivirus, OCR, validation humaine et mapping avant
            création d’une connaissance.
          </p>
        </header>
        {items.map((x) => (
          <div
            key={x.id}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b p-4 text-[12px]"
          >
            <div>
              <b>{x.file_name}</b>
              <small className="block text-[#737b84]">
                {x.mime_type} · {(x.size_bytes / 1024).toFixed(1)} Ko ·
                confiance{" "}
                {x.confidence == null
                  ? "—"
                  : `${Math.round(x.confidence * 100)} %`}
              </small>
            </div>
            <span>{x.extraction_status}</span>
            <span
              className={
                x.prompt_injection_detected
                  ? "text-red-600"
                  : "text-emerald-700"
              }
            >
              {x.prompt_injection_detected
                ? "Révision sécurité"
                : "Antivirus validé"}
            </span>
            <PermissionGuard permission="knowledge.create">
              <button
                disabled={
                  x.import_status === "IMPORTED" || x.prompt_injection_detected
                }
                className={btn}
                onClick={() => setSelected(x)}
              >
                {x.import_status === "IMPORTED"
                  ? "Importé"
                  : "Vérifier et mapper"}
              </button>
            </PermissionGuard>
          </div>
        ))}
        {!items.length && (
          <p className="p-12 text-center text-[13px]">Aucun fichier importé.</p>
        )}
      </section>
      {selected && (
        <ImportValidation file={selected} close={() => setSelected(null)} />
      )}
    </div>
  );
}
function ImportValidation({
  file,
  close,
}: {
  file: KnowledgeFile;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await importKnowledgeFile(file.id, {
        title: f.get("title"),
        knowledge_type: f.get("knowledge_type"),
        category: f.get("category"),
        content: f.get("content"),
        tags: splitList(f.get("tags")),
        language: f.get("language"),
        audiences: splitList(f.get("audiences")).map((x) => x.toUpperCase()),
        owner_name: f.get("owner_name"),
        review_interval_days:
          Number(f.get("review_interval_days")) || undefined,
        sensitive: f.get("sensitive") === "on",
      });
      location.reload();
    } catch {
      setError(
        "La validation a échoué. Vérifiez le contenu extrait et les règles de sécurité.",
      );
      setBusy(false);
    }
  }
  return (
    <Modal title="Valider et mapper la source" close={close}>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <Field
          name="title"
          label="Titre officiel"
          required
          defaultValue={file.file_name.replace(/\.[^.]+$/, "")}
        />
        <label>
          Type
          <select name="knowledge_type" className={input}>
            <option>DOCUMENT</option>
            <option>FAQ</option>
            <option>PROCEDURE</option>
            <option>RULE</option>
            <option>POLICY</option>
          </select>
        </label>
        <label>
          Catégorie
          <select name="category" className={input}>
            {categories.slice(1).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <Field name="language" label="Langue" defaultValue="FR" />
        <Field name="audiences" label="Audiences" defaultValue="EMPLOYEES" />
        <Field name="owner_name" label="Responsable" />
        <Field name="tags" label="Tags" />
        <Field name="review_interval_days" label="Révision (jours)" />
        <label className="md:col-span-2">
          Texte extrait et corrigé
          <textarea
            name="content"
            required
            rows={14}
            defaultValue={file.extracted_text || ""}
            className="w-full rounded-md border p-3 text-[12px] leading-5"
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="sensitive" />
          Contenu sensible
        </label>
        {error && <p className="md:col-span-2 text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 md:col-span-2">
          <button type="button" className={btn} onClick={close}>
            Annuler
          </button>
          <button className={primary} disabled={busy}>
            {busy ? "Import…" : "Créer le brouillon contrôlé"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Playground() {
  const [q, setQ] = useState(""),
    [result, setResult] = useState<{
      decision: string;
      answer: string;
      sources: Array<{
        id: string;
        reference: string;
        title: string;
        source_type: string;
        updated_at: string;
      }>;
    } | null>(null),
    [busy, setBusy] = useState(false);
  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      setResult(await testKnowledge(q));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid gap-4 p-4 xl:grid-cols-[1fr_360px]">
      <section className="border bg-white p-5">
        <div className="flex items-center gap-2">
          <Sparkles size={17} />
          <h2 className="font-semibold">Tester mon IA</h2>
        </div>
        <p className="mt-1 text-[12px] text-[#737b84]">
          Prévisualisez une réponse et contrôlez exactement les sources
          utilisées.
        </p>
        <textarea
          rows={5}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ex. Où se trouve notre entrepôt de Guangzhou ?"
          className="mt-5 w-full rounded-md border p-3 text-[13px]"
        />
        <button onClick={run} disabled={busy} className={`${primary} mt-3`}>
          {busy ? "Recherche…" : "Tester la réponse"}
        </button>
        {result && (
          <section className="mt-6 border p-4">
            <Badge value={result.decision} />
            <p className="mt-4 whitespace-pre-wrap text-[13px] leading-6">
              {result.answer}
            </p>
          </section>
        )}
      </section>
      <aside className="border bg-white p-5">
        <h3 className="text-[13px] font-semibold">Sources citées</h3>
        {result?.sources.map((s) => (
          <div key={s.id} className="mt-3 border-t pt-3 text-[12px]">
            <b>{s.title}</b>
            <small className="block text-[#737b84]">
              {s.reference} · {s.source_type}
            </small>
          </div>
        ))}
        {result && !result.sources.length && (
          <p className="mt-4 text-[12px] text-[#737b84]">
            Aucune source officielle. La réponse bascule vers l’escalade
            humaine.
          </p>
        )}
      </aside>
    </main>
  );
}
function Analytics() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof knowledgeAnalytics>
  > | null>(null);
  useEffect(() => {
    knowledgeAnalytics()
      .then(setData)
      .catch(() => undefined);
  }, []);
  return (
    <main className="grid gap-4 p-4 lg:grid-cols-3">
      <section className="border bg-white p-4">
        <h3 className="font-semibold">Résolution IA · 30 jours</h3>
        {data?.decisions.map((x) => (
          <p key={x.decision} className="mt-3 flex justify-between text-[12px]">
            <span>{x.decision}</span>
            <b>{x.count}</b>
          </p>
        ))}
      </section>
      <section className="border bg-white p-4">
        <h3 className="font-semibold">Connaissances les plus utilisées</h3>
        {data?.top.map((x) => (
          <p key={x.id} className="mt-3 flex justify-between text-[12px]">
            <span className="truncate">{x.title}</span>
            <b>{x.usage_count}</b>
          </p>
        ))}
      </section>
      <section className="border bg-white p-4">
        <h3 className="font-semibold">Questions sans réponse</h3>
        {data?.unanswered.map((x, i) => (
          <p key={i} className="mt-3 border-t pt-3 text-[12px]">
            {x.question}
            <b className="float-right">{x.occurrences}×</b>
          </p>
        ))}
      </section>
    </main>
  );
}
export function KnowledgeFinalizationPanel() {
  const [mode, setMode] = useState<"views" | "live">("views"),
    [views, setViews] = useState<
      Array<{ id: string; name: string; filters: Record<string, unknown> }>
    >([]),
    [live, setLive] = useState<Record<string, Array<Record<string, unknown>>>>(
      {},
    ),
    [name, setName] = useState("");
  async function load(next = mode) {
    setMode(next);
    if (next === "views") setViews(await listKnowledgeViews());
    else setLive(await getKnowledgeLiveCatalog());
  }
  useEffect(() => {
    void load("views");
  }, []);
  return (
    <section className="mx-4 mt-4 border bg-white">
      <header className="flex items-center gap-2 border-b p-3">
        <b className="mr-auto text-[13px]">Outils de gouvernance</b>
        <button className={btn} onClick={() => void load("views")}>
          <Save size={14} />
          Vues enregistrées
        </button>
        <button className={btn} onClick={() => void load("live")}>
          <Link2 size={14} />
          Sources métier live
        </button>
      </header>
      {mode === "views" ? (
        <div className="p-4">
          <div className="flex max-w-xl gap-2">
            <input
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom de la vue"
            />
            <button
              className={primary}
              disabled={!name.trim()}
              onClick={async () => {
                await saveKnowledgeView(name, {
                  status: "PUBLISHED",
                  ai_scope: "BOTH",
                });
                setName("");
                await load("views");
              }}
            >
              Enregistrer la vue IA publiée
            </button>
          </div>
          {views.map((v) => (
            <div
              key={v.id}
              className="mt-3 flex items-center border-t pt-3 text-[12px]"
            >
              <div className="flex-1">
                <b>{v.name}</b>
                <small className="block text-[#737b84]">
                  {JSON.stringify(v.filters)}
                </small>
              </div>
              <button
                className={btn}
                onClick={async () => {
                  await deleteKnowledgeView(v.id);
                  await load("views");
                }}
              >
                <Trash2 size={13} />
                Supprimer
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(live).map(([source, rows]) => (
            <section key={source} className="border p-4">
              <h3 className="text-[13px] font-semibold">{source}</h3>
              <p className="mt-1 text-[11px] text-[#737b84]">
                Source de vérité dynamique · {rows.length} élément(s)
              </p>
              {rows.slice(0, 5).map((row, i) => (
                <p key={i} className="mt-2 truncate border-t pt-2 text-[11px]">
                  {String(
                    row.name ||
                      row.title ||
                      row.reference ||
                      row.id ||
                      "Élément métier",
                  )}
                </p>
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
export function KnowledgeManagementWorkbench() {
  const [entry, setEntry] = useState<KnowledgeEntry | null>(null),
    [id, setId] = useState(""),
    [message, setMessage] = useState("");
  async function open() {
    try {
      setEntry(await knowledgeDetail(id.trim()));
      setMessage("");
    } catch {
      setMessage("Connaissance introuvable ou non autorisée.");
    }
  }
  return (
    <section className="mx-4 mt-4 border bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b p-3">
        <b className="mr-auto text-[13px]">Atelier d’administration</b>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          className={`${input} w-72`}
          placeholder="UUID de la connaissance"
        />
        <button className={btn} onClick={open}>
          Ouvrir la fiche complète
        </button>
      </header>
      {message && <p className="p-4 text-[12px] text-red-600">{message}</p>}
      {entry && (
        <div className="grid gap-4 p-4 xl:grid-cols-[1fr_300px]">
          <EditKnowledge
            item={entry}
            cancel={() => setEntry(null)}
            done={async () => setEntry(await knowledgeDetail(entry.id))}
          />
          <aside className="space-y-3">
            <section className="border p-3">
              <h3 className="text-[12px] font-semibold">Traduction et index</h3>
              <button
                className={`${btn} mt-3 w-full`}
                onClick={async () => {
                  await translateKnowledge(
                    entry.id,
                    entry.language === "FR" ? "EN" : "FR",
                  );
                  setMessage("Traduction créée en brouillon à vérifier.");
                }}
              >
                <Languages size={13} />
                Traduire en {entry.language === "FR" ? "EN" : "FR"}
              </button>
              <button
                className={`${btn} mt-2 w-full`}
                onClick={async () => {
                  await embedKnowledge(entry.id);
                  setMessage("Index hybride actualisé.");
                }}
              >
                <Sparkles size={13} />
                Réindexer
              </button>
            </section>
            <section className="border p-3">
              <h3 className="text-[12px] font-semibold">Versions</h3>
              {entry.versions?.map((v) => (
                <div key={v.id} className="mt-2 border-t pt-2 text-[11px]">
                  <b>v{v.version}</b> · {v.change_reason || "Modification"}
                  <button
                    disabled={v.version === entry.version}
                    className={`${btn} mt-2 w-full`}
                    onClick={async () => {
                      await restoreKnowledgeVersion(entry.id, v.version);
                      setEntry(await knowledgeDetail(entry.id));
                    }}
                  >
                    <RotateCcw size={12} />
                    Restaurer cette version
                  </button>
                </div>
              ))}
            </section>
            <RelationEditor
              item={entry}
              changed={async () => setEntry(await knowledgeDetail(entry.id))}
            />
          </aside>
        </div>
      )}
    </section>
  );
}
function EditKnowledge({
  item,
  cancel,
  done,
}: {
  item: KnowledgeEntry;
  cancel: () => void;
  done: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await updateKnowledge(item.id, {
        expected_version: item.version,
        change_reason: f.get("change_reason"),
        title: f.get("title"),
        knowledge_type: f.get("knowledge_type"),
        category: f.get("category"),
        content: f.get("content"),
        question_variants: splitList(f.get("question_variants")),
        tags: splitList(f.get("tags")),
        language: f.get("language"),
        audiences: splitList(f.get("audiences")).map((x) => x.toUpperCase()),
        ai_scope: f.get("ai_scope"),
        source_type: f.get("source_type"),
        owner_name: f.get("owner_name"),
        effective_at: f.get("effective_at") || undefined,
        expires_at: f.get("expires_at") || undefined,
        review_due_at: f.get("review_due_at") || undefined,
        review_interval_days:
          Number(f.get("review_interval_days")) || undefined,
        sensitive: f.get("sensitive") === "on",
      });
      await done();
    } catch {
      setError(
        "Modification refusée ou conflit de version. Rechargez la fiche.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 border p-4 md:grid-cols-2">
      <h3 className="md:col-span-2 text-[14px] font-semibold">
        Modifier {item.reference}
      </h3>
      <Field name="title" label="Titre" required defaultValue={item.title} />
      <label>
        Type
        <select
          name="knowledge_type"
          defaultValue={item.knowledge_type}
          className={input}
        >
          {[
            "TEXT",
            "FAQ",
            "RULE",
            "PROCEDURE",
            "POLICY",
            "DOCUMENT",
            "LIVE_REFERENCE",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Catégorie
        <select name="category" defaultValue={item.category} className={input}>
          {categories.slice(1).map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Source
        <select
          name="source_type"
          defaultValue={item.source_type}
          className={input}
        >
          {[
            "MANUAL",
            "ROUTE",
            "SERVICE",
            "PRICING",
            "WAREHOUSE",
            "OFFICE",
            "DOCUMENT",
            "API",
            "IMPORT",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <Field name="language" label="Langue" defaultValue={item.language} />
      <Field
        name="owner_name"
        label="Responsable"
        defaultValue={item.owner_name}
      />
      <Field
        name="audiences"
        label="Audiences"
        defaultValue={item.audiences.join(", ")}
      />
      <label>
        Portée IA
        <select name="ai_scope" defaultValue={item.ai_scope} className={input}>
          {["NONE", "INTERNAL", "CLIENT", "BOTH"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <Field name="tags" label="Tags" defaultValue={item.tags.join(", ")} />
      <Field
        name="question_variants"
        label="Variantes de question"
        defaultValue={item.question_variants.join(", ")}
      />
      <Field
        name="effective_at"
        label="Date d’effet"
        defaultValue={dateValue(item.effective_at)}
      />
      <Field
        name="expires_at"
        label="Expiration"
        defaultValue={dateValue(item.expires_at)}
      />
      <Field
        name="review_due_at"
        label="Prochaine révision"
        defaultValue={dateValue(item.review_due_at)}
      />
      <Field
        name="review_interval_days"
        label="Cycle de révision (jours)"
        defaultValue={
          item.review_interval_days
            ? String(item.review_interval_days)
            : undefined
        }
      />
      <label className="md:col-span-2">
        Contenu
        <textarea
          name="content"
          rows={12}
          defaultValue={item.content}
          className="w-full rounded-md border p-3 text-[12px]"
        />
      </label>
      <Field name="change_reason" label="Motif de la modification" required />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="sensitive"
          defaultChecked={item.sensitive}
        />
        Contenu sensible
      </label>
      {error && <p className="md:col-span-2 text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 md:col-span-2">
        <button type="button" className={btn} onClick={cancel}>
          Fermer
        </button>
        <button className={primary} disabled={busy}>
          <Save size={13} />
          {busy ? "Enregistrement…" : "Enregistrer une nouvelle version"}
        </button>
      </div>
    </form>
  );
}
function RelationEditor({
  item,
  changed,
}: {
  item: KnowledgeEntry;
  changed: () => Promise<unknown>;
}) {
  const [type, setType] = useState("ROUTE"),
    [entity, setEntity] = useState("");
  return (
    <section className="border p-3">
      <h3 className="text-[12px] font-semibold">Relations métier</h3>
      {item.relations?.map((r) => (
        <div key={r.id} className="mt-2 flex border-t pt-2 text-[11px]">
          <span className="flex-1 truncate">
            {r.entity_type} · {r.entity_id}
          </span>
          <button
            onClick={async () => {
              await removeKnowledgeRelation(item.id, r.id);
              await changed();
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <select
        className={`${input} mt-3`}
        value={type}
        onChange={(e) => setType(e.target.value)}
      >
        {[
          "ROUTE",
          "SERVICE",
          "WAREHOUSE",
          "OFFICE",
          "COUNTRY",
          "CLIENT_SEGMENT",
        ].map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <input
        className={`${input} mt-2`}
        value={entity}
        onChange={(e) => setEntity(e.target.value)}
        placeholder="Identifiant métier"
      />
      <button
        disabled={!entity.trim()}
        className={`${btn} mt-2 w-full`}
        onClick={async () => {
          await addKnowledgeRelation(item.id, {
            entity_type: type,
            entity_id: entity,
            relation_type: "APPLIES_TO",
          });
          setEntity("");
          await changed();
        }}
      >
        <Link2 size={12} />
        Ajouter la relation
      </button>
    </section>
  );
}
export function KnowledgeSettingsConsole() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(
      null,
    ),
    [message, setMessage] = useState("");
  useEffect(() => {
    getKnowledgeSettings()
      .then(setSettings)
      .catch(() => undefined);
  }, []);
  if (!settings) return null;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const updated = await updateKnowledgeSettings({
      client_ai_enabled: f.get("client_ai_enabled") === "on",
      internal_ai_enabled: f.get("internal_ai_enabled") === "on",
      default_language: f.get("default_language"),
      response_tone: f.get("response_tone"),
      escalation_topics: splitList(f.get("escalation_topics")).map((x) =>
        x.toUpperCase(),
      ),
      system_rules: splitList(f.get("system_rules")).map((x) =>
        x.toUpperCase(),
      ),
      client_fallback_message: f.get("client_fallback_message"),
      retention_days: Number(f.get("retention_days")),
    });
    setSettings(updated as Record<string, unknown>);
    setMessage("Politique IA enregistrée et auditée.");
  }
  return (
    <PermissionGuard permission="knowledge.manage">
      <section className="mx-4 mt-4 border bg-white">
        <header className="border-b p-4">
          <h2 className="text-[14px] font-semibold">IA & comportement</h2>
          <p className="text-[12px] text-[#737b84]">
            Contrôlez précisément les réponses, escalades et règles applicables
            à l’agence.
          </p>
        </header>
        <form onSubmit={submit} className="grid gap-3 p-4 md:grid-cols-2">
          <label>
            Langue par défaut
            <select
              className={input}
              name="default_language"
              defaultValue={String(settings.default_language || "FR")}
            >
              <option>FR</option>
              <option>EN</option>
            </select>
          </label>
          <label>
            Ton
            <select
              className={input}
              name="response_tone"
              defaultValue={String(settings.response_tone || "PROFESSIONAL")}
            >
              <option>PROFESSIONAL</option>
              <option>WARM</option>
              <option>DIRECT</option>
              <option>PREMIUM</option>
            </select>
          </label>
          <Field
            name="escalation_topics"
            label="Sujets à escalader"
            defaultValue={
              Array.isArray(settings.escalation_topics)
                ? settings.escalation_topics.join(", ")
                : "CUSTOMS, DISPUTE, NEGOTIATED_PRICE, PROHIBITED_GOODS"
            }
          />
          <Field
            name="system_rules"
            label="Règles système"
            defaultValue={
              Array.isArray(settings.system_rules)
                ? settings.system_rules.join(", ")
                : "USE_AGENCY_NAME, NEVER_INVENT_PRICE, NEVER_PROMISE_UNCONFIRMED_DATE"
            }
          />
          <Field
            name="retention_days"
            label="Rétention des journaux (jours)"
            defaultValue={String(settings.retention_days || 365)}
          />
          <label className="flex items-center gap-2 pt-6">
            <input
              name="client_ai_enabled"
              type="checkbox"
              defaultChecked={Boolean(settings.client_ai_enabled)}
            />
            IA client autorisée
          </label>
          <label className="flex items-center gap-2">
            <input
              name="internal_ai_enabled"
              type="checkbox"
              defaultChecked={Boolean(settings.internal_ai_enabled)}
            />
            IA interne autorisée
          </label>
          <label className="md:col-span-2">
            Réponse sûre en absence d’information
            <textarea
              className="w-full rounded-md border p-3 text-[12px]"
              rows={3}
              name="client_fallback_message"
              defaultValue={String(settings.client_fallback_message || "")}
            />
          </label>
          {message && <p className="text-[12px] text-emerald-700">{message}</p>}
          <div className="flex justify-end md:col-span-2">
            <button className={primary}>
              <Save size={13} />
              Enregistrer la politique IA
            </button>
          </div>
        </form>
      </section>
    </PermissionGuard>
  );
}
export function KnowledgeAdministration() {
  const [mode, setMode] = useState<
      "conflicts" | "suggestions" | "connectors" | "settings"
    >("conflicts"),
    [rows, setRows] = useState<Array<Record<string, unknown>>>([]),
    [message, setMessage] = useState("");
  async function load(next = mode) {
    setMode(next);
    setMessage("");
    if (next === "conflicts") setRows(await getKnowledgeConflicts());
    if (next === "suggestions") setRows(await getKnowledgeSuggestions());
    if (next === "connectors") setRows(await getKnowledgeConnectors());
    if (next === "settings") setRows([await getKnowledgeSettings()]);
  }
  return (
    <section className="m-4 border bg-white">
      <header className="flex flex-wrap gap-2 border-b p-3">
        <b className="mr-auto text-[13px]">Gouvernance avancée</b>
        {(
          [
            ["conflicts", "Conflits"],
            ["suggestions", "Suggestions"],
            ["connectors", "Sources connectées"],
            ["settings", "IA & comportement"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={btn} onClick={() => load(k)}>
            {l}
          </button>
        ))}
      </header>
      <div className="p-4">
        <div className="mb-3 flex gap-2">
          <PermissionGuard permission="knowledge.manage">
            {mode === "conflicts" && (
              <button
                className={primary}
                onClick={async () => {
                  await detectKnowledgeConflicts();
                  await load();
                }}
              >
                Détecter les conflits
              </button>
            )}
            {mode === "suggestions" && (
              <button
                className={primary}
                onClick={async () => {
                  await generateKnowledgeSuggestions();
                  await load();
                }}
              >
                Analyser les questions sans réponse
              </button>
            )}
          </PermissionGuard>
          {mode === "connectors" && (
            <PermissionGuard permission="knowledge.connectors">
              <button
                className={primary}
                onClick={async () => {
                  const provider =
                    prompt("GOOGLE_DRIVE, NOTION ou SHAREPOINT") || "";
                  const token = prompt("Access token OAuth") || "";
                  if (provider && token) {
                    await createKnowledgeConnector({
                      provider,
                      display_name: provider,
                      credentials: { access_token: token },
                      configuration: {},
                    });
                    await load();
                  }
                }}
              >
                Ajouter une source
              </button>
            </PermissionGuard>
          )}
          {mode === "settings" && (
            <PermissionGuard permission="knowledge.manage">
              <button
                className={primary}
                onClick={async () => {
                  await updateKnowledgeSettings({
                    client_ai_enabled: true,
                    internal_ai_enabled: true,
                  });
                  setMessage("Paramètres IA enregistrés");
                }}
              >
                Activer les IA autorisées
              </button>
            </PermissionGuard>
          )}
        </div>
        {message && <p className="mb-3 text-emerald-700">{message}</p>}
        {rows.map((row, i) => (
          <div
            key={String(row.id || i)}
            className="flex items-center gap-3 border-t py-3 text-[12px]"
          >
            <div className="min-w-0 flex-1">
              <b>
                {String(
                  row.title ||
                    row.display_name ||
                    row.provider ||
                    row.response_tone ||
                    "Configuration",
                )}
              </b>
              <small className="block truncate text-[#737b84]">
                {String(row.description || row.explanation || row.status || "")}
              </small>
            </div>
            {mode === "conflicts" && row.status === "OPEN" && (
              <button
                className={btn}
                onClick={async () => {
                  const resolution = prompt("Décision de résolution") || "";
                  if (resolution) {
                    await resolveKnowledgeConflict(String(row.id), resolution);
                    await load();
                  }
                }}
              >
                Résoudre
              </button>
            )}
            {mode === "connectors" && (
              <button
                className={btn}
                onClick={async () => {
                  await syncKnowledgeConnector(String(row.id));
                  await load();
                }}
              >
                Synchroniser
              </button>
            )}
          </div>
        ))}
        {!rows.length && (
          <p className="py-8 text-center text-[12px] text-[#737b84]">
            Choisissez une vue ou aucune donnée à traiter.
          </p>
        )}
      </div>
    </section>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-l border-[#eceef1] px-4 py-1 first:border-l-0">
      <small className="text-[11px] text-[#69727d]">{label}</small>
      <b className="mt-1 block text-[24px] font-medium tracking-[-.035em]">
        {value}
      </b>
    </div>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-medium ${["PUBLISHED", "APPROVED", "ANSWERED"].includes(value) ? "bg-emerald-50 text-emerald-700" : ["EXPIRED", "ARCHIVED", "NO_RESULT"].includes(value) ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
    >
      {statusLabels[value] || value}
    </span>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] bg-[#f7f8f7] p-3">
      <small className="text-[#6c747d]">{label}</small>
      <b className="mt-1 block text-[12px]">{value}</b>
    </div>
  );
}
function Field(p: {
  name: string;
  label: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="text-[12px] font-medium text-[#555e58]">
      {p.label}
      <input {...p} className={`${input} mt-1`} />
    </label>
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
      description="Les informations restent modifiables avant publication."
      close={close}
    >
      {children}
    </OperationDrawer>
  );
}
