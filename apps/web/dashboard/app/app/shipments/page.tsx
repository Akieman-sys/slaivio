import { DashboardFrame } from "@/components/dashboard/dashboard-overview";
import { ShipmentsPage } from "@/components/shipments/shipments-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <DashboardFrame>
      <ShipmentsPage />
    </DashboardFrame>
  );
}
