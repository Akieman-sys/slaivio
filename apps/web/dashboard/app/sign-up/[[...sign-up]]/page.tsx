import { ClerkAuthPanel } from "@/components/auth/clerk-auth-panel";
import { AuthShell } from "@/components/auth/auth-shell";

export default function Page() {
  return (
    <AuthShell
      title="Create your Slaivio account"
      description="Launch your cargo workspace and invite the team."
    >
      <ClerkAuthPanel mode="sign-up" />
    </AuthShell>
  );
}
