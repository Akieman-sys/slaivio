import {RouteAccessGuard} from "@/components/permissions/route-access-guard";
import {WarehouseDetailPage} from "@/components/warehouses/warehouse-detail-page";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <RouteAccessGuard permission="warehouses.read"><WarehouseDetailPage id={id}/></RouteAccessGuard>}
