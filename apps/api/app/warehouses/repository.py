from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import text

from app.db.database import engine


def _rows(result):
    return [dict(row) for row in result.mappings().all()]


def _actor(tenant):
    return tenant.get("user_id") or tenant.get("manager_id") or "system"


def _audit(conn, org_id, warehouse_id, entity_type, entity_id, action, actor, payload=None):
    conn.execute(text("""insert into warehouse_audit_log(org_id,warehouse_id,entity_type,entity_id,action,actor_id,payload)
      values(:o,:w,:t,:e,:a,:u,cast(:p as jsonb))"""), {"o":org_id,"w":warehouse_id,"t":entity_type,"e":str(entity_id),"a":action,"u":actor,"p":json.dumps(payload or {},default=str)})


def list_warehouses(org_id, q=None, active=None):
    filters=["w.org_id=:o","w.archived_at is null"] ; params={"o":org_id}
    if q: filters.append("(w.warehouse_name ilike :q or w.warehouse_code ilike :q or coalesce(w.city,'') ilike :q)");params["q"]=f"%{q}%"
    if active is not None: filters.append("w.active=:active");params["active"]=active
    sql=f"""select w.id::text,w.warehouse_code,w.warehouse_name,w.warehouse_type,w.country_code,w.city,w.address,w.contact_phone,w.contact_name,w.active,w.manager_name,w.timezone,w.capacity_packages,w.capacity_weight_kg,w.capacity_volume_cbm,w.row_version,
      coalesce(stock.package_count,0) package_count,coalesce(stock.weight_kg,0) weight_kg,coalesce(stock.volume_cbm,0) volume_cbm,coalesce(alerts.open_anomalies,0) open_anomalies
      from warehouses w left join lateral(select count(*)::int package_count,coalesce(sum(weight_kg),0)::float weight_kg,coalesce(sum(volume_cbm),0)::float volume_cbm from cargo_packages p where p.org_id=w.org_id and p.warehouse_id=w.id and p.deleted_at is null and p.inventory_status='IN_STOCK') stock on true
      left join lateral(select count(*)::int open_anomalies from warehouse_anomalies a where a.org_id=w.org_id and a.warehouse_id=w.id and a.status in ('OPEN','IN_REVIEW')) alerts on true
      where {' and '.join(filters)} order by w.warehouse_name"""
    with engine.connect() as conn:return _rows(conn.execute(text(sql),params))


def create_warehouse(org_id, actor, payload):
    warehouse_id=str(uuid4())
    with engine.begin() as conn:
        row=conn.execute(text("""insert into warehouses(id,org_id,warehouse_code,warehouse_name,warehouse_type,country_code,city,address,contact_phone,contact_name,manager_id,manager_name,timezone,capacity_packages,capacity_weight_kg,capacity_volume_cbm)
          values(:id,:o,:warehouse_code,:warehouse_name,:warehouse_type,:country_code,:city,:address,:contact_phone,:contact_name,:manager_id,:manager_name,:timezone,:capacity_packages,:capacity_weight_kg,:capacity_volume_cbm)
          returning *"""),{"id":warehouse_id,"o":org_id,**payload}).mappings().one()
        _audit(conn,org_id,warehouse_id,"warehouse",warehouse_id,"CREATED",actor,payload)
        return dict(row)


def get_warehouse(org_id, warehouse_id):
    with engine.connect() as conn:
        warehouse=conn.execute(text("select * from warehouses where id=:id and org_id=:o and archived_at is null"),{"id":warehouse_id,"o":org_id}).mappings().first()
        if not warehouse: raise HTTPException(404,"warehouse_not_found")
        inventory=_rows(conn.execute(text("""select id::text,package_reference,tracking_id,description,status,inventory_status,warehouse_zone,warehouse_aisle,warehouse_shelf,warehouse_position,weight_kg,volume_cbm,client_name,dossier_reference,updated_at
          from cargo_packages where org_id=:o and warehouse_id=:id and deleted_at is null order by updated_at desc limit 500"""),{"o":org_id,"id":warehouse_id}))
        slots=_rows(conn.execute(text("select * from warehouse_slots where org_id=:o and warehouse_id=:id order by zone,code"),{"o":org_id,"id":warehouse_id}))
        transfers=_rows(conn.execute(text("""select t.*,s.warehouse_name source_name,d.warehouse_name destination_name,(select count(*) from warehouse_transfer_items i where i.transfer_id=t.id)::int package_count from warehouse_transfers t join warehouses s on s.id=t.source_warehouse_id join warehouses d on d.id=t.destination_warehouse_id where t.org_id=:o and (t.source_warehouse_id=:id or t.destination_warehouse_id=:id) order by t.created_at desc"""),{"o":org_id,"id":warehouse_id}))
        counts=_rows(conn.execute(text("select * from warehouse_stock_counts where org_id=:o and warehouse_id=:id order by created_at desc"),{"o":org_id,"id":warehouse_id}))
        anomalies=_rows(conn.execute(text("select * from warehouse_anomalies where org_id=:o and warehouse_id=:id order by case severity when 'CRITICAL' then 1 when 'HIGH' then 2 else 3 end,created_at desc"),{"o":org_id,"id":warehouse_id}))
        movements=_rows(conn.execute(text("""select m.*,p.package_reference from package_movements m join cargo_packages p on p.id=m.package_id and p.org_id=m.org_id where m.org_id=:o and (p.warehouse_id=:id or m.from_warehouse=(select warehouse_name from warehouses where id=:id)) order by m.created_at desc limit 200"""),{"o":org_id,"id":warehouse_id}))
        audit=_rows(conn.execute(text("select * from warehouse_audit_log where org_id=:o and warehouse_id=:id order by created_at desc limit 100"),{"o":org_id,"id":warehouse_id}))
    result=dict(warehouse);result.update(inventory=inventory,slots=slots,transfers=transfers,counts=counts,anomalies=anomalies,movements=movements,audit=audit);return result


def update_warehouse(org_id, warehouse_id, actor, payload, expected_version):
    allowed={"warehouse_name","warehouse_type","country_code","city","address","contact_phone","contact_name","manager_id","manager_name","timezone","capacity_packages","capacity_weight_kg","capacity_volume_cbm","active"}
    values={k:v for k,v in payload.items() if k in allowed}; sets=[f"{k}=:{k}" for k in values]
    if not sets:return get_warehouse(org_id,warehouse_id)
    params={"o":org_id,"id":warehouse_id,"v":expected_version,**values}
    with engine.begin() as conn:
        row=conn.execute(text(f"update warehouses set {','.join(sets)},row_version=row_version+1,updated_at=now() where org_id=:o and id=:id and row_version=:v returning *"),params).mappings().first()
        if not row: raise HTTPException(409,"warehouse_version_conflict")
        _audit(conn,org_id,warehouse_id,"warehouse",warehouse_id,"UPDATED",actor,values)
    return get_warehouse(org_id,warehouse_id)


def create_slot(org_id, warehouse_id, actor, payload):
    with engine.begin() as conn:
        row=conn.execute(text("""insert into warehouse_slots(org_id,warehouse_id,code,zone,aisle,rack,shelf,position,capacity_packages,capacity_weight_kg,capacity_volume_cbm,status)
          select :o,:w,:code,:zone,:aisle,:rack,:shelf,:position,:capacity_packages,:capacity_weight_kg,:capacity_volume_cbm,:status where exists(select 1 from warehouses where id=:w and org_id=:o) returning *"""),{"o":org_id,"w":warehouse_id,**payload}).mappings().first()
        if not row:raise HTTPException(404,"warehouse_not_found")
        _audit(conn,org_id,warehouse_id,"slot",row["id"],"CREATED",actor,payload);return dict(row)


def move_package(org_id, warehouse_id, package_id, actor, payload):
    with engine.begin() as conn:
        package=conn.execute(text("select * from cargo_packages where id=:p and org_id=:o and deleted_at is null for update"),{"p":package_id,"o":org_id}).mappings().first()
        warehouse=conn.execute(text("select warehouse_name from warehouses where id=:w and org_id=:o"),{"w":warehouse_id,"o":org_id}).mappings().first()
        if not package or not warehouse: raise HTTPException(404,"warehouse_or_package_not_found")
        conn.execute(text("""insert into package_movements(org_id,package_id,from_warehouse,from_zone,from_aisle,from_shelf,from_position,to_warehouse,to_zone,to_aisle,to_shelf,to_position,reason,moved_by)
          values(:o,:p,:fw,:fz,:fa,:fs,:fp,:tw,:zone,:aisle,:shelf,:position,:reason,:u)"""),{"o":org_id,"p":package_id,"fw":package.get("warehouse_name"),"fz":package.get("warehouse_zone"),"fa":package.get("warehouse_aisle"),"fs":package.get("warehouse_shelf"),"fp":package.get("warehouse_position"),"tw":warehouse["warehouse_name"],"u":actor,**payload})
        conn.execute(text("""update cargo_packages set warehouse_id=:w,warehouse_name=:wn,warehouse_zone=:zone,warehouse_aisle=:aisle,warehouse_shelf=:shelf,warehouse_position=:position,warehouse_location=concat_ws(' / ',:zone,:aisle,:shelf,:position),inventory_status='IN_STOCK',updated_at=now() where id=:p and org_id=:o"""),{"w":warehouse_id,"wn":warehouse["warehouse_name"],"p":package_id,"o":org_id,**payload})
        _audit(conn,org_id,warehouse_id,"package",package_id,"MOVED",actor,payload)
    return get_warehouse(org_id,warehouse_id)


def create_transfer(org_id, actor, payload):
    transfer_id=str(uuid4());reference=f"TRF-{datetime.now(timezone.utc):%Y%m%d}-{uuid4().hex[:6].upper()}"
    package_ids=payload.pop("package_ids",[])
    with engine.begin() as conn:
        row=conn.execute(text("""insert into warehouse_transfers(id,org_id,reference,source_warehouse_id,destination_warehouse_id,notes,created_by) values(:id,:o,:r,:source_warehouse_id,:destination_warehouse_id,:notes,:u) returning *"""),{"id":transfer_id,"o":org_id,"r":reference,"u":actor,**payload}).mappings().one()
        for package_id in package_ids: conn.execute(text("insert into warehouse_transfer_items(org_id,transfer_id,package_id) select :o,:t,id from cargo_packages where id=:p and org_id=:o and warehouse_id=:source"),{"o":org_id,"t":transfer_id,"p":package_id,"source":payload["source_warehouse_id"]})
        _audit(conn,org_id,payload["source_warehouse_id"],"transfer",transfer_id,"CREATED",actor,{"reference":reference,"package_ids":package_ids})
        return dict(row)


def transition_transfer(org_id, transfer_id, actor, action, expected_version):
    targets={"dispatch":("DRAFT","IN_TRANSIT"),"receive":("IN_TRANSIT","RECEIVED"),"cancel":("DRAFT","CANCELLED")}
    if action not in targets:raise HTTPException(400,"invalid_transfer_action")
    source,target=targets[action]
    with engine.begin() as conn:
        transfer=conn.execute(text("select * from warehouse_transfers where id=:id and org_id=:o for update"),{"id":transfer_id,"o":org_id}).mappings().first()
        if not transfer:raise HTTPException(404,"transfer_not_found")
        if transfer["row_version"]!=expected_version or transfer["status"]!=source:raise HTTPException(409,"transfer_state_conflict")
        extra="dispatched_at=now(),dispatched_by=:u" if action=="dispatch" else "received_at=now(),received_by=:u" if action=="receive" else "updated_at=now()"
        conn.execute(text(f"update warehouse_transfers set status=:target,{extra},row_version=row_version+1,updated_at=now() where id=:id and org_id=:o"),{"target":target,"u":actor,"id":transfer_id,"o":org_id})
        if action=="receive":
            destination=conn.execute(text("select warehouse_name from warehouses where id=:id and org_id=:o"),{"id":transfer["destination_warehouse_id"],"o":org_id}).scalar_one()
            conn.execute(text("""update cargo_packages p set warehouse_id=:w,warehouse_name=:wn,inventory_status='IN_STOCK',updated_at=now() from warehouse_transfer_items i where i.transfer_id=:t and i.package_id=p.id and p.org_id=:o"""),{"w":transfer["destination_warehouse_id"],"wn":destination,"t":transfer_id,"o":org_id})
        _audit(conn,org_id,transfer["source_warehouse_id"],"transfer",transfer_id,target,actor)
    return {"id":transfer_id,"status":target}


def create_count(org_id, warehouse_id, actor, payload):
    reference=f"CNT-{datetime.now(timezone.utc):%Y%m%d}-{uuid4().hex[:6].upper()}"
    with engine.begin() as conn:
        expected=conn.execute(text("select count(*) from cargo_packages where org_id=:o and warehouse_id=:w and deleted_at is null and inventory_status='IN_STOCK'"),{"o":org_id,"w":warehouse_id}).scalar_one()
        row=conn.execute(text("""insert into warehouse_stock_counts(org_id,warehouse_id,reference,status,expected_packages,assigned_id,assigned_name,notes,created_by) values(:o,:w,:r,'IN_PROGRESS',:e,:assigned_id,:assigned_name,:notes,:u) returning *"""),{"o":org_id,"w":warehouse_id,"r":reference,"e":expected,"u":actor,**payload}).mappings().one();_audit(conn,org_id,warehouse_id,"stock_count",row["id"],"STARTED",actor);return dict(row)


def complete_count(org_id, count_id, actor, actual, expected_version):
    with engine.begin() as conn:
        row=conn.execute(text("""update warehouse_stock_counts set status='COMPLETED',actual_packages=:a,variance=:a-expected_packages,completed_by=:u,completed_at=now(),updated_at=now(),row_version=row_version+1 where id=:id and org_id=:o and status='IN_PROGRESS' and row_version=:v returning *"""),{"a":actual,"u":actor,"id":count_id,"o":org_id,"v":expected_version}).mappings().first()
        if not row:raise HTTPException(409,"count_state_conflict")
        _audit(conn,org_id,row["warehouse_id"],"stock_count",count_id,"COMPLETED",actor,{"actual":actual,"variance":row["variance"]});return dict(row)


def create_anomaly(org_id, warehouse_id, actor, payload):
    with engine.begin() as conn:
        row=conn.execute(text("""insert into warehouse_anomalies(org_id,warehouse_id,package_id,slot_id,anomaly_type,severity,title,description,assigned_id,assigned_name,created_by) values(:o,:w,:package_id,:slot_id,:anomaly_type,:severity,:title,:description,:assigned_id,:assigned_name,:u) returning *"""),{"o":org_id,"w":warehouse_id,"u":actor,**payload}).mappings().one();_audit(conn,org_id,warehouse_id,"anomaly",row["id"],"CREATED",actor,payload);return dict(row)


def resolve_anomaly(org_id, anomaly_id, actor, resolution, expected_version):
    with engine.begin() as conn:
        row=conn.execute(text("""update warehouse_anomalies set status='RESOLVED',resolution=:r,resolved_by=:u,resolved_at=now(),updated_at=now(),row_version=row_version+1 where id=:id and org_id=:o and status in ('OPEN','IN_REVIEW') and row_version=:v returning *"""),{"r":resolution,"u":actor,"id":anomaly_id,"o":org_id,"v":expected_version}).mappings().first()
        if not row:raise HTTPException(409,"anomaly_state_conflict")
        _audit(conn,org_id,row["warehouse_id"],"anomaly",anomaly_id,"RESOLVED",actor,{"resolution":resolution});return dict(row)


def stats(org_id):
    with engine.connect() as conn:return dict(conn.execute(text("""select
      (select count(*) from warehouses where org_id=:o and archived_at is null)::int warehouses,
      (select count(*) from cargo_packages where org_id=:o and deleted_at is null and inventory_status='IN_STOCK')::int packages,
      coalesce((select sum(weight_kg) from cargo_packages where org_id=:o and deleted_at is null and inventory_status='IN_STOCK'),0)::float weight_kg,
      coalesce((select sum(volume_cbm) from cargo_packages where org_id=:o and deleted_at is null and inventory_status='IN_STOCK'),0)::float volume_cbm,
      (select count(*) from warehouse_anomalies where org_id=:o and status in ('OPEN','IN_REVIEW'))::int anomalies,
      (select count(*) from warehouse_transfers where org_id=:o and status='IN_TRANSIT')::int transfers"""),{"o":org_id}).mappings().one())


def export_inventory(org_id):
    with engine.connect() as conn: rows=_rows(conn.execute(text("""select w.warehouse_code,w.warehouse_name,p.package_reference,p.tracking_id,p.client_name,p.dossier_reference,p.status,p.inventory_status,p.warehouse_zone,p.warehouse_aisle,p.warehouse_shelf,p.warehouse_position,p.weight_kg,p.volume_cbm,p.updated_at from cargo_packages p join warehouses w on w.id=p.warehouse_id and w.org_id=p.org_id where p.org_id=:o and p.deleted_at is null order by w.warehouse_name,p.package_reference"""),{"o":org_id}))
    output=io.StringIO();writer=csv.DictWriter(output,fieldnames=list(rows[0]) if rows else ["warehouse_code","package_reference"]);writer.writeheader();writer.writerows(rows);return output.getvalue()
