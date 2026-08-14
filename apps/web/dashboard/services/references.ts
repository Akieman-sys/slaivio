import {api} from './api';

export type ReferenceItem={id:string;label:string;secondary?:string|null;client_id?:string|null;route_id?:string|null;shipping_service_id?:string|null};
export type ReferenceCatalog={clients:ReferenceItem[];dossiers:ReferenceItem[];routes:ReferenceItem[];services:ReferenceItem[];warehouses:ReferenceItem[];offices:ReferenceItem[];departures:ReferenceItem[]};

export async function getReferenceCatalog(params:Record<string,string|undefined>={}){
  return(await api.get<ReferenceCatalog>('/references',{params})).data;
}
