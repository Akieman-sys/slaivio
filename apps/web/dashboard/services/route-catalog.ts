import { api } from "./api";
export type Route={id:string;route_code:string;route_name:string;origin_country:string;origin_city?:string;destination_country:string;destination_city?:string;transport_mode:string;eta_min_days:number;eta_max_days:number;active:boolean;service_count:number};
type ServiceBase={id:string;route_id:string;service_code:string;service_name:string;shipping_mode:string;service_type:string;currency_code:string;eta_min_days:number;eta_max_days:number;pricing_count:number};
export type Service=ServiceBase&({route_name:string}|{route_name?:never});
export async function catalog(){return (await api.get<{routes:Route[];services:Service[]}>("/route-catalog")).data}
export async function createRoute(p:Record<string,unknown>){return (await api.post("/route-catalog/routes",p)).data}
export async function createService(p:Record<string,unknown>){return (await api.post("/route-catalog/services",p)).data}
export async function addPrice(id:string,p:Record<string,unknown>){return (await api.post(`/route-catalog/services/${id}/prices`,p)).data}
export async function simulate(p:Record<string,unknown>){return (await api.post<{currency:string;total_minor:number;chargeable_weight_kg:number;volumetric_weight_kg:number;breakdown:unknown[]}>("/route-catalog/simulate",p)).data}
export async function serviceConfiguration(id:string){return (await api.get<{stops:unknown[];departures:unknown[];policies:unknown[];adjustments:unknown[]}>(`/route-catalog/services/${id}/configuration`)).data}
export async function addStop(id:string,p:Record<string,unknown>){return (await api.post(`/route-catalog/services/${id}/stops`,p)).data}
export async function addDeparture(id:string,p:Record<string,unknown>){return (await api.post(`/route-catalog/services/${id}/departures`,p)).data}
export async function addPolicy(id:string,p:Record<string,unknown>){return (await api.post(`/route-catalog/services/${id}/policies`,p)).data}
export async function addAdjustment(id:string,p:Record<string,unknown>){return (await api.post(`/route-catalog/services/${id}/adjustments`,p)).data}
