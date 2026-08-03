import {TrackingDetailPage} from "@/components/tracking/tracking-detail-page";
import {RouteAccessGuard} from "@/components/permissions/route-access-guard";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <RouteAccessGuard permission="tracking.read"><TrackingDetailPage trackingId={id}/></RouteAccessGuard>}
