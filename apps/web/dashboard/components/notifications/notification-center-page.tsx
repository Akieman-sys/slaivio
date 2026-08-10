"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Archive, CheckCheck, Clock3, RotateCcw, Search, Settings2, X } from "lucide-react";

import { PermissionGuard } from "@/components/permissions/permission-guard";
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

const button = "inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-[#d3d3d0] bg-white px-3 text-[13px] text-[#2f3437] hover:bg-[#f5f5f3]";
const primary = "inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-[#1a73e8] px-3 text-[13px] font-medium text-white hover:bg-[#1768d1]";
const input = "h-8 rounded-[4px] border border-[#d3d3d0] bg-white px-3 text-[13px] outline-none focus:border-[#1a73e8]";

export function NotificationCenterPage() {
  const [result, setResult] = useState<CenterResponse | null>(null);
  const [filters, setFilters] = useState({ status: "", source: "", priority: "", q: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);

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
    <div className="min-h-full bg-[#f8f8f7]">
      <header className="border-b border-[#d9d9d6] bg-white">
        <div className="flex min-h-[58px] items-center gap-4 px-6">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#202124]">Notifications</h1>
          <div className="ml-auto flex items-center gap-2">
            <button className={button} onClick={() => setSettings(true)}>
              <Settings2 size={15} />
              Preferences
            </button>
            <PermissionGuard permission="notifications.manage">
              <button className={primary} onClick={async () => { await markAllRead(); await load(); }}>
                <CheckCheck size={15} />
                Mark all read
              </button>
            </PermissionGuard>
          </div>
        </div>
        <div className="flex h-[48px] items-center gap-2 border-t border-[#eeeeeb] px-6">
          <button className="h-8 rounded-[4px] bg-[#f0f0ef] px-3 text-[13px]">Unread</button>
          <button className="h-8 rounded-[4px] px-3 text-[13px] hover:bg-[#f0f0ef]">Read</button>
          <label className="ml-2 flex h-8 w-[360px] max-w-[45vw] items-center gap-2 rounded-[4px] border border-[#d3d3d0] bg-white px-2 focus-within:border-[#1a73e8]">
            <Search size={15} className="text-[#6b7075]" />
            <input
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              placeholder="Search notifications"
            />
          </label>
          <select className={`${input} ml-auto`} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">All statuses</option>
            <option>UNREAD</option>
            <option>READ</option>
            <option>ARCHIVED</option>
          </select>
          <select className={input} value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}>
            <option value="">All sources</option>
            <option value="IN_APP">In app</option>
            <option value="DELIVERY">Delivery</option>
          </select>
          <select className={input} value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}>
            <option value="">All priorities</option>
            <option>NORMAL</option>
            <option>HIGH</option>
            <option>CRITICAL</option>
          </select>
        </div>
      </header>

      <main className="px-6 py-5">
        {error && <p className="mb-3 rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
        <section className="overflow-hidden rounded-[6px] border border-[#d3d3d0] bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_120px_120px_150px_168px] border-b border-[#d9d9d6] bg-[#f7f7f5] px-4 py-2 text-[12px] font-medium text-[#5f6368]">
            <span>Notification</span>
            <span>Source</span>
            <span>Priority</span>
            <span>Created</span>
            <span className="text-right">Actions</span>
          </div>
          {loading ? (
            <p className="p-12 text-center text-[13px] text-[#6b7075]">Chargement...</p>
          ) : !result?.items.length ? (
            <p className="p-16 text-center text-[13px] text-[#9aa0a6]">No unread notifications</p>
          ) : (
            result.items.map((item) => <NotificationRow key={`${item.source}-${item.id}`} item={item} action={action} reload={load} />)
          )}
        </section>
      </main>
      {settings && <Preferences close={() => setSettings(false)} />}
    </div>
  );
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
    <article className={`grid grid-cols-[1fr_120px_120px_150px_168px] items-start border-b border-[#eeeeeb] px-4 py-3 text-[13px] last:border-0 ${unread ? "bg-[#f8fbff]" : "bg-white"}`}>
      <div className="flex min-w-0 gap-3">
        <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${item.priority === "CRITICAL" ? "bg-red-500" : item.priority === "HIGH" ? "bg-amber-500" : unread ? "bg-[#1a73e8]" : "bg-[#c7c7c3]"}`} />
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
          <button title={unread ? "Marquer comme lu" : "Marquer non lu"} className={button} onClick={() => action(item, unread ? "read" : "unread")}>
            {unread ? <CheckCheck size={14} /> : <RotateCcw size={14} />}
          </button>
          <button title="Reporter" className={button} onClick={() => action(item, "snooze", 60)}>
            <Clock3 size={14} />
          </button>
          <button title={item.archived_at ? "Restaurer" : "Archiver"} className={button} onClick={() => action(item, item.archived_at ? "restore" : "archive")}>
            <Archive size={14} />
          </button>
          {item.source === "DELIVERY" && item.delivery_status === "FAILED" && (
            <PermissionGuard permission="notifications.delivery.manage">
              <button className={button} onClick={async () => { await retryDelivery(item.id); await reload(); }}>Retry</button>
            </PermissionGuard>
          )}
        </div>
      </PermissionGuard>
    </article>
  );
}

const categories = ["OPERATIONS", "SHIPMENT", "PACKAGE", "PAYMENT", "COMPLIANCE", "SYSTEM"];

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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25">
      <aside className="h-full w-full max-w-[620px] overflow-y-auto border-l border-[#d3d3d0] bg-white shadow-2xl">
        <div className="flex h-[60px] items-center border-b border-[#d9d9d6] px-5">
          <h2 className="text-[16px] font-semibold">Notification preferences</h2>
          <button onClick={close} className="ml-auto rounded-[4px] p-1 hover:bg-[#f0f0ef]"><X size={18} /></button>
        </div>
        {error && <p className="m-5 rounded-[5px] bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
        <form onSubmit={submit} className="p-5">
          <div className="overflow-hidden rounded-[6px] border border-[#d3d3d0]">
            <div className="grid grid-cols-[1fr_repeat(3,78px)_128px] border-b bg-[#f7f7f5] px-3 py-2 text-[12px] font-medium text-[#5f6368]">
              <span>Category</span><span>App</span><span>Email</span><span>WhatsApp</span><span>Frequency</span>
            </div>
            {categories.map((category) => {
              const pref = current(category);
              return (
                <div key={category} className="grid grid-cols-[1fr_repeat(3,78px)_128px] items-center border-b px-3 py-3 text-[13px] last:border-0">
                  <b>{category}</b>
                  <input name={`${category}.in_app`} type="checkbox" defaultChecked={pref.in_app} className="h-4 w-4 accent-[#1a73e8]" />
                  <input name={`${category}.email`} type="checkbox" defaultChecked={pref.email} className="h-4 w-4 accent-[#1a73e8]" />
                  <input name={`${category}.whatsapp`} type="checkbox" defaultChecked={pref.whatsapp} className="h-4 w-4 accent-[#1a73e8]" />
                  <select name={`${category}.digest`} defaultValue={pref.digest_frequency} className={input}>
                    <option>IMMEDIATE</option><option>DAILY</option><option>WEEKLY</option><option>OFF</option>
                  </select>
                </div>
              );
            })}
          </div>
          <button className={`${primary} mt-4`}>Save preferences</button>
        </form>
      </aside>
    </div>
  );
}
