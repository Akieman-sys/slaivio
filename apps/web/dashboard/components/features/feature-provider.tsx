"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { getFeatures } from "@/services/features";

type Feature = { flag_key: string; enabled: boolean };
type FeatureContextValue = {
  features: Record<string, boolean>;
  loading: boolean;
  reload: () => Promise<void>;
};

const FeatureContext = createContext<FeatureContextValue | null>(null);

export function FeatureProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getFeatures();
      const map: Record<string, boolean> = {};

      data.forEach((feature: Feature) => {
        map[feature.flag_key] = feature.enabled;
      });

      setFeatures(map);
    } catch {
      setFeatures({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <FeatureContext.Provider value={{ features, loading, reload: load }}>
      {children}
    </FeatureContext.Provider>
  );
}

export function useFeatures() {
  const context = useContext(FeatureContext);

  if (!context) {
    throw new Error("FeatureProvider missing");
  }

  return context;
}

