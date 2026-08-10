from sqlalchemy import text
from app.db.database import engine

def _rows(r):return [dict(x._mapping) for x in r]
def list_center(org_id,user_id,status=None,category=None,priority=None,source=None,q=None,page=1,page_size=50):
    filters=[];p={'o':org_id,'u':user_id,'limit':page_size,'offset':(page-1)*page_size}
    if status=='UNREAD':filters.append('read_at is null')
    elif status=='READ':filters.append('read_at is not null')
    if status!='ARCHIVED':filters.append('archived_at is null')
    else:filters.append('archived_at is not null')
    if category:filters.append('category=:category');p['category']=category
    if priority:filters.append('priority=:priority');p['priority']=priority
    if source:filters.append('source=:source');p['source']=source
    if q:filters.append("(title ilike :q or message ilike :q)");p['q']=f'%{q}%'
    where=' and '.join(filters) or 'true'
    base="""select * from (
      select e.id,e.org_id,'IN_APP' source,e.event_type category,e.title,e.message,e.priority,e.created_at,
       coalesce(s.read_at,case when e.is_read then e.created_at end) read_at,s.archived_at,s.snoozed_until,
       coalesce(e.shipment_id::text,e.dossier_id::text,e.client_id::text) resource_id,null::text delivery_status,null::text error_message
      from manager_events e left join notification_user_states s on s.org_id=e.org_id and s.user_id=:u and s.source='IN_APP' and s.notification_id=e.id where e.org_id=:o
      union all
      select n.id,n.org_id,'DELIVERY',n.notification_type,concat(upper(n.channel),' · ',coalesce(n.recipient_phone,'Destinataire')),n.message,
       case when n.status='FAILED' then 'HIGH' else 'NORMAL' end,n.created_at,s.read_at,s.archived_at,s.snoozed_until,
       coalesce(n.dossier_id::text,n.client_id::text),n.status,n.error_message
      from notification_outbox n left join notification_user_states s on s.org_id=n.org_id and s.user_id=:u and s.source='DELIVERY' and s.notification_id=n.id where n.org_id=:o
    ) unified"""
    with engine.connect() as c:
        total=c.execute(text(f'select count(*) from ({base}) x where {where}'),p).scalar_one()
        items=_rows(c.execute(text(f'select * from ({base}) x where {where} and (snoozed_until is null or snoozed_until<=now()) order by created_at desc limit :limit offset :offset'),p))
        stats=dict(c.execute(text(f"""select count(*)::int total,count(*) filter(where read_at is null and archived_at is null)::int unread,
          count(*) filter(where source='DELIVERY' and delivery_status='FAILED' and archived_at is null)::int failed,
          count(*) filter(where priority in ('HIGH','CRITICAL') and archived_at is null)::int urgent from ({base}) x"""),p).mappings().one())
        return {'items':items,'total':total,'page':page,'page_size':page_size,'stats':stats}

def state(org_id,user_id,source,notification_id,action,minutes=None):
    fields={'read':'read_at=now()','unread':'read_at=null','archive':'archived_at=now()','restore':'archived_at=null','snooze':"snoozed_until=now()+(:minutes*interval '1 minute')"}
    with engine.begin() as c:
        exists=c.execute(text("select 1 from manager_events where :source='IN_APP' and id=:id and org_id=:o union all select 1 from notification_outbox where :source='DELIVERY' and id=:id and org_id=:o"),{'source':source,'id':notification_id,'o':org_id}).first()
        if not exists:return None
        c.execute(text("insert into notification_user_states(org_id,user_id,source,notification_id) values(:o,:u,:source,:id) on conflict do nothing"),{'o':org_id,'u':user_id,'source':source,'id':notification_id})
        return dict(c.execute(text(f"update notification_user_states set {fields[action]},updated_at=now() where org_id=:o and user_id=:u and source=:source and notification_id=:id returning *"),{'o':org_id,'u':user_id,'source':source,'id':notification_id,'minutes':minutes or 60}).mappings().one())

def read_all(org_id,user_id):
    with engine.begin() as c:
        result=c.execute(text("""insert into notification_user_states(org_id,user_id,source,notification_id,read_at)
          select :o,:u,'IN_APP',id,now() from manager_events where org_id=:o
          union all select :o,:u,'DELIVERY',id,now() from notification_outbox where org_id=:o
          on conflict(org_id,user_id,source,notification_id) do update set read_at=now(),updated_at=now()"""),{'o':org_id,'u':user_id})
        return result.rowcount or 0

def preferences(org_id,user_id):
    with engine.connect() as c:return _rows(c.execute(text("select * from notification_preferences where org_id=:o and user_id=:u order by category"),{'o':org_id,'u':user_id}))
def save_preference(org_id,user_id,data):
    with engine.begin() as c:
        row=c.execute(text("""insert into notification_preferences(org_id,user_id,category,in_app,email,whatsapp,quiet_hours_start,quiet_hours_end,digest_frequency)
          values(:o,:u,:category,:in_app,:email,:whatsapp,:quiet_hours_start,:quiet_hours_end,:digest_frequency)
          on conflict(org_id,user_id,category) do update set in_app=excluded.in_app,email=excluded.email,whatsapp=excluded.whatsapp,quiet_hours_start=excluded.quiet_hours_start,quiet_hours_end=excluded.quiet_hours_end,digest_frequency=excluded.digest_frequency,updated_at=now() returning *"""),{'o':org_id,'u':user_id,**data}).mappings().one();return dict(row)
