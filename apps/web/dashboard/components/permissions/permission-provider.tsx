"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { getMyPermissions } from "@/services/permissions";

type PermissionContextValue = {
  permissions: string[];
  loading: boolean;
  available: boolean;
  reload: () => Promise<void>;
};

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getMyPermissions();
      setPermissions(data.permissions || []);
      setAvailable(true);
    } catch {
      setPermissions([]);
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PermissionContext.Provider
      value={{
        permissions,
        loading,
        available,
        reload: load,
      }}
    >
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionContext);

  if (!context) {
    throw new Error("PermissionProvider missing");
  }

  return context;
}

