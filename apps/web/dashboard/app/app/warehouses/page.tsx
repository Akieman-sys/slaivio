import {RouteAccessGuard} from "@/components/permissions/route-access-guard";
import {WarehousesPage} from "@/components/warehouses/warehouses-page";
export const dynamic="force-dynamic";
export default function Page(){return <RouteAccessGuard permission="warehouses.read"><WarehousesPage/></RouteAccessGuard>}
