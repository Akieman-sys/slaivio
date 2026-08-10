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
 with engine.connect() as c:return rows(c.execute(text(f"select d.*,s.service_name,s.shipping_mode,r.route_name,r.origin_city,r.destination_city,(select count(*) from departure_allocations a where a.departure_id=d.id and a.status<>'REMOVED')::int shipment_count from cargo_departures d join shipping_services s on s.id=d.shipping_service_id and s.org_id=d.org_id left join shipping_routes r on r.id=s.route_id where {' and '.join(f)} order by d.scheduled_at"),p))
def create(o,a,n,p):
 with engine.begin() as c:
  if not c.execute(text('select 1 from shipping_services where id=:s and org_id=:o and active'),{'s':p['shipping_service_id'],'o':o}).first():raise HTTPException(422,'service_not_found')
  p['departure_code']=p.get('departure_code') or f"DEP-{uuid4().hex[:8].upper()}";row=dict(c.execute(text("insert into cargo_departures(org_id,shipping_service_id,departure_code,scheduled_at,cutoff_at,estimated_arrival_at,status,capacity_weight_kg,capacity_cbm,carrier_name,transport_reference,notes,created_by) values(:o,:shipping_service_id,:departure_code,:scheduled_at,:cutoff_at,:estimated_arrival_at,'OPEN',:capacity_weight_kg,:capacity_cbm,:carrier_name,:transport_reference,:notes,:a) returning *"),{'o':o,'a':a,**p}).mappings().one());ev(c,o,str(row['id']),'CREATED',a,n);return row
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
 allowed={'OPEN':{'CLOSED','CANCELLED'},'CLOSED':{'LOADING','CANCELLED'},'LOADING':{'DEPARTED'},'DEPARTED':{'ARRIVED'}}
 with engine.begin() as c:
  cur=c.execute(text('select * from cargo_departures where id=:d and org_id=:o for update'),{'d':d,'o':o}).mappings().first()
  if not cur or version!=cur['row_version'] or status not in allowed.get(cur['status'],set()):raise HTTPException(409,'departure_state_conflict')
  if status=='CANCELLED' and not reason:raise HTTPException(422,'cancellation_reason_required')
  row=dict(c.execute(text('update cargo_departures set status=:s,row_version=row_version+1,notes=concat_ws(E\'\\n\',notes,:r),updated_at=now() where id=:d returning *'),{'s':status,'r':reason,'d':d}).mappings().one());ev(c,o,d,status,a,n,{'reason':reason});return row
