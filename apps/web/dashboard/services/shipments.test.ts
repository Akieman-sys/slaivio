import {beforeEach,describe,expect,it,vi} from "vitest";

const {get,post,patch,del}=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn(),del:vi.fn()}));
vi.mock("@/services/api",()=>({api:{get,post,patch,delete:del}}));

import {archiveShipment,exportShipments,updateShipment,uploadShipmentDocument} from "@/services/shipments";

describe("shipment production contracts",()=>{
 beforeEach(()=>vi.clearAllMocks());
 it("sends the optimistic concurrency version",async()=>{patch.mockResolvedValue({data:{shipment:{}}});await updateShipment("ship-1",{status:"LOADING",expected_version:4});expect(patch).toHaveBeenCalledWith("/shipments/ship-1",{status:"LOADING",expected_version:4})});
 it("archives with the current version",async()=>{del.mockResolvedValue({data:{status:"ok"}});await archiveShipment("ship-1",7);expect(del).toHaveBeenCalledWith("/shipments/ship-1",{params:{expected_version:7}})});
 it("uploads real multipart documents",async()=>{post.mockResolvedValue({data:{shipment:{}}});const file=new File(["manifest"],"manifest.txt",{type:"text/plain"});await uploadShipmentDocument("ship-1",file,"MANIFEST","Départ");const [,body]=post.mock.calls[0];expect(body).toBeInstanceOf(FormData);expect(body.get("file")).toBe(file);expect(body.get("document_type")).toBe("MANIFEST")});
 it("keeps export filters",async()=>{get.mockResolvedValue({data:new Blob()});await exportShipments({status:"IN_TRANSIT",mode:"AIR"});expect(get).toHaveBeenCalledWith("/shipments/export",expect.objectContaining({params:expect.objectContaining({status:"IN_TRANSIT",mode:"AIR"})}))});
});
