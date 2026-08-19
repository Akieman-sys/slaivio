import csv,io,json
from datetime import datetime,timedelta,timezone
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
  out=dict(item);out['allocations']=rows(c.execute(text("select a.*,e.expedition_reference from departure_allocations a left join expeditions e on e.id=a.shipment_id and e.org_id=a.org_id where a.org_id=:o and a.departure_id=:d and a.status<>'REMOVED' order by a.created_at"),{'o':o,'d':d}));out['packages']=rows(c.execute(text("select a.*,p.package_reference,p.tracking_id,p.client_name,p.status package_status from departure_package_allocations a join cargo_packages p on p.id=a.package_id and p.org_id=a.org_id where a.org_id=:o and a.departure_id=:d and a.status<>'REMOVED' order by a.created_at"),{'o':o,'d':d}));out['documents']=rows(c.execute(text("select * from departure_documents where org_id=:o and departure_id=:d order by created_at desc"),{'o':o,'d':d}));out['events']=rows(c.execute(text("select * from departure_events where org_id=:o and departure_id=:d order by created_at desc"),{'o':o,'d':d}));return out
def update(o,d,a,n,p):
 version=p.pop('expected_version');allowed={'scheduled_at','cutoff_at','estimated_arrival_at','capacity_weight_kg','capacity_cbm','capacity_packages','carrier_name','transport_reference','responsible_name','published','notes'};changes={k:v for k,v in p.items() if k in allowed}
 if not changes:raise HTTPException(422,'no_changes')
 sets=', '.join(f'{k}=:{k}' for k in changes)
 with engine.begin() as c:
  row=c.execute(text(f'update cargo_departures set {sets},row_version=row_version+1,updated_at=now() where org_id=:o and id=:d and row_version=:v returning *'),{'o':o,'d':d,'v':version,**changes}).mappings().first()
  if not row:raise HTTPException(409,'departure_version_conflict')
  ev(c,o,d,'UPDATED',a,n,changes);return dict(row)
def checklist(o,d,a,n,p):
 if p['key'] not in {'packages','weight','documents','manifest','payments','carrier','final_approval'}:raise HTTPException(422,'invalid_checklist_key')
 with engine.begin() as c:
  row=c.execute(text("update cargo_departures set checklist=jsonb_set(checklist,array[:key],to_jsonb(cast(:completed as boolean))),row_version=row_version+1,updated_at=now() where org_id=:o and id=:d and row_version=:version returning *"),{'o':o,'d':d,**p}).mappings().first()
  if not row:raise HTTPException(409,'departure_version_conflict')
  ev(c,o,d,'CHECKLIST_UPDATED',a,n,{'key':p['key'],'completed':p['completed']});return dict(row)
def compatible_packages(o,d):
 with engine.connect() as c:return rows(c.execute(text("""select p.id::text,p.package_reference,p.tracking_id,p.client_name,p.weight_kg,p.volume_cbm,p.destination_city,p.destination_country,p.warehouse_name from cargo_departures d join shipping_services s on s.id=d.shipping_service_id and s.org_id=d.org_id join shipping_routes r on r.id=s.route_id left join cargo_packages p on p.org_id=d.org_id and p.deleted_at is null and p.status in ('READY_FOR_DISPATCH','WAREHOUSE_PROCESSING','RECEIVED_AT_ORIGIN') and p.shipment_id is null and (p.destination_country is null or p.destination_country=r.destination_country) and (p.destination_city is null or p.destination_city=r.destination_city) left join departure_package_allocations a on a.departure_id=d.id and a.package_id=p.id and a.status<>'REMOVED' where d.org_id=:o and d.id=:d and p.id is not null and a.id is null order by p.received_at limit 200"""),{'o':o,'d':d}))
def allocate_package(o,d,a,n,p):
 with engine.begin() as c:
  old=c.execute(text('select * from departure_package_allocations where org_id=:o and idempotency_key=:k'),{'o':o,'k':p['idempotency_key']}).mappings().first()
  if old:return dict(old)
  dep=c.execute(text("select * from cargo_departures where org_id=:o and id=:d and status not in ('CANCELLED','DEPARTED','ARRIVED','COMPLETED') for update"),{'o':o,'d':d}).mappings().first();pkg=c.execute(text('select * from cargo_packages where org_id=:o and id=:p and deleted_at is null for update'),{'o':o,'p':p['package_id']}).mappings().first()
  if not dep or not pkg:raise HTTPException(404,'departure_or_package_not_found')
  nw=float(dep['reserved_weight_kg'])+float(pkg['weight_kg'] or 0);nv=float(dep['reserved_cbm'])+float(pkg['volume_cbm'] or 0);np=int(dep['reserved_packages'])+1
  if not p.get('override_capacity') and ((dep['capacity_weight_kg'] and nw>float(dep['capacity_weight_kg'])) or (dep['capacity_cbm'] and nv>float(dep['capacity_cbm'])) or (dep['capacity_packages'] and np>dep['capacity_packages'])):raise HTTPException(409,'departure_capacity_exceeded')
  row=dict(c.execute(text("insert into departure_package_allocations(org_id,departure_id,package_id,weight_kg,volume_cbm,idempotency_key,created_by) values(:o,:d,:package_id,:w,:v,:idempotency_key,:a) returning *"),{'o':o,'d':d,'a':a,'w':pkg['weight_kg'] or 0,'v':pkg['volume_cbm'] or 0,**p}).mappings().one());c.execute(text('update cargo_departures set reserved_weight_kg=:w,reserved_cbm=:v,reserved_packages=:p,row_version=row_version+1 where id=:d'),{'w':nw,'v':nv,'p':np,'d':d});ev(c,o,d,'PACKAGE_ALLOCATED',a,n,{'package_id':p['package_id']});return row
def remove_package(o,d,p,a,n):
 with engine.begin() as c:
  row=c.execute(text("update departure_package_allocations set status='REMOVED' where org_id=:o and departure_id=:d and package_id=:p and status<>'REMOVED' returning weight_kg,volume_cbm"),{'o':o,'d':d,'p':p}).mappings().first()
  if not row:raise HTTPException(404,'allocation_not_found')
  c.execute(text('update cargo_departures set reserved_weight_kg=greatest(0,reserved_weight_kg-:w),reserved_cbm=greatest(0,reserved_cbm-:v),reserved_packages=greatest(0,reserved_packages-1),row_version=row_version+1 where org_id=:o and id=:d'),{'o':o,'d':d,'w':row['weight_kg'],'v':row['volume_cbm']});ev(c,o,d,'PACKAGE_REMOVED',a,n,{'package_id':p});return {'status':'removed'}
def manifest(o,d):
 item=detail(o,d);out=io.StringIO();w=csv.writer(out);w.writerow(['departure','route','scheduled_at','package','tracking','client','weight_kg','cbm']);
 for p in item['packages']:w.writerow([item['departure_code'],item['route_name'],item['scheduled_at'],p['package_reference'],p['tracking_id'],p['client_name'],p['weight_kg'],p['volume_cbm']])
 return out.getvalue()
def analytics(o):
 with engine.connect() as c:return {'routes':rows(c.execute(text("select coalesce(r.route_name,'Sans route') label,count(*)::int departures,round(avg(case when d.capacity_weight_kg>0 then d.reserved_weight_kg/d.capacity_weight_kg*100 end),1) fill_rate,count(*) filter(where d.status='DELAYED')::int delayed from cargo_departures d join shipping_services s on s.id=d.shipping_service_id left join shipping_routes r on r.id=s.route_id where d.org_id=:o group by 1 order by departures desc"),{'o':o}))}
def templates(o):
 with engine.connect() as c:return rows(c.execute(text("select t.*,s.service_name,r.route_name from departure_templates t join shipping_services s on s.id=t.shipping_service_id and s.org_id=t.org_id left join shipping_routes r on r.id=s.route_id where t.org_id=:o and t.active order by t.template_name"),{'o':o}))
def create_template(o,a,p):
 with engine.begin() as c:return dict(c.execute(text("insert into departure_templates(org_id,template_name,shipping_service_id,timezone,capacity_weight_kg,capacity_cbm,capacity_packages,checklist,created_by) values(:o,:template_name,:shipping_service_id,:timezone,:capacity_weight_kg,:capacity_cbm,:capacity_packages,cast(:checklist as jsonb),:a) returning *"),{'o':o,'a':a,'checklist':json.dumps(p.get('checklist') or {}),**p}).mappings().one())
def recurrences(o):
 with engine.connect() as c:return rows(c.execute(text("select x.*,s.service_name,r.route_name from departure_recurrences x join shipping_services s on s.id=x.shipping_service_id and s.org_id=x.org_id left join shipping_routes r on r.id=s.route_id where x.org_id=:o and x.active order by x.created_at desc"),{'o':o}))
def create_recurrence(o,a,p):
 with engine.begin() as c:return dict(c.execute(text("insert into departure_recurrences(org_id,template_id,shipping_service_id,frequency,weekdays,local_time,timezone,cutoff_hours,horizon_days,next_generation_at,created_by) values(:o,cast(:template_id as uuid),:shipping_service_id,:frequency,:weekdays,:local_time,:timezone,:cutoff_hours,:horizon_days,now(),:a) returning *"),{'o':o,'a':a,**p}).mappings().one())
def run_automation(o=None):
 generated=reminders=0;where='and x.org_id=:o' if o else '';params={'o':o} if o else {}
 with engine.begin() as c:
  rules=rows(c.execute(text(f"select x.*,t.capacity_weight_kg,t.capacity_cbm,t.capacity_packages from departure_recurrences x left join departure_templates t on t.id=x.template_id where x.active and coalesce(x.next_generation_at,now())<=now() {where}"),params))
  for rule in rules:
   now=datetime.now(timezone.utc);days=range(0,min(int(rule['horizon_days']),14)+1)
   for offset in days:
    day=now+timedelta(days=offset)
    if rule['frequency']=='WEEKLY' and rule['weekdays'] and day.weekday() not in rule['weekdays']:continue
    scheduled=day.replace(hour=rule['local_time'].hour,minute=rule['local_time'].minute,second=0,microsecond=0)
    exists=c.execute(text('select 1 from cargo_departures where org_id=:o and shipping_service_id=:s and scheduled_at=:at'),{'o':rule['org_id'],'s':rule['shipping_service_id'],'at':scheduled}).first()
    if not exists:
     code=f"DEP-{scheduled:%Y%m%d}-{uuid4().hex[:4].upper()}";c.execute(text("insert into cargo_departures(org_id,shipping_service_id,departure_code,scheduled_at,cutoff_at,status,timezone,capacity_weight_kg,capacity_cbm,capacity_packages,created_by) values(:o,:s,:code,:at,:cutoff,'PLANNED',:tz,:w,:v,:p,'automation')"),{'o':rule['org_id'],'s':rule['shipping_service_id'],'code':code,'at':scheduled,'cutoff':scheduled-timedelta(hours=rule['cutoff_hours']),'tz':rule['timezone'],'w':rule.get('capacity_weight_kg'),'v':rule.get('capacity_cbm'),'p':rule.get('capacity_packages')});generated+=1
   c.execute(text("update departure_recurrences set next_generation_at=now()+interval '1 day' where id=:id"),{'id':rule['id']})
  due=rows(c.execute(text(f"select d.id,d.org_id,d.departure_code,d.scheduled_at from cargo_departures d where d.status in ('PLANNED','PENDING_CONFIRMATION','CONFIRMED','LOADING','READY_TO_DEPART') and d.scheduled_at between now() and now()+interval '2 days' {'and d.org_id=:o' if o else ''}"),params))
  for dep in due:
   key='DEPARTURE_2H' if dep['scheduled_at']<=datetime.now(timezone.utc)+timedelta(hours=2) else 'DEPARTURE_24H'
   already=c.execute(text("select 1 from departure_events where org_id=:o and departure_id=:d and event_type=:k"),{'o':dep['org_id'],'d':dep['id'],'k':key}).first()
   if not already:ev(c,dep['org_id'],str(dep['id']),key,'automation','Slaivio',{'scheduled_at':str(dep['scheduled_at'])});reminders+=1
 return {'generated':generated,'reminders':reminders}
def stats(o):
 with engine.connect() as c:return dict(c.execute(text("""select count(*) filter(where scheduled_at::date=current_date)::int today,count(*) filter(where scheduled_at>=date_trunc('week',now()) and scheduled_at<date_trunc('week',now())+interval '7 days')::int this_week,count(*) filter(where status='CONFIRMED')::int confirmed,count(*) filter(where status in ('OPEN','PLANNED','PENDING_CONFIRMATION'))::int pending,count(*) filter(where status='DELAYED')::int delayed,count(*) filter(where capacity_weight_kg>0 and reserved_weight_kg>=capacity_weight_kg)::int full,coalesce(sum(reserved_packages),0)::int packages,coalesce(sum(reserved_weight_kg),0)::float weight_kg,coalesce(sum(reserved_cbm),0)::float cbm from cargo_departures where org_id=:o"""),{'o':o}).mappings().one())
def create(o,a,n,p):
 with engine.begin() as c:
  if not c.execute(text('select 1 from shipping_services where id=:s and org_id=:o and active'),{'s':p['shipping_service_id'],'o':o}).first():raise HTTPException(422,'service_not_found')
  p['departure_code']=p.get('departure_code') or f"DEP-{uuid4().hex[:8].upper()}";existing=c.execute(text("select * from cargo_departures where org_id=:o and departure_code=:code"),{'o':o,'code':p['departure_code']}).mappings().first()
  if existing:return dict(existing)
  row=dict(c.execute(text("insert into cargo_departures(org_id,shipping_service_id,departure_code,scheduled_at,cutoff_at,estimated_arrival_at,status,capacity_weight_kg,capacity_cbm,capacity_packages,carrier_name,transport_reference,timezone,responsible_name,warehouse_id,destination_office,published,notes,created_by) values(:o,:shipping_service_id,:departure_code,:scheduled_at,:cutoff_at,:estimated_arrival_at,'PLANNED',:capacity_weight_kg,:capacity_cbm,:capacity_packages,:carrier_name,:transport_reference,:timezone,:responsible_name,cast(:warehouse_id as uuid),:destination_office,:published,:notes,:a) returning *"),{'o':o,'a':a,**p}).mappings().one());ev(c,o,str(row['id']),'CREATED',a,n);return row
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
  if status=='DEPARTED' and not all((cur.get('checklist') or {}).values()):raise HTTPException(409,'departure_checklist_incomplete')
  if not cur or version!=cur['row_version'] or status not in allowed.get(cur['status'],set()):raise HTTPException(409,'departure_state_conflict')
  if status=='CANCELLED' and not reason:raise HTTPException(422,'cancellation_reason_required')
  row=dict(c.execute(text("update cargo_departures set status=:s,row_version=row_version+1,notes=concat_ws(E'\\n',notes,:r),delay_reason=case when :s='DELAYED' then :r else delay_reason end,actual_departure_at=case when :s='DEPARTED' then now() else actual_departure_at end,actual_arrival_at=case when :s='ARRIVED' then now() else actual_arrival_at end,updated_at=now() where id=:d returning *"),{'s':status,'r':reason,'d':d}).mappings().one());ev(c,o,d,status,a,n,{'reason':reason});_sync_operations(c,o,row,a,n,status,reason);return row
def _sync_operations(c,o,dep,a,n,status,reason):
 if status not in {'CONFIRMED','DELAYED','DEPARTED','ARRIVED','CANCELLED'}:return
 route=c.execute(text("select s.service_name,s.shipping_mode,r.route_name,r.origin_country,r.origin_city,r.destination_country,r.destination_city from shipping_services s left join shipping_routes r on r.id=s.route_id where s.org_id=:o and s.id=:s"),{'o':o,'s':dep['shipping_service_id']}).mappings().first() or {}
 reference=f"EXP-{dep['departure_code']}"
 exp=c.execute(text('select id::text,status from cargo_expeditions where org_id=:o and expedition_reference=:r for update'),{'o':o,'r':reference}).mappings().first()
 if not exp and status in {'CONFIRMED','DEPARTED'}:
  exp=c.execute(text("""insert into cargo_expeditions(org_id,expedition_reference,title,status,mode,service_type,origin_country,origin_city,destination_country,destination_city,route_label,carrier_name,flight_number,vessel_name,container_number,batch_reference,manifest_reference,owner_name,planned_departure_at,departed_at,eta_at,created_by,updated_by) values(:o,:ref,:title,:status,:mode,:service,:oc,:ocity,:dc,:dcity,:route,:carrier,:flight,:vessel,:container,:batch,:manifest,:owner,:planned,:departed,:eta,:a,:a) returning id::text,status"""),{'o':o,'ref':reference,'title':dep['departure_code'],'status':'DISPATCHED' if status=='DEPARTED' else 'PREPARING','mode':route.get('shipping_mode') or 'OTHER','service':route.get('service_name'),'oc':route.get('origin_country'),'ocity':route.get('origin_city'),'dc':route.get('destination_country'),'dcity':route.get('destination_city'),'route':route.get('route_name'),'carrier':dep.get('carrier_name'),'flight':dep.get('flight_number'),'vessel':dep.get('vessel_name'),'container':dep.get('container_number'),'batch':dep.get('batch_reference'),'manifest':f"MAN-{dep['departure_code']}",'owner':dep.get('responsible_name'),'planned':dep.get('scheduled_at'),'departed':dep.get('actual_departure_at'),'eta':dep.get('estimated_arrival_at'),'a':a}).mappings().one()
 if not exp:return
 exp_status={'CONFIRMED':'PREPARING','DELAYED':'PREPARING','DEPARTED':'DISPATCHED','ARRIVED':'ARRIVED_DESTINATION','CANCELLED':'CANCELLED'}[status]
 c.execute(text('update cargo_expeditions set status=:s,is_delayed=:delayed,delay_reason=coalesce(:reason,delay_reason),departed_at=case when :s=\'DISPATCHED\' then coalesce(departed_at,now()) else departed_at end,arrived_at=case when :s=\'ARRIVED_DESTINATION\' then coalesce(arrived_at,now()) else arrived_at end,updated_by=:a,updated_at=now() where org_id=:o and id=:id'),{'s':exp_status,'delayed':status=='DELAYED','reason':reason,'a':a,'o':o,'id':exp['id']})
 c.execute(text("insert into expedition_events(org_id,expedition_id,event_type,title,description,new_status,metadata,actor_id,actor_name,idempotency_key) values(:o,:id,:event,:title,:description,:status,cast(:meta as jsonb),:a,:n,:key) on conflict(idempotency_key) do nothing"),{'o':o,'id':exp['id'],'event':f'DEPARTURE_{status}','title':f'Départ {status.lower()}','description':reason,'status':exp_status,'meta':json.dumps({'departure_id':str(dep['id']),'departure_code':dep['departure_code']}),'a':a,'n':n,'key':f"departure:{dep['id']}:{status}:{dep['row_version']}"})
 packages=rows(c.execute(text("select p.*,cl.phone client_phone,cl.whatsapp_phone client_whatsapp_phone from departure_package_allocations da join cargo_packages p on p.id=da.package_id and p.org_id=da.org_id left join clients cl on cl.id=p.client_id and cl.org_id=p.org_id where da.org_id=:o and da.departure_id=:d and da.status<>'REMOVED' and p.deleted_at is null"),{'o':o,'d':dep['id']}))
 for pkg in packages:
  c.execute(text("insert into expedition_packages(org_id,expedition_id,package_id,added_by) values(:o,:e,:p,:a) on conflict(org_id,expedition_id,package_id) where removed_at is null do nothing"),{'o':o,'e':exp['id'],'p':pkg['id'],'a':a})
  package_status={'CONFIRMED':'READY_FOR_DISPATCH','DELAYED':'READY_FOR_DISPATCH','DEPARTED':'IN_TRANSIT','ARRIVED':'ARRIVED_DESTINATION','CANCELLED':'READY_FOR_DISPATCH'}[status]
  c.execute(text('update cargo_packages set shipment_id=:e,status=:s,current_status=:s,updated_at=now() where org_id=:o and id=:p'),{'e':exp['id'] if status!='CANCELLED' else None,'s':package_status,'o':o,'p':pkg['id']})
  c.execute(text("insert into package_events(org_id,package_id,event_type,title,description,new_status,metadata,actor_id) values(:o,:p,:event,:title,:description,:status,cast(:meta as jsonb),:a)"),{'o':o,'p':pkg['id'],'event':f'DEPARTURE_{status}','title':f'Départ {status.lower()}','description':reason,'status':package_status,'meta':json.dumps({'departure_id':str(dep['id']),'expedition_id':exp['id']}),'a':a})
  if status in {'DELAYED','DEPARTED','CANCELLED'} and pkg.get('client_id') and pkg.get('dossier_id') and (pkg.get('client_phone') or pkg.get('client_whatsapp_phone')):
   when=dep.get('scheduled_at');message=(f"Votre départ {dep['departure_code']} a été retardé. Nouvelle date prévue : {when}. Motif : {reason}." if status=='DELAYED' else f"Votre colis {pkg.get('package_reference')} a quitté l'origine. Suivi : {pkg.get('tracking_id') or pkg.get('package_reference')}." if status=='DEPARTED' else f"Le départ {dep['departure_code']} a été annulé. Votre colis sera réaffecté au prochain départ compatible.")
   c.execute(text("insert into notification_outbox(org_id,client_id,dossier_id,channel,recipient_phone,notification_type,message) select :o,:client,:dossier,'whatsapp',:phone,:type,:message where not exists(select 1 from notification_outbox where org_id=:o and client_id=:client and notification_type=:type and message=:message)"),{'o':o,'client':pkg['client_id'],'dossier':pkg['dossier_id'],'phone':pkg.get('client_whatsapp_phone') or pkg.get('client_phone'),'type':f'DEPARTURE_{status}','message':message})
 c.execute(text("update cargo_expeditions set packages_count=(select count(*) from expedition_packages where org_id=:o and expedition_id=:e and removed_at is null),clients_count=(select count(distinct p.client_id) from expedition_packages ep join cargo_packages p on p.id=ep.package_id where ep.org_id=:o and ep.expedition_id=:e and ep.removed_at is null),total_weight_kg=(select coalesce(sum(p.weight_kg),0) from expedition_packages ep join cargo_packages p on p.id=ep.package_id where ep.org_id=:o and ep.expedition_id=:e and ep.removed_at is null),total_volume_cbm=(select coalesce(sum(p.volume_cbm),0) from expedition_packages ep join cargo_packages p on p.id=ep.package_id where ep.org_id=:o and ep.expedition_id=:e and ep.removed_at is null) where org_id=:o and id=:e"),{'o':o,'e':exp['id']})
