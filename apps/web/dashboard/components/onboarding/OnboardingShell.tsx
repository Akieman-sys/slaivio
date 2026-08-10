import { ReactNode } from "react";
import Link from "next/link";
import { LifeBuoy, ShieldCheck } from "lucide-react";

import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { SlaivioBrand } from "@/components/ui/slaivio-brand";
import type { OnboardingExperienceState } from "@/services/onboarding-experience";

export function OnboardingShell({
  children,
  state,
}: {
  children: ReactNode;
  state: OnboardingExperienceState;
}) {
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[360px_1fr]">
        <aside className="bg-[#07111f] p-6 text-white">
          <Link href="/landing" className="flex items-center gap-3">
            <SlaivioBrand inverse />
          </Link>

          <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.06] p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">Agency setup</span>
              <span className="font-black text-white">{state.progress}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-emerald-400"
                style={{ width: `${state.progress || 0}%` }}
              />
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-300">
              <ShieldCheck size={15} className="text-emerald-300" />
              Production readiness: {state.readiness_score}%
            </div>
          </div>

          <OnboardingStepper steps={state.steps || []} />

          <div className="mt-8 rounded-3xl border border-sky-400/20 bg-sky-400/10 p-5 text-sm">
            <div className="flex items-center gap-2 font-bold text-sky-100">
              <LifeBuoy size={17} />
              Besoin d’aide ?
            </div>
            <p className="mt-2 text-slate-300">
              Configurez uniquement les informations réelles de votre agence:
              bureaux, warehouses, routes, prix et WhatsApp officiel.
            </p>
          </div>
        </aside>

        <section className="min-h-screen overflow-auto p-5 md:p-10">
          {children}
        </section>
      </div>
    </main>
  );
}
