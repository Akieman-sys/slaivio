"use client";

import { Building2, Check, ChevronDown, Settings, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { getTenantContext, switchTenant } from "@/services/tenant";

type Tenant = {
  org_id: string;
  organization_name?: string | null;
  role_code?: string | null;
};

export function OrganizationSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getTenantContext();
      setTenants(data.tenants || []);
      setActiveTenant(data.active_tenant || null);
    } catch {
      setError("Espaces indisponibles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  async function handleSwitch(tenant: Tenant) {
    if (tenant.org_id === activeTenant?.org_id) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    setError("");
    try {
      await switchTenant(tenant.org_id);
      window.sessionStorage.removeItem("slaivio:dashboard-home");
      window.location.reload();
    } catch {
      setError("Changement impossible");
      setSwitching(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${collapsed ? "lg:p-0" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={loading || switching}
        aria-expanded={open}
        title={collapsed ? activeTenant?.organization_name || "Espace actif" : undefined}
        className={`flex min-h-11 w-full items-center rounded-[6px] border border-[#d8dadd] bg-white text-left shadow-[0_1px_1px_rgba(15,23,42,.03)] hover:bg-[#f7f7f6] disabled:opacity-60 ${collapsed ? "lg:justify-center lg:px-1" : "gap-2 px-3"}`}
      >
        {collapsed && <Building2 size={17} className="hidden text-[#16855f] lg:block" />}
        <span className={`min-w-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}>
          <span className="block text-[10px] font-medium uppercase text-[#83878d]">Espace actif</span>
          <span className="block truncate text-[13px] font-medium text-[#25292e]">
            {loading ? "Chargement..." : activeTenant?.organization_name || "Aucune agence"}
          </span>
        </span>
        <ChevronDown size={15} className={`shrink-0 text-[#73777c] transition ${collapsed ? "lg:hidden" : ""} ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className={`absolute z-50 w-[248px] overflow-hidden rounded-[7px] border border-[#d2d5d8] bg-white shadow-[0_14px_38px_rgba(15,23,42,.16)] ${collapsed ? "bottom-0 left-[48px]" : "bottom-[52px] left-0"}`}>
          <div className="flex h-10 items-center border-b border-[#eceeed] px-3 text-[12px] font-medium text-[#5f6670]">
            Changer d’agence
            <button type="button" onClick={() => setOpen(false)} className="ml-auto rounded p-1 hover:bg-[#f0f1f1]" aria-label="Fermer">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5">
            {tenants.map((tenant) => (
              <button
                key={tenant.org_id}
                type="button"
                onClick={() => handleSwitch(tenant)}
                className="flex min-h-10 w-full items-center gap-2 rounded-[5px] px-2 text-left hover:bg-[#f3f4f4]"
              >
                <Building2 size={15} className="text-[#686e75]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{tenant.organization_name || "Agence"}</span>
                  <span className="block text-[10px] text-[#848990]">{tenant.role_code || "Membre"}</span>
                </span>
                {tenant.org_id === activeTenant?.org_id && <Check size={15} className="text-[#16855f]" />}
              </button>
            ))}
          </div>
          <div className="border-t border-[#eceeed] p-1.5">
            <Link href="/app/settings?section=agency" onClick={() => setOpen(false)} className="flex h-9 items-center gap-2 rounded-[5px] px-2 text-[13px] hover:bg-[#f3f4f4]">
              <Settings size={15} />
              Ouvrir les paramètres
            </Link>
          </div>
        </div>
      )}
      {error && <p className="mt-1 px-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
