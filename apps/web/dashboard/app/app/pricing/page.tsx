import {RouteAccessGuard} from "@/components/permissions/route-access-guard";
import {PricingEnginePage} from "@/components/pricing/pricing-engine-page";
export const dynamic="force-dynamic";
export default function Page(){return <RouteAccessGuard permission="pricing.read"><PricingEnginePage/></RouteAccessGuard>}
