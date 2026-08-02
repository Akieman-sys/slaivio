import { DossiersPage } from "@/components/dossiers/dossiers-page";
import { RouteAccessGuard } from "@/components/permissions/route-access-guard";

export const dynamic = "force-dynamic";

export default function Page() {
  return <RouteAccessGuard permission="dossiers.read"><DossiersPage /></RouteAccessGuard>;
}
