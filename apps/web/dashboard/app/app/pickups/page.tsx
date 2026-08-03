import {RouteAccessGuard} from "@/components/permissions/route-access-guard";import {PickupsPage} from "@/components/pickups/pickups-page";
export const dynamic="force-dynamic";export default function Page(){return <RouteAccessGuard permission="pickups.read"><PickupsPage/></RouteAccessGuard>}
