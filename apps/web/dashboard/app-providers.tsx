"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ReactNode, useEffect, useState } from "react";

import { EntitlementProvider } from "@/components/entitlements/entitlement-provider";
import { FeatureProvider } from "@/components/features/feature-provider";
import { PermissionProvider } from "@/components/permissions/permission-provider";
import { setAccessTokenProvider } from "@/services/api";
import { LoadingState } from "@/components/ui/page-state";

export function AppProviders({
  children,
}: {
  children: ReactNode;
}) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const content = (
    <PermissionProvider>
      <FeatureProvider>
        <EntitlementProvider>{children}</EntitlementProvider>
      </FeatureProvider>
    </PermissionProvider>
  );

  if (!publishableKey) {
    return content;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkApiAuthBridge>{content}</ClerkApiAuthBridge>
    </ClerkProvider>
  );
}

function ClerkApiAuthBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      setReady(false);
      return;
    }
    if (!isSignedIn) {
      setAccessTokenProvider(null);
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
  return children;
}
