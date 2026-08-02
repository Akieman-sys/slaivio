"use client";

import { ErrorState } from "@/components/ui/page-state";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Cette page n’a pas pu être chargée" description="Réessayez. Si le problème persiste, contactez le support avec l’heure de l’incident." retry={reset} />;
}
