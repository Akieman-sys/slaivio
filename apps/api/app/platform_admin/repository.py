import json
from sqlalchemy import text
from app.db.database import engine
def _rows(r):return [dict(x._mapping) for x in r]
def _audit(c,actor,action,target_type,target_id,old=None,new=None,reason=None):
 c.execute(text("insert into platform_admin_audit_log(actor_user_id,action,target_type,target_id,old_data,new_data,reason) values(:a,:x,:t,:i,cast(:old as jsonb),cast(:new as jsonb),:r)"),{'a':actor,'x':action,'t':target_type,'i':str(target_id),'old':json.dumps(old or{},default=str),'new':json.dumps(new or{},default=str),'r':reason})
def overview():
 with engine.connect() as c:
  return dict(c.execute(text("""select
   (select count(*) from organizations)::int agencies,(select count(*) from organizations where status='ACTIVE')::int active_agencies,
   (select count(*) from organization_memberships where status='ACTIVE')::int active_users,
   (select count(*) from agency_subscriptions where status='TRIAL')::int trials,
   (select count(*) from agency_subscriptions where status='ACTIVE')::int paid_subscriptions,
   (select count(*) from support_tickets where status not in('RESOLVED','CLOSED'))::int open_tickets,
   (select count(*) from support_tickets where priority='URGENT' and status not in('RESOLVED','CLOSED'))::int urgent_tickets,
   (select count(*) from platform_inbound_event_envelopes where routing_status<>'PROCESSED')::int quarantined_events,
   (select coalesce(sum(amount_paid_minor),0) from billing_invoices where status='PAID')::bigint collected_minor"""),{}).mappings().one())
def agencies(q=None,status=None,limit=200):
 filters=['true'];p={'limit':limit}
 if q:filters.append('(o.name ilike :q or o.id ilike :q or o.email ilike :q)');p['q']=f'%{q}%'
 if status:filters.append('o.status=:status');p['status']=status
 with engine.connect() as c:return _rows(c.execute(text(f"""select o.id,o.name,o.organization_name,o.country,o.city,o.email,o.status,o.provisioning_status,o.created_at,o.updated_at,o.row_version,
  count(distinct m.id) filter(where m.status='ACTIVE')::int members,s.status subscription_status,p.name plan_name,s.trial_ends_at,s.ends_at
  from organizations o left join organization_memberships m on m.org_id=o.id left join agency_subscriptions s on s.org_id=o.id left join pricing_plans p on p.id=s.pricing_plan_id
  where {' and '.join(filters)} group by o.id,s.id,p.id order by o.created_at desc limit :limit"""),p))
def agency(org_id):
 with engine.connect() as c:
  org=c.execute(text("select * from organizations where id=:o"),{'o':org_id}).mappings().first()
  if not org:return None
  members=_rows(c.execute(text("select * from organization_memberships where org_id=:o order by created_at"),{'o':org_id}));subscription=c.execute(text("select s.*,p.code plan_code,p.name plan_name from agency_subscriptions s left join pricing_plans p on p.id=s.pricing_plan_id where s.org_id=:o"),{'o':org_id}).mappings().first();invoices=_rows(c.execute(text("select * from billing_invoices where org_id=:o order by created_at desc limit 100"),{'o':org_id}));notes=_rows(c.execute(text("select * from platform_agency_notes where org_id=:o order by created_at desc"),{'o':org_id}));return {'organization':dict(org),'members':members,'subscription':dict(subscription) if subscription else None,'invoices':invoices,'notes':notes}
def update_agency(org_id,actor,status,reason,version):
 with engine.begin() as c:
  old=c.execute(text("select * from organizations where id=:o"),{'o':org_id}).mappings().first()
  if not old:return 'missing'
  row=c.execute(text("""update organizations set status=:s,suspended_at=case when :s='SUSPENDED' then now() else null end,suspension_reason=case when :s='SUSPENDED' then :r else null end,row_version=row_version+1,updated_at=now()
   where id=:o and row_version=:v returning *"""),{'s':status,'r':reason,'o':org_id,'v':version}).mappings().first()
  if not row:return 'conflict'
  _audit(c,actor,'AGENCY_STATUS_CHANGED','organization',org_id,dict(old),dict(row),reason);return dict(row)
def subscription(org_id,actor,plan_code,status,reason,version):
 with engine.begin() as c:
  plan=c.execute(text("select id from pricing_plans where code=:p and active"),{'p':plan_code}).scalar()
  if not plan:return 'plan'
  old=c.execute(text("select * from agency_subscriptions where org_id=:o"),{'o':org_id}).mappings().first()
  if not old:return 'missing'
  row=c.execute(text("update agency_subscriptions set pricing_plan_id=:p,status=:s,row_version=row_version+1,updated_at=now() where org_id=:o and row_version=:v returning *"),{'p':plan,'s':status,'o':org_id,'v':version}).mappings().first()
  if not row:return 'conflict'
  c.execute(text("insert into subscription_access_logs(org_id,subscription_id,old_status,new_status,reason) values(:o,:id,:old,:new,:r)"),{'o':org_id,'id':row['id'],'old':old['status'],'new':status,'r':reason});_audit(c,actor,'SUBSCRIPTION_CHANGED','subscription',row['id'],dict(old),dict(row),reason);return dict(row)
def add_note(org_id,actor,note):
 with engine.begin() as c:return dict(c.execute(text("insert into platform_agency_notes(org_id,author_id,note) select :o,:a,:n where exists(select 1 from organizations where id=:o) returning *"),{'o':org_id,'a':actor,'n':note}).mappings().one())
def tickets(status=None,priority=None):
 filters=['true'];p={}
 if status:filters.append('t.status=:s');p['s']=status
 if priority:filters.append('t.priority=:p');p['p']=priority
 with engine.connect() as c:return _rows(c.execute(text(f"select t.*,o.name organization_name from support_tickets t join organizations o on o.id=t.org_id where {' and '.join(filters)} order by case t.priority when 'URGENT' then 1 when 'HIGH' then 2 else 3 end,t.updated_at desc limit 500"),p))
def support_reply(ticket_id,actor,name,message,status,version):
 with engine.begin() as c:
  ticket=c.execute(text("select * from support_tickets where id=:t for update"),{'t':ticket_id}).mappings().first()
  if not ticket:return 'missing'
  if ticket['platform_row_version']!=version:return 'conflict'
  msg=c.execute(text("insert into support_ticket_messages(org_id,ticket_id,author_id,author_name,author_type,message) values(:o,:t,:a,:n,'PLATFORM_SUPPORT',:m) returning *"),{'o':ticket['org_id'],'t':ticket_id,'a':actor,'n':name,'m':message}).mappings().one()
  c.execute(text("""update support_tickets set status=:s,first_responded_at=coalesce(first_responded_at,now()),resolved_at=case when :s='RESOLVED' then now() else resolved_at end,assigned_to=:a,assigned_name=:n,platform_row_version=platform_row_version+1,row_version=row_version+1,updated_at=now() where id=:t"""),{'s':status,'a':actor,'n':name,'t':ticket_id});_audit(c,actor,'SUPPORT_REPLIED','support_ticket',ticket_id,new={'status':status});return dict(msg)
def audit(limit=200):
 with engine.connect() as c:return _rows(c.execute(text("select * from platform_admin_audit_log order by created_at desc limit :l"),{'l':limit}))
def operators():
 with engine.connect() as c:return _rows(c.execute(text("select user_id,array_agg(permission_code order by permission_code) permissions,max(granted_at) granted_at from platform_operator_permissions where status='ACTIVE' group by user_id order by user_id")))
def grant(actor,user_id,permissions):
 with engine.begin() as c:
  c.execute(text("update platform_operator_permissions set status='REVOKED' where user_id=:u"),{'u':user_id})
  for permission in permissions:c.execute(text("insert into platform_operator_permissions(user_id,permission_code,status,granted_by) values(:u,:p,'ACTIVE',:a) on conflict(user_id,permission_code) do update set status='ACTIVE',granted_by=:a,granted_at=now()"),{'u':user_id,'p':permission,'a':actor})
  _audit(c,actor,'PLATFORM_PERMISSIONS_CHANGED','platform_operator',user_id,new={'permissions':permissions});return permissions
