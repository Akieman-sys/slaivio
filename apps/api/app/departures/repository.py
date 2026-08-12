import json
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import text
from app.db.database import engine
def rows(r):return [dict(x) for x in r.mappings().all()]
def ev(c,o,d,t,a,n,p=None):c.execute(text("insert into departure_events(org_id,departure_id,event_type,actor_id,actor_name,payload) values(:o,:d,:t,:a,:n,cast(:p as jsonb))"),{"o":o,"d":d,"t":t,"a":a,"n":n,"p":json.dumps(p or {})})
def listing(o,start=None,end=None,status=None):
 f=['d.org_id=:o'];p={'o':o};
 if start:f.append('d.scheduled_at>=:start');p['start']=start
 if end:f.append('d.scheduled_at<:end');p['end']=end
 if status:f.append('d.status=:status');p['status']=status
 with engine.connect() as c:return rows(c.execute(text(f"select d.*,s.service_name,s.shipping_mode,r.route_name,r.origin_city,r.origin_country,r.destination_city,r.destination_country,(select count(*) from departure_allocations a where a.departure_id=d.id and a.status<>'REMOVED')::int shipment_count from cargo_departures d join shipping_services s on s.id=d.shipping_service_id and s.org_id=d.org_id left join shipping_routes r on r.id=s.route_id where {' and '.join(f)} order by d.scheduled_at"),p))
def detail(o,d):
 with engine.connect() as c:
  item=c.execute(text("select d.*,s.service_name,s.shipping_mode,r.route_name,r.origin_city,r.origin_country,r.destination_city,r.destination_country from cargo_departures d join shipping_services s on s.id=d.shipping_service_id and s.org_id=d.org_id left join shipping_routes r on r.id=s.route_id where d.org_id=:o and d.id=:d"),{'o':o,'d':d}).mappings().first()
  if not item:raise HTTPException(404,'departure_not_found')
  out=dict(item);out['allocations']=rows(c.execute(text("select a.*,e.expedition_reference from departure_allocations a left join expeditions e on e.id=a.shipment_id and e.org_id=a.org_id where a.org_id=:o and a.departure_id=:d and a.status<>'REMOVED' order by a.created_at"),{'o':o,'d':d}));out['events']=rows(c.execute(text("select * from departure_events where org_id=:o and departure_id=:d order by created_at desc"),{'o':o,'d':d}));return out
def stats(o):
 with engine.connect() as c:return dict(c.execute(text("""select count(*) filter(where scheduled_at::date=current_date)::int today,count(*) filter(where scheduled_at>=date_trunc('week',now()) and scheduled_at<date_trunc('week',now())+interval '7 days')::int this_week,count(*) filter(where status='CONFIRMED')::int confirmed,count(*) filter(where status in ('OPEN','PLANNED','PENDING_CONFIRMATION'))::int pending,count(*) filter(where status='DELAYED')::int delayed,count(*) filter(where capacity_weight_kg>0 and reserved_weight_kg>=capacity_weight_kg)::int full,coalesce(sum(reserved_packages),0)::int packages,coalesce(sum(reserved_weight_kg),0)::float weight_kg,coalesce(sum(reserved_cbm),0)::float cbm from cargo_departures where org_id=:o"""),{'o':o}).mappings().one())
def create(o,a,n,p):
 with engine.begin() as c:
  if not c.execute(text('select 1 from shipping_services where id=:s and org_id=:o and active'),{'s':p['shipping_service_id'],'o':o}).first():raise HTTPException(422,'service_not_found')
  p['departure_code']=p.get('departure_code') or f"DEP-{uuid4().hex[:8].upper()}";row=dict(c.execute(text("insert into cargo_departures(org_id,shipping_service_id,departure_code,scheduled_at,cutoff_at,estimated_arrival_at,status,capacity_weight_kg,capacity_cbm,capacity_packages,carrier_name,transport_reference,timezone,responsible_name,warehouse_id,destination_office,published,notes,created_by) values(:o,:shipping_service_id,:departure_code,:scheduled_at,:cutoff_at,:estimated_arrival_at,'PLANNED',:capacity_weight_kg,:capacity_cbm,:capacity_packages,:carrier_name,:transport_reference,:timezone,:responsible_name,cast(:warehouse_id as uuid),:destination_office,:published,:notes,:a) returning *"),{'o':o,'a':a,**p}).mappings().one());ev(c,o,str(row['id']),'CREATED',a,n);return row
def allocate(o,d,a,n,p):
 with engine.begin() as c:
  old=c.execute(text('select * from departure_allocations where org_id=:o and idempotency_key=:k'),{'o':o,'k':p['idempotency_key']}).mappings().first()
  if old:return dict(old)
  dep=c.execute(text("select * from cargo_departures where id=:d and org_id=:o and status='OPEN' for update"),{'d':d,'o':o}).mappings().first()
  if not dep:raise HTTPException(409,'departure_not_open')
  if dep['cutoff_at'] and c.execute(text('select now()>:x'),{'x':dep['cutoff_at']}).scalar():raise HTTPException(409,'departure_cutoff_passed')
  if dep['reserved_weight_kg']+p['weight_kg']>(dep['capacity_weight_kg'] or 10**12) or dep['reserved_cbm']+p['volume_cbm']>(dep['capacity_cbm'] or 10**12):raise HTTPException(409,'departure_capacity_exceeded')
  row=dict(c.execute(text("insert into departure_allocations(org_id,departure_id,shipment_id,weight_kg,volume_cbm,idempotency_key,created_by) values(:o,:d,:shipment_id,:weight_kg,:volume_cbm,:idempotency_key,:a) returning *"),{'o':o,'d':d,'a':a,**p}).mappings().one());c.execute(text('update cargo_departures set reserved_weight_kg=reserved_weight_kg+:w,reserved_cbm=reserved_cbm+:v,row_version=row_version+1,updated_at=now() where id=:d'),{'w':p['weight_kg'],'v':p['volume_cbm'],'d':d});ev(c,o,d,'SHIPMENT_ALLOCATED',a,n,p);return row
def transition(o,d,a,n,status,version,reason=None):
 allowed={'DRAFT':{'PLANNED','CANCELLED'},'OPEN':{'CONFIRMED','CANCELLED'},'PLANNED':{'PENDING_CONFIRMATION','CONFIRMED','DELAYED','CANCELLED'},'PENDING_CONFIRMATION':{'CONFIRMED','DELAYED','CANCELLED'},'CONFIRMED':{'LOADING','DELAYED','CANCELLED'},'CLOSED':{'LOADING','CANCELLED'},'LOADING':{'READY_TO_DEPART','DEPARTED','DELAYED'},'READY_TO_DEPART':{'DEPARTED','DELAYED'},'DELAYED':{'CONFIRMED','LOADING','CANCELLED'},'DEPARTED':{'ARRIVED'},'ARRIVED':{'COMPLETED'}}
 with engine.begin() as c:
  cur=c.execute(text('select * from cargo_departures where id=:d and org_id=:o for update'),{'d':d,'o':o}).mappings().first()
  if status in {'LOADING','DEPARTED'}:
   blocked=c.execute(text("select count(*) from departure_allocations da left join compliance_checks cc on cc.org_id=da.org_id and cc.entity_type='SHIPMENT' and cc.entity_id=da.shipment_id where da.departure_id=:d and da.status<>'REMOVED' and coalesce(cc.status,'BLOCKED')<>'CLEAR'"),{'d':d}).scalar_one()
   if blocked:raise HTTPException(409,'departure_compliance_blocked')
  if not cur or version!=cur['row_version'] or status not in allowed.get(cur['status'],set()):raise HTTPException(409,'departure_state_conflict')
  if status=='CANCELLED' and not reason:raise HTTPException(422,'cancellation_reason_required')
  row=dict(c.execute(text('update cargo_departures set status=:s,row_version=row_version+1,notes=concat_ws(E\'\\n\',notes,:r),updated_at=now() where id=:d returning *'),{'s':status,'r':reason,'d':d}).mappings().one());ev(c,o,d,status,a,n,{'reason':reason});return row
