"use client";

import { ChevronDown, Grid2X2, List, MoreHorizontal, Star, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const bases = [
  { title: "Suivi des dossiers", href: "/app/dossiers", icon: "📦", meta: "Opened today" },
  { title: "Clients", href: "/app/clients", icon: "👥", meta: "Opened 2 days ago" },
  { title: "Facturation", href: "/app/finance", icon: "💳", meta: "Opened 5 days ago" },
];

export function DashboardOverviewPage() {
  const [typeOpen, setTypeOpen] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");

  return (
    <div className="min-h-full bg-[#f8f8f7]">
      <div className="mx-auto max-w-[1540px] px-12 py-9 max-lg:px-6 max-sm:px-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#202124]">Home</h1>
          <div className="hidden items-center gap-2 text-[#4f555a] sm:flex">
            <button
              onClick={() => setView("list")}
              aria-label="List view"
              className={`rounded-[4px] p-1.5 hover:bg-[#ececea] ${view === "list" ? "bg-[#ececea]" : ""}`}
            >
              <List size={19} />
            </button>
            <button
              onClick={() => setView("grid")}
              aria-label="Grid view"
              className={`rounded-[4px] p-1.5 hover:bg-[#ececea] ${view === "grid" ? "bg-[#ececea]" : ""}`}
            >
              <Grid2X2 size={19} />
            </button>
          </div>
        </div>

        <section className="relative mt-7 min-h-[150px] overflow-hidden rounded-[6px] border border-[#cfd8df] bg-[#eef6ff] shadow-sm">
          <button aria-label="Fermer" className="absolute right-4 top-4 rounded-[4px] p-1 text-[#2f3437] hover:bg-white/70">
            <X size={16} />
          </button>
          <div className="relative z-10 px-10 py-7 max-sm:px-5">
            <h2 className="text-[17px] font-medium text-[#202124]">Unlock more power on the Team plan</h2>
            <p className="mt-2 text-[13px] text-[#2f3437]">
              More records. More automations. More customization. More Slaivio.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-5">
              <button className="inline-flex h-9 items-center gap-2 rounded-full bg-[#202124] px-8 text-[15px] font-medium text-white hover:bg-black">
                <Star size={15} />
                Upgrade
              </button>
              <button className="inline-flex h-9 items-center gap-2 text-[15px] text-[#5f6368] hover:text-[#202124]">
                ⇆ Compare plans
              </button>
            </div>
          </div>
          <div className="absolute bottom-0 right-8 hidden h-[120px] w-[380px] opacity-90 md:block">
            <div className="absolute bottom-5 right-0 h-12 w-24 rounded-[4px] bg-[#38bdf8]/30" />
            <div className="absolute bottom-6 right-28 h-20 w-24 rounded-[5px] bg-[#0ea5e9]/60" />
            <div className="absolute bottom-4 right-58 h-11 w-24 rounded-[4px] bg-[#c4b5fd]/70" />
            <div className="absolute bottom-3 right-16 h-24 w-44 rounded-[5px] border border-[#b8c7d8] bg-white shadow-sm">
              <div className="h-6 rounded-t-[5px] bg-[#1f5f9e]" />
              <div className="grid grid-cols-3 gap-1 p-2">
                {Array.from({ length: 9 }).map((_, index) => (
                  <span key={index} className="h-2 rounded bg-[#dbeafe]" />
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="relative mt-5">
          <button
            onClick={() => setTypeOpen((value) => !value)}
            className="inline-flex h-8 items-center gap-1.5 text-[15px] text-[#5f6368] hover:text-[#202124]"
          >
            Opened anytime
            <ChevronDown size={15} />
          </button>
          {typeOpen && (
            <div className="absolute left-0 top-9 z-20 w-[242px] rounded-[5px] border border-[#d3d3d0] bg-white py-3 shadow-2xl">
              {["Select all", "Interfaces", "Apps", "Workspaces"].map((item) => (
                <label key={item} className="flex h-10 items-center gap-3 px-4 text-[13px] hover:bg-[#f5f5f3]">
                  <input type="checkbox" defaultChecked className="h-4 w-4 accent-[#1a73e8]" />
                  {item}
                </label>
              ))}
            </div>
          )}
        </div>

        {view === "grid" ? (
          <div className="mt-7 grid max-w-5xl gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {bases.map((base) => (
              <BaseCard key={base.href} {...base} />
            ))}
          </div>
        ) : (
          <div className="mt-7 max-w-5xl overflow-hidden rounded-[6px] border border-[#d3d3d0] bg-white shadow-sm">
            <div className="grid grid-cols-[1fr_160px_72px] border-b border-[#d9d9d6] bg-[#f7f7f5] px-4 py-2 text-[12px] font-medium text-[#5f6368]">
              <span>Name</span>
              <span>Last opened</span>
              <span />
            </div>
            {bases.map((base) => (
              <Link
                key={base.href}
                href={base.href}
                className="grid grid-cols-[1fr_160px_72px] items-center border-b border-[#eeeeeb] px-4 py-3 text-[14px] last:border-0 hover:bg-[#f8f8f7]"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#ffba00] text-[20px] shadow-sm">
                    {base.icon}
                  </span>
                  {base.title}
                </span>
                <span className="text-[12px] text-[#6b7075]">{base.meta}</span>
                <span className="justify-self-end text-[#6b7075]">
                  <MoreHorizontal size={17} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BaseCard({ title, href, icon, meta }: { title: string; href: string; icon: string; meta: string }) {
  return (
    <Link
      href={href}
      className="group flex min-h-[94px] items-center gap-4 rounded-[6px] border border-[#d3d3d0] bg-white px-5 py-4 shadow-sm transition hover:shadow-md"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[11px] bg-[#ffba00] text-[25px] shadow-sm ring-1 ring-black/10">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-[#202124]">{title}</span>
        <span className="mt-1 block text-[12px] text-[#6b7075]">{meta}</span>
      </span>
      <span className="opacity-0 transition group-hover:opacity-100">
        <MoreHorizontal size={18} />
      </span>
    </Link>
  );
}

export function StarredPreviewPage() {
  return (
    <div className="min-h-full bg-[#f8f8f7] px-12 py-9">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Starred</h1>
      <button className="mt-8 inline-flex h-8 items-center gap-1 text-[15px]">
        Show all types <ChevronDown size={15} />
      </button>
      <div className="mt-[260px] text-center">
        <h2 className="text-[22px] text-[#202124]">You haven&apos;t starred anything</h2>
        <p className="mt-2 text-[13px] text-[#6b7075]">Click the star icon on any base, app, or workspace to add it here for quick access.</p>
        <Link href="/app" className="mt-7 inline-flex h-9 items-center rounded-[5px] border border-[#d3d3d0] bg-white px-4 text-[13px] shadow-sm">
          Go to all workspaces
        </Link>
      </div>
    </div>
  );
}
