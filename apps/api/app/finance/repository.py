from __future__ import annotations
import csv,io,json
from datetime import date,datetime,timezone
from decimal import Decimal,ROUND_HALF_UP
from fastapi import HTTPException
from sqlalchemy import text
from app.db.database import engine

D=Decimal
def money(v):return D(str(v or 0)).quantize(D("0.01"),rounding=ROUND_HALF_UP)
def rows(r):return [dict(x) for x in r.mappings().all()]
def event(c,o,d,t,a,n,p=None,payment=None):c.execute(text("insert into finance_events(org_id,document_id,payment_id,event_type,actor_id,actor_name,payload) values(:o,:d,:pay,:t,:a,:n,cast(:p as jsonb))"),{"o":o,"d":d,"pay":payment,"t":t,"a":a,"n":n,"p":json.dumps(p or {},default=str)})
def number(c,o,t):
 y=date.today().year
 v=c.execute(text("insert into finance_document_sequences(org_id,document_type,year,last_value) values(:o,:t,:y,1) on conflict(org_id,document_type,year) do update set last_value=finance_document_sequences.last_value+1 returning last_value"),{"o":o,"t":t,"y":y}).scalar_one()
 return f"{'DEV' if t=='QUOTE' else 'FAC' if t=='INVOICE' else 'AVO'}-{y}-{int(v):06d}"
def receipt_number(c,o):
 y=date.today().year;v=c.execute(text("insert into finance_document_sequences(org_id,document_type,year,last_value) values(:o,'RECEIPT',:y,1) on conflict(org_id,document_type,year) do update set last_value=finance_document_sequences.last_value+1 returning last_value"),{"o":o,"y":y}).scalar_one();return f"REC-{y}-{int(v):06d}"
def calculate(lines):
 out=[];subtotal=discount=tax=total=D('0')
 for i,x in enumerate(lines,1):
  raw=money(D(str(x['quantity']))*D(str(x['unit_price'])));disc=money(raw*D(str(x.get('discount_rate',0)))/100);base=raw-disc;vat=money(base*D(str(x.get('tax_rate',0)))/100);line_total=base+vat
  out.append({**x,"position":i,"line_subtotal":raw,"line_discount":disc,"line_tax":vat,"line_total":line_total});subtotal+=raw;discount+=disc;tax+=vat;total+=line_total
 return out,money(subtotal),money(discount),money(tax),money(total)
def list_documents(o,q=None,status=None,kind=None,page=1,page_size=50):
 f=["d.org_id=:o"];p={"o":o,"q":f"%{q or ''}%","limit":page_size,"offset":(page-1)*page_size}
 if q:f.append("(d.document_number ilike :q or coalesce(c.name,c.phone,c.email,'') ilike :q)")
 if status:f.append("d.status=:s");p['s']=status
 if kind:f.append("d.document_type=:t");p['t']=kind
 w=' and '.join(f)
 with engine.connect() as c:
  total=c.execute(text(f"select count(*) from finance_documents d left join clients c on c.id=d.client_id and c.org_id=d.org_id where {w}"),p).scalar_one()
  items=rows(c.execute(text(f"select d.*,coalesce(c.name,c.phone,c.email,'Client') client_name,ds.dossier_reference from finance_documents d left join clients c on c.id=d.client_id and c.org_id=d.org_id left join dossiers ds on ds.id=d.dossier_id and ds.org_id=d.org_id where {w} order by d.created_at desc limit :limit offset :offset"),p))
  return {"items":items,"pagination":{"page":page,"page_size":page_size,"total":total,"total_pages":max(1,(total+page_size-1)//page_size)}}
def stats(o):
 with engine.connect() as c:return dict(c.execute(text("select count(*) filter(where document_type='INVOICE')::int invoices,count(*) filter(where status='DRAFT')::int drafts,count(*) filter(where status='OVERDUE' or (status in ('ISSUED','PARTIALLY_PAID') and due_date<current_date))::int overdue,coalesce(sum(total) filter(where document_type='INVOICE' and status<>'VOID'),0) invoiced,coalesce(sum(amount_paid) filter(where document_type='INVOICE' and status<>'VOID'),0) collected,coalesce(sum(balance_due) filter(where document_type='INVOICE' and status in ('ISSUED','PARTIALLY_PAID','OVERDUE')),0) outstanding from finance_documents where org_id=:o"),{"o":o}).mappings().one())
def create(o,a,n,payload):
 lines,sub,disc,tax,total=calculate(payload.pop('lines'))
 with engine.begin() as c:
  if not c.execute(text("select 1 from clients where id=cast(:id as uuid) and org_id=:o and deleted_at is null"),{"id":payload['client_id'],"o":o}).first():raise HTTPException(422,'finance_client_not_found')
  if payload.get('dossier_id') and not c.execute(text("select 1 from dossiers where id=cast(:id as uuid) and org_id=:o and deleted_at is null"),{"id":payload['dossier_id'],"o":o}).first():raise HTTPException(422,'finance_dossier_not_found')
  if payload.get('source_document_id') and not c.execute(text("select 1 from finance_documents where id=cast(:id as uuid) and org_id=:o"),{"id":payload['source_document_id'],"o":o}).first():raise HTTPException(422,'finance_source_document_not_found')
  doc_id=c.execute(text("select gen_random_uuid()::text")).scalar_one();num=number(c,o,payload['document_type'])
  doc=dict(c.execute(text("insert into finance_documents(id,org_id,document_type,document_number,client_id,dossier_id,source_document_id,currency,subtotal,discount_total,tax_total,total,balance_due,due_date,notes,terms,created_by,created_by_name) values(cast(:id as uuid),:o,:document_type,:num,cast(:client_id as uuid),cast(:dossier_id as uuid),cast(:source_document_id as uuid),:currency,:sub,:disc,:tax,:total,:total,:due_date,:notes,:terms,:a,:n) returning *"),{"id":doc_id,"o":o,"num":num,"a":a,"n":n,"sub":sub,"disc":disc,"tax":tax,"total":total,**payload}).mappings().one())
  for x in lines:c.execute(text("insert into finance_document_lines(org_id,document_id,position,description,quantity,unit_price,discount_rate,tax_rate,line_subtotal,line_discount,line_tax,line_total,metadata) values(:o,cast(:d as uuid),:position,:description,:quantity,:unit_price,:discount_rate,:tax_rate,:line_subtotal,:line_discount,:line_tax,:line_total,cast(:metadata as jsonb))"),{"o":o,"d":doc_id,**x,"metadata":json.dumps(x.get('metadata') or {})})
  event(c,o,doc_id,'CREATED',a,n,{"number":num,"total":str(total)});return doc
def detail(o,d):
 with engine.connect() as c:
  doc=c.execute(text("select d.*,coalesce(c.name,c.phone,c.email,'Client') client_name,c.phone client_phone,c.email client_email,ds.dossier_reference from finance_documents d left join clients c on c.id=d.client_id and c.org_id=d.org_id left join dossiers ds on ds.id=d.dossier_id and ds.org_id=d.org_id where d.org_id=:o and d.id=:d"),{"o":o,"d":d}).mappings().first()
  if not doc:raise HTTPException(404,'finance_document_not_found')
  x=dict(doc);x['lines']=rows(c.execute(text("select * from finance_document_lines where org_id=:o and document_id=:d order by position"),{"o":o,"d":d}));x['payments']=rows(c.execute(text("select * from finance_payments where org_id=:o and document_id=:d order by paid_at desc"),{"o":o,"d":d}));x['events']=rows(c.execute(text("select * from finance_events where org_id=:o and document_id=:d order by created_at desc"),{"o":o,"d":d}));return x
def issue(o,d,a,n,version):
 with engine.begin() as c:
  row=c.execute(text("update finance_documents set status='ISSUED',issue_date=current_date,issued_at=now(),issued_by=:a,row_version=row_version+1,updated_at=now() where org_id=:o and id=:d and status='DRAFT' and row_version=:v returning *"),{"o":o,"d":d,"a":a,"v":version}).mappings().first()
  if not row:raise HTTPException(409,'finance_document_state_conflict')
  event(c,o,d,'ISSUED',a,n);return dict(row)
def pay(o,d,a,n,p):
 with engine.begin() as c:
  old=c.execute(text("select * from finance_payments where org_id=:o and idempotency_key=:k"),{"o":o,"k":p['idempotency_key']}).mappings().first()
  if old:return dict(old)
  doc=c.execute(text("select * from finance_documents where org_id=:o and id=:d and document_type='INVOICE' and status in ('ISSUED','PARTIALLY_PAID','OVERDUE') for update"),{"o":o,"d":d}).mappings().first()
  if not doc:raise HTTPException(409,'invoice_not_payable')
  amount=money(p['amount'])
  if p['currency']!=doc['currency']:raise HTTPException(422,'payment_currency_mismatch')
  if amount>money(doc['balance_due']):raise HTTPException(422,'payment_exceeds_balance')
  pid=c.execute(text("select gen_random_uuid()::text")).scalar_one();receipt=receipt_number(c,o)
  payment=dict(c.execute(text("insert into finance_payments(id,org_id,document_id,receipt_number,amount,currency,method,reference,paid_at,idempotency_key,recorded_by,recorded_by_name) values(cast(:id as uuid),:o,:d,:receipt,:amount,:currency,:method,:reference,:paid_at,:idempotency_key,:a,:n) returning *"),{"id":pid,"o":o,"d":d,"receipt":receipt,"a":a,"n":n,**p}).mappings().one())
  paid=money(doc['amount_paid'])+amount;balance=money(doc['total'])-paid;status='PAID' if balance==0 else 'PARTIALLY_PAID'
  c.execute(text("update finance_documents set amount_paid=:paid,balance_due=:balance,status=:status,row_version=row_version+1,updated_at=now() where id=:d and org_id=:o"),{"paid":paid,"balance":balance,"status":status,"d":d,"o":o});event(c,o,d,'PAYMENT_RECORDED',a,n,{"amount":str(amount),"receipt":receipt},pid);return payment
def void(o,d,a,n,version,reason):
 with engine.begin() as c:
  row=c.execute(text("update finance_documents set status='VOID',voided_by=:a,voided_at=now(),row_version=row_version+1,updated_at=now(),notes=concat_ws(E'\n',notes,:reason) where org_id=:o and id=:d and status in ('DRAFT','ISSUED') and amount_paid=0 and row_version=:v returning *"),{"o":o,"d":d,"a":a,"v":version,"reason":'ANNULATION: '+reason}).mappings().first()
  if not row:raise HTTPException(409,'finance_document_not_voidable')
  event(c,o,d,'VOIDED',a,n,{"reason":reason});return dict(row)
def export(o):
 data=list_documents(o,page_size=10000)['items'];s=io.StringIO();w=csv.writer(s);w.writerow(['numero','type','client','statut','devise','total','paye','solde','echeance']);[w.writerow([x['document_number'],x['document_type'],x['client_name'],x['status'],x['currency'],x['total'],x['amount_paid'],x['balance_due'],x['due_date']]) for x in data];return s.getvalue()
