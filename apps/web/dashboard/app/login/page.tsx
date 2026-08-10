"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";

export default function LoginPage() {
  return (
    <AuthShell
      title="Connectez-vous à Slaivio"
      description="Pilotez vos clients, dossiers, colis et expéditions depuis un espace opérationnel unique."
    >
      <div className="space-y-4">
        <Link
          href="/sign-in"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-[5px] bg-[#5651db] px-4 text-sm font-semibold text-white hover:bg-[#4843c8]"
        >
          Ouvrir Clerk Sign In
          <ArrowRight size={16} />
        </Link>

        <div className="rounded-[6px] border border-[#dfe1e3] bg-[#f8f8f7] p-4 text-sm leading-6 text-[#69717a]">
          L’ancien login local a été retiré. Les accès passent maintenant par
          Clerk uniquement.
        </div>
      </div>
    </AuthShell>
  );
}
