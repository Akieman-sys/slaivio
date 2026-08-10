import {api} from './api';
export type Article={id:string;title:string;summary:string;content:string;category:string};
export type Ticket={id:string;ticket_reference:string;subject:string;description:string;category:string;priority:string;status:string;first_response_due_at?:string;first_response_overdue:boolean;resolution_overdue:boolean;message_count:number;row_version:number;updated_at:string};
export type TicketDetail={ticket:Ticket;messages:Array<{id:string;author_name?:string;author_type:string;message:string;created_at:string}>;attachments:Array<{id:string;file_name:string;size_bytes:number}>;events:Array<Record<string,unknown>>};
export const listArticles=async(q?:string)=>(await api.get<{articles:Article[]}>('/support/articles',{params:{q:q||undefined}})).data.articles;
export const listTickets=async(params:Record<string,unknown>={})=>(await api.get<{tickets:Ticket[]}>('/support/tickets',{params})).data.tickets;
export const createTicket=async(payload:{subject:string;description:string;category:string;priority:string})=>(await api.post<{ticket:Ticket}>('/support/tickets',payload)).data.ticket;
export const getTicket=async(id:string)=>(await api.get<TicketDetail>(`/support/tickets/${id}`)).data;
export const addTicketMessage=async(id:string,message:string)=>(await api.post(`/support/tickets/${id}/messages`,{message})).data;
export const transitionTicket=async(id:string,action:'close'|'reopen',expected_version:number)=>(await api.post(`/support/tickets/${id}/transition/${action}`,{expected_version})).data;
export async function uploadTicketAttachment(id:string,file:File){const form=new FormData();form.append('file',file);return (await api.post(`/support/tickets/${id}/attachments`,form)).data}
export const ticketAttachmentUrl=async(ticketId:string,id:string)=>(await api.get<{url:string}>(`/support/tickets/${ticketId}/attachments/${id}`)).data.url;
