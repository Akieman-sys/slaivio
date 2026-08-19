"use client";

import {
  ChevronRight,
  FileCheck2,
  FilePlus2,
  FolderOpen,
  ShieldCheck,
} from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  docs,
  downloadDoc,
  reviewDoc,
  uploadDoc,
  type Doc,
} from "@/services/documents";
import { OperationPageHeader } from "@/components/ui/operation-page-header";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import {
  OperationMetrics,
  OperationSearch,
  OperationTable,
  OperationToolbar,
} from "@/components/ui/operation-primitives";
import { LoadingState } from "@/components/ui/page-state";

const button =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] border border-[#d6dadd] bg-white px-3 text-[12px] font-medium hover:bg-[#f5f6f6]";
const primary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] bg-[#12a861] px-3 text-[12px] font-semibold text-white hover:bg-[#0d9455]";
const input =
  "h-9 rounded-[5px] border border-[#d6dadd] bg-white px-3 text-[13px] outline-none focus:border-[#12a861]";

export function DocumentsPage() {
  const [items, setItems] = useState<Doc[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setItems(await docs());
    } catch {
      setError("Les documents sont indisponibles.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () =>
      items.filter((item) =>
        `${item.document_code} ${item.title} ${item.file_name}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [items, query],
  );
  const valid = items.filter((item) => item.status === "VALID").length;
  const pending = items.filter(
    (item) => item.status === "PENDING_REVIEW",
  ).length;
  const expiring = items.filter(
    (item) =>
      item.expires_at &&
      new Date(item.expires_at).getTime() < Date.now() + 30 * 86400000,
  ).length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await uploadDoc(new FormData(event.currentTarget));
      setOpen(false);
      await load();
    } catch {
      setError("Téléversement impossible.");
    }
  }

  return (
    <div className="min-h-full bg-[#f7f7f6]">
      <OperationPageHeader
        title="Documents et conformité"
        description="Centralisez les pièces cargo, contrôlez leur validité et suivez les échéances."
        actions={
          <button className={primary} onClick={() => setOpen(true)}>
            <FilePlus2 size={15} />
            Ajouter un document
          </button>
        }
      />
      <main>
        <OperationMetrics>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Documents"
              value={items.length}
              icon={<FolderOpen size={16} />}
            />
            <Metric
              label="À contrôler"
              value={pending}
              icon={<FileCheck2 size={16} />}
            />
            <Metric
              label="Conformes"
              value={valid}
              icon={<ShieldCheck size={16} />}
            />
            <Metric
              label="À renouveler bientôt"
              value={expiring}
              icon={<FileCheck2 size={16} />}
            />
          </div>
        </OperationMetrics>
        <OperationToolbar
          search={
            <OperationSearch
              value={query}
              onChange={setQuery}
              placeholder="Rechercher un document..."
            />
          }
        />
        <section className="border-b border-[#dfe1e3] bg-white">
          {error && (
            <p className="m-4 bg-red-50 p-3 text-[13px] text-red-700">
              {error}
            </p>
          )}
          {loading ? (
            <LoadingState label="Chargement des documents…" />
          ) : filtered.length ? (
            <OperationTable>
            <table className="w-full min-w-[850px] border-collapse text-left text-[13px]">
              <thead className="bg-[#fbfcfd] text-[#5f6b7a]">
                <tr className="border-b border-[#e6e9ee]">
                  {[
                    "Code",
                    "Document",
                    "Élément lié",
                    "Statut",
                    "Expiration",
                    "Actions",
                    "",
                  ].map((label) => (
                    <th className="px-4 py-3 font-medium" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    className="h-11 border-b border-[#edf0f3] hover:bg-[#f7faf9]"
                    key={item.id}
                  >
                    <td className="px-4 py-3 font-semibold">
                      {item.document_code}
                    </td>
                    <td>
                      {item.title}
                      <small className="block text-[#7a8188]">
                        {item.file_name}
                      </small>
                    </td>
                    <td>{entityLabel(item.entity_type)}</td>
                    <td>
                      <Status value={item.status} />
                    </td>
                    <td>{item.expires_at || "—"}</td>
                    <td className="space-x-3">
                      <button
                        className="font-medium text-[#087a46]"
                        onClick={async () =>
                          window.open(await downloadDoc(item.id), "_blank")
                        }
                      >
                        Ouvrir
                      </button>
                      {item.status === "PENDING_REVIEW" && (
                        <>
                          <button
                            onClick={() =>
                              reviewDoc(item.id, "VALID").then(load)
                            }
                          >
                            Valider
                          </button>
                          <button
                            className="text-red-600"
                            onClick={() => {
                              const reason = prompt("Motif du rejet");
                              if (reason)
                                reviewDoc(item.id, "REJECTED", reason).then(
                                  load,
                                );
                            }}
                          >
                            Rejeter
                          </button>
                        </>
                      )}
                    </td>
                    <td className="pr-4 text-right text-[#7b848d]">
                      <ChevronRight size={17} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </OperationTable>
          ) : (
            <div className="grid min-h-64 place-items-center text-center">
              <div>
                <FolderOpen className="mx-auto text-[#9299a0]" />
                <p className="mt-3 text-[13px] font-medium">
                  Aucun document dans cette vue
                </p>
                <p className="mt-1 text-[11px] text-[#7a8188]">
                  Les pièces liées aux opérations apparaîtront ici.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
      {open && (
        <OperationDrawer
          open
          title="Ajouter un document"
          description="Ajoutez une pièce à une opération existante de l’agence."
          close={() => setOpen(false)}
        >
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Code du document">
              <input
                required
                name="document_code"
                className={input}
                placeholder="Ex. DOC-2026-001"
              />
            </FieldLabel>
            <FieldLabel label="Type de document">
              <input
                required
                name="document_type"
                className={input}
                placeholder="Ex. Facture fournisseur"
              />
            </FieldLabel>
            <FieldLabel label="Titre">
              <input
                required
                name="title"
                className={input}
                placeholder="Nom compréhensible par l’équipe"
              />
            </FieldLabel>
            <FieldLabel label="Concerne">
              <select name="entity_type" className={input}>
                <option value="SHIPMENT">Une expédition</option>
                <option value="DOSSIER">Un dossier</option>
                <option value="PACKAGE">Un colis</option>
                <option value="CLIENT">Un client</option>
                <option value="DEPARTURE">Un départ</option>
                <option value="ORGANIZATION">L’agence</option>
              </select>
            </FieldLabel>
            <FieldLabel label="Référence de l’élément">
              <input
                required
                name="entity_id"
                className={input}
                placeholder="Rechercher ou saisir la référence"
              />
            </FieldLabel>
            <FieldLabel label="Date d’émission">
              <input name="issued_at" type="date" className={input} />
            </FieldLabel>
            <FieldLabel label="Date d’expiration">
              <input name="expires_at" type="date" className={input} />
            </FieldLabel>
            <FieldLabel label="Émis par">
              <input
                name="issuer"
                className={input}
                placeholder="Fournisseur, douane ou agence"
              />
            </FieldLabel>
            <label className="grid gap-1 text-[12px] font-medium sm:col-span-2">
              Fichier
              <input
                required
                name="file"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="rounded-md border border-dashed border-[#cfd5dd] p-4 text-[12px]"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-[#eceef1] pt-4 sm:col-span-2">
              <button
                type="button"
                className={button}
                onClick={() => setOpen(false)}
              >
                Annuler
              </button>
              <button className={primary}>Enregistrer</button>
            </div>
          </form>
        </OperationDrawer>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="flex min-h-[76px] items-center gap-3 border-l border-[#eceeef] px-4 py-1 first:border-l-0">
      <span className="text-[#087a46]">{icon}</span>
      <div>
        <p className="text-[11px] text-[#6d747c]">{label}</p>
        <p className="mt-1 text-[24px] font-medium">{value}</p>
      </div>
    </div>
  );
}
function Status({ value }: { value: string }) {
  const style =
    value === "VALID"
      ? "bg-emerald-50 text-emerald-700"
      : value === "REJECTED"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";
  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${style}`}>
      {value}
    </span>
  );
}
function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-[12px] font-medium text-[#414950]">
      {label}
      {children}
    </label>
  );
}
function entityLabel(value: string) {
  return (
    (
      {
        SHIPMENT: "Expédition",
        DOSSIER: "Dossier",
        PACKAGE: "Colis",
        CLIENT: "Client",
        DEPARTURE: "Départ",
        ORGANIZATION: "Agence",
      } as Record<string, string>
    )[value] || value
  );
}
