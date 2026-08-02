"use client";

import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { useEffect, useState } from "react";

import { getDashboardHome, type DashboardHome } from "@/services/dashboard";

export function DashboardOverviewPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [homeData, setHomeData] = useState<DashboardHome | null>(null);
  const [agencyState, setAgencyState] = useState<"loading" | "ready" | "none" | "error">("loading");
  const [agencyError, setAgencyError] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setAgencyState("error");
      return;
    }

    let active = true;
    getToken()
      .then((token) => getDashboardHome(token))
      .then((home) => {
        if (!active) return;
        setHomeData(home);
        if (home.status === "no_workspace" || !home.workspace.org_id) {
          setAgencyState("none");
          return;
        }
        setAgencyState("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAgencyState("error");
        if (!axios.isAxiosError(error) || !error.response) {
          setAgencyError("API Slaivio injoignable. Vérifiez NEXT_PUBLIC_API_URL et le service backend Render.");
          return;
        }
        const status = error.response.status;
        if (status === 401) {
          setAgencyError("Authentification refusée (401). Vérifiez CLERK_JWKS_URL et que le frontend et le backend utilisent la même instance Clerk.");
        } else if (status === 403 || status === 409) {
          setAgencyError(`Agence non provisionnée (${status}). Vérifiez le webhook Clerk et le membership.`);
        } else if (status >= 500) {
          setAgencyError(`Erreur backend/Supabase (${status}). Consultez les logs du backend Render.`);
        } else {
          setAgencyError(`L’API a répondu avec le statut ${status}.`);
        }
      });

    return () => { active = false; };
  }, [getToken, isLoaded, isSignedIn]);

  return (
    <>
      <div className="mx-auto max-w-[1240px] px-6 py-8 sm:px-10 lg:px-12">
        <h1 className="text-[28px] font-semibold tracking-[-0.035em]">Accueil</h1>
        <p className={`mt-3 text-sm ${agencyState === "error" ? "text-red-600" : "text-slate-500"}`}>
          {agencyState === "loading" && "Chargement de votre agence…"}
          {agencyState === "ready" && <>Votre espace Slaivio est connecté aux données de votre agence.</>}
          {agencyState === "none" && "Aucune agence associée à ce compte."}
          {agencyState === "error" && agencyError}
        </p>
        <ConnectedAccountCard home={homeData} state={agencyState} />
      </div>
    </>
  );
}
function ConnectedAccountCard({ home, state }: { home: DashboardHome | null; state: "loading" | "ready" | "none" | "error" }) {
  const manager = home?.manager;
  const workspace = home?.workspace;
  const whatsapp = home?.whatsapp;

  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-[#d9dce1] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="border-b border-[#e3e6eb] px-6 py-4">
        <h2 className="text-base font-semibold text-[#1d1f25]">Compte connecté</h2>
        <p className="mt-1 text-sm text-slate-500">Première information affichée dans l’accueil : l’identité et l’agence active du compte.</p>
      </div>

      {state === "loading" && (
        <div className="grid gap-4 p-6 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {state !== "loading" && (
        <div className="grid gap-0 md:grid-cols-[1.1fr_1fr_1fr]">
          <div className="border-b border-[#e3e6eb] p-6 md:border-b-0 md:border-r">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1d1f25] text-sm font-semibold text-white">
                {manager?.initials || "SL"}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#1d1f25]">{manager?.name || "Compte Slaivio"}</p>
                <p className="mt-1 truncate text-sm text-slate-500">{manager?.email || "Email non disponible"}</p>
              </div>
            </div>
          </div>

          <div className="border-b border-[#e3e6eb] p-6 md:border-b-0 md:border-r">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Agence active</p>
            <p className="mt-3 truncate text-sm font-semibold text-[#1d1f25]">{workspace?.name || "Aucune agence"}</p>
            <p className="mt-1 text-sm text-slate-500">
              {workspace?.country || workspace?.city
                ? [workspace.city, workspace.country].filter(Boolean).join(", ")
                : state === "none" ? "Aucun workspace associé" : "Localisation non renseignée"}
            </p>
          </div>

          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">WhatsApp Business</p>
            <div className="mt-3 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${whatsapp?.configured ? "bg-emerald-500" : "bg-slate-300"}`} />
              <p className="text-sm font-semibold text-[#1d1f25]">{whatsapp?.configured ? "Connecté" : "Non configuré"}</p>
            </div>
            <p className="mt-1 truncate text-sm text-slate-500">{whatsapp?.phone || whatsapp?.status || "Aucun numéro actif"}</p>
          </div>
        </div>
      )}
    </section>
  );
}
