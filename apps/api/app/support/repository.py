import json
from sqlalchemy import text
from app.db.database import engine
def _rows(r):return [dict(x._mapping) for x in r]
def articles(q=None,category=None):
    filters=["status='PUBLISHED'","audience in('AGENCY','PUBLIC')"];p={}
    if q:filters.append("(title ilike :q or summary ilike :q or content ilike :q)");p['q']=f'%{q}%'
    if category:filters.append('category=:category');p['category']=category
    with engine.connect() as c:return _rows(c.execute(text(f"select * from help_articles where {' and '.join(filters)} order by sort_order,title"),p))
def list_tickets(org_id,status=None,q=None):
    filters=['t.org_id=:o'];p={'o':org_id}
    if status:filters.append('t.status=:status');p['status']=status
    if q:filters.append('(t.ticket_reference ilike :q or t.subject ilike :q)');p['q']=f'%{q}%'
    with engine.connect() as c:return _rows(c.execute(text(f"""select t.*,(select count(*) from support_ticket_messages m where m.ticket_id=t.id and not m.internal)::int message_count,
      (first_response_due_at<now() and first_responded_at is null) first_response_overdue,(resolution_due_at<now() and resolved_at is null) resolution_overdue
      from support_tickets t where {' and '.join(filters)} order by case t.priority when 'URGENT' then 1 when 'HIGH' then 2 else 3 end,t.updated_at desc limit 500"""),p))
def get_ticket(org_id,ticket_id):
    with engine.connect() as c:
        ticket=c.execute(text("select * from support_tickets where org_id=:o and id=:id"),{'o':org_id,'id':ticket_id}).mappings().first()
        if not ticket:return None
        messages=_rows(c.execute(text("select * from support_ticket_messages where org_id=:o and ticket_id=:id and not internal order by created_at"),{'o':org_id,'id':ticket_id}))
        attachments=_rows(c.execute(text("select * from support_ticket_attachments where org_id=:o and ticket_id=:id order by created_at"),{'o':org_id,'id':ticket_id}))
        events=_rows(c.execute(text("select * from support_ticket_events where org_id=:o and ticket_id=:id order by created_at"),{'o':org_id,'id':ticket_id}))
        return {'ticket':dict(ticket),'messages':messages,'attachments':attachments,'events':events}
def create_ticket(org_id,actor,name,email,data):
    hours={'LOW':72,'NORMAL':48,'HIGH':24,'URGENT':8}[data['priority']];response={'LOW':24,'NORMAL':8,'HIGH':4,'URGENT':1}[data['priority']]
    with engine.begin() as c:
        row=c.execute(text("""insert into support_tickets(org_id,subject,description,category,priority,requester_id,requester_name,requester_email,first_response_due_at,resolution_due_at)
          values(:o,:subject,:description,:category,:priority,:a,:n,:email,now()+(:response*interval '1 hour'),now()+(:hours*interval '1 hour')) returning *"""),{'o':org_id,'a':actor,'n':name,'email':email,'hours':hours,'response':response,**data}).mappings().one()
        c.execute(text("insert into support_ticket_messages(org_id,ticket_id,author_id,author_name,message) values(:o,:t,:a,:n,:m)"),{'o':org_id,'t':row['id'],'a':actor,'n':name,'m':data['description']})
        c.execute(text("insert into support_ticket_events(org_id,ticket_id,event_type,actor_id,new_value) values(:o,:t,'CREATED',:a,'OPEN')"),{'o':org_id,'t':row['id'],'a':actor});return dict(row)
def add_message(org_id,ticket_id,actor,name,message):
    with engine.begin() as c:
        ticket=c.execute(text("select status from support_tickets where org_id=:o and id=:t for update"),{'o':org_id,'t':ticket_id}).mappings().first()
        if not ticket:return None
        if ticket['status'] in ('RESOLVED','CLOSED'):return 'closed'
        row=c.execute(text("insert into support_ticket_messages(org_id,ticket_id,author_id,author_name,message) values(:o,:t,:a,:n,:m) returning *"),{'o':org_id,'t':ticket_id,'a':actor,'n':name,'m':message}).mappings().one()
        c.execute(text("update support_tickets set status=case when status='WAITING_CUSTOMER' then 'IN_PROGRESS' else status end,updated_at=now(),row_version=row_version+1 where id=:t"),{'t':ticket_id});return dict(row)
def transition(org_id,ticket_id,actor,action,version):
    target={'close':'CLOSED','reopen':'REOPENED'}[action]
    with engine.begin() as c:
        old=c.execute(text("select status from support_tickets where org_id=:o and id=:t"),{'o':org_id,'t':ticket_id}).scalar()
        row=c.execute(text("""update support_tickets set status=:s,closed_at=case when :s='CLOSED' then now() else null end,row_version=row_version+1,updated_at=now()
          where org_id=:o and id=:t and row_version=:v returning *"""),{'s':target,'o':org_id,'t':ticket_id,'v':version}).mappings().first()
        if row:c.execute(text("insert into support_ticket_events(org_id,ticket_id,event_type,actor_id,old_value,new_value) values(:o,:t,'STATUS_CHANGED',:a,:old,:new)"),{'o':org_id,'t':ticket_id,'a':actor,'old':old,'new':target})
        return dict(row) if row else None
def add_attachment(org_id,ticket_id,message_id,actor,path,name,mime,size):
    with engine.begin() as c:
        return dict(c.execute(text("""insert into support_ticket_attachments(org_id,ticket_id,message_id,object_path,file_name,mime_type,size_bytes,uploaded_by)
          select :o,:t,:m,:p,:n,:mime,:s,:a where exists(select 1 from support_tickets where id=:t and org_id=:o) returning *"""),{'o':org_id,'t':ticket_id,'m':message_id,'p':path,'n':name,'mime':mime,'s':size,'a':actor}).mappings().one())
