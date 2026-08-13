import json,re
from uuid import uuid4
from sqlalchemy import text
from app.db.database import engine
def rows(r):return [dict(x._mapping) for x in r]
def event(c,o,b,e,a=None,p=None,r=None):c.execute(text('insert into broadcast_events(org_id,broadcast_id,recipient_id,event_type,actor_id,payload) values(:o,:b,:r,:e,:a,cast(:p as jsonb))'),{'o':o,'b':b,'r':r,'e':e,'a':a,'p':json.dumps(p or {},default=str)})
def dashboard(o,q=None,status=None,channel=None,page=1,page_size=40):
 f=['b.org_id=:o','b.archived_at is null'];p={'o':o,'limit':page_size,'offset':(page-1)*page_size}
 if q:f.append('(b.reference ilike :q or b.title ilike :q)');p['q']=f'%{q}%'
 if status:f.append('b.status=:status');p['status']=status
 if channel:f.append(':channel=any(b.channels)');p['channel']=channel
 w=' and '.join(f)
 with engine.connect() as c:
  total=c.execute(text('select count(*) from broadcasts b where '+w),p).scalar_one();items=rows(c.execute(text("select b.*,(select count(*) from broadcast_recipients r where r.broadcast_id=b.id and r.exclusion_reason is null)::int recipients,(select count(*) from broadcast_recipients r where r.broadcast_id=b.id and r.status='READ')::int reads,(select count(*) from broadcast_recipients r where r.broadcast_id=b.id and r.status='REPLIED')::int replies from broadcasts b where "+w+' order by b.created_at desc limit :limit offset :offset'),p))
  stats=dict(c.execute(text("select count(*) filter(where status in('QUEUED','SENDING','PAUSED'))::int active,count(*) filter(where status='SCHEDULED')::int scheduled,count(*) filter(where created_at>=date_trunc('month',now()) and status in('COMPLETED','SENDING'))::int sent_month from broadcasts where org_id=:o and archived_at is null"),{'o':o}).mappings().one());delivery=dict(c.execute(text("select count(*) filter(where exclusion_reason is null)::int recipients,count(*) filter(where status in('DELIVERED','READ','REPLIED','CLICKED','CONVERTED'))::int delivered,count(*) filter(where status in('READ','REPLIED','CLICKED','CONVERTED'))::int read,count(*) filter(where status='REPLIED')::int replies,count(*) filter(where status='FAILED')::int failed,count(*) filter(where opted_out_at is not null)::int optouts from broadcast_recipients where org_id=:o"),{'o':o}).mappings().one());stats.update(delivery);stats.update({k:round(100*delivery[n]/max(1,delivery['recipients']),1) for k,n in [('delivery_rate','delivered'),('read_rate','read'),('reply_rate','replies')]});return {'items':items,'stats':stats,'pagination':{'page':page,'page_size':page_size,'total':total}}
def create_campaign(o,a,d):
 ref=f"CAM-{__import__('datetime').datetime.now():%Y}-{uuid4().hex[:8].upper()}"
 with engine.begin() as c:
  row=c.execute(text("""insert into broadcasts(org_id,workspace_id,reference,title,message,broadcast_type,target_type,objective,channels,audience_id,template_id,language_versions,media,variable_defaults,scheduled_at,timezone_mode,created_by,status) values(:o,cast(:workspace_id as uuid),:ref,:title,:message,:campaign_type,'DYNAMIC',:objective,:channels,cast(:audience_id as uuid),cast(:template_id as uuid),cast(:language_versions as jsonb),cast(:media as jsonb),cast(:defaults as jsonb),:scheduled_at,:timezone_mode,:a,:status) returning *"""),{'o':o,'a':a,'ref':ref,'status':'SCHEDULED' if d.get('scheduled_at') else 'DRAFT','language_versions':json.dumps(d.get('language_versions') or {}),'media':json.dumps(d.get('media') or []),'defaults':json.dumps(d.get('variable_defaults') or {}),**d}).mappings().one();event(c,o,row['id'],'CAMPAIGN_CREATED',a,dict(row));return dict(row)
def detail(o,b):
 with engine.connect() as c:
  x=c.execute(text('select * from broadcasts where org_id=:o and id=:b'),{'o':o,'b':b}).mappings().first()
  if not x:return None
  out=dict(x);out['recipients']=rows(c.execute(text('select * from broadcast_recipients where org_id=:o and broadcast_id=:b order by created_at limit 500'),{'o':o,'b':b}));out['events']=rows(c.execute(text('select * from broadcast_events where org_id=:o and broadcast_id=:b order by created_at desc'),{'o':o,'b':b}));return out
def save_audience(o,a,d):
 with engine.begin() as c:return dict(c.execute(text("insert into broadcast_audiences(org_id,workspace_id,name,audience_type,filter_config,created_by) values(:o,cast(:workspace_id as uuid),:name,:audience_type,cast(:filters as jsonb),:a) on conflict(org_id,name) do update set filter_config=excluded.filter_config,updated_at=now() returning *"),{'o':o,'a':a,'filters':json.dumps(d.get('filter_config') or {}),**d}).mappings().one())
def resources(o):
 with engine.connect() as c:return {'audiences':rows(c.execute(text('select * from broadcast_audiences where org_id=:o order by name'),{'o':o})),'templates':rows(c.execute(text('select * from broadcast_templates where org_id=:o order by name'),{'o':o})),'suppressions':rows(c.execute(text('select * from broadcast_suppressions where org_id=:o order by created_at desc limit 500'),{'o':o})),'consents':rows(c.execute(text('select * from broadcast_consents where org_id=:o order by recorded_at desc limit 500'),{'o':o})),'settings':dict(c.execute(text('select * from broadcast_settings where org_id=:o'),{'o':o}).mappings().first() or {})}
def snapshot(o,b,a):
 with engine.begin() as c:
  campaign=c.execute(text('select b.*,a.filter_config from broadcasts b left join broadcast_audiences a on a.id=b.audience_id where b.org_id=:o and b.id=:b for update of b'),{'o':o,'b':b}).mappings().first()
  if not campaign:return None
  filters=campaign.get('filter_config') or {};where=['c.org_id=:o','c.deleted_at is null'];p={'o':o}
  for key,col in [('country','c.country'),('language','c.preferred_language'),('status','c.lifecycle_status')]:
   if filters.get(key):where.append(f'lower({col})=lower(:{key})');p[key]=filters[key]
  clients=rows(c.execute(text('select c.id,c.phone,c.email,c.name,c.preferred_language from clients c where '+' and '.join(where)),p));channels=campaign['channels'] or ['WHATSAPP'];created=excluded=0
  for client in clients:
   for channel in channels:
    contact=client.get('phone') if channel=='WHATSAPP' else client.get('email');reason=None
    if not contact:reason='MISSING_CONTACT'
    elif c.execute(text('select 1 from broadcast_suppressions where org_id=:o and contact=:contact and channel=:channel'),{'o':o,'contact':contact,'channel':channel}).first():reason='DO_NOT_CONTACT'
    elif campaign['broadcast_type']=='COMMERCIAL' and not c.execute(text("select 1 from broadcast_consents where org_id=:o and contact=:contact and channel=:channel and consent_status='OPTED_IN'"),{'o':o,'contact':contact,'channel':channel}).first():reason='MARKETING_CONSENT_REQUIRED'
    idem=f'{b}:{channel}:{contact or client["id"]}';msg=render(campaign['message'],client,campaign.get('variable_defaults') or {})
    c.execute(text("insert into broadcast_recipients(org_id,broadcast_id,client_id,recipient_phone,recipient_email,channel,language,rendered_message,status,exclusion_reason,idempotency_key) values(:o,:b,:client,:phone,:email,:channel,:lang,:message,:status,:reason,:idem) on conflict(org_id,idempotency_key) do nothing"),{'o':o,'b':b,'client':client['id'],'phone':client.get('phone'),'email':client.get('email'),'channel':channel,'lang':client.get('preferred_language') or 'fr','message':msg,'status':'EXCLUDED' if reason else 'SNAPSHOT','reason':reason,'idem':idem});excluded+=bool(reason);created+=not bool(reason)
  event(c,o,b,'AUDIENCE_SNAPSHOT',a,{'eligible':created,'excluded':excluded});return {'eligible':created,'excluded':excluded,'total':created+excluded}
def render(msg,client,defaults):
 vals={'client_name':client.get('name') or defaults.get('client_name','Client'),'first_name':(client.get('name') or defaults.get('first_name','Client')).split()[0],**defaults}
 return re.sub(r'{{\s*([a-zA-Z0-9_]+)\s*}}',lambda m:str(vals.get(m.group(1),'')),msg)
def action(o,b,a,act,version):
 states={'APPROVE':'SCHEDULED','START':'QUEUED','PAUSE':'PAUSED','RESUME':'QUEUED','CANCEL':'CANCELLED','ARCHIVE':'ARCHIVED'};target=states[act]
 with engine.begin() as c:
  if act=='START':
   campaign=c.execute(text('select b.*,t.provider_status from broadcasts b left join broadcast_templates t on t.id=b.template_id where b.org_id=:o and b.id=:b'),{'o':o,'b':b}).mappings().first()
   bad=c.execute(text("select count(*) from broadcast_recipients where broadcast_id=:b and exclusion_reason is null and (rendered_message is null or rendered_message like '%{{%')"),{'b':b}).scalar_one()
   if not campaign or campaign['approved_at'] is null or (campaign['scheduled_at'] and campaign['scheduled_at']>__import__('datetime').datetime.now(__import__('datetime').timezone.utc)):return 'approval_or_schedule'
   if 'WHATSAPP' in (campaign['channels'] or []) and campaign.get('template_id') and campaign.get('provider_status')!='APPROVED':return 'template_not_approved'
   if not c.execute(text('select 1 from broadcast_recipients where broadcast_id=:b and exclusion_reason is null'),{'b':b}).first():return 'audience_empty'
   if bad:return 'precheck_failed'
  row=c.execute(text("update broadcasts set status=:s,approved_by=case when :act='APPROVE' then :a else approved_by end,approved_at=case when :act='APPROVE' then now() else approved_at end,paused_at=case when :act='PAUSE' then now() else paused_at end,archived_at=case when :act='ARCHIVE' then now() else archived_at end,row_version=row_version+1,updated_at=now() where org_id=:o and id=:b and row_version=:v returning *"),{'s':target,'act':act,'a':a,'o':o,'b':b,'v':version}).mappings().first()
  if row and act in('START','RESUME'):c.execute(text("update broadcast_recipients set status='QUEUED',queued_at=now() where broadcast_id=:b and status='SNAPSHOT' and exclusion_reason is null"),{'b':b})
  if row:event(c,o,b,act,a);return dict(row)
def process_queue(limit=200):
 from app.db.notification_repository import create_notification_outbox
 done=0
 with engine.begin() as c:
  candidates=rows(c.execute(text("select r.*,b.broadcast_type from broadcast_recipients r join broadcasts b on b.id=r.broadcast_id where r.status='QUEUED' and b.status in('QUEUED','SENDING') order by r.queued_at for update of r skip locked limit :l"),{'l':limit}))
  for r in candidates:
   try:
    contact=r.get('recipient_phone') if r['channel']=='WHATSAPP' else r.get('recipient_email');n=create_notification_outbox(org_id=r['org_id'],client_id=r.get('client_id'),dossier_id=r.get('dossier_id'),recipient_phone=contact,notification_type=f"BROADCAST:{r['broadcast_type']}",message=r['rendered_message'],channel=r['channel'].lower());c.execute(text("update broadcast_recipients set status='SENT',notification_id=:n,sent_at=now() where id=:id"),{'n':n['id'],'id':r['id']});c.execute(text("update broadcasts set status='SENDING',started_at=coalesce(started_at,now()),updated_at=now() where id=:b"),{'b':r['broadcast_id']});done+=1
   except Exception as exc:c.execute(text("update broadcast_recipients set retry_count=retry_count+1,status=case when retry_count+1>=3 then 'FAILED' else 'QUEUED' end,error_message=:e where id=:id"),{'e':type(exc).__name__,'id':r['id']})
  c.execute(text("update broadcasts b set status='COMPLETED',completed_at=now(),updated_at=now() where b.status='SENDING' and not exists(select 1 from broadcast_recipients r where r.broadcast_id=b.id and r.status in('SNAPSHOT','QUEUED'))"));return done
def analytics(o):
 with engine.connect() as c:return {'summary':dict(c.execute(text("select count(*)::int campaigns,coalesce(sum(actual_cost),0) cost,coalesce(sum(attributed_revenue),0) revenue from broadcasts where org_id=:o and archived_at is null"),{'o':o}).mappings().one()),'campaigns':rows(c.execute(text("select reference,title,status,(select count(*) from broadcast_recipients r where r.broadcast_id=b.id and exclusion_reason is null)::int recipients,(select count(*) from broadcast_recipients r where r.broadcast_id=b.id and status in('DELIVERED','READ','REPLIED','CLICKED','CONVERTED'))::int delivered,(select count(*) from broadcast_recipients r where r.broadcast_id=b.id and status in('READ','REPLIED','CLICKED','CONVERTED'))::int reads,(select count(*) from broadcast_recipients r where r.broadcast_id=b.id and status='REPLIED')::int replies,(select count(*) from broadcast_recipients r where r.broadcast_id=b.id and status='CONVERTED')::int conversions from broadcasts b where org_id=:o order by created_at desc limit 100"),{'o':o}))}

def save_template(o,a,d):
 with engine.begin() as c:return dict(c.execute(text("insert into broadcast_templates(org_id,workspace_id,name,channel,category,language,subject,preheader,body,variables,media_config,buttons,provider_template_name,provider_status) values(:o,cast(:workspace_id as uuid),:name,:channel,:category,:language,:subject,:preheader,:body,:variables,cast(:media_config as jsonb),cast(:buttons as jsonb),:provider_template_name,:provider_status) on conflict(org_id,name,channel,language) do update set subject=excluded.subject,body=excluded.body,variables=excluded.variables,buttons=excluded.buttons,provider_template_name=excluded.provider_template_name,provider_status=excluded.provider_status,row_version=broadcast_templates.row_version+1,updated_at=now() returning *"),{'o':o,'media_config':json.dumps(d.get('media_config') or {}),'buttons':json.dumps(d.get('buttons') or []),**d}).mappings().one())
def consent(o,d):
 with engine.begin() as c:
  row=c.execute(text("insert into broadcast_consents(org_id,client_id,contact,channel,consent_status,source,evidence) values(:o,cast(:client_id as uuid),:contact,:channel,:consent_status,:source,cast(:evidence as jsonb)) on conflict(org_id,contact,channel) do update set consent_status=excluded.consent_status,source=excluded.source,evidence=excluded.evidence,recorded_at=now() returning *"),{'o':o,'evidence':json.dumps(d.get('evidence') or {}),**d}).mappings().one()
  if d['consent_status']=='OPTED_OUT':c.execute(text("insert into broadcast_suppressions(org_id,client_id,contact,channel,reason,source) values(:o,cast(:client_id as uuid),:contact,:channel,'OPT_OUT',:source) on conflict do nothing"),{'o':o,**d})
  return dict(row)
def save_settings(o,d):
 allowed={'quiet_hours_start','quiet_hours_end','allowed_weekdays','marketing_frequency_days','max_marketing_per_week','batch_size','failure_pause_threshold','require_approval_above'};pairs=[f'{k}=:{k}' for k in d if k in allowed]
 if not pairs:return None
 with engine.begin() as c:return dict(c.execute(text('update broadcast_settings set '+','.join(pairs)+',updated_at=now() where org_id=:o returning *'),{'o':o,**d}).mappings().one())
def test_send(o,b,a,channel,recipient):
 from app.db.notification_repository import create_notification_outbox
 with engine.begin() as c:
  campaign=c.execute(text('select * from broadcasts where org_id=:o and id=:b'),{'o':o,'b':b}).mappings().first()
  if not campaign:return None
  n=create_notification_outbox(org_id=o,client_id=None,dossier_id=None,recipient_phone=recipient,notification_type='BROADCAST_TEST',message=campaign['message'],channel=channel.lower());row=c.execute(text("insert into broadcast_test_sends(org_id,broadcast_id,channel,recipient,status,notification_id,created_by) values(:o,:b,:channel,:recipient,'QUEUED',:n,:a) returning *"),{'o':o,'b':b,'channel':channel,'recipient':recipient,'n':n['id'],'a':a}).mappings().one();c.execute(text('update broadcasts set test_sent_at=now() where id=:b'),{'b':b});return dict(row)
def save_view(o,u,name,filters):
 with engine.begin() as c:return dict(c.execute(text("insert into broadcast_saved_views(org_id,user_id,name,filters) values(:o,:u,:name,cast(:f as jsonb)) on conflict(org_id,user_id,name) do update set filters=excluded.filters,updated_at=now() returning *"),{'o':o,'u':u,'name':name,'f':json.dumps(filters)}).mappings().one())
def export_recipients(o,b):
 with engine.connect() as c:return rows(c.execute(text('select channel,language,status,exclusion_reason,error_code,created_at,sent_at,delivered_at,read_at,replied_at from broadcast_recipients where org_id=:o and broadcast_id=:b order by created_at'),{'o':o,'b':b}))
def sync_delivery(provider_message_id,status):
 with engine.begin() as c:
  normalized=status.upper();row=c.execute(text("update broadcast_recipients set status=case when :s='DELIVERED' then 'DELIVERED' when :s='READ' then 'READ' when :s in('FAILED','UNDELIVERED') then 'FAILED' else status end,delivered_at=case when :s='DELIVERED' then now() else delivered_at end,read_at=case when :s='READ' then now() else read_at end where provider_message_id=:p returning *"),{'s':normalized,'p':provider_message_id}).mappings().first();return dict(row) if row else None
def link_reply(o,client_id,message):
 value=(message or '').lower();intent='UNSUBSCRIBE' if 'stop' in value else 'INTERESTED' if any(x in value for x in ('intéressé','interesse','prix','devis')) else 'QUESTION'
 with engine.begin() as c:
  row=c.execute(text("update broadcast_recipients set status='REPLIED',replied_at=now(),reply_intent=:intent where id=(select r.id from broadcast_recipients r where r.org_id=:o and r.client_id=:client and r.sent_at is not null order by r.sent_at desc limit 1) returning *"),{'intent':intent,'o':o,'client':client_id}).mappings().first()
  if row and intent=='UNSUBSCRIBE':c.execute(text("insert into broadcast_suppressions(org_id,client_id,contact,channel,reason,source) values(:o,:client,coalesce(:phone,''),'WHATSAPP','CLIENT_STOP','WHATSAPP') on conflict do nothing"),{'o':o,'client':client_id,'phone':row.get('recipient_phone')})
  return dict(row) if row else None
