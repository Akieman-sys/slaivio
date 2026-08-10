import { ClerkAuthPanel } from "@/components/auth/clerk-auth-panel";
import { AuthShell } from "@/components/auth/auth-shell";

export default function Page() {
  return (
    <AuthShell
      title="Connectez-vous à Slaivio"
      description="Pilotez vos clients, dossiers, colis et expéditions depuis un espace opérationnel unique."
    >
      <ClerkAuthPanel mode="sign-in" />
    </AuthShell>
  );
}
