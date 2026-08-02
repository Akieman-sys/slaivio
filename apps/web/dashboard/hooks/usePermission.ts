import { usePermissions } from "@/components/permissions/permission-provider";

export function usePermission(permission: string) {
  const { permissions, loading, available } = usePermissions();

  return {
    loading,
    available,
    allowed: available && permissions.includes(permission),
  };
}

