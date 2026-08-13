from __future__ import annotations
import csv,io,json
from datetime import datetime,timezone
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import text
from app.db.database import engine
from app.warehouses.repository import _audit,_rows

def _ref(prefix): return f"{prefix}-{datetime.now(timezone.utc):%Y%m%d}-{uuid4().hex[:7].upper()}"
def dashboard(org_id,warehouse_id):
 with engine.connect() as c:
  return dict(c.execute(text("""select
   (select count(*) from warehouse_intakes where org_id=:o and warehouse_id=:w and received_at::date=current_date)::int received_today,
   (select count(*) from warehouse_intakes where org_id=:o and warehouse_id=:w and received_at>=date_trunc('week',now()))::int received_week,
   (select count(*) from warehouse_intakes where org_id=:o and warehouse_id=:w and status='PENDING_IDENTIFICATION')::int unidentified,
   (select count(*) from cargo_packages where org_id=:o and warehouse_id=:w and weight_kg is not null and deleted_at is null)::int weighed,
   (select count(*) from cargo_packages where org_id=:o and warehouse_id=:w and inventory_status='READY_FOR_DISPATCH' and deleted_at is null)::int ready,
   (select count(*) from warehouse_intakes where org_id=:o and warehouse_id=:w and status='QC_BLOCKED')::int blocked,
   (select count(*) from cargo_packages where org_id=:o and warehouse_id=:w and is_fragile and deleted_at is null)::int sensitive,
   (select count(*) from cargo_packages where org_id=:o and warehouse_id=:w and priority in ('HIGH','URGENT') and deleted_at is null)::int priority,
   (select count(*) from warehouse_scan_items where org_id=:o and created_at::date=current_date)::int scans_today,
   (select count(*) from warehouse_anomalies where org_id=:o and warehouse_id=:w and status in ('OPEN','IN_REVIEW'))::int alerts,
   coalesce((select round(extract(epoch from avg(updated_at-received_at))/60) from warehouse_intakes where org_id=:o and warehouse_id=:w and status in ('STORED','QC_APPROVED')),0)::int average_processing_minutes"""),{"o":org_id,"w":warehouse_id}).mappings().one())

def list_intakes(org_id,warehouse_id,q=None,status=None):
 f=["i.org_id=:o","i.warehouse_id=:w"];p={"o":org_id,"w":warehouse_id}
 if q:f.append("(i.intake_reference ilike :q or coalesce(i.supplier_tracking,'') ilike :q or coalesce(i.recipient_name,'') ilike :q or coalesce(i.recipient_phone,'') ilike :q or coalesce(i.shipping_mark,'') ilike :q)");p["q"]=f"%{q}%"
 if status:f.append("i.status=:s");p["s"]=status
 with engine.connect() as c:return _rows(c.execute(text(f"select i.*,p.package_reference from warehouse_intakes i left join cargo_packages p on p.id=i.package_id and p.org_id=i.org_id where {' and '.join(f)} order by i.received_at desc limit 500"),p))

def receive(org_id,warehouse_id,actor,actor_name,payload):
 data=dict(payload); key=data.pop("idempotency_key",None);reference=_ref("REC")
 length=float(data.get("length_cm") or 0);width=float(data.get("width_cm") or 0);height=float(data.get("height_cm") or 0)
 data["volume_cbm"]=round(length*width*height/1_000_000,6) if length and width and height else None
 data["volumetric_weight_kg"]=round(length*width*height/5000,3) if length and width and height else None
 with engine.begin() as c:
  if not c.execute(text("select 1 from warehouses where id=:w and org_id=:o and active"),{"w":warehouse_id,"o":org_id}).first():raise HTTPException(404,"warehouse_not_found")
  if key:
   existing=c.execute(text("select * from warehouse_intakes where org_id=:o and idempotency_key=:k"),{"o":org_id,"k":key}).mappings().first()
   if existing:return dict(existing)
  row=c.execute(text("""insert into warehouse_intakes(org_id,warehouse_id,intake_reference,supplier_name,supplier_phone,shipping_mark,supplier_tracking,order_reference,recipient_name,recipient_phone,destination_country,destination_city,description,declared_weight_kg,measured_weight_kg,length_cm,width_cm,height_cm,volume_cbm,volumetric_weight_kg,condition,notes,source,idempotency_key,received_by,received_by_name)
   values(:o,:w,:r,:supplier_name,:supplier_phone,:shipping_mark,:supplier_tracking,:order_reference,:recipient_name,:recipient_phone,:destination_country,:destination_city,:description,:declared_weight_kg,:measured_weight_kg,:length_cm,:width_cm,:height_cm,:volume_cbm,:volumetric_weight_kg,:condition,:notes,:source,:key,:u,:un) returning *"""),{"o":org_id,"w":warehouse_id,"r":reference,"key":key,"u":actor,"un":actor_name,**data}).mappings().one()
  _audit(c,org_id,warehouse_id,"intake",row["id"],"RECEIVED",actor,{"reference":reference});return dict(row)

def link_intake(org_id,intake_id,package_id,actor,expected_version):
 with engine.begin() as c:
  intake=c.execute(text("select * from warehouse_intakes where id=:id and org_id=:o for update"),{"id":intake_id,"o":org_id}).mappings().first()
  package=c.execute(text("select * from cargo_packages where id=:p and org_id=:o and deleted_at is null for update"),{"p":package_id,"o":org_id}).mappings().first()
  if not intake or not package:raise HTTPException(404,"intake_or_package_not_found")
  if intake["row_version"]!=expected_version or intake["status"]!='PENDING_IDENTIFICATION':raise HTTPException(409,"intake_state_conflict")
  duplicate=c.execute(text("select id from cargo_packages where org_id=:o and id<>:p and deleted_at is null and ((tracking_id is not null and tracking_id=:t) or (barcode is not null and barcode=:t)) limit 1"),{"o":org_id,"p":package_id,"t":intake["supplier_tracking"]}).first() if intake["supplier_tracking"] else None
  if duplicate:raise HTTPException(409,"duplicate_tracking_detected")
  c.execute(text("""update cargo_packages set warehouse_id=:w,warehouse_name=(select warehouse_name from warehouses where id=:w),weight_kg=coalesce(:weight,weight_kg),length_cm=coalesce(:l,length_cm),width_cm=coalesce(:wi,width_cm),height_cm=coalesce(:h,height_cm),volume_cbm=coalesce(:v,volume_cbm),volumetric_weight_kg=coalesce(:vw,volumetric_weight_kg),inventory_status='IN_STOCK',status='RECEIVED_AT_ORIGIN',received_at=coalesce(received_at,now()),updated_at=now(),row_version=row_version+1 where id=:p and org_id=:o"""),{"w":intake["warehouse_id"],"weight":intake["measured_weight_kg"],"l":intake["length_cm"],"wi":intake["width_cm"],"h":intake["height_cm"],"v":intake["volume_cbm"],"vw":intake["volumetric_weight_kg"],"p":package_id,"o":org_id})
  row=c.execute(text("update warehouse_intakes set package_id=:p,status='QC_PENDING',row_version=row_version+1,updated_at=now() where id=:id returning *"),{"p":package_id,"id":intake_id}).mappings().one();_audit(c,org_id,intake["warehouse_id"],"intake",intake_id,"IDENTIFIED",actor,{"package_id":package_id});return dict(row)

def quality_check(org_id,warehouse_id,actor,actor_name,payload):
 data=dict(payload);intake_id=data["intake_id"]
 with engine.begin() as c:
  intake=c.execute(text("select * from warehouse_intakes where id=:id and org_id=:o and warehouse_id=:w for update"),{"id":intake_id,"o":org_id,"w":warehouse_id}).mappings().first()
  if not intake:raise HTTPException(404,"intake_not_found")
  blocked=any(data.get(k) for k in ("damaged","torn","wet","broken","missing_items")) or not data.get("packaging_ok",True);status="BLOCKED" if blocked else "APPROVED"
  row=c.execute(text("""insert into warehouse_quality_checks(org_id,warehouse_id,intake_id,package_id,status,damaged,torn,wet,broken,missing_items,packaging_ok,weight_verified,dimensions_verified,label_verified,photos_taken,comments,checked_by,checked_by_name)
   values(:o,:w,:intake_id,:package_id,:status,:damaged,:torn,:wet,:broken,:missing_items,:packaging_ok,:weight_verified,:dimensions_verified,:label_verified,:photos_taken,:comments,:u,:un)
   on conflict(org_id,intake_id) do update set status=excluded.status,damaged=excluded.damaged,torn=excluded.torn,wet=excluded.wet,broken=excluded.broken,missing_items=excluded.missing_items,packaging_ok=excluded.packaging_ok,weight_verified=excluded.weight_verified,dimensions_verified=excluded.dimensions_verified,label_verified=excluded.label_verified,photos_taken=excluded.photos_taken,comments=excluded.comments,checked_by=excluded.checked_by,checked_by_name=excluded.checked_by_name,checked_at=now(),row_version=warehouse_quality_checks.row_version+1 returning *"""),{"o":org_id,"w":warehouse_id,"package_id":intake["package_id"],"status":status,"u":actor,"un":actor_name,**data}).mappings().one()
  next_status="QC_BLOCKED" if blocked else "QC_APPROVED";c.execute(text("update warehouse_intakes set status=:s,row_version=row_version+1,updated_at=now() where id=:id"),{"s":next_status,"id":intake_id})
  if blocked:c.execute(text("""insert into warehouse_anomalies(org_id,warehouse_id,package_id,anomaly_type,severity,title,description,created_by) values(:o,:w,:p,'QUALITY_CONTROL','HIGH','Contrôle qualité bloqué',:d,:u)"""),{"o":org_id,"w":warehouse_id,"p":intake["package_id"],"d":data.get("comments"),"u":actor})
  _audit(c,org_id,warehouse_id,"quality_check",row["id"],status,actor,data);return dict(row)

def start_scan(org_id,warehouse_id,actor,actor_name,scan_type):
 with engine.begin() as c:return dict(c.execute(text("insert into warehouse_scan_sessions(org_id,warehouse_id,session_reference,scan_type,created_by,created_by_name) values(:o,:w,:r,:t,:u,:un) returning *"),{"o":org_id,"w":warehouse_id,"r":_ref("SCN"),"t":scan_type,"u":actor,"un":actor_name}).mappings().one())
def scan(org_id,session_id,actor,value,location):
 with engine.begin() as c:
  session=c.execute(text("select * from warehouse_scan_sessions where id=:id and org_id=:o and status='OPEN' for update"),{"id":session_id,"o":org_id}).mappings().first()
  if not session:raise HTTPException(409,"scan_session_not_open")
  package=c.execute(text("select id::text,package_reference from cargo_packages where org_id=:o and deleted_at is null and (:v in (package_reference,tracking_id,barcode,qr_code_value)) limit 1"),{"o":org_id,"v":value}).mappings().first()
  duplicate=c.execute(text("select 1 from warehouse_scan_items where session_id=:s and scan_value=:v"),{"s":session_id,"v":value}).first();result="DUPLICATE" if duplicate else "FOUND" if package else "UNKNOWN"
  if not duplicate:c.execute(text("insert into warehouse_scan_items(org_id,session_id,scan_value,package_id,result,location_label,scanned_by) values(:o,:s,:v,:p,:r,:l,:u)"),{"o":org_id,"s":session_id,"v":value,"p":package["id"] if package else None,"r":result,"l":location,"u":actor})
  c.execute(text("update warehouse_scan_sessions set scanned_count=scanned_count+:ok,duplicate_count=duplicate_count+:dup,error_count=error_count+:err where id=:s"),{"ok":0 if duplicate else 1,"dup":1 if duplicate else 0,"err":1 if result=='UNKNOWN' else 0,"s":session_id});return {"result":result,"package":dict(package) if package else None}

def create_group(org_id,warehouse_id,actor,actor_name,payload):
 ids=payload.pop("package_ids",[]);gid=str(uuid4())
 with engine.begin() as c:
  row=c.execute(text("""insert into warehouse_groups(id,org_id,warehouse_id,group_reference,group_type,destination_country,destination_city,container_number,notes,created_by,created_by_name) values(:id,:o,:w,:r,:group_type,:destination_country,:destination_city,:container_number,:notes,:u,:un) returning *"""),{"id":gid,"o":org_id,"w":warehouse_id,"r":_ref("GRP"),"u":actor,"un":actor_name,**payload}).mappings().one()
  valid=c.execute(text("select id from cargo_packages where org_id=:o and warehouse_id=:w and id=any(cast(:ids as uuid[])) and deleted_at is null"),{"o":org_id,"w":warehouse_id,"ids":ids}).scalars().all() if ids else []
  if len(valid)!=len(set(ids)):raise HTTPException(422,"group_contains_invalid_packages")
  for package_id in valid:c.execute(text("insert into warehouse_group_items(org_id,group_id,package_id) values(:o,:g,:p)"),{"o":org_id,"g":gid,"p":package_id})
  _audit(c,org_id,warehouse_id,"group",gid,"CREATED",actor,{"packages":ids});return dict(row)
def transition_group(org_id,group_id,actor,action,version):
 transitions={"ready":("DRAFT","READY"),"start-loading":("READY","LOADING"),"finish-loading":("LOADING","LOADED"),"dispatch":("LOADED","DISPATCHED"),"cancel":("DRAFT","CANCELLED")}
 if action not in transitions:raise HTTPException(422,"invalid_group_action")
 source,target=transitions[action]
 with engine.begin() as c:
  row=c.execute(text("update warehouse_groups set status=:t,row_version=row_version+1,updated_at=now() where id=:id and org_id=:o and status=:s and row_version=:v returning *"),{"t":target,"id":group_id,"o":org_id,"s":source,"v":version}).mappings().first()
  if not row:raise HTTPException(409,"group_state_conflict")
  if target=='DISPATCHED':c.execute(text("update cargo_packages p set inventory_status='DISPATCHED',status='SHIPPED',dispatched_at=now(),updated_at=now(),row_version=row_version+1 from warehouse_group_items i where i.group_id=:g and i.package_id=p.id and p.org_id=:o"),{"g":group_id,"o":org_id})
  _audit(c,org_id,row["warehouse_id"],"group",group_id,target,actor);return dict(row)
def list_groups(org_id,warehouse_id):
 with engine.connect() as c:return _rows(c.execute(text("select g.*,(select count(*) from warehouse_group_items i where i.group_id=g.id)::int package_count from warehouse_groups g where org_id=:o and warehouse_id=:w order by created_at desc"),{"o":org_id,"w":warehouse_id}))
def detect_alerts(org_id,warehouse_id,actor):
 with engine.begin() as c:
  candidates=_rows(c.execute(text("""select id::text,package_reference,'STALE_PACKAGE' kind,'HIGH' severity,'Colis immobilisé depuis plus de 10 jours' description from cargo_packages where org_id=:o and warehouse_id=:w and deleted_at is null and inventory_status='IN_STOCK' and received_at<now()-interval '10 days'
   union all select id::text,package_reference,'MISSING_WEIGHT','MEDIUM','Poids manquant' from cargo_packages where org_id=:o and warehouse_id=:w and deleted_at is null and inventory_status='IN_STOCK' and weight_kg is null
   union all select id::text,package_reference,'PAYMENT_MISSING','HIGH','Paiement non validé avant départ' from cargo_packages where org_id=:o and warehouse_id=:w and deleted_at is null and inventory_status='READY_FOR_DISPATCH' and payment_clearance_status not in ('PAID','CLEARED')
   union all select id::text,package_reference,'DIMENSION_INCONSISTENCY','MEDIUM','Dimensions présentes mais volume absent' from cargo_packages where org_id=:o and warehouse_id=:w and deleted_at is null and length_cm>0 and width_cm>0 and height_cm>0 and coalesce(volume_cbm,0)=0"""),{"o":org_id,"w":warehouse_id}))
  created=0
  for p in candidates:
   result=c.execute(text("""insert into warehouse_anomalies(org_id,warehouse_id,package_id,anomaly_type,severity,title,description,created_by,detection_key) values(:o,:w,:p,:k,:s,:t,:d,:u,:key) on conflict do nothing returning id"""),{"o":org_id,"w":warehouse_id,"p":p["id"],"k":p["kind"],"s":p["severity"],"t":f"{p['package_reference']} · {p['kind']}","d":p["description"],"u":actor,"key":f"{p['kind']}:{p['id']}"}).first();created+=1 if result else 0
  return {"created":created,"evaluated":len(candidates)}
def packing_list(org_id,group_id):
 with engine.connect() as c:rows=_rows(c.execute(text("select g.group_reference,g.group_type,g.destination_country,g.destination_city,p.package_reference,p.tracking_id,p.client_name,p.description,p.weight_kg,p.volume_cbm from warehouse_groups g join warehouse_group_items i on i.group_id=g.id join cargo_packages p on p.id=i.package_id and p.org_id=g.org_id where g.org_id=:o and g.id=:g order by p.package_reference"),{"o":org_id,"g":group_id}))
 if not rows:raise HTTPException(404,"group_not_found_or_empty")
 out=io.StringIO();w=csv.DictWriter(out,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows);return out.getvalue()
