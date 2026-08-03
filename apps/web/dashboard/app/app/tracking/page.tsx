import {TrackingPage} from "@/components/tracking/tracking-page";
import {RouteAccessGuard} from "@/components/permissions/route-access-guard";
export const dynamic="force-dynamic";
export default function Page(){return <RouteAccessGuard permission="tracking.read"><TrackingPage/></RouteAccessGuard>}
