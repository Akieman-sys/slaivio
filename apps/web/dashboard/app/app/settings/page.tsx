import {RouteAccessGuard} from '@/components/permissions/route-access-guard';
import {OrganizationAdminPage} from '@/components/settings/organization-admin-page';
export const dynamic='force-dynamic';
export default function Page(){return <RouteAccessGuard permission="organization.read"><OrganizationAdminPage/></RouteAccessGuard>}
