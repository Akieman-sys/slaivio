import {api} from "./api";
export type FinanceDocument={id:string;document_type:"QUOTE"|"INVOICE"|"CREDIT_NOTE";document_number:string;client_id:string;client_name:string;dossier_reference?:string;status:string;currency:string;subtotal:number;discount_total:number;tax_total:number;total:number;amount_paid:number;balance_due:number;due_date?:string;row_version:number;created_at:string;lines?:FinanceLine[];payments?:FinancePayment[];events?:Array<{id:string;event_type:string;actor_name?:string;created_at:string}>};
export type FinanceLine={description:string;quantity:number;unit_price:number;discount_rate:number;tax_rate:number;line_total?:number};
export type FinancePayment={id:string;receipt_number:string;amount:number;currency:string;method:string;reference?:string;paid_at:string};
export type FinanceStats={invoices:number;drafts:number;overdue:number;invoiced:number;collected:number;outstanding:number};
export async function listFinance(params:Record<string,unknown>={}){return (await api.get<{items:FinanceDocument[];pagination:{total:number}}>("/finance",{params})).data}
export async function financeStats(){return (await api.get<FinanceStats>("/finance/stats")).data}
export async function createFinance(payload:{document_type:string;client_id:string;currency:string;due_date?:string|null;notes?:string|null;terms?:string|null;lines:FinanceLine[]}){return (await api.post<FinanceDocument>("/finance",payload)).data}
export async function getFinance(id:string){return (await api.get<FinanceDocument>(`/finance/${id}`)).data}
export async function issueFinance(id:string,expected_version:number){return (await api.post<FinanceDocument>(`/finance/${id}/issue`,{expected_version})).data}
export async function payFinance(id:string,payload:{amount:number;currency:string;method:string;reference?:string|null;paid_at:string;idempotency_key:string}){return (await api.post<FinancePayment>(`/finance/${id}/payments`,payload)).data}
export async function voidFinance(id:string,expected_version:number,reason:string){return (await api.post<FinanceDocument>(`/finance/${id}/void`,{expected_version,reason})).data}
export async function exportFinance(){return (await api.get<Blob>("/finance/export",{responseType:"blob"})).data}
