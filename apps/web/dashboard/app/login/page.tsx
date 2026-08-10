"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome to Slaivio"
      description="Cargo management built for modern freight collaboration."
    >
      <div className="space-y-4">
        <Link
          href="/sign-in"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-800"
        >
          Ouvrir Clerk Sign In
          <ArrowRight size={16} />
        </Link>

        <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          L’ancien login local a été retiré. Les accès passent maintenant par
          Clerk uniquement.
        </div>
      </div>
    </AuthShell>
  );
}
