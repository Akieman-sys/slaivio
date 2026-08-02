"use client";

import type { ReactNode } from "react";

import { usePermissions } from "@/components/permissions/permission-provider";
import { ForbiddenState, LoadingState } from "@/components/ui/page-state";

export function RouteAccessGuard({ permission, children }: { permission: string; children: ReactNode }) {
  const { permissions, loading, available } = usePermissions();

  if (loading) return <LoadingState label="Vérification de vos droits…" />;
  // En cas d'indisponibilité du service RBAC, l'API reste l'autorité finale.
  if (!available) return <>{children}</>;
  if (!permissions.includes(permission)) return <ForbiddenState />;
  return <>{children}</>;
}
