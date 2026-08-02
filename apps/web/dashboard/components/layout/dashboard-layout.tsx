"use client";

import { ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  Globe2,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { Sidebar } from "@/components/sidebar/sidebar";
import { OrganizationSwitcher } from "@/components/tenant/organization-switcher";
import { getCurrentManager } from "@/services/auth";
import type { Manager } from "@/types/auth";

export function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();

  const [manager, setManager] = useState<Manager | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    getCurrentManager()
      .then((managerData) => setManager(managerData))
      .catch(() => {
        router.push("/sign-in");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <div className="slaivo-shell-bg flex h-screen items-center justify-center">
        <div className="slaivo-card rounded-3xl p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <Sparkles size={22} />
          </div>
          <div className="mt-5 text-lg font-bold">Chargement SLAIVIO</div>
          <div className="mt-2 text-sm text-slate-500">
            Préparation de votre centre opérationnel cargo...
          </div>
        </div>
      </div>
    );
  }

  const managerName =
    manager?.full_name ||
    manager?.name ||
    manager?.email ||
    "Manager SLAIVIO";
  const orgLabel = manager?.org_id || manager?.tenant_org_id || "Organisation";

  return (
    <div className="slaivo-shell-bg min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-80 border-r border-white/10 bg-[#0b1120] text-white shadow-2xl xl:block">
        <div className="flex h-full flex-col">
          <SidebarHeader managerName={managerName} orgLabel={orgLabel} />
          <div className="px-5 pb-4">
            <OrganizationSwitcher variant="dark" />
          </div>
          <Sidebar />
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            aria-label="Fermer le menu"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative h-full w-[86vw] max-w-sm bg-[#0b1120] text-white shadow-2xl">
            <div className="absolute right-4 top-4">
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl border border-white/10 p-2 text-slate-300"
              >
                <X size={18} />
              </button>
            </div>
            <SidebarHeader managerName={managerName} orgLabel={orgLabel} />
            <div className="px-5 pb-4">
              <OrganizationSwitcher variant="dark" />
            </div>
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="min-h-screen xl:pl-80">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-700 shadow-sm xl:hidden"
            >
              <Menu size={19} />
            </button>

            <div className="hidden min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-100 md:flex">
              <Search size={18} className="text-slate-400" />
              <input
                placeholder="Rechercher dossier, tracking, client, batch..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="ml-auto flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 lg:flex">
                <ShieldCheck size={15} />
                Stabilisation en cours
              </div>

              <button className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-600 shadow-sm transition hover:border-emerald-200 hover:text-emerald-700">
                <Bell size={18} />
              </button>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-sm font-black text-white shadow-lg shadow-emerald-500/20">
                  {managerName.slice(0, 1).toUpperCase()}
                </div>
                <div className="hidden text-sm md:block">
                  <div className="font-semibold text-slate-900">
                    {managerName}
                  </div>
                  <div className="text-xs text-slate-500">{orgLabel}</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="slaivo-grid-bg min-h-[calc(100vh-73px)] overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarHeader({
  managerName,
  orgLabel,
}: {
  managerName: string;
  orgLabel: string;
}) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10">
          <Image
            src="/slaivio-icon.png"
            alt="SLAIVIO"
            width={48}
            height={48}
            className="h-full w-full object-cover"
          />
        </div>
        <div>
          <div className="text-2xl font-black tracking-tight">SLAIVIO</div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-300">
            Cargo OS
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.045] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-200">
            <Building2 size={18} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {managerName}
            </div>
            <div className="truncate text-xs text-slate-400">
              {orgLabel}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-black/20 px-3 py-2 text-xs text-slate-300">
          <Globe2 size={14} className="text-emerald-300" />
          Multi-country operations
        </div>
      </div>
    </div>
  );
}
