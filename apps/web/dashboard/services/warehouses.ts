/* eslint-disable @typescript-eslint/no-explicit-any */
import {api} from "./api";
export type Warehouse={id:string;warehouse_code:string;warehouse_name:string;warehouse_type:string;country_code:string|null;city:string|null;address:string|null;active:boolean;manager_name:string|null;timezone:string;capacity_packages:number|null;capacity_weight_kg:number|null;capacity_volume_cbm:number|null;row_version:number;package_count:number;weight_kg:number;volume_cbm:number;open_anomalies:number};
export type WarehouseDetail=Warehouse&{inventory:any[];slots:any[];transfers:any[];counts:any[];anomalies:any[];movements:any[];audit:any[]};
export type WarehouseStats={warehouses:number;packages:number;weight_kg:number;volume_cbm:number;anomalies:number;transfers:number};
export type WmsDashboard={received_today:number;received_week:number;unidentified:number;weighed:number;ready:number;blocked:number;sensitive:number;priority:number;scans_today:number;alerts:number;average_processing_minutes:number};
export type WarehouseIntake={id:string;intake_reference:string;package_id:string|null;package_reference:string|null;status:string;supplier_name:string|null;supplier_tracking:string|null;shipping_mark:string|null;recipient_name:string|null;recipient_phone:string|null;description:string|null;measured_weight_kg:number|null;length_cm:number|null;width_cm:number|null;height_cm:number|null;condition:string;received_at:string;row_version:number};
export type WarehouseGroup={id:string;group_reference:string;group_type:string;status:string;destination_country:string|null;destination_city:string|null;container_number:string|null;package_count:number;row_version:number;created_at:string};
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
export async function getWmsDashboard(id:string){return (await api.get<WmsDashboard>(`/warehouses/${id}/dashboard`)).data}
export async function listWarehouseIntakes(id:string,params?:{q?:string;status?:string}){return (await api.get<{items:WarehouseIntake[]}>(`/warehouses/${id}/intakes`,{params})).data.items}
export async function receiveWarehouseIntake(id:string,payload:Record<string,unknown>){return (await api.post<WarehouseIntake>(`/warehouses/${id}/intakes`,payload)).data}
export async function linkWarehouseIntake(id:string,package_id:string,expected_version:number){return (await api.post<WarehouseIntake>(`/warehouses/intakes/${id}/link`,{package_id,expected_version})).data}
export async function submitWarehouseQuality(id:string,payload:Record<string,unknown>){return (await api.post(`/warehouses/${id}/quality-checks`,payload)).data}
export async function startWarehouseScan(id:string,scan_type="RECEIPT"){return (await api.post(`/warehouses/${id}/scan-sessions`,{scan_type})).data as {id:string;session_reference:string}}
export async function scanWarehouseItem(sessionId:string,value:string,location?:string){return (await api.post(`/warehouses/scan-sessions/${sessionId}/items`,{value,location})).data as {result:string;package:{id:string;package_reference:string}|null}}
export async function listWarehouseGroups(id:string){return (await api.get<{items:WarehouseGroup[]}>(`/warehouses/${id}/groups`)).data.items}
export async function createWarehouseGroup(id:string,payload:Record<string,unknown>){return (await api.post(`/warehouses/${id}/groups`,payload)).data}
export async function transitionWarehouseGroup(id:string,action:string,expected_version:number){return (await api.post(`/warehouses/groups/${id}/${action}`,{expected_version})).data}
export async function downloadPackingList(id:string){return (await api.get(`/warehouses/groups/${id}/packing-list`,{responseType:"blob"})).data as Blob}
export async function detectWarehouseAlerts(id:string){return (await api.post<{created:number}>(`/warehouses/${id}/alerts/detect`)).data}
export async function weighWarehousePackage(id:string,payload:{weight_kg:number;source?:string;device_reference?:string|null;notes?:string|null}){return (await api.post(`/warehouses/packages/${id}/weigh`,payload)).data}
export async function measureWarehousePackage(id:string,payload:{length_cm:number;width_cm:number;height_cm:number}){return (await api.patch(`/warehouses/packages/${id}/dimensions`,payload)).data}
