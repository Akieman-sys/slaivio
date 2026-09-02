import { api } from "@/services/api";

export async function getTenantContext() {
  const response = await api.get("/tenant/context");

  return response.data;
}

export async function switchTenant(orgId: string) {
  const response = await api.post("/tenant/switch", {
    org_id: orgId,
  });

  return response.data.active_tenant;
}

export async function createTenant(organizationName: string) {
  const response = await api.post("/tenant/organizations", {
    organization_name: organizationName,
  });
  return response.data;
}

