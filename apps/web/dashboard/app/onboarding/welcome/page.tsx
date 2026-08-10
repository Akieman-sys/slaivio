"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { completeOnboardingStep } from "@/services/onboarding-experience";

export default function OnboardingWelcomePage() {
  const router = useRouter();

  async function start() {
    await completeOnboardingStep("WELCOME");
    router.push("/onboarding/agency-profile");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <section className="max-w-3xl rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 shadow-2xl md:p-12">
        <h1 className="text-4xl font-black tracking-tight md:text-6xl">
          Bienvenue. Configurons votre agence cargo.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
          SLAIVIO va vous guider à travers le profil agence, les bureaux,
          warehouses, routes, prix, équipe et WhatsApp Business officiel.
        </p>
        <div className="mt-8 grid gap-3 text-sm text-slate-200">
          {[
            "Temps estimé: 12 à 20 minutes",
            "Configuration basée sur les vraies opérations",
            "Vous pouvez sauvegarder et continuer plus tard",
          ].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-300" />
              {item}
            </div>
          ))}
        </div>
        <button
          onClick={start}
          className="mt-10 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-4 font-black text-slate-950"
        >
          Start setup
          <ArrowRight size={17} />
        </button>
      </section>
    </main>
  );
}
