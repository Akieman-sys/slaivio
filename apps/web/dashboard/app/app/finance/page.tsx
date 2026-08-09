import {FinancePage} from "@/components/finance/finance-page";import {RouteAccessGuard} from "@/components/permissions/route-access-guard";
export const dynamic="force-dynamic";export default function Page(){return <RouteAccessGuard permission="finance.read"><FinancePage/></RouteAccessGuard>}
