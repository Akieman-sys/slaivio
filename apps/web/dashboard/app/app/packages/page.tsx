import { DashboardFrame } from "@/components/dashboard/dashboard-overview";
import { PackagesPage } from "@/components/packages/packages-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <DashboardFrame>
      <PackagesPage />
    </DashboardFrame>
  );
}
