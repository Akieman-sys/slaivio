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
    const active = await switchTenant(orgId);
    setActiveTenant(active);
    window.location.reload();
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
            : "rounded-xl border p-3 text-xs text-gray-500"
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
          : "rounded-xl border bg-white p-3"
      }
    >
      <div
        className={
          variant === "dark"
            ? "text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
            : "text-xs text-gray-500"
        }
      >
        Organisation active
      </div>

      <select
        value={activeTenant?.org_id || ""}
        onChange={(event) => handleSwitch(event.target.value)}
        className={
          variant === "dark"
            ? "mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
            : "mt-2 w-full rounded-lg border px-3 py-2 text-sm"
        }
      >
        {tenants.map((tenant) => (
          <option key={tenant.org_id} value={tenant.org_id}>
            {tenant.organization_name} - {tenant.role_code}
          </option>
        ))}
      </select>
    </div>
  );
}
