"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getTenantContext,
  switchTenant,
} from "@/services/tenant";

export function OrganizationSwitcher({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  type Tenant = {
    org_id: string;
    organization_name?: string | null;
    role_code?: string | null;
  };

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getTenantContext();
      setTenants(data.tenants || []);
      setActiveTenant(data.active_tenant || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSwitch(orgId: string) {
    if (!orgId || orgId === activeTenant?.org_id) return;
    setSwitching(true);
    setError("");
    try {
      const active = await switchTenant(orgId);
      setActiveTenant(active);
      window.location.reload();
    } catch {
      setError("Changement impossible");
      setSwitching(false);
    }
  }

  if (loading) {
    return (
      <div
        className={
          variant === "dark"
            ? "text-xs text-slate-400"
            : "text-xs text-gray-500"
        }
      >
        Chargement organisation...
      </div>
    );
  }

  if (!tenants.length) {
    return (
      <div
        className={
          variant === "dark"
            ? "rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs text-slate-400"
            : "rounded-md border border-[#dededb] bg-white p-2.5 text-xs text-slate-500"
        }
      >
        Aucune organisation active.
      </div>
    );
  }

  return (
    <div
      className={
        variant === "dark"
          ? "rounded-2xl border border-white/10 bg-white/[0.04] p-3"
          : "rounded-md border-0 bg-transparent p-0"
      }
    >
      <div
        className={
          variant === "dark"
            ? "text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
            : "px-1 text-[11px] font-normal text-[#777]"
        }
      >
        {variant === "dark" ? "Organisation active" : "Espace actif"}
      </div>

      <select
        value={activeTenant?.org_id || ""}
        onChange={(event) => handleSwitch(event.target.value)}
        disabled={switching}
        aria-label="Organisation active"
        className={
          variant === "dark"
            ? "mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
            : "mt-1 w-full truncate rounded-[4px] border-0 bg-[#eeeeec] px-2.5 py-2 text-[13px] font-normal text-[#333] outline-none transition hover:bg-[#e7e7e4] focus:ring-2 focus:ring-[#7771ed]/20 disabled:cursor-wait disabled:opacity-60"
        }
      >
        {tenants.map((tenant) => (
          <option key={tenant.org_id} value={tenant.org_id}>
            {tenant.organization_name} - {tenant.role_code}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 px-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
