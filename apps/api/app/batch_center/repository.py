import csv, io, json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import text

from app.db.database import engine
from app.expeditions.repository import create_expedition, add_package_to_expedition


STATUSES={"DRAFT","OPEN","PREPARING","NEAR_CAPACITY","FULL","PENDING_VALIDATION","READY_FOR_SHIPMENT","CONVERTED_TO_SHIPMENT","BLOCKED","CANCELLED","ARCHIVED"}
TRANSITIONS={"DRAFT":{"OPEN","CANCELLED"},"OPEN":{"PREPARING","PENDING_VALIDATION","BLOCKED","CANCELLED"},"PREPARING":{"NEAR_CAPACITY","FULL","PENDING_VALIDATION","BLOCKED","CANCELLED"},"NEAR_CAPACITY":{"FULL","PENDING_VALIDATION","PREPARING","BLOCKED"},"FULL":{"PENDING_VALIDATION","PREPARING","BLOCKED"},"PENDING_VALIDATION":{"READY_FOR_SHIPMENT","PREPARING","BLOCKED"},"READY_FOR_SHIPMENT":{"PREPARING","CONVERTED_TO_SHIPMENT","BLOCKED"},"BLOCKED":{"PREPARING","CANCELLED"}}
ELIGIBLE={"READY_FOR_BATCH","READY_FOR_DISPATCH"}

def rows(result):return [dict(x) for x in result.mappings().all()]
def actor(t):return str(t.get("user_id") or "system")
def name(t):return str(t.get("actor_name") or "Membre de l'agence")
def dump(v):return json.dumps(v,default=str)
def audit(c,o,b,event,a,n,new=None,old=None,reason=None):c.execute(text("insert into batch_audit_events(org_id,batch_id,event_type,old_values,new_values,reason,actor_id,actor_name) values(:o,:b,:e,cast(:old as jsonb),cast(:new as jsonb),:r,:a,:n)"),{"o":o,"b":b,"e":event,"old":dump(old) if old else None,"new":dump(new) if new else None,"r":reason,"a":a,"n":n})

def _summary_sql(where=""):
 return f"""select b.*,r.route_name,s.service_name,s.shipping_mode,w.warehouse_name,d.departure_code,
 coalesce(m.package_count,0)::int package_count,coalesce(m.client_count,0)::int client_count,
 coalesce(m.total_weight_kg,0)::float total_weight_kg,coalesce(m.total_cbm,0)::float total_cbm,
 coalesce(m.total_value,0)::float total_value,
 greatest(case when b.capacity_weight_kg>0 then coalesce(m.total_weight_kg,0)/b.capacity_weight_kg*100 else 0 end,
 case when b.capacity_cbm>0 then coalesce(m.total_cbm,0)/b.capacity_cbm*100 else 0 end,
 case when b.capacity_packages>0 then coalesce(m.package_count,0)::numeric/b.capacity_packages*100 else 0 end)::float occupancy_percent
 from shipment_batches b join shipping_routes r on r.id=b.route_id and r.org_id=b.org_id join shipping_services s on s.id=b.shipping_service_id and s.org_id=b.org_id
 left join warehouses w on w.id=b.origin_warehouse_id and w.org_id=b.org_id left join cargo_departures d on d.id=b.departure_id and d.org_id=b.org_id
 left join lateral (
  select count(i.id)::int package_count,count(distinct p.client_id)::int client_count,
  coalesce(sum(p.weight_kg),0) total_weight_kg,coalesce(sum(p.volume_cbm),0) total_cbm,coalesce(sum(p.declared_value),0) total_value
  from batch_package_items i join cargo_packages p on p.id=i.package_id and p.org_id=i.org_id
  where i.org_id=b.org_id and i.batch_id=b.id and i.removed_at is null
 ) m on true {where}"""

def dashboard(o,q=None,status=None,page=1,page_size=30):
 clauses=["b.org_id=:o","b.archived_at is null"];p={"o":o,"limit":page_size,"offset":(page-1)*page_size}
 if q:clauses.append("(b.batch_code ilike :q or r.route_name ilike :q or s.service_name ilike :q)");p["q"]=f"%{q}%"
 if status:clauses.append("b.status=:status");p["status"]=status
 where="where "+" and ".join(clauses)
 with engine.connect() as c:
  data=rows(c.execute(text(_summary_sql(where)+" order by b.updated_at desc limit :limit offset :offset"),p))
  total=c.execute(text("select count(*) from shipment_batches b join shipping_routes r on r.id=b.route_id and r.org_id=b.org_id join shipping_services s on s.id=b.shipping_service_id and s.org_id=b.org_id "+where),p).scalar_one()
  stats=dict(c.execute(text("""select count(*) filter(where status in('DRAFT','OPEN','PREPARING','NEAR_CAPACITY','FULL','PENDING_VALIDATION'))::int open_batches,count(*) filter(where status='READY_FOR_SHIPMENT')::int ready,count(*) filter(where status='PREPARING')::int preparing,count(*) filter(where status='FULL')::int full,count(*) filter(where status='BLOCKED')::int blocked from shipment_batches where org_id=:o and archived_at is null"""),{"o":o}).mappings().one())
  stats["unassigned_packages"]=c.execute(text("select count(*) from cargo_packages p where p.org_id=:o and p.deleted_at is null and p.status in('READY_FOR_BATCH','READY_FOR_DISPATCH') and not exists(select 1 from batch_package_items i where i.org_id=p.org_id and i.package_id=p.id and i.removed_at is null)"),{"o":o}).scalar_one()
 return {"items":data,"stats":stats,"pagination":{"page":page,"page_size":page_size,"total":total,"total_pages":max(1,(total+page_size-1)//page_size)}}

def create(o,t,p):
 a,n=actor(t),name(t)
 with engine.begin() as c:
  code=p.get("batch_code") or f"BAT-{datetime.now().year}-{uuid4().hex[:8].upper()}"
  existing=c.execute(text("select * from shipment_batches where org_id=:o and batch_code=:code"),{"o":o,"code":code}).mappings().first()
  if existing:return dict(existing)
  route=c.execute(text("select * from shipping_routes where org_id=:o and id=:r and status in('ACTIVE','LIMITED')"),{"o":o,"r":p["route_id"]}).mappings().first()
  service=c.execute(text("""select s.* from shipping_services s where s.org_id=:o and s.id=:s and s.active and (s.route_id=:r or exists(select 1 from service_route_offerings x where x.org_id=:o and x.service_id=s.id and x.route_id=:r and x.availability in('AVAILABLE','LIMITED')))"""),{"o":o,"s":p["shipping_service_id"],"r":p["route_id"]}).mappings().first()
  if not route:raise HTTPException(422,"route_not_available")
  if not service:raise HTTPException(422,"route_service_mismatch")
  values={**p,"o":o,"a":a,"n":n,"code":code,"oc":route["origin_country"],"oci":route["origin_city"],"dc":route["destination_country"],"dci":route["destination_city"]}
  row=dict(c.execute(text("""insert into shipment_batches(org_id,batch_code,batch_type,workspace_id,route_id,shipping_service_id,origin_warehouse_id,destination_office_id,departure_id,route_origin_country,route_origin_city,route_destination_country,route_destination_city,status,cutoff_at,planned_departure_at,capacity_weight_kg,capacity_cbm,capacity_packages,capacity_value,near_capacity_percent,responsible_id,responsible_name,notes,created_by_id,created_by_name)
  values(:o,:code,:batch_type,:workspace_id,:route_id,:shipping_service_id,:origin_warehouse_id,:destination_office_id,:departure_id,:oc,:oci,:dc,:dci,'DRAFT',:cutoff_at,:planned_departure_at,:capacity_weight_kg,:capacity_cbm,:capacity_packages,:capacity_value,:near_capacity_percent,:responsible_id,:responsible_name,:notes,:a,:n) returning *"""),values).mappings().one())
  c.execute(text("insert into batch_checklist(batch_id,org_id) values(:b,:o) on conflict do nothing"),{"b":row["id"],"o":o});audit(c,o,row["id"],"BATCH_CREATED",a,n,new=row)
 return row

def detail(o,b):
 with engine.connect() as c:
  batch=c.execute(text(_summary_sql("where b.org_id=:o and b.id=:b")),{"o":o,"b":b}).mappings().first()
  if not batch:raise HTTPException(404,"batch_not_found")
  items=rows(c.execute(text("""select i.*,p.package_reference,p.tracking_id,p.description,p.category,p.status package_status,p.weight_kg,p.volume_cbm,p.payment_status,p.client_id::text,p.dossier_id::text,coalesce(cl.display_name,cl.name) client_name,d.dossier_reference from batch_package_items i join cargo_packages p on p.id=i.package_id and p.org_id=i.org_id left join clients cl on cl.id=p.client_id and cl.org_id=p.org_id left join dossiers d on d.id=p.dossier_id and d.org_id=p.org_id where i.org_id=:o and i.batch_id=:b and i.removed_at is null order by coalesce(i.load_order,999999),i.added_at"""),{"o":o,"b":b}))
  checklist=dict(c.execute(text("select * from batch_checklist where org_id=:o and batch_id=:b"),{"o":o,"b":b}).mappings().first() or {})
  return {"batch":dict(batch),"packages":items,"checklist":checklist,"alerts":rows(c.execute(text("select * from batch_alerts where org_id=:o and batch_id=:b order by status,severity desc,created_at desc"),{"o":o,"b":b})),"events":rows(c.execute(text("select * from batch_audit_events where org_id=:o and batch_id=:b order by created_at desc limit 150"),{"o":o,"b":b})),"notes":rows(c.execute(text("select * from batch_notes where org_id=:o and batch_id=:b order by created_at desc"),{"o":o,"b":b}))}

def compatible(o,b,q=None):
 with engine.connect() as c:
  batch=c.execute(text("select * from shipment_batches where org_id=:o and id=:b"),{"o":o,"b":b}).mappings().first()
  if not batch:raise HTTPException(404,"batch_not_found")
  p={"o":o,"b":b,"r":batch["route_id"],"s":batch["shipping_service_id"],"w":batch["origin_warehouse_id"],"q":f"%{q or ''}%"}
  return rows(c.execute(text("""select p.id::text,p.package_reference,p.tracking_id,coalesce(cl.display_name,cl.name) client_name,p.weight_kg,p.volume_cbm,p.category,p.status
  from cargo_packages p left join clients cl on cl.id=p.client_id and cl.org_id=p.org_id where p.org_id=:o and p.deleted_at is null and p.status in('READY_FOR_BATCH','READY_FOR_DISPATCH')
  and p.route_id=:r and p.shipping_service_id=:s and (:w is null or p.warehouse_id=:w) and (:q='%%' or p.package_reference ilike :q or p.tracking_id ilike :q or coalesce(cl.display_name,cl.name,'') ilike :q)
  and not exists(select 1 from batch_package_items i where i.org_id=p.org_id and i.package_id=p.id and i.removed_at is null) order by p.created_at limit 300"""),p))

def _capacity(batch,weight,cbm,count,value):
 limits=[(batch.get("capacity_weight_kg"),weight,"WEIGHT"),(batch.get("capacity_cbm"),cbm,"CBM"),(batch.get("capacity_packages"),count,"PACKAGES"),(batch.get("capacity_value"),value,"VALUE")]
 exceeded=[k for limit,current,k in limits if limit is not None and current>float(limit)]
 ratios=[current/float(limit)*100 for limit,current,_ in limits if limit]
 return max(ratios or [0]),exceeded

def add_packages(o,b,ids,t,override=False):
 a,n=actor(t),name(t)
 with engine.begin() as c:
  batch=c.execute(text("select * from shipment_batches where org_id=:o and id=:b for update"),{"o":o,"b":b}).mappings().first()
  if not batch or batch["status"] not in("DRAFT","OPEN","PREPARING","NEAR_CAPACITY"):raise HTTPException(409,"batch_not_editable")
  packages=rows(c.execute(text("select * from cargo_packages where org_id=:o and id=any(cast(:ids as uuid[])) and deleted_at is null for update"),{"o":o,"ids":ids}))
  if len(packages)!=len(set(ids)):raise HTTPException(404,"package_not_found")
  problems=[]
  for p in packages:
   if p["status"] not in ELIGIBLE:problems.append({"package":p["package_reference"],"reason":"STATUS_NOT_ELIGIBLE"})
   elif str(p.get("route_id"))!=str(batch["route_id"]):problems.append({"package":p["package_reference"],"reason":"ROUTE_MISMATCH"})
   elif str(p.get("shipping_service_id"))!=str(batch["shipping_service_id"]):problems.append({"package":p["package_reference"],"reason":"SERVICE_MISMATCH"})
   elif batch.get("origin_warehouse_id") and str(p.get("warehouse_id"))!=str(batch["origin_warehouse_id"]):problems.append({"package":p["package_reference"],"reason":"WAREHOUSE_MISMATCH"})
  if problems:raise HTTPException(422,{"code":"incompatible_packages","items":problems})
  totals=c.execute(text("""select coalesce(sum(p.weight_kg),0) w,coalesce(sum(p.volume_cbm),0) cbm,count(*) n,coalesce(sum(p.declared_value),0) value from batch_package_items i join cargo_packages p on p.id=i.package_id and p.org_id=i.org_id where i.org_id=:o and i.batch_id=:b and i.removed_at is null"""),{"o":o,"b":b}).mappings().one()
  weight=float(totals["w"])+sum(float(p.get("weight_kg") or 0) for p in packages);cbm=float(totals["cbm"])+sum(float(p.get("volume_cbm") or 0) for p in packages);count=int(totals["n"])+len(packages);value=float(totals["value"])+sum(float(p.get("declared_value") or 0) for p in packages)
  occupancy,exceeded=_capacity(batch,weight,cbm,count,value)
  if exceeded and not (override and batch.get("override_capacity")):raise HTTPException(409,{"code":"capacity_exceeded","constraints":exceeded,"occupancy":occupancy})
  for p in packages:
   c.execute(text("""insert into batch_package_items(org_id,batch_id,package_id,added_by,added_by_name) values(:o,:b,:p,:a,:n)
   on conflict(batch_id,package_id) do update set removed_at=null,removed_by=null,removal_reason=null,scan_status='PLANNED',added_by=excluded.added_by,added_by_name=excluded.added_by_name,added_at=now()"""),{"o":o,"b":b,"p":p["id"],"a":a,"n":n});c.execute(text("update cargo_packages set shipment_batch_id=:b,status='BATCHED',updated_by=:a,updated_at=now() where org_id=:o and id=:p"),{"b":b,"a":a,"o":o,"p":p["id"]})
  new_status="FULL" if occupancy>=100 else "NEAR_CAPACITY" if occupancy>=float(batch["near_capacity_percent"]) else "PREPARING"
  c.execute(text("update shipment_batches set status=:s,row_version=row_version+1,updated_at=now() where org_id=:o and id=:b"),{"s":new_status,"o":o,"b":b});audit(c,o,b,"PACKAGES_ADDED",a,n,new={"package_ids":ids,"occupancy":occupancy})
 return {"added":len(packages),"occupancy_percent":occupancy,"status":new_status}

def remove_package(o,b,p,t,reason):
 a,n=actor(t),name(t)
 with engine.begin() as c:
  batch=c.execute(text("select * from shipment_batches where org_id=:o and id=:b for update"),{"o":o,"b":b}).mappings().first()
  if not batch or batch["status"] in("CONVERTED_TO_SHIPMENT","ARCHIVED"):raise HTTPException(409,"batch_not_editable")
  item=c.execute(text("update batch_package_items set removed_at=now(),removed_by=:a,removal_reason=:r,scan_status='REMOVED' where org_id=:o and batch_id=:b and package_id=:p and removed_at is null returning id"),{"a":a,"r":reason,"o":o,"b":b,"p":p}).first()
  if not item:raise HTTPException(404,"batch_package_not_found")
  c.execute(text("update cargo_packages set shipment_batch_id=null,status='READY_FOR_BATCH',updated_by=:a,updated_at=now() where org_id=:o and id=:p"),{"a":a,"o":o,"p":p});c.execute(text("update shipment_batches set status='PREPARING',row_version=row_version+1,updated_at=now() where org_id=:o and id=:b"),{"o":o,"b":b});audit(c,o,b,"PACKAGE_REMOVED",a,n,new={"package_id":p},reason=reason)
 return {"removed":True}

def checklist(o,b,p,t):
 allowed={"compatibility","weight_verified","cbm_verified","no_blocked_packages","documents_ready","payments_compliant","capacity_compliant","manager_approved"};data={k:bool(v) for k,v in p.items() if k in allowed}
 if not data:return detail(o,b)["checklist"]
 sets=",".join(f"{k}=:{k}" for k in data)
 with engine.begin() as c:c.execute(text(f"update batch_checklist set {sets},updated_by=:a,updated_at=now() where org_id=:o and batch_id=:b"),{"o":o,"b":b,"a":actor(t),**data});audit(c,o,b,"CHECKLIST_UPDATED",actor(t),name(t),new=data)
 return detail(o,b)["checklist"]

def transition(o,b,status,t,reason=None,expected_version=None):
 if status not in STATUSES:raise HTTPException(422,"invalid_batch_status")
 a,n=actor(t),name(t)
 with engine.begin() as c:
  old=c.execute(text("select * from shipment_batches where org_id=:o and id=:b for update"),{"o":o,"b":b}).mappings().first()
  if not old:raise HTTPException(404,"batch_not_found")
  if expected_version and old["row_version"]!=expected_version:raise HTTPException(409,"stale_batch")
  if status not in TRANSITIONS.get(old["status"],set()):raise HTTPException(409,"invalid_batch_transition")
  if status=="READY_FOR_SHIPMENT":
   check=c.execute(text("select * from batch_checklist where org_id=:o and batch_id=:b"),{"o":o,"b":b}).mappings().one()
   missing=[k for k in ("compatibility","weight_verified","cbm_verified","no_blocked_packages","documents_ready","payments_compliant","capacity_compliant","manager_approved") if not check[k]]
   if missing:raise HTTPException(409,{"code":"checklist_incomplete","items":missing})
  row=dict(c.execute(text("update shipment_batches set status=:s,block_reason=case when :s='BLOCKED' then :r else null end,row_version=row_version+1,updated_at=now(),archived_at=case when :s='ARCHIVED' then now() else archived_at end where org_id=:o and id=:b returning *"),{"s":status,"r":reason,"o":o,"b":b}).mappings().one());audit(c,o,b,"STATUS_CHANGED",a,n,new=row,old=dict(old),reason=reason)
 return row

def scan(o,b,value,t):
 with engine.connect() as c:p=c.execute(text("select id::text from cargo_packages where org_id=:o and (package_reference=:v or tracking_id=:v or supplier_tracking=:v) and deleted_at is null limit 1"),{"o":o,"v":value}).scalar()
 if not p:raise HTTPException(404,"package_not_found")
 try:add_packages(o,b,[p],t)
 except HTTPException as e:
  if e.detail!="batch_not_editable":raise
 with engine.begin() as c:c.execute(text("update batch_package_items set scan_status='SCANNED' where org_id=:o and batch_id=:b and package_id=:p and removed_at is null"),{"o":o,"b":b,"p":p});audit(c,o,b,"PACKAGE_SCANNED",actor(t),name(t),new={"package_id":p,"value":value})
 return {"package_id":p,"scan_status":"SCANNED"}

def convert(o,b,t):
 data=detail(o,b);batch=data["batch"]
 if batch["status"]=="CONVERTED_TO_SHIPMENT" and batch.get("converted_expedition_id"):
  with engine.connect() as c:
   existing=c.execute(text("select * from cargo_expeditions where org_id=:o and id=:e"),{"o":o,"e":batch["converted_expedition_id"]}).mappings().first()
  if existing:return dict(existing)
 if batch["status"]!="READY_FOR_SHIPMENT":raise HTTPException(409,"batch_not_ready")
 with engine.connect() as c:
  existing=c.execute(text("select * from cargo_expeditions where org_id=:o and batch_reference=:ref and deleted_at is null order by created_at limit 1"),{"o":o,"ref":batch["batch_code"]}).mappings().first()
 expedition=dict(existing) if existing else create_expedition(o,actor(t),{"title":batch["batch_code"],"status":"PREPARING","mode":batch.get("shipping_mode") or "AIR","service_type":batch.get("service_name"),"route_id":str(batch["route_id"]),"shipping_service_id":str(batch["shipping_service_id"]),"origin_warehouse_id":str(batch["origin_warehouse_id"]) if batch.get("origin_warehouse_id") else None,"destination_office_id":str(batch["destination_office_id"]) if batch.get("destination_office_id") else None,"departure_id":str(batch["departure_id"]) if batch.get("departure_id") else None,"batch_reference":batch["batch_code"],"planned_departure_at":batch.get("planned_departure_at"),"eta_at":batch.get("eta_at"),"owner_id":batch.get("responsible_id"),"owner_name":batch.get("responsible_name")})
 for package in data["packages"]:
  add_package_to_expedition(o,expedition["id"],str(package["package_id"]),actor(t))
 with engine.begin() as c:
  c.execute(text("insert into expedition_batches(org_id,expedition_id,batch_id) values(:o,:e,:b)"),{"o":o,"e":expedition["id"],"b":b})
  c.execute(text("update shipment_batches set status='CONVERTED_TO_SHIPMENT',converted_expedition_id=:e,row_version=row_version+1,updated_at=now() where org_id=:o and id=:b"),{"e":expedition["id"],"o":o,"b":b})
  c.execute(text("update cargo_packages p set status='SHIPPED',updated_by=:a,updated_at=now() from batch_package_items i where i.org_id=:o and i.package_id=p.id and p.org_id=i.org_id and i.batch_id=:b and i.removed_at is null"),{"a":actor(t),"b":b,"o":o});audit(c,o,b,"EXPEDITION_CREATED",actor(t),name(t),new={"expedition_id":expedition["id"],"reference":expedition["expedition_reference"]})
 return expedition

def analytics(o):
 with engine.connect() as c:
  by_route=rows(c.execute(text("""
   select r.route_name label,count(*)::int batches,round(avg(x.occupancy),2) average_occupancy
   from (
    select b.id,b.org_id,b.route_id,
     greatest(
      case when b.capacity_weight_kg>0 then coalesce(m.total_weight_kg,0)/b.capacity_weight_kg*100 else 0 end,
      case when b.capacity_cbm>0 then coalesce(m.total_cbm,0)/b.capacity_cbm*100 else 0 end
     )::numeric occupancy
    from shipment_batches b
    left join lateral (
     select coalesce(sum(p.weight_kg),0)::float total_weight_kg,coalesce(sum(p.volume_cbm),0)::float total_cbm
     from batch_package_items i join cargo_packages p on p.id=i.package_id and p.org_id=i.org_id
     where i.org_id=b.org_id and i.batch_id=b.id and i.removed_at is null
    ) m on true
    where b.org_id=:o and b.archived_at is null
   ) x join shipping_routes r on r.id=x.route_id and r.org_id=x.org_id
   group by r.id,r.route_name order by batches desc
  """),{"o":o}))
  by_warehouse=rows(c.execute(text("""
   select coalesce(w.warehouse_name,'Non défini') label,count(*)::int batches
   from shipment_batches b left join warehouses w on w.id=b.origin_warehouse_id and w.org_id=b.org_id
   where b.org_id=:o and b.archived_at is null
   group by w.id,w.warehouse_name order by batches desc
  """),{"o":o}))
  return {"by_route":by_route,"by_warehouse":by_warehouse}

def export_csv(o):
 data=dashboard(o,page_size=1000)["items"];out=io.StringIO();w=csv.writer(out);w.writerow(["batch","route","service","warehouse","packages","clients","weight_kg","cbm","capacity_percent","cutoff","status"])
 for x in data:w.writerow([x["batch_code"],x["route_name"],x["service_name"],x["warehouse_name"],x["package_count"],x["client_count"],x["total_weight_kg"],x["total_cbm"],x["occupancy_percent"],x["cutoff_at"],x["status"]])
 return "\ufeff"+out.getvalue()

def suggestions(o):
 with engine.connect() as c:
  groups=rows(c.execute(text("""select p.route_id::text,p.shipping_service_id::text,p.warehouse_id::text,count(*)::int package_count,
  coalesce(sum(p.weight_kg),0)::float total_weight_kg,coalesce(sum(p.volume_cbm),0)::float total_cbm,r.route_name,s.service_name,w.warehouse_name
  from cargo_packages p join shipping_routes r on r.id=p.route_id and r.org_id=p.org_id join shipping_services s on s.id=p.shipping_service_id and s.org_id=p.org_id
  left join warehouses w on w.id=p.warehouse_id and w.org_id=p.org_id where p.org_id=:o and p.deleted_at is null and p.status in('READY_FOR_BATCH','READY_FOR_DISPATCH')
  and not exists(select 1 from batch_package_items i where i.org_id=p.org_id and i.package_id=p.id and i.removed_at is null)
  group by p.route_id,p.shipping_service_id,p.warehouse_id,r.route_name,s.service_name,w.warehouse_name order by package_count desc"""),{"o":o}))
 return {"groups":groups,"strategy":"COMPATIBILITY_FIRST","requires_confirmation":True}

def detect_alerts(o):
 created=0
 with engine.begin() as c:
  candidates=rows(c.execute(text(_summary_sql("where b.org_id=:o and b.archived_at is null and b.status not in('CONVERTED_TO_SHIPMENT','CANCELLED','ARCHIVED')")),{"o":o}))
  for b in candidates:
   alerts=[]
   occ=float(b.get("occupancy_percent") or 0)
   if occ>100: alerts.append(("OVER_CAPACITY","HIGH",f"Capacité dépassée ({occ:.1f}%)."))
   elif occ>=95: alerts.append(("NEAR_CAPACITY","MEDIUM",f"Batch rempli à {occ:.1f}%."))
   if b.get("cutoff_at") and b["cutoff_at"]<datetime.now(timezone.utc): alerts.append(("CUTOFF_PASSED","HIGH","Le cut-off est dépassé."))
   if b.get("cutoff_at") and occ<30 and 0<(b["cutoff_at"]-datetime.now(timezone.utc)).total_seconds()<86400: alerts.append(("LOW_FILL_NEAR_CUTOFF","MEDIUM","Occupation inférieure à 30 % près du cut-off."))
   for typ,severity,message in alerts:
    result=c.execute(text("""insert into batch_alerts(org_id,batch_id,alert_type,severity,message)
    select :o,:b,:t,:s,:m where not exists(select 1 from batch_alerts where org_id=:o and batch_id=:b and package_id is null and alert_type=:t and status='OPEN') returning id"""),{"o":o,"b":b["id"],"t":typ,"s":severity,"m":message}).first();created+=bool(result)
 return {"created":created}

def manifest_csv(o,b):
 data=detail(o,b);out=io.StringIO();w=csv.writer(out);w.writerow(["batch","tracking","client","dossier","category","weight_kg","cbm","payment","scan"])
 for p in data["packages"]:w.writerow([data["batch"]["batch_code"],p.get("package_reference"),p.get("client_name"),p.get("dossier_reference"),p.get("category"),p.get("weight_kg"),p.get("volume_cbm"),p.get("payment_status"),p.get("scan_status")])
 return "\ufeff"+out.getvalue()
