import {RouteAccessGuard} from '@/components/permissions/route-access-guard';
import {BatchCenterPage} from '@/components/batches/batch-center-page';
export const dynamic='force-dynamic';
export default function Page(){return <RouteAccessGuard permission="batches.read"><BatchCenterPage/></RouteAccessGuard>}
