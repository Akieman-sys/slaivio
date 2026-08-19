"use client";

import {
  ChevronRight,
  FilePlus2,
} from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
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
  FormSection,
  OperationButton,
  OperationField,
  OperationMetric,
  OperationMetricGrid,
  OperationStatus,
} from "@/components/ui/operation-controls";
import {
  OperationMetrics,
  OperationSearch,
  OperationTable,
  OperationToolbar,
} from "@/components/ui/operation-primitives";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/page-state";
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
          <OperationButton variant="primary" onClick={() => setOpen(true)}>
            <FilePlus2 size={15} />
            Ajouter un document
          </OperationButton>
        }
      />
      <main>
        <OperationMetrics>
          <OperationMetricGrid>
            <OperationMetric label="Documents" value={items.length} />
            <OperationMetric label="À contrôler" value={pending} tone={pending ? "warning" : "default"} />
            <OperationMetric label="Conformes" value={valid} tone="success" />
            <OperationMetric label="À renouveler bientôt" value={expiring} tone={expiring ? "warning" : "default"} />
          </OperationMetricGrid>
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
          {error && !items.length ? (
            <ErrorState title="Documents indisponibles" description={error} retry={load} />
          ) : loading ? (
            <TableSkeleton columns={7} label="Chargement des documents" />
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
                      <DocumentStatus value={item.status} />
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
            <EmptyState title="Aucun document dans cette vue" description="Les pièces liées aux opérations apparaîtront ici." />
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
          <form onSubmit={submit} className="grid gap-5">
            <FormSection title="Identification" description="Nommez clairement la pièce pour que l’équipe puisse la retrouver.">
              <div className="grid gap-4 sm:grid-cols-2">
                <OperationField label="Code du document" required><input required name="document_code" className={input} placeholder="Ex. DOC-2026-001" /></OperationField>
                <OperationField label="Type de document" required><input required name="document_type" className={input} placeholder="Ex. Facture fournisseur" /></OperationField>
                <OperationField label="Titre" required><input required name="title" className={input} placeholder="Nom compréhensible par l’équipe" /></OperationField>
                <OperationField label="Émis par"><input name="issuer" className={input} placeholder="Fournisseur, douane ou agence" /></OperationField>
              </div>
            </FormSection>
            <FormSection title="Élément concerné" description="Reliez la pièce à l’opération réelle pour éviter les documents isolés.">
              <div className="grid gap-4 sm:grid-cols-2">
                <OperationField label="Ce document concerne" required><select name="entity_type" className={input}><option value="SHIPMENT">Une expédition</option><option value="DOSSIER">Un dossier</option><option value="PACKAGE">Un colis</option><option value="CLIENT">Un client</option><option value="DEPARTURE">Un départ</option><option value="ORGANIZATION">L’agence</option></select></OperationField>
                <OperationField label="Référence visible" hint="Exemple : COL-2026-008452" required><input required name="entity_id" className={input} placeholder="Référence du dossier, colis ou expédition" /></OperationField>
                <OperationField label="Date d’émission"><input name="issued_at" type="date" className={input} /></OperationField>
                <OperationField label="Date d’expiration"><input name="expires_at" type="date" className={input} /></OperationField>
              </div>
            </FormSection>
            <FormSection title="Fichier" description="PDF ou image lisible. Le document restera lié à l’agence active.">
              <OperationField label="Choisir le fichier" required><input required name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="rounded-[6px] border border-dashed border-[#cfd5dd] p-4 text-[13px]" /></OperationField>
            </FormSection>
            <div className="flex justify-end gap-2 border-t border-[#eceef1] pt-4">
              <OperationButton type="button" onClick={() => setOpen(false)}>Annuler</OperationButton>
              <OperationButton type="submit" variant="primary">Enregistrer</OperationButton>
            </div>
          </form>
        </OperationDrawer>
      )}
    </div>
  );
}

function DocumentStatus({ value }: { value: string }) {
  const states: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
    VALID: { label: "Conforme", tone: "success" },
    REJECTED: { label: "Rejeté", tone: "danger" },
    PENDING_REVIEW: { label: "À contrôler", tone: "warning" },
    EXPIRED: { label: "Expiré", tone: "danger" },
  };
  const state = states[value] || { label: value, tone: "neutral" as const };
  return <OperationStatus label={state.label} tone={state.tone} />;
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
