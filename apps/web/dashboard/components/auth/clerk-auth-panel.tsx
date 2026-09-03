"use client";

import { SignIn, SignUp, useUser } from "@clerk/nextjs";

import { AuthSessionState } from "@/components/auth/auth-session-state";
import { clerkAppearance } from "@/components/auth/clerk-appearance";
import { SlaivioBrand } from "@/components/ui/slaivio-brand";

export function ClerkAuthPanel({ mode }: { mode: "sign-in" | "sign-up" }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return (
      <div className="rounded-3xl border border-red-100 bg-red-50 p-6 text-sm leading-6 text-red-700 shadow-sm">
        <p className="font-semibold">Authentification indisponible.</p>
        <p className="mt-2">
          La variable <span className="font-mono">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</span> est absente du service frontend.
          Ajoutez-la dans Railway puis redéployez l’application.
        </p>
      </div>
    );
  }

  return <ClerkAuthPanelContent mode={mode} />;
}

function ClerkAuthPanelContent({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white" role="status" aria-label="Préparation de votre espace sécurisé"><SlaivioBrand /></div>;
  }

  if (isSignedIn) {
    return mode === "sign-up" ? (
      <AuthSessionState
        title="Vous avez déjà un compte actif"
        description="Votre session SLAIVIO est déjà ouverte. Déconnectez-vous si vous voulez créer un autre compte."
      />
    ) : (
      <AuthSessionState />
    );
  }

  if (mode === "sign-up") {
    return (
      <SignUp
        appearance={clerkAppearance}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/onboarding"
        forceRedirectUrl="/onboarding"
      />
    );
  }

  return (
    <SignIn
      appearance={clerkAppearance}
      routing="path"
      path="/sign-in"
      signUpUrl="/sign-up"
      fallbackRedirectUrl="/app"
      forceRedirectUrl="/app"
    />
  );
}
