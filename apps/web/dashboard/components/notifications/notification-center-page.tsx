"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Archive, CheckCheck, Clock3, RotateCcw, Settings2 } from "lucide-react";

import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationButton, OperationTab } from "@/components/ui/operation-controls";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { OperationPageHeader, OperationTabs } from "@/components/ui/operation-page-header";
import { OperationContent, OperationSearch, OperationTable, OperationToolbar } from "@/components/ui/operation-primitives";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/page-state";
import {
  getNotificationPreferences,
  listNotifications,
  markAllRead,
  notificationAction,
  retryDelivery,
  saveNotificationPreference,
  type CenterItem,
  type CenterResponse,
  type NotificationPreference,
} from "@/services/notification-center";

const input = "h-9 rounded-[5px] border border-[#d3d8dd] bg-white px-3 text-[13px] outline-none focus:border-[#167d57] focus:ring-2 focus:ring-[#12c76f]/10";

export function NotificationCenterPage() {
  const [result, setResult] = useState<CenterResponse | null>(null);
  const [filters, setFilters] = useState({ status: "", source: "", priority: "", q: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("preferences") === "1") setSettings(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await listNotifications(Object.fromEntries(Object.entries(filters).filter(([, value]) => value))));
    } catch {
      setError("Le centre de notifications est indisponible.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function action(item: CenterItem, nextAction: string, minutes?: number) {
    try {
      await notificationAction(item, nextAction, minutes);
      await load();
    } catch {
      setError("L’action n’a pas abouti.");
    }
  }

  return (
    <div className="min-h-full bg-[#f7f8f8]">
      <OperationPageHeader
        title="Notifications"
        description="Suivez les événements opérationnels et gérez les alertes qui demandent votre attention."
        actions={
          <>
            <OperationButton onClick={() => setSettings(true)}>
              <Settings2 size={15} />
              Préférences
            </OperationButton>
            <PermissionGuard permission="notifications.manage">
              <OperationButton variant="primary" onClick={async () => { await markAllRead(); await load(); }}>
                <CheckCheck size={15} />
                Tout marquer comme lu
              </OperationButton>
            </PermissionGuard>
          </>
        }
      />
      <OperationTabs>
        <NotificationTab active={filters.status === "UNREAD"} onClick={() => setFilters({ ...filters, status: "UNREAD" })}>Non lues</NotificationTab>
        <NotificationTab active={filters.status === "READ"} onClick={() => setFilters({ ...filters, status: "READ" })}>Lues</NotificationTab>
        <NotificationTab active={!filters.status} onClick={() => setFilters({ ...filters, status: "" })}>Toutes</NotificationTab>
      </OperationTabs>
      <OperationToolbar
        search={<OperationSearch value={filters.q} onChange={(q) => setFilters({ ...filters, q })} placeholder="Rechercher une notification" />}
        filters={
          <>
            <select className={input} value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}>
              <option value="">Toutes les sources</option>
              <option value="IN_APP">Dans l’application</option>
              <option value="DELIVERY">Canal externe</option>
            </select>
            <select className={input} value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}>
              <option value="">Toutes les priorités</option>
              <option>NORMAL</option>
              <option>HIGH</option>
              <option>CRITICAL</option>
            </select>
          </>
        }
      />

      <OperationContent>
        {error && !result ? <ErrorState title="Notifications indisponibles" description={error} retry={load} /> : null}
        <OperationTable>
          <div className="grid min-w-[820px] grid-cols-[1fr_120px_120px_150px_168px] border-b border-[#d9d9d6] bg-[#f7f7f5] px-4 py-2 text-[12px] font-medium text-[#5f6368]">
            <span>Notification</span>
            <span>Source</span>
            <span>Priorité</span>
            <span>Créée le</span>
            <span className="text-right">Actions</span>
          </div>
          {loading ? (
            <TableSkeleton columns={5} label="Chargement des notifications" />
          ) : !result?.items.length ? (
            <EmptyState title="Aucune notification" description="Les événements correspondant à cette vue apparaîtront ici." />
          ) : (
            result.items.map((item) => <NotificationRow key={`${item.source}-${item.id}`} item={item} action={action} reload={load} />)
          )}
        </OperationTable>
      </OperationContent>
      {settings && <Preferences close={() => setSettings(false)} />}
    </div>
  );
}

function NotificationTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <OperationTab active={active} onClick={onClick} className="h-[42px]">{children}</OperationTab>;
}

function NotificationRow({
  item,
  action,
  reload,
}: {
  item: CenterItem;
  action: (item: CenterItem, nextAction: string, minutes?: number) => void;
  reload: () => Promise<void>;
}) {
  const unread = !item.read_at;
  return (
    <article className={`grid min-h-11 min-w-[820px] grid-cols-[1fr_120px_120px_150px_168px] items-center border-b border-[#eeeeeb] px-4 py-2 text-[13px] last:border-0 ${unread ? "bg-[#f3fbf7]" : "bg-white"}`}>
      <div className="flex min-w-0 gap-3">
        <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${item.priority === "CRITICAL" ? "bg-red-500" : item.priority === "HIGH" ? "bg-amber-500" : unread ? "bg-[#167d57]" : "bg-[#c7c7c3]"}`} />
        <div className="min-w-0">
          <div className="truncate font-medium text-[#202124]">{item.title}</div>
          <p className="mt-1 line-clamp-2 text-[#5f6368]">{item.message}</p>
          {item.error_message && <p className="mt-1 text-[11px] text-red-700">{item.error_message}</p>}
        </div>
      </div>
      <span className="rounded-full bg-[#f0f0ef] px-2 py-1 text-[11px] text-[#5f6368]">{item.source === "DELIVERY" ? "Delivery" : item.category}</span>
      <span>{item.priority}</span>
      <span className="text-[#6b7075]">{new Date(item.created_at).toLocaleString("fr-FR")}</span>
      <PermissionGuard permission="notifications.manage">
        <div className="flex justify-end gap-1">
          <OperationButton title={unread ? "Marquer comme lu" : "Marquer non lu"} onClick={() => action(item, unread ? "read" : "unread")}>
            {unread ? <CheckCheck size={14} /> : <RotateCcw size={14} />}
          </OperationButton>
          <OperationButton title="Reporter" onClick={() => action(item, "snooze", 60)}>
            <Clock3 size={14} />
          </OperationButton>
          <OperationButton title={item.archived_at ? "Restaurer" : "Archiver"} onClick={() => action(item, item.archived_at ? "restore" : "archive")}>
            <Archive size={14} />
          </OperationButton>
          {item.source === "DELIVERY" && item.delivery_status === "FAILED" && (
            <PermissionGuard permission="notifications.delivery.manage">
              <OperationButton onClick={async () => { await retryDelivery(item.id); await reload(); }}>Réessayer</OperationButton>
            </PermissionGuard>
          )}
        </div>
      </PermissionGuard>
    </article>
  );
}

const categories = ["OPERATIONS", "SHIPMENT", "PACKAGE", "PAYMENT", "COMPLIANCE", "SYSTEM"];
const categoryLabels: Record<string, string> = {
  OPERATIONS: "Activité de l’agence",
  SHIPMENT: "Expéditions",
  PACKAGE: "Colis",
  PAYMENT: "Paiements",
  COMPLIANCE: "Documents et contrôles",
  SYSTEM: "Compte et sécurité",
};

function Preferences({ close }: { close: () => void }) {
  const [items, setItems] = useState<NotificationPreference[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    getNotificationPreferences().then(setItems).catch(() => setError("Préférences indisponibles."));
  }, []);

  function current(category: string): NotificationPreference {
    return items.find((item) => item.category === category) ?? {
      category,
      in_app: true,
      email: false,
      whatsapp: false,
      digest_frequency: "IMMEDIATE",
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      for (const category of categories) {
        await saveNotificationPreference({
          category,
          in_app: form.get(`${category}.in_app`) === "on",
          email: form.get(`${category}.email`) === "on",
          whatsapp: form.get(`${category}.whatsapp`) === "on",
          digest_frequency: String(form.get(`${category}.digest`)),
        });
      }
      close();
    } catch {
      setError("Enregistrement impossible.");
    }
  }

  return (
    <OperationDrawer open close={close} title="Préférences de notifications" description="Choisissez les canaux et la fréquence pour chaque activité." width="max-w-[720px]">
        {error && <p className="mb-4 rounded-[5px] bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
        <form onSubmit={submit}>
          <div className="overflow-x-auto rounded-[6px] border border-[#d3d8dd] bg-white">
            <div className="grid min-w-[640px] grid-cols-[1fr_repeat(3,78px)_148px] border-b bg-[#f7f7f5] px-3 py-2 text-[12px] font-medium text-[#5f6368]">
              <span>Catégorie</span><span>App</span><span>Email</span><span>WhatsApp</span><span>Fréquence</span>
            </div>
            {categories.map((category) => {
              const pref = current(category);
              return (
                <div key={category} className="grid min-w-[640px] grid-cols-[1fr_repeat(3,78px)_148px] items-center border-b px-3 py-3 text-[13px] last:border-0">
                  <b>{categoryLabels[category]}</b>
                  <input name={`${category}.in_app`} type="checkbox" defaultChecked={pref.in_app} className="h-4 w-4 accent-[#167d57]" />
                  <input name={`${category}.email`} type="checkbox" defaultChecked={pref.email} className="h-4 w-4 accent-[#167d57]" />
                  <input name={`${category}.whatsapp`} type="checkbox" defaultChecked={pref.whatsapp} className="h-4 w-4 accent-[#167d57]" />
                  <select name={`${category}.digest`} defaultValue={pref.digest_frequency} className={input}>
                    <option value="IMMEDIATE">Immédiatement</option><option value="DAILY">Résumé quotidien</option><option value="WEEKLY">Résumé hebdomadaire</option><option value="OFF">Désactivé</option>
                  </select>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end"><OperationButton type="submit" variant="primary">Enregistrer les préférences</OperationButton></div>
        </form>
    </OperationDrawer>
  );
}
