import { ClerkAuthPanel } from "@/components/auth/clerk-auth-panel";
import { AuthShell } from "@/components/auth/auth-shell";

export default function Page() {
  return (
    <AuthShell
      title="Welcome to Slaivio"
      description="Cargo management built for modern freight collaboration."
    >
      <ClerkAuthPanel mode="sign-in" />
    </AuthShell>
  );
}
