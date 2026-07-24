import { DashboardFrame } from "@/components/dashboard/dashboard-overview";
import { DossiersPage } from "@/components/dossiers/dossiers-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <DashboardFrame>
      <DossiersPage />
    </DashboardFrame>
  );
}
