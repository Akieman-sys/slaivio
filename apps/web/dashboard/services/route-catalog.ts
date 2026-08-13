import { api } from "./api";
export type Route={id:string;route_code:string;route_name:string;description?:string;origin_country:string;origin_city?:string;destination_country:string;destination_city?:string;transport_mode:string;eta_min_days:number;eta_max_days:number;active:boolean;status:string;availability:string;direction?:string;owner_name?:string;origin_warehouse_name?:string;destination_office_city?:string;service_count:number;base_price_minor?:number;currency_code?:string;next_departure_at?:string;shipments_count?:number;weight_kg?:number;cbm?:number;on_time_rate?:number;real_eta_days?:number;margin_percent?:number;row_version:number;public_visible?:boolean;processing_days?:number;customs_days?:number;final_delivery_days?:number;weekly_capacity_kg?:number;weekly_capacity_cbm?:number;departure_capacity_kg?:number;departure_capacity_cbm?:number};
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
export async function routeIntelligence(params:Record<string,string|number|undefined>={}){return (await api.get<{items:Route[];total:number}>("/route-catalog/routes/intelligence",{params})).data}
export async function routeStats(){return (await api.get<Record<string,number>>("/route-catalog/routes/stats")).data}
export async function routeDetail(id:string){return (await api.get<Route&{legs:Array<Record<string,unknown>>;carriers:Array<Record<string,unknown>>;restrictions:Array<Record<string,unknown>>;services:Service[];departures:Array<Record<string,unknown>>;shipments:Array<Record<string,unknown>>;events:Array<Record<string,unknown>>;alerts:Array<Record<string,unknown>>}>(`/route-catalog/routes/${id}`)).data}
export async function updateRoute(id:string,p:Record<string,unknown>){return (await api.patch(`/route-catalog/routes/${id}`,p)).data}
export async function suspendRoute(id:string,p:Record<string,unknown>){return (await api.post(`/route-catalog/routes/${id}/suspend`,p)).data}
export async function reactivateRoute(id:string){return (await api.post(`/route-catalog/routes/${id}/reactivate`)).data}
export async function duplicateRoute(id:string){return (await api.post(`/route-catalog/routes/${id}/duplicate`)).data}
export async function addRouteLeg(id:string,p:Record<string,unknown>){return (await api.post(`/route-catalog/routes/${id}/legs`,p)).data}
export async function addRouteCarrier(id:string,p:Record<string,unknown>){return (await api.post(`/route-catalog/routes/${id}/carriers`,p)).data}
export async function addRouteRestriction(id:string,p:Record<string,unknown>){return (await api.post(`/route-catalog/routes/${id}/restrictions`,p)).data}
export async function routeEngine(p:Record<string,unknown>){return (await api.post<{items:Array<Route&{service_id:string;service_name:string;service_eta_min:number;service_eta_max:number;next_departure_at?:string}>;requires_confirmation:boolean}>("/route-catalog/routes/engine",p)).data}
export async function compareRoutes(ids:string[]){return (await api.get<{items:Route[]}>("/route-catalog/routes/compare",{params:{ids:ids.join(",")}})).data.items}
export async function routeAnalytics(){return (await api.get<{stats:Record<string,number>;by_mode:Array<{label:string;count:number}>;top_volume:Array<{label:string;value:number}>;delays:Array<{label:string;value:number}>}>("/route-catalog/routes/analytics")).data}
export async function routeViews(){return (await api.get<{items:Array<{id:string;name:string;filters:Record<string,unknown>}>}>("/route-catalog/routes/views")).data.items}
export async function saveRouteView(name:string,filters:Record<string,unknown>){return (await api.post("/route-catalog/routes/views",{name,filters})).data}
