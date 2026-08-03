import {beforeEach,describe,expect,it,vi} from "vitest";

const {get,post,patch,del}=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn(),del:vi.fn()}));
vi.mock("@/services/api",()=>({api:{get,post,patch,delete:del}}));

import {archiveTracking,createTrackingEvent,exportTracking,listTracking,notifyTrackingBulk,updateTrackingAlert} from "@/services/tracking";

describe("tracking service contracts",()=>{
 beforeEach(()=>vi.clearAllMocks());
 it("forwards every control tower filter",async()=>{get.mockResolvedValue({data:{items:[],pagination:{page:1,page_size:30,total:0,total_pages:0}}});const filters={route:"CN-CD",warehouse:"GZ",batch:"B-4",container:"MSCU",incident:true,date_from:"2026-08-01",date_to:"2026-08-03"};await listTracking(filters);expect(get).toHaveBeenCalledWith("/tracking",{params:filters})});
 it("exports the active filtered scope",async()=>{get.mockResolvedValue({data:new Blob()});await exportTracking({status:"IN_TRANSIT",country:"CD"});expect(get).toHaveBeenCalledWith("/tracking/export",{params:{status:"IN_TRANSIT",country:"CD"},responseType:"blob"})});
 it("sends idempotency keys for manual events",async()=>{post.mockResolvedValue({data:{tracking:{}}});await createTrackingEvent("tracking-1",{event_type:"ARRIVAL",title:"Arrivée",idempotency_key:"event-unique-1"});expect(post).toHaveBeenCalledWith("/tracking/tracking-1/events",expect.objectContaining({idempotency_key:"event-unique-1"}))});
 it("supports bulk notification, alert resolution and archive",async()=>{post.mockResolvedValue({data:{count:2}});patch.mockResolvedValue({data:{tracking:{}}});del.mockResolvedValue({data:{}});await notifyTrackingBulk(["a","b"],{channel:"whatsapp",audience:"ALL_CLIENTS",message:"Arrivée"});await updateTrackingAlert("a","alert-1",{status:"RESOLVED",comment:"Traité"});await archiveTracking("a");expect(post).toHaveBeenCalledWith("/tracking/notifications/bulk",expect.objectContaining({tracking_ids:["a","b"]}));expect(patch).toHaveBeenCalledWith("/tracking/a/alerts/alert-1",expect.objectContaining({status:"RESOLVED"}));expect(del).toHaveBeenCalledWith("/tracking/a")});
});
