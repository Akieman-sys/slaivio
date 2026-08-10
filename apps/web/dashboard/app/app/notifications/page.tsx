import {RouteAccessGuard} from '@/components/permissions/route-access-guard';import {NotificationCenterPage} from '@/components/notifications/notification-center-page';
export const dynamic='force-dynamic';export default function Page(){return <RouteAccessGuard permission="notifications.read"><NotificationCenterPage/></RouteAccessGuard>}
