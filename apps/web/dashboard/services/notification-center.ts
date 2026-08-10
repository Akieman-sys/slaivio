import {api} from './api';
export type CenterItem={id:string;source:'IN_APP'|'DELIVERY';category:string;title:string;message:string;priority:string;created_at:string;read_at?:string;archived_at?:string;resource_id?:string;delivery_status?:string;error_message?:string};
export type CenterResponse={items:CenterItem[];total:number;page:number;page_size:number;stats:{total:number;unread:number;failed:number;urgent:number}};
export type NotificationPreference={category:string;in_app:boolean;email:boolean;whatsapp:boolean;quiet_hours_start?:string;quiet_hours_end?:string;digest_frequency:string};
export async function listNotifications(params:Record<string,unknown>={}){return (await api.get<CenterResponse>('/notification-center',{params})).data}
export async function notificationAction(item:CenterItem,action:string,minutes?:number){return (await api.patch(`/notification-center/${item.source}/${item.id}`,{action,minutes})).data}
export async function markAllRead(){return (await api.post('/notification-center/read-all')).data}
export async function retryDelivery(id:string){return (await api.post(`/notification-center/delivery/${id}/retry`)).data}
export async function getNotificationPreferences(){return (await api.get<{preferences:NotificationPreference[]}>('/notification-center/preferences')).data.preferences}
export async function saveNotificationPreference(payload:NotificationPreference){return (await api.put('/notification-center/preferences',payload)).data}
