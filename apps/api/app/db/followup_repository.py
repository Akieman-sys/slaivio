import json
from uuid import uuid4
from sqlalchemy import text
from app.db.database import engine


def create_followup_task(
    org_id: str,
    client_id: str,
    dossier_id: str,
    followup_type: str,
    message: str,
    due_minutes: int = 1440,
    shipment_id: str | None = None,
):
    existing = get_pending_followup_by_type(
        org_id=org_id,
        dossier_id=dossier_id,
        followup_type=followup_type,
    )

    if existing:
        existing["already_exists"] = True
        return existing

    with engine.connect() as conn:
        result = conn.execute(
            text("""
                insert into followup_tasks (
                    org_id,
                    client_id,
                    dossier_id,
                    shipment_id,
                    followup_type,
                    message,
                    due_at
                )
                values (
                    :org_id,
                    :client_id,
                    :dossier_id,
                    :shipment_id,
                    :followup_type,
                    :message,
                    now() + (:due_minutes || ' minutes')::interval
                )
                returning *
            """),
            {
                "org_id": org_id,
                "client_id": client_id,
                "dossier_id": dossier_id,
                "shipment_id": shipment_id,
                "followup_type": followup_type,
                "message": message,
                "due_minutes": due_minutes,
            },
        )

        conn.commit()
        row = result.fetchone()

        followup = dict(row._mapping) if row else None

        if followup:
            followup["already_exists"] = False

        return followup


def list_due_followups(org_id: str, limit: int = 50):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select *
                from followup_tasks
                where org_id = :org_id
                  and status = 'PENDING'
                  and due_at <= now()
                order by due_at asc
                limit :limit
            """),
            {
                "org_id": org_id,
                "limit": limit,
            },
        )

        return [dict(row._mapping) for row in result.fetchall()]


def mark_followup_executed(org_id: str, followup_id: str):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update followup_tasks
                set
                    status = 'EXECUTED',
                    executed_at = now()
                where org_id = :org_id
                  and id = :followup_id
                returning *
            """),
            {
                "org_id": org_id,
                "followup_id": followup_id,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def get_followup_with_client_phone(org_id: str, followup_id: str):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select
                    f.*,
                    c.phone as client_phone
                from followup_tasks f
                left join clients c
                  on c.id = f.client_id
                 and c.org_id = f.org_id
                where f.org_id = :org_id
                  and f.id = :followup_id
                limit 1
            """),
            {
                "org_id": org_id,
                "followup_id": followup_id,
            },
        ).fetchone()

        return dict(result._mapping) if result else None


def cancel_pending_followups_for_dossier(
    org_id: str,
    dossier_id: str,
    reason: str = "client_replied",
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update followup_tasks
                set
                    status = 'CANCELLED',
                    cancelled_at = now(),
                    error_message = :reason
                where org_id = :org_id
                  and dossier_id = :dossier_id
                  and status = 'PENDING'
                returning id, followup_type, status, cancelled_at
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
                "reason": reason,
            },
        )

        conn.commit()

        return [dict(row._mapping) for row in result.fetchall()]


def get_pending_followup_by_type(
    org_id: str,
    dossier_id: str,
    followup_type: str,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select *
                from followup_tasks
                where org_id = :org_id
                  and dossier_id = :dossier_id
                  and followup_type = :followup_type
                  and status = 'PENDING'
                order by created_at desc
                limit 1
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
                "followup_type": followup_type,
            },
        ).fetchone()

        return dict(result._mapping) if result else None

def _rows(result):return [dict(row._mapping) for row in result]
def _event(conn,org_id,followup_id,event_type,actor=None,payload=None):conn.execute(text("insert into followup_events(org_id,followup_id,event_type,actor_id,payload) values(:o,:f,:e,:a,cast(:p as jsonb))"),{"o":org_id,"f":followup_id,"e":event_type,"a":actor,"p":json.dumps(payload or {},default=str)})

def followup_dashboard(org_id,*,q=None,status=None,followup_type=None,channel=None,priority=None,responsible_id=None,date_scope=None,page=1,page_size=40):
    filters=["f.org_id=:o","f.archived_at is null"];params={"o":org_id,"limit":page_size,"offset":(page-1)*page_size}
    for key,value,column in [("status",status,"f.status"),("channel",channel,"f.channel"),("priority",priority,"f.priority"),("responsible_id",responsible_id,"f.responsible_id")]:
        if value:filters.append(f"{column}=:{key}");params[key]=value
    if followup_type:
        filters.append("f.followup_type ilike :followup_type")
        params["followup_type"] = f"{followup_type}%"
    if q:filters.append("(f.reference ilike :q or f.subject_reference ilike :q or f.reason ilike :q or f.message ilike :q or coalesce(c.display_name,c.name,c.company_name,c.phone,c.email) ilike :q)");params['q']=f'%{q}%'
    if date_scope=='TODAY':filters.append("f.due_at::date=current_date")
    elif date_scope=='UPCOMING':filters.append("f.due_at>current_date+interval '1 day'")
    elif date_scope=='OVERDUE':filters.append("f.due_at<now() and f.status in('SCHEDULED','DUE','FAILED')")
    where=' and '.join(filters)
    base=f"""from followup_tasks f left join clients c on c.id=f.client_id and c.org_id=f.org_id left join dossiers d on d.id=f.dossier_id and d.org_id=f.org_id where {where}"""
    with engine.connect() as conn:
        total=conn.execute(text('select count(*) '+base),params).scalar_one()
        items=_rows(conn.execute(text("""select f.*,coalesce(c.display_name,c.name,c.company_name,c.phone,c.email) client_name,c.phone client_phone,d.tracking_id dossier_reference,
          (select count(*) from followup_attempts a where a.followup_id=f.id)::int attempts_total from followup_tasks f left join clients c on c.id=f.client_id and c.org_id=f.org_id left join dossiers d on d.id=f.dossier_id and d.org_id=f.org_id where """+' and '.join(filters)+" order by case f.priority when 'URGENT' then 0 when 'HIGH' then 1 else 2 end,f.due_at limit :limit offset :offset"),params))
        stats=dict(conn.execute(text("""select count(*) filter(where due_at::date=current_date and status in('SCHEDULED','DUE','FAILED'))::int due_today,count(*) filter(where due_at<now() and status in('SCHEDULED','DUE','FAILED'))::int overdue,
          count(*) filter(where status='WAITING_RESPONSE')::int waiting_response,count(*) filter(where status='RESPONDED')::int responded,count(*) filter(where status='ESCALATED')::int escalated,count(*) filter(where status='FAILED')::int failed,
          count(*) filter(where status='COMPLETED' and completed_at::date=current_date)::int completed_today,count(*) filter(where sequence_id is not null and status not in('COMPLETED','CANCELLED'))::int automatic,
          coalesce(sum(amount_context) filter(where status='COMPLETED' and followup_type like 'PAYMENT%'),0) recovered_amount from followup_tasks where org_id=:o and archived_at is null"""),{"o":org_id}).mappings().one())
        attempts=conn.execute(text("select count(*) total,count(*) filter(where status in('DELIVERED','READ')) engaged from followup_attempts where org_id=:o"),{"o":org_id}).mappings().one();stats['response_rate']=round((stats['responded']/max(1,attempts['total']))*100,1)
        return {'items':items,'stats':stats,'pagination':{'page':page,'page_size':page_size,'total':total,'total_pages':(total+page_size-1)//page_size}}

def followup_detail(org_id,item_id):
    with engine.connect() as c:
        row=c.execute(text("select f.*,coalesce(cl.display_name,cl.name,cl.company_name,cl.phone,cl.email) client_name,cl.phone client_phone from followup_tasks f left join clients cl on cl.id=f.client_id and cl.org_id=f.org_id where f.org_id=:o and f.id=:id"),{"o":org_id,"id":item_id}).mappings().first()
        if not row:return None
        out=dict(row);out['attempts']=_rows(c.execute(text("select * from followup_attempts where org_id=:o and followup_id=:id order by queued_at"),{"o":org_id,"id":item_id}));out['responses']=_rows(c.execute(text("select * from followup_responses where org_id=:o and followup_id=:id order by received_at"),{"o":org_id,"id":item_id}));out['notes']=_rows(c.execute(text("select * from followup_notes where org_id=:o and followup_id=:id order by created_at desc"),{"o":org_id,"id":item_id}));out['events']=_rows(c.execute(text("select * from followup_events where org_id=:o and followup_id=:id order by created_at desc"),{"o":org_id,"id":item_id}));return out

def detect_all_organizations():
    with engine.connect() as c:orgs=[x[0] for x in c.execute(text('select id from organizations'))]
    return {o:detect_candidates(o) for o in orgs}

def create_manual_followup(org_id,actor,data):
    reference=f"FUP-{__import__('datetime').datetime.now():%Y}-{uuid4().hex[:8].upper()}";idem=data.pop('idempotency_key',None) or f'manual:{uuid4()}'
    with engine.begin() as c:
        row=c.execute(text("""insert into followup_tasks(org_id,workspace_id,client_id,dossier_id,followup_type,reference,subject_type,subject_id,subject_reference,reason,channel,message,due_at,priority,responsible_id,responsible_name,amount_context,currency,consent_type,status,idempotency_key,condition_snapshot)
         values(:o,cast(:workspace_id as uuid),cast(:client_id as uuid),cast(:dossier_id as uuid),:followup_type,:reference,:subject_type,cast(:subject_id as uuid),:subject_reference,:reason,:channel,:message,:due_at,:priority,:responsible_id,:responsible_name,:amount_context,:currency,:consent_type,'SCHEDULED',:idem,cast(:snapshot as jsonb)) returning *"""),{"o":org_id,"reference":reference,"idem":idem,"snapshot":json.dumps(data.get('condition_snapshot') or {}),**data}).mappings().one();_event(c,org_id,row['id'],'CREATED',actor,dict(row));return dict(row)

def mutate_followup(org_id,item_id,actor,action,version,due_at=None,reason=None,responsible_id=None,responsible_name=None):
    transitions={'PAUSE':'PAUSED','RESUME':'SCHEDULED','CANCEL':'CANCELLED','COMPLETE':'COMPLETED','ESCALATE':'ESCALATED','RESPOND':'RESPONDED'}
    target=transitions[action]
    with engine.begin() as c:
        row=c.execute(text("""update followup_tasks set status=:s,due_at=coalesce(:due,due_at),pause_reason=case when :s='PAUSED' then :reason else pause_reason end,
         cancelled_at=case when :s='CANCELLED' then now() else cancelled_at end,completed_at=case when :s='COMPLETED' then now() else completed_at end,responded_at=case when :s='RESPONDED' then now() else responded_at end,
         escalated_at=case when :s='ESCALATED' then now() else escalated_at end,responsible_id=coalesce(:responsible_id,responsible_id),responsible_name=coalesce(:responsible_name,responsible_name),row_version=row_version+1,updated_at=now()
         where org_id=:o and id=:id and row_version=:v and status not in('COMPLETED','CANCELLED') returning *"""),{"s":target,"due":due_at,"reason":reason,"responsible_id":responsible_id,"responsible_name":responsible_name,"o":org_id,"id":item_id,"v":version}).mappings().first()
        if row:_event(c,org_id,item_id,action,actor,{"reason":reason,"due_at":due_at})
        return dict(row) if row else None

def rules_and_sequences(org_id):
    with engine.connect() as c:return {'rules':_rows(c.execute(text('select * from followup_rules where org_id=:o order by active desc,name'),{'o':org_id})),'sequences':_rows(c.execute(text("select s.*,(select jsonb_agg(x order by x.step_number) from followup_sequence_steps x where x.sequence_id=s.id) steps from followup_sequences s where s.org_id=:o order by s.name"),{'o':org_id})),'templates':_rows(c.execute(text('select * from followup_templates where org_id=:o order by category,name'),{'o':org_id})),'settings':dict(c.execute(text('select * from followup_settings where org_id=:o'),{'o':org_id}).mappings().first() or {})}

def save_sequence(org_id,actor,data):
    steps=data.pop('steps');
    with engine.begin() as c:
        row=c.execute(text("insert into followup_sequences(org_id,name,followup_type,exit_conditions,created_by) values(:o,:name,:followup_type,cast(:exit as jsonb),:a) on conflict(org_id,name) do update set followup_type=excluded.followup_type,exit_conditions=excluded.exit_conditions,row_version=followup_sequences.row_version+1,updated_at=now() returning *"),{'o':org_id,'a':actor,'exit':json.dumps(data.get('exit_conditions',[])),**data}).mappings().one();c.execute(text('delete from followup_sequence_steps where sequence_id=:id'),{'id':row['id']})
        for i,step in enumerate(steps,1):c.execute(text("insert into followup_sequence_steps(org_id,sequence_id,step_number,delay_minutes,channel,message_template,condition_config,action_type) values(:o,:id,:n,:delay_minutes,:channel,:message_template,cast(:condition_config as jsonb),:action_type)"),{'o':org_id,'id':row['id'],'n':i,'condition_config':json.dumps(step.get('condition_config',{})),**step})
        _event(c,org_id,None,'SEQUENCE_SAVED',actor,{'sequence_id':str(row['id'])});return dict(row)

def save_rule(org_id,actor,data):
    with engine.begin() as c:
        row=c.execute(text("insert into followup_rules(org_id,workspace_id,name,followup_type,trigger_type,trigger_config,condition_config,sequence_id,priority,responsible_team,created_by) values(:o,cast(:workspace_id as uuid),:name,:followup_type,:trigger_type,cast(:trigger_config as jsonb),cast(:condition_config as jsonb),cast(:sequence_id as uuid),:priority,:responsible_team,:a) on conflict(org_id,name) do update set trigger_type=excluded.trigger_type,trigger_config=excluded.trigger_config,condition_config=excluded.condition_config,sequence_id=excluded.sequence_id,priority=excluded.priority,responsible_team=excluded.responsible_team,row_version=followup_rules.row_version+1,updated_at=now() returning *"),{'o':org_id,'a':actor,'trigger_config':json.dumps(data.get('trigger_config',{})),'condition_config':json.dumps(data.get('condition_config',{})),**data}).mappings().one();_event(c,org_id,None,'RULE_SAVED',actor,{'rule_id':str(row['id'])});return dict(row)

def _condition_still_true(conn,item):
    kind=(item.get('followup_type') or '').upper();subject=item.get('subject_id')
    if kind.startswith('PAYMENT') and subject:
        return bool(conn.execute(text("select 1 from finance_documents where org_id=:o and id=:id and balance_due>0 and status in('ISSUED','PARTIALLY_PAID','OVERDUE')"),{'o':item['org_id'],'id':subject}).first())
    if kind.startswith('PICKUP') and subject:
        return bool(conn.execute(text("select 1 from pickup_orders where org_id=:o and id=:id and status not in('RELEASED','CANCELLED')"),{'o':item['org_id'],'id':subject}).first())
    if kind.startswith('QUOTE') and subject:
        return bool(conn.execute(text("select 1 from finance_documents where org_id=:o and id=:id and document_type='QUOTE' and status='ISSUED'"),{'o':item['org_id'],'id':subject}).first())
    if kind in ('PACKAGE_DROP_REMINDER','PARCEL_NOT_DROPPED') and item.get('dossier_id'):
        return not bool(conn.execute(text("select 1 from cargo_packages where org_id=:o and dossier_id=:d and deleted_at is null"),{'o':item['org_id'],'d':item['dossier_id']}).first())
    if item.get('dossier_id'):
        return bool(conn.execute(text("select 1 from dossiers where org_id=:o and id=:d and status_global not in('COMPLETED','CLOSED','CANCELLED')"),{'o':item['org_id'],'d':item['dossier_id']}).first())
    return True

def queue_followup(org_id,item_id,actor):
    with engine.begin() as c:
        item=c.execute(text("select f.*,c.phone client_phone from followup_tasks f left join clients c on c.id=f.client_id and c.org_id=f.org_id where f.org_id=:o and f.id=:id for update of f"),{'o':org_id,'id':item_id}).mappings().first()
        if not item:return 'missing'
        if item['status'] not in ('SCHEDULED','DUE','FAILED'):return 'closed'
        if not _condition_still_true(c,item):
            c.execute(text("update followup_tasks set status='COMPLETED',completed_at=now(),row_version=row_version+1,updated_at=now() where id=:id"),{'id':item_id});_event(c,org_id,item_id,'AUTO_COMPLETED',actor,{'reason':'business_condition_resolved'});return 'resolved'
        if not item.get('client_phone') and item.get('channel') in ('WHATSAPP','SMS'):return 'recipient_missing'
        attempt=max(1,int(item.get('attempt_count') or 0)+1);idem=f"followup:{item_id}:step:{item.get('current_step') or 1}:attempt:{attempt}"
        row=c.execute(text("""insert into followup_attempts(org_id,followup_id,step_number,channel,idempotency_key,status,recipient,message)
          values(:o,:id,:step,:channel,:idem,'QUEUED',:recipient,:message) on conflict(org_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning *"""),{'o':org_id,'id':item_id,'step':item.get('current_step') or 1,'channel':item.get('channel') or 'WHATSAPP','idem':idem,'recipient':item.get('client_phone'),'message':item['message']}).mappings().one()
        c.execute(text("update followup_tasks set status='WAITING_RESPONSE',attempt_count=:attempt,row_version=row_version+1,updated_at=now() where id=:id"),{'attempt':attempt,'id':item_id});_event(c,org_id,item_id,'QUEUED',actor,{'attempt_id':str(row['id']),'idempotency_key':idem});return dict(row)

def record_response(org_id,item_id,actor,body,channel='WHATSAPP',message_id=None,classification=None,confidence=None,requires_review=False):
    with engine.begin() as c:
        item=c.execute(text("select * from followup_tasks where org_id=:o and id=:id for update"),{'o':org_id,'id':item_id}).mappings().first()
        if not item:return None
        row=c.execute(text("""insert into followup_responses(org_id,followup_id,channel,message_id,body,classification,confidence,requires_review)
          values(:o,:id,:channel,:message_id,:body,:classification,:confidence,:requires_review)
          on conflict(org_id,message_id) do update set body=excluded.body returning *"""),{'o':org_id,'id':item_id,'channel':channel,'message_id':message_id,'body':body,'classification':classification,'confidence':confidence,'requires_review':requires_review}).mappings().one()
        c.execute(text("update followup_tasks set status='RESPONDED',responded_at=now(),row_version=row_version+1,updated_at=now() where id=:id"),{'id':item_id})
        _event(c,org_id,item_id,'RESPONSE_RECEIVED',actor,{'response_id':str(row['id']),'classification':classification,'requires_review':requires_review})
        return dict(row)

def classify_response(body):
    value=(body or '').strip().lower()
    if any(x in value for x in ('stop','désabonne','desabonne')):return 'UNSUBSCRIBE'
    if any(x in value for x in ('montant incorrect','conteste','litige')):return 'DISPUTE'
    if any(x in value for x in ('pas encore','plus tard')):return 'NOT_READY'
    if any(x in value for x in ('adresse','information','comment')):return 'NEEDS_INFORMATION'
    if any(x in value for x in ('je paie','payerai','paiement demain')):return 'PROMISE_TO_PAY'
    if any(x in value for x in ('annuler','annulez')):return 'CANCEL_REQUEST'
    return 'OTHER'

def link_whatsapp_response(org_id,client_id,dossier_id,message_id,body):
    classification=classify_response(body)
    with engine.begin() as c:
        item=c.execute(text("""select * from followup_tasks where org_id=:o and client_id=:client and archived_at is null
          and status in('SENT','DELIVERED','READ','WAITING_RESPONSE','SCHEDULED','DUE')
          order by case when dossier_id=:d then 0 else 1 end,coalesce(executed_at,updated_at) desc limit 1 for update"""),{'o':org_id,'client':client_id,'d':dossier_id}).mappings().first()
        if not item:return None
        requires=classification in ('DISPUTE','CANCEL_REQUEST','OTHER')
        c.execute(text("insert into followup_responses(org_id,followup_id,channel,message_id,body,classification,confidence,requires_review) values(:o,:f,'WHATSAPP',:m,:body,:class,1,:review) on conflict(org_id,message_id) do nothing"),{'o':org_id,'f':item['id'],'m':message_id,'body':body or '', 'class':classification,'review':requires})
        status='ESCALATED' if requires else 'RESPONDED'
        c.execute(text("update followup_tasks set status=:s,responded_at=now(),response_classification=:class,escalated_at=case when :s='ESCALATED' then now() else escalated_at end,row_version=row_version+1,updated_at=now() where id=:id"),{'s':status,'class':classification,'id':item['id']})
        if classification=='UNSUBSCRIBE':c.execute(text("insert into followup_stop_list(org_id,client_id,channel,reason,created_by) values(:o,:client,'WHATSAPP','CLIENT_REQUEST','webhook') on conflict do nothing"),{'o':org_id,'client':client_id})
        _event(c,org_id,item['id'],'WHATSAPP_RESPONSE',None,{'classification':classification,'requires_review':requires});return {'followup_id':str(item['id']),'classification':classification,'requires_review':requires}

def detect_candidates(org_id):
    created=0
    with engine.begin() as c:
        key=f"detect:{__import__('datetime').datetime.utcnow():%Y%m%d%H}"
        run=c.execute(text("insert into followup_detection_runs(org_id,idempotency_key) values(:o,:k) on conflict(org_id,idempotency_key) do nothing returning id"),{'o':org_id,'k':key}).scalar()
        if not run:return {'created':0,'duplicate':True}
        candidates=rows=[]
        candidates+=_rows(c.execute(text("""select f.client_id,f.dossier_id,f.id subject_id,f.document_number subject_reference,'PAYMENT_DUE' followup_type,'INVOICE' subject_type,
          'Solde de facture arrivé à échéance' reason,f.balance_due amount_context,f.currency,coalesce(cl.display_name,cl.name,'Client') client_name
          from finance_documents f join clients cl on cl.id=f.client_id and cl.org_id=f.org_id where f.org_id=:o and f.document_type='INVOICE' and f.balance_due>0 and f.due_date<=current_date and f.status in('ISSUED','PARTIALLY_PAID','OVERDUE')"""),{'o':org_id}))
        candidates+=_rows(c.execute(text("""select p.client_id,(select cp.dossier_id from pickup_order_items pi join cargo_packages cp on cp.id=pi.package_id where pi.pickup_id=p.id limit 1) dossier_id,p.id subject_id,p.pickup_reference subject_reference,'PICKUP_REMINDER' followup_type,'PICKUP' subject_type,
          'Colis disponible non retiré' reason,null amount_context,null currency,coalesce(cl.display_name,cl.name,'Client') client_name
          from pickup_orders p join clients cl on cl.id=p.client_id and cl.org_id=p.org_id where p.org_id=:o and p.status in('READY','NOTIFIED') and p.ready_at<now()-interval '2 days'"""),{'o':org_id}))
        candidates+=_rows(c.execute(text("""select d.client_id,d.id dossier_id,d.id subject_id,coalesce(d.dossier_reference,d.tracking_id) subject_reference,'PACKAGE_DROP_REMINDER' followup_type,'DOSSIER' subject_type,
          'Dossier créé mais colis non déposé' reason,null amount_context,null currency,coalesce(cl.display_name,cl.name,'Client') client_name from dossiers d join clients cl on cl.id=d.client_id and cl.org_id=d.org_id where d.org_id=:o and d.status_global in('LEAD','ACTIVE','WAITING_PACKAGE') and d.created_at<now()-interval '2 days' and not exists(select 1 from cargo_packages p where p.org_id=d.org_id and p.dossier_id=d.id and p.deleted_at is null)"""),{'o':org_id}))
        org=c.execute(text('select name from organizations where id=:o'),{'o':org_id}).scalar() or 'Notre agence'
        for x in candidates:
            idem=f"auto:{x['followup_type']}:{x['subject_id']}"
            message=(f"Bonjour {x['client_name']}, {org} vous contacte concernant {x['reason'].lower()} ({x['subject_reference'] or ''}). Merci de nous répondre directement sur WhatsApp.")
            result=c.execute(text("""insert into followup_tasks(org_id,client_id,dossier_id,followup_type,reference,subject_type,subject_id,subject_reference,reason,channel,message,due_at,priority,amount_context,currency,consent_type,status,idempotency_key)
              values(:o,:client,:dossier,:type,:ref,:subject_type,:subject,:subject_ref,:reason,'WHATSAPP',:message,now(),'NORMAL',:amount,:currency,'OPERATIONAL','DUE',:idem) on conflict(org_id,idempotency_key) do nothing returning id"""),{'o':org_id,'client':x['client_id'],'dossier':x.get('dossier_id'),'type':x['followup_type'],'ref':f"FUP-{uuid4().hex[:8].upper()}",'subject_type':x['subject_type'],'subject':x['subject_id'],'subject_ref':x.get('subject_reference'),'reason':x['reason'],'message':message,'amount':x.get('amount_context'),'currency':x.get('currency'),'idem':idem}).scalar();created+=bool(result)
        c.execute(text("update followup_detection_runs set status='COMPLETED',candidates=:n,created=:created,completed_at=now() where id=:id"),{'n':len(candidates),'created':created,'id':run});return {'candidates':len(candidates),'created':created}

def advance_sequences(org_id=None):
    with engine.begin() as c:
        params={};scope="and f.org_id=:o" if org_id else ''
        if org_id:params['o']=org_id
        items=_rows(c.execute(text("select f.*,s.id step_id,s.delay_minutes,s.channel step_channel,s.message_template from followup_tasks f join followup_sequence_steps s on s.sequence_id=f.sequence_id and s.step_number=f.current_step where f.status in('DUE','SCHEDULED') and f.due_at<=now() "+scope+" for update of f skip locked"),params));count=0
        for item in items:
            if _condition_still_true(c,item):
                c.execute(text("update followup_tasks set channel=:channel,message=:message,status='DUE',max_steps=(select count(*) from followup_sequence_steps where sequence_id=:seq),updated_at=now() where id=:id"),{'channel':item['step_channel'],'message':item['message_template'],'seq':item['sequence_id'],'id':item['id']});count+=1
            else:c.execute(text("update followup_tasks set status='COMPLETED',completed_at=now(),updated_at=now() where id=:id"),{'id':item['id']})
        return count

def add_note(org_id,item_id,actor,body):
    with engine.begin() as c:return dict(c.execute(text("insert into followup_notes(org_id,followup_id,body,author_id) select :o,id,:body,:a from followup_tasks where org_id=:o and id=:id returning *"),{'o':org_id,'id':item_id,'body':body,'a':actor}).mappings().one())

def followup_analytics(org_id):
    with engine.connect() as c:
        summary=dict(c.execute(text("""select count(*)::int total,count(*) filter(where status='RESPONDED')::int responded,
          count(*) filter(where status='COMPLETED')::int completed,count(*) filter(where status='FAILED')::int failed,
          count(*) filter(where status='ESCALATED')::int escalated,coalesce(sum(amount_context) filter(where status='COMPLETED' and followup_type like 'PAYMENT%'),0) recovered
          from followup_tasks where org_id=:o and archived_at is null"""),{'o':org_id}).mappings().one())
        summary['by_type']=_rows(c.execute(text("select followup_type,count(*)::int total,count(*) filter(where status='RESPONDED')::int responded from followup_tasks where org_id=:o and archived_at is null group by followup_type order by total desc"),{'o':org_id}))
        summary['by_channel']=_rows(c.execute(text("select channel,count(*)::int total,count(*) filter(where status in('DELIVERED','READ'))::int engaged from followup_attempts where org_id=:o group by channel"),{'o':org_id}))
        return summary

def process_attempt_queue(limit=100):
    """Claim queued attempts with SKIP LOCKED and hand them to the existing outbox.
    A provider worker remains responsible for SENT/DELIVERED/READ webhooks."""
    from app.db.notification_repository import create_notification_outbox
    processed=0
    with engine.begin() as c:
        candidates=_rows(c.execute(text("select a.*,f.client_id,f.dossier_id,f.followup_type from followup_attempts a join followup_tasks f on f.id=a.followup_id and f.org_id=a.org_id where a.status='QUEUED' order by a.queued_at for update of a skip locked limit :limit"),{'limit':limit}))
        for a in candidates:
            try:
                if c.execute(text("select 1 from followup_stop_list where org_id=:o and client_id=:client and channel=:channel"),{'o':a['org_id'],'client':a['client_id'],'channel':a['channel']}).first():raise ValueError('stop_list')
                n=create_notification_outbox(org_id=a['org_id'],client_id=a['client_id'],dossier_id=a.get('dossier_id'),recipient_phone=a['recipient'],notification_type=f"FOLLOWUP:{a['followup_type']}",message=a['message'],channel=(a['channel'] or 'WHATSAPP').lower())
                c.execute(text("update followup_attempts set status='SENT',notification_id=:notification,sent_at=now() where id=:id and status='QUEUED'"),{'notification':n['id'],'id':a['id']});_event(c,a['org_id'],a['followup_id'],'SENT',None,{'attempt_id':str(a['id'])});processed+=1
            except Exception as exc:
                retries=int(a.get('retry_count') or 0)+1;permanent=retries>=3
                c.execute(text("update followup_attempts set status=:s,retry_count=:r,error_message=:e,failed_at=case when :s='FAILED' then now() end where id=:id"),{'s':'FAILED' if permanent else 'QUEUED','r':retries,'e':type(exc).__name__,'id':a['id']})
                if permanent:c.execute(text("update followup_tasks set status='FAILED',error_message=:e,row_version=row_version+1,updated_at=now() where id=:id"),{'e':type(exc).__name__,'id':a['followup_id']});_event(c,a['org_id'],a['followup_id'],'FAILED',None,{'attempt_id':str(a['id'])})
    return processed

