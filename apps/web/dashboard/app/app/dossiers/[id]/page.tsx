import { DossierDetailPage } from "@/components/dossiers/dossier-detail-page";
import { RouteAccessGuard } from "@/components/permissions/route-access-guard";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RouteAccessGuard permission="dossiers.read"><DossierDetailPage dossierId={id} /></RouteAccessGuard>;
}
