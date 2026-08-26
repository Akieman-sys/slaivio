import { api } from "@/services/api";

export type OfflineOperationType = "DOSSIER_CREATE" | "DOSSIER_UPDATE" | "FOLLOWUP_DRAFT_SAVE";
export type OfflineEntityType = "DOSSIER" | "FOLLOWUP_DRAFT";
export type OfflineOperationState = "PENDING" | "SYNCING" | "CONFLICT" | "REJECTED";

export type OfflineOperation = {
  id: string;
  scope: string;
  operation_key: string;
  operation_type: OfflineOperationType;
  entity_type: OfflineEntityType;
  local_entity_id?: string | null;
  entity_id?: string | null;
  expected_version?: number | null;
  payload: Record<string, unknown>;
  state: OfflineOperationState;
  error_code?: string | null;
  conflict?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type CacheEntry = { id: string; scope: string; key: string; data: unknown; updated_at: string };
type SyncReceipt = {
  operation_key: string;
  status: "APPLIED" | "CONFLICT" | "REJECTED" | "PROCESSING";
  result?: Record<string, unknown>;
  conflict?: Record<string, unknown> | null;
  error_code?: string | null;
};

const DB_NAME = "slaivio-pilot-v1";
const DB_VERSION = 1;
const DEVICE_KEY = "slaivio.pilot.device-key";
export const PILOT_SYNCED_EVENT = "slaivio:pilot-synced";

export function newOfflineKey(prefix: string) { return `${prefix}:${crypto.randomUUID()}`; }

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("cache")) {
        const store = db.createObjectStore("cache", { keyPath: "id" });
        store.createIndex("scope", "scope", { unique: false });
      }
      if (!db.objectStoreNames.contains("queue")) {
        const store = db.createObjectStore("queue", { keyPath: "id" });
        store.createIndex("scope", "scope", { unique: false });
        store.createIndex("scope_state", ["scope", "state"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(storeName: "cache" | "queue", mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

function scoped(scope: string, key: string) { return `${scope}:${key}`; }

export async function cachePilotData(scope: string, key: string, data: unknown) {
  if (typeof indexedDB === "undefined") return;
  const entry: CacheEntry = { id: scoped(scope, key), scope, key, data, updated_at: new Date().toISOString() };
  await run("cache", "readwrite", (store) => store.put(entry));
}

export async function readPilotCache<T>(scope: string, key: string): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  const entry = await run<CacheEntry | undefined>("cache", "readonly", (store) => store.get(scoped(scope, key)));
  return (entry?.data as T | undefined) ?? null;
}

export async function queuePilotOperation(
  scope: string,
  operation: Omit<OfflineOperation, "id" | "scope" | "state" | "created_at" | "updated_at">,
) {
  const now = new Date().toISOString();
  const item: OfflineOperation = {
    ...operation,
    id: scoped(scope, operation.operation_key),
    scope,
    state: "PENDING",
    created_at: now,
    updated_at: now,
  };
  await run("queue", "readwrite", (store) => store.put(item));
  return item;
}

export async function listPilotOperations(scope: string): Promise<OfflineOperation[]> {
  if (typeof indexedDB === "undefined") return [];
  const all = await run<OfflineOperation[]>("queue", "readonly", (store) => store.getAll());
  return all.filter((item) => item.scope === scope).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function writeOperation(item: OfflineOperation) {
  await run("queue", "readwrite", (store) => store.put({ ...item, updated_at: new Date().toISOString() }));
}

async function removeOperation(item: OfflineOperation) {
  await run("queue", "readwrite", (store) => store.delete(item.id));
}

export async function discardPilotOperation(id: string) {
  if (typeof indexedDB === "undefined") return;
  await run("queue", "readwrite", (store) => store.delete(id));
}

export function pilotDeviceKey() {
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = `device:${crypto.randomUUID()}`;
  window.localStorage.setItem(DEVICE_KEY, created);
  return created;
}

export async function synchronizePilotQueue(scope: string) {
  const queued = (await listPilotOperations(scope)).filter((item) => item.state === "PENDING").slice(0, 50);
  if (!queued.length) return { applied: 0, conflicts: 0, rejected: 0 };
  await Promise.all(queued.map((item) => writeOperation({ ...item, state: "SYNCING" })));
  try {
    const response = (await api.post<{
      items: SyncReceipt[]; applied: number; conflicts: number; rejected: number;
    }>("/pilot/sync", {
      device_key: pilotDeviceKey(),
      device_label: typeof navigator === "undefined" ? null : navigator.userAgent.slice(0, 120),
      operations: queued.map(({ operation_key, operation_type, entity_type, local_entity_id, entity_id, expected_version, payload }) => ({
        operation_key, operation_type, entity_type, local_entity_id, entity_id, expected_version, payload,
      })),
    })).data;
    for (const receipt of response.items) {
      const local = queued.find((item) => item.operation_key === receipt.operation_key);
      if (!local) continue;
      if (receipt.status === "APPLIED") {
        if (local.local_entity_id && receipt.result) {
          await cachePilotData(scope, `resolved:${local.local_entity_id}`, receipt.result);
        }
        await removeOperation(local);
      } else if (receipt.status === "CONFLICT" || receipt.status === "REJECTED") {
        await writeOperation({
          ...local,
          state: receipt.status,
          error_code: receipt.error_code,
          conflict: receipt.conflict,
        });
      } else {
        await writeOperation({ ...local, state: "PENDING" });
      }
    }
    await cachePilotData(scope, "sync:last-success", new Date().toISOString());
    return { applied: response.applied, conflicts: response.conflicts, rejected: response.rejected };
  } catch (error) {
    await Promise.all(queued.map((item) => writeOperation({ ...item, state: "PENDING" })));
    throw error;
  }
}

export async function clearPilotOfflineData() {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
  window.localStorage.removeItem(DEVICE_KEY);
}
