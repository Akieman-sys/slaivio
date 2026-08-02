import { ClientsPage } from "@/components/clients/clients-page";
import { RouteAccessGuard } from "@/components/permissions/route-access-guard";

export const dynamic = "force-dynamic";

export default function Page() {
  return <RouteAccessGuard permission="clients.read"><ClientsPage /></RouteAccessGuard>;
}
