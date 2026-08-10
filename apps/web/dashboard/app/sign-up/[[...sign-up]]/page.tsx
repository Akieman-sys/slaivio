import { ClerkAuthPanel } from "@/components/auth/clerk-auth-panel";
import { AuthShell } from "@/components/auth/auth-shell";

export default function Page() {
  return (
    <AuthShell
      title="Créez votre espace Slaivio"
      description="Configurez votre agence cargo, invitez votre équipe et centralisez vos opérations."
    >
      <ClerkAuthPanel mode="sign-up" />
    </AuthShell>
  );
}
