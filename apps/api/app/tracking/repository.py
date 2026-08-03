from __future__ import annotations

import json
import secrets
from datetime import date, datetime
from decimal import Decimal
from math import ceil
from typing import Any

from sqlalchemy import text

from app.db.database import engine
from app.expeditions.repository import get_expedition, expedition_timeline


ACTIVE_STATUSES=("PREPARING","LOADING","READY_FOR_DEPARTURE","DISPATCHED","IN_TRANSIT","ARRIVED_DESTINATION","CUSTOMS_CLEARANCE","AVAILABLE_FOR_PICKUP","OUT_FOR_DELIVERY")

def _safe(value:Any)->Any:
    if isinstance(value,Decimal): return float(value)
    if isinstance(value,(datetime,date)): return value.isoformat()
    if isinstance(value,dict): return {k:_safe(v) for k,v in value.items()}
    if isinstance(value,list): return [_safe(v) for v in value]
    return value

def _rows(result): return [_safe(dict(row._mapping)) for row in result]

def control_tower(org_id:str,*,q:str|None=None,status:str|None=None,risk_level:str|None=None,country:str|None=None,route:str|None=None,warehouse:str|None=None,client_id:str|None=None,container:str|None=None,batch:str|None=None,incident:bool|None=None,page:int=1,page_size:int=30)->dict:
    filters=["e.org_id=:org_id","e.deleted_at is null","e.archived_at is null"]
    params:dict[str,Any]={"org_id":org_id}
    if q:
        filters.append("(e.expedition_reference ilike :q or coalesce(e.title,'') ilike :q or coalesce(e.container_number,'') ilike :q or exists(select 1 from expedition_packages ep join cargo_packages p on p.id=ep.package_id where ep.org_id=e.org_id and ep.expedition_id=e.id and ep.removed_at is null and (p.package_reference ilike :q or p.tracking_id ilike :q)))");params["q"]=f"%{q.strip()}%"
    for key,value,column in [("status",status,"e.status"),("risk_level",risk_level,"e.risk_level"),("route",route,"e.route_label"),("warehouse",warehouse,"e.origin_warehouse"),("container",container,"e.container_number"),("batch",batch,"e.batch_reference")]:
        if value: filters.append(f"{column}=:{key}");params[key]=value
    if country: filters.append("(e.origin_country=:country or e.destination_country=:country)");params["country"]=country
    if client_id: filters.append("exists(select 1 from expedition_packages ep where ep.org_id=e.org_id and ep.expedition_id=e.id and ep.client_id=:client_id and ep.removed_at is null)");params["client_id"]=client_id
    if incident is True: filters.append("exists(select 1 from expedition_anomalies a where a.org_id=e.org_id and a.expedition_id=e.id and a.status in ('OPEN','IN_REVIEW'))")
    where=" and ".join(filters);page=max(page,1);page_size=min(max(page_size,1),100);offset=(page-1)*page_size
    select="""select e.id::text,e.expedition_reference tracking_id,'SHIPMENT' type,e.title,e.status,e.mode,e.risk_level,
      e.origin_country,e.origin_city,e.destination_country,e.destination_city,e.route_label,e.origin_warehouse,e.destination_warehouse,
      e.last_location,e.eta_at,e.progress_percent,e.is_delayed,e.delay_hours,e.delay_reason,e.owner_name,e.container_number,e.batch_reference,
      e.packages_count,e.clients_count,e.total_weight_kg,e.total_volume_cbm,e.updated_at,
      coalesce(e.last_signal_at,e.updated_at) last_signal_at,coalesce(e.last_signal_source,'SLAIVIO') last_signal_source,
      (select count(*)::int from expedition_anomalies a where a.org_id=e.org_id and a.expedition_id=e.id and a.status in ('OPEN','IN_REVIEW')) open_alerts
      from cargo_expeditions e"""
    with engine.connect() as conn:
        total=conn.execute(text(f"select count(*) from cargo_expeditions e where {where}"),params).scalar() or 0
        items=_rows(conn.execute(text(f"{select} where {where} order by e.updated_at desc limit :limit offset :offset"),dict(params,limit=page_size,offset=offset)).fetchall())
    return {"items":items,"pagination":{"page":page,"page_size":page_size,"total":total,"total_pages":ceil(total/page_size) if total else 0}}

def tracking_stats(org_id:str)->dict:
    with engine.connect() as conn:
        row=conn.execute(text("""select
          count(*) filter(where status='IN_TRANSIT')::int packages_in_transit,
          count(*) filter(where status in ('PREPARING','LOADING','READY_FOR_DEPARTURE','DISPATCHED','IN_TRANSIT','ARRIVED_DESTINATION','CUSTOMS_CLEARANCE','AVAILABLE_FOR_PICKUP','OUT_FOR_DELIVERY'))::int active_shipments,
          count(*) filter(where delivered_at::date=current_date)::int delivered_today,
          count(*) filter(where is_delayed or (eta_at<now() and status<>'DELIVERED'))::int delays,
          (select count(*)::int from expedition_anomalies a where a.org_id=:org_id and a.status in ('OPEN','IN_REVIEW')) incidents_open,
          round(avg(extract(epoch from(delivered_at-coalesce(departed_at,planned_departure_at)))/3600) filter(where delivered_at is not null and coalesce(departed_at,planned_departure_at) is not null)::numeric,1) average_transit_hours
          from cargo_expeditions where org_id=:org_id and deleted_at is null and archived_at is null"""),{"org_id":org_id}).fetchone()
    return _safe(dict(row._mapping)) if row else {}

def global_timeline(org_id:str,limit:int=80)->list[dict]:
    with engine.connect() as conn:
        return _rows(conn.execute(text("""select ev.id::text,ev.expedition_id::text,e.expedition_reference tracking_id,
          ev.event_type,ev.title,ev.description,ev.actor_id,ev.actor_name,ev.metadata,ev.occurred_at,
          coalesce(ev.metadata->>'location',e.last_location) location
          from expedition_events ev join cargo_expeditions e on e.id=ev.expedition_id and e.org_id=ev.org_id
          where ev.org_id=:org_id order by ev.occurred_at desc limit :limit"""),{"org_id":org_id,"limit":min(limit,200)}).fetchall())

def tracking_detail(org_id:str,tracking_id:str)->dict|None:
    expedition=get_expedition(org_id,tracking_id)
    if not expedition: return None
    expedition["timeline"]=expedition_timeline(org_id,tracking_id)
    return expedition

def add_manual_event(org_id:str,expedition_id:str,user_id:str,payload:dict)->dict|None:
    if not get_expedition(org_id,expedition_id): return None
    with engine.begin() as conn:
        conn.execute(text("""insert into expedition_events(org_id,expedition_id,event_type,title,description,metadata,actor_id,occurred_at)
          values(:org_id,:expedition_id,:event_type,:title,:description,cast(:metadata as jsonb),:actor_id,coalesce(:occurred_at,now()))"""),
          {"org_id":org_id,"expedition_id":expedition_id,"actor_id":user_id,"event_type":payload["event_type"],"title":payload["title"],"description":payload.get("description"),"metadata":json.dumps({"location":payload.get("location"),"latitude":payload.get("latitude"),"longitude":payload.get("longitude"),"source":"MANUAL_TRACKING"}),"occurred_at":payload.get("occurred_at")})
        conn.execute(text("""update cargo_expeditions set last_location=coalesce(:location,last_location),last_signal_at=now(),last_signal_source='MANUAL_TRACKING',updated_by=:user_id,updated_at=now() where org_id=:org_id and id=:expedition_id"""),{"org_id":org_id,"expedition_id":expedition_id,"location":payload.get("location"),"user_id":user_id})
    return tracking_detail(org_id,expedition_id)

def public_token(org_id:str,expedition_id:str,expires_at:str|None=None)->dict|None:
    token=secrets.token_urlsafe(32)
    with engine.begin() as conn:
        row=conn.execute(text("""update cargo_expeditions set public_tracking_token=:token,public_tracking_enabled=true,
          public_tracking_expires_at=:expires_at,updated_at=now() where org_id=:org_id and id=:expedition_id and deleted_at is null
          returning public_tracking_token,public_tracking_expires_at"""),{"org_id":org_id,"expedition_id":expedition_id,"token":token,"expires_at":expires_at}).fetchone()
    return _safe(dict(row._mapping)) if row else None

def public_view(token:str,ip_address:str|None,user_agent:str|None)->dict|None:
    with engine.begin() as conn:
        row=conn.execute(text("""select id::text,org_id,expedition_reference tracking_id,status,mode,origin_country,origin_city,
          destination_country,destination_city,route_label,last_location,eta_at,progress_percent,is_delayed,updated_at
          from cargo_expeditions where public_tracking_token=:token and public_tracking_enabled
          and (public_tracking_expires_at is null or public_tracking_expires_at>now()) and deleted_at is null limit 1"""),{"token":token}).fetchone()
        if not row:return None
        item=_safe(dict(row._mapping))
        conn.execute(text("insert into tracking_public_access_logs(org_id,expedition_id,ip_address,user_agent) values(:org_id,:id,:ip,:ua)"),{"org_id":item["org_id"],"id":item["id"],"ip":ip_address,"ua":user_agent})
        item.pop("org_id",None)
        item["events"]=_rows(conn.execute(text("""select event_type,title,description,occurred_at from expedition_events where expedition_id=:id and org_id=:org_id order by occurred_at asc"""),{"id":item["id"],"org_id":row._mapping["org_id"]}).fetchall())
        return item

def save_view(org_id:str,user_id:str,name:str,filters:dict)->dict:
    with engine.begin() as conn:
        row=conn.execute(text("""insert into tracking_saved_views(org_id,user_id,name,filters) values(:org_id,:user_id,:name,cast(:filters as jsonb))
          on conflict(org_id,user_id,name) do update set filters=excluded.filters,updated_at=now() returning id::text,name,filters,is_default,created_at,updated_at"""),{"org_id":org_id,"user_id":user_id,"name":name,"filters":json.dumps(filters)}).fetchone()
    return _safe(dict(row._mapping))

def list_views(org_id:str,user_id:str)->list[dict]:
    with engine.connect() as conn:return _rows(conn.execute(text("select id::text,name,filters,is_default,created_at,updated_at from tracking_saved_views where org_id=:org_id and user_id=:user_id order by is_default desc,name"),{"org_id":org_id,"user_id":user_id}).fetchall())
