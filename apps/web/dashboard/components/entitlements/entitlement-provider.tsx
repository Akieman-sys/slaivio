"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { getEntitlements } from "@/services/entitlements";

type EntitlementValue = boolean | number | null;

type EntitlementItem = {
  entitlement_key: string;
  entitlement_type: "BOOLEAN" | "LIMIT";
  boolean_value?: boolean | null;
  limit_value?: number | null;
};

type EntitlementContextValue = {
  planCode: string | null;
  entitlements: Record<string, EntitlementValue>;
  loading: boolean;
  reload: () => Promise<void>;
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function EntitlementProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [entitlements, setEntitlements] = useState<Record<string, EntitlementValue>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getEntitlements();
      setPlanCode(data.plan_code);

      const map: Record<string, EntitlementValue> = {};

      data.entitlements.forEach((item: EntitlementItem) => {
        if (item.entitlement_type === "BOOLEAN") {
          map[item.entitlement_key] = item.boolean_value ?? null;
        }

        if (item.entitlement_type === "LIMIT") {
          map[item.entitlement_key] = item.limit_value ?? null;
        }
      });

      setEntitlements(map);
    } catch {
      setEntitlements({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <EntitlementContext.Provider
      value={{
        planCode,
        entitlements,
        loading,
        reload: load,
      }}
    >
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlements() {
  const context = useContext(EntitlementContext);

  if (!context) {
    throw new Error("EntitlementProvider missing");
  }

  return context;
}

