import { ShipmentsPage } from "@/components/shipments/shipments-page";
import { RouteAccessGuard } from "@/components/permissions/route-access-guard";

export const dynamic = "force-dynamic";

export default function Page() {
  return <RouteAccessGuard permission="shipments.read"><ShipmentsPage /></RouteAccessGuard>;
}
