import { ShipmentDetailPage } from "@/components/shipments/shipment-detail-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShipmentDetailPage shipmentId={id} />;
}
