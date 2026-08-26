"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  cachePilotData, discardPilotOperation, listPilotOperations, queuePilotOperation, readPilotCache,
  synchronizePilotQueue, PILOT_SYNCED_EVENT, type OfflineOperation,
} from "@/services/pilot-offline";

type QueueInput = Omit<OfflineOperation, "id" | "scope" | "state" | "created_at" | "updated_at">;
type OfflineContextValue = {
  scopeKey: string;
  online: boolean;
  syncing: boolean;
  pending: number;
  conflicts: number;
  rejected: number;
  issues: OfflineOperation[];
  cache: (key: string, data: unknown) => Promise<void>;
  cached: <T>(key: string) => Promise<T | null>;
  enqueue: (operation: QueueInput) => Promise<void>;
  syncNow: () => Promise<void>;
  dismissIssue: (id: string) => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function PilotOfflineProvider({ scopeKey, children }: { scopeKey: string; children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [issues, setIssues] = useState<OfflineOperation[]>([]);

  const refresh = useCallback(async () => {
    const operations = await listPilotOperations(scopeKey);
    setPending(operations.filter((item) => item.state === "PENDING" || item.state === "SYNCING").length);
    setConflicts(operations.filter((item) => item.state === "CONFLICT").length);
    setRejected(operations.filter((item) => item.state === "REJECTED").length);
    setIssues(operations.filter((item) => item.state === "CONFLICT" || item.state === "REJECTED"));
  }, [scopeKey]);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await synchronizePilotQueue(scopeKey);
      if (result.applied || result.conflicts || result.rejected) window.dispatchEvent(new CustomEvent(PILOT_SYNCED_EVENT, { detail: result }));
    }
    finally { syncingRef.current = false; setSyncing(false); await refresh(); }
  }, [refresh, scopeKey]);

  const cache = useCallback((key: string, data: unknown) => cachePilotData(scopeKey, key, data), [scopeKey]);
  const cached = useCallback(<T,>(key: string) => readPilotCache<T>(scopeKey, key), [scopeKey]);
  const enqueue = useCallback(async (operation: QueueInput) => {
    await queuePilotOperation(scopeKey, operation);
    await refresh();
  }, [refresh, scopeKey]);
  const dismissIssue = useCallback(async (id: string) => {
    await discardPilotOperation(id);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refresh();
    const connected = () => { setOnline(true); void syncNow(); };
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/pilot-sw.js");
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, [refresh, syncNow]);

  useEffect(() => {
    if (online) void syncNow();
    const timer = window.setInterval(() => { if (navigator.onLine) void syncNow(); }, 30000);
    return () => window.clearInterval(timer);
  }, [online, syncNow]);

  const value = useMemo<OfflineContextValue>(() => ({
    scopeKey, online, syncing, pending, conflicts, rejected, issues,
    cache, cached, enqueue,
    syncNow, dismissIssue,
  }), [cache, cached, conflicts, dismissIssue, enqueue, issues, online, pending, rejected, scopeKey, syncNow, syncing]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function usePilotOffline() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error("usePilotOffline must be used inside PilotOfflineProvider");
  return context;
}
