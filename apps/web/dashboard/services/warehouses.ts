/* eslint-disable @typescript-eslint/no-explicit-any */
import {api} from "./api";
export type Warehouse={id:string;warehouse_code:string;warehouse_name:string;warehouse_type:string;country_code:string|null;city:string|null;address:string|null;active:boolean;manager_name:string|null;timezone:string;capacity_packages:number|null;capacity_weight_kg:number|null;capacity_volume_cbm:number|null;row_version:number;package_count:number;weight_kg:number;volume_cbm:number;open_anomalies:number};
export type WarehouseDetail=Warehouse&{inventory:any[];slots:any[];transfers:any[];counts:any[];anomalies:any[];movements:any[];audit:any[]};
export type WarehouseStats={warehouses:number;packages:number;weight_kg:number;volume_cbm:number;anomalies:number;transfers:number};
export async function listWarehouses(params?:{q?:string;active?:boolean}){return (await api.get<{items:Warehouse[]}>("/warehouses",{params})).data.items}
export async function getWarehouse(id:string){return (await api.get<WarehouseDetail>(`/warehouses/${id}`)).data}
export async function getWarehouseStats(){return (await api.get<WarehouseStats>("/warehouses/stats")).data}
export async function createWarehouse(payload:Record<string,unknown>){return (await api.post<Warehouse>("/warehouses",payload)).data}
export async function updateWarehouse(id:string,payload:Record<string,unknown>){return (await api.patch<WarehouseDetail>(`/warehouses/${id}`,payload)).data}
export async function createSlot(id:string,payload:Record<string,unknown>){return (await api.post(`/warehouses/${id}/slots`,payload)).data}
export async function moveWarehousePackage(id:string,payload:Record<string,unknown>){return (await api.post<WarehouseDetail>(`/warehouses/${id}/moves`,payload)).data}
export async function createWarehouseTransfer(payload:Record<string,unknown>){return (await api.post("/warehouses/transfers",payload)).data}
export async function transitionWarehouseTransfer(id:string,action:string,expected_version:number){return (await api.post(`/warehouses/transfers/${id}/${action}`,{expected_version})).data}
export async function createStockCount(id:string,payload:Record<string,unknown>){return (await api.post(`/warehouses/${id}/counts`,payload)).data}
export async function completeStockCount(id:string,actual_packages:number,expected_version:number){return (await api.post(`/warehouses/counts/${id}/complete`,{actual_packages,expected_version})).data}
export async function createWarehouseAnomaly(id:string,payload:Record<string,unknown>){return (await api.post(`/warehouses/${id}/anomalies`,payload)).data}
export async function resolveWarehouseAnomaly(id:string,resolution:string,expected_version:number){return (await api.post(`/warehouses/anomalies/${id}/resolve`,{resolution,expected_version})).data}
export async function exportWarehouseInventory(){return (await api.get("/warehouses/export",{responseType:"blob"})).data as Blob}
