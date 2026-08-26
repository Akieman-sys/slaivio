"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ReactNode, useEffect, useState } from "react";

import { EntitlementProvider } from "@/components/entitlements/entitlement-provider";
import { FeatureProvider } from "@/components/features/feature-provider";
import { PermissionProvider } from "@/components/permissions/permission-provider";
import { setAccessTokenProvider } from "@/services/api";
import { LoadingState } from "@/components/ui/page-state";
import { ApiMutationFeedback } from "@/components/ui/api-mutation-feedback";
import { PilotOfflineProvider } from "@/components/offline/pilot-offline-provider";
import { clearPilotOfflineData } from "@/services/pilot-offline";

export function AppProviders({
  children,
}: {
  children: ReactNode;
}) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const content = (
    <PermissionProvider>
      <FeatureProvider>
        <EntitlementProvider>{children}<ApiMutationFeedback /></EntitlementProvider>
      </FeatureProvider>
    </PermissionProvider>
  );

  if (!publishableKey) {
    return <PilotOfflineProvider scopeKey="local-development">{content}</PilotOfflineProvider>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkApiAuthBridge>{content}</ClerkApiAuthBridge>
    </ClerkProvider>
  );
}

function ClerkApiAuthBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, userId, orgId } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      setReady(false);
      return;
    }
    if (!isSignedIn) {
      setAccessTokenProvider(null);
      void clearPilotOfflineData();
      setReady(true);
      return;
    }
    setAccessTokenProvider((options) => getToken(options));
    setReady(true);
    return () => {
      setReady(false);
      setAccessTokenProvider(null);
    };
  }, [getToken, isLoaded, isSignedIn]);

  if (!ready) {
    return <div className="min-h-screen bg-[#f7f7f6]"><LoadingState label="Préparation de votre espace Slaivio…" /></div>;
  }
  return <PilotOfflineProvider scopeKey={`${userId || "account"}:${orgId || "personal"}`}>{children}</PilotOfflineProvider>;
}
