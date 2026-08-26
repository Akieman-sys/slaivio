import {RouteAccessGuard} from '@/components/permissions/route-access-guard';
import {OrganizationAdminPage} from '@/components/settings/organization-admin-page';
import {PilotSettingsPage} from '@/components/settings/pilot-settings-page';
import {isPilotV1} from '@/config/product-profile';
export const dynamic='force-dynamic';
export default function Page(){const pilot=isPilotV1();return <RouteAccessGuard permission={pilot?"pilot.settings.read":"organization.read"}>{pilot?<PilotSettingsPage/>:<OrganizationAdminPage/>}</RouteAccessGuard>}
