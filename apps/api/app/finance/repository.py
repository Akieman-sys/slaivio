from __future__ import annotations
import csv,io,json,html
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

def settings_for(o):
 with engine.begin() as c:
  c.execute(text("insert into finance_settings(org_id) values(:o) on conflict do nothing"),{"o":o});return dict(c.execute(text("select * from finance_settings where org_id=:o"),{"o":o}).mappings().one())
def save_settings(o,a,p):
 with engine.begin() as c:return dict(c.execute(text("""insert into finance_settings(org_id,legal_name,tax_identifier,billing_address,default_currency,default_tax_rate,default_payment_terms_days,document_footer,updated_by) values(:o,:legal_name,:tax_identifier,:billing_address,:default_currency,:default_tax_rate,:default_payment_terms_days,:document_footer,:a) on conflict(org_id) do update set legal_name=excluded.legal_name,tax_identifier=excluded.tax_identifier,billing_address=excluded.billing_address,default_currency=excluded.default_currency,default_tax_rate=excluded.default_tax_rate,default_payment_terms_days=excluded.default_payment_terms_days,document_footer=excluded.document_footer,updated_by=excluded.updated_by,updated_at=now() returning *"""),{"o":o,"a":a,**p}).mappings().one())
def quote_decision(o,d,a,n,version,accepted,reason=None):
 status='ACCEPTED' if accepted else 'REJECTED'
 with engine.begin() as c:
  row=c.execute(text(f"update finance_documents set status=:s,{'accepted_at' if accepted else 'rejected_at'}=now(),rejection_reason=:r,row_version=row_version+1,updated_at=now() where org_id=:o and id=:d and document_type='QUOTE' and status='ISSUED' and row_version=:v returning *"),{"s":status,"r":reason,"o":o,"d":d,"v":version}).mappings().first()
  if not row:raise HTTPException(409,'quote_state_conflict')
  event(c,o,d,status,a,n,{"reason":reason});return dict(row)
def convert_quote(o,d,a,n,version,due_date=None):
 with engine.begin() as c:
  quote=c.execute(text("select * from finance_documents where org_id=:o and id=:d and document_type='QUOTE' and status='ACCEPTED' and converted_document_id is null and row_version=:v for update"),{"o":o,"d":d,"v":version}).mappings().first()
  if not quote:raise HTTPException(409,'quote_not_convertible')
  new_id=c.execute(text("select gen_random_uuid()::text")).scalar_one();num=number(c,o,'INVOICE')
  invoice=dict(c.execute(text("""insert into finance_documents(id,org_id,document_type,document_number,client_id,dossier_id,source_document_id,status,currency,subtotal,discount_total,tax_total,total,balance_due,due_date,notes,terms,created_by,created_by_name) values(cast(:id as uuid),:o,'INVOICE',:num,:client,:dossier,:source,'DRAFT',:currency,:subtotal,:discount,:tax,:total,:total,:due,:notes,:terms,:a,:n) returning *"""),{"id":new_id,"o":o,"num":num,"client":quote['client_id'],"dossier":quote['dossier_id'],"source":d,"currency":quote['currency'],"subtotal":quote['subtotal'],"discount":quote['discount_total'],"tax":quote['tax_total'],"total":quote['total'],"due":due_date,"notes":quote['notes'],"terms":quote['terms'],"a":a,"n":n}).mappings().one())
  c.execute(text("insert into finance_document_lines(id,org_id,document_id,position,description,quantity,unit_price,discount_rate,tax_rate,line_subtotal,line_discount,line_tax,line_total,metadata) select gen_random_uuid(),org_id,cast(:new as uuid),position,description,quantity,unit_price,discount_rate,tax_rate,line_subtotal,line_discount,line_tax,line_total,metadata from finance_document_lines where org_id=:o and document_id=:old"),{"new":new_id,"o":o,"old":d})
  c.execute(text("update finance_documents set converted_document_id=cast(:new as uuid),row_version=row_version+1,updated_at=now() where id=:old and org_id=:o"),{"new":new_id,"old":d,"o":o});event(c,o,d,'CONVERTED_TO_INVOICE',a,n,{"invoice_id":new_id,"invoice_number":num});event(c,o,new_id,'CREATED_FROM_QUOTE',a,n,{"quote_id":d});return invoice
def apply_credit(o,credit_id,invoice_id,a,n,version):
 with engine.begin() as c:
  credit=c.execute(text("select * from finance_documents where org_id=:o and id=:id and document_type='CREDIT_NOTE' and status='ISSUED' and credit_applied=0 and row_version=:v for update"),{"o":o,"id":credit_id,"v":version}).mappings().first()
  invoice=c.execute(text("select * from finance_documents where org_id=:o and id=:id and document_type='INVOICE' and status in ('ISSUED','PARTIALLY_PAID','OVERDUE') for update"),{"o":o,"id":invoice_id}).mappings().first()
  if not credit or not invoice or credit['client_id']!=invoice['client_id'] or credit['currency']!=invoice['currency']:raise HTTPException(409,'credit_not_applicable')
  amount=min(money(credit['total']),money(invoice['balance_due']));balance=money(invoice['balance_due'])-amount;status='PAID' if balance==0 else 'PARTIALLY_PAID'
  c.execute(text("update finance_documents set credit_applied=:amount,status='ACCEPTED',source_document_id=:invoice,row_version=row_version+1,updated_at=now() where id=:credit and org_id=:o"),{"amount":amount,"invoice":invoice_id,"credit":credit_id,"o":o});c.execute(text("update finance_documents set balance_due=:balance,status=:status,row_version=row_version+1,updated_at=now() where id=:invoice and org_id=:o"),{"balance":balance,"status":status,"invoice":invoice_id,"o":o});event(c,o,credit_id,'CREDIT_APPLIED',a,n,{"invoice_id":invoice_id,"amount":str(amount)});event(c,o,invoice_id,'CREDIT_RECEIVED',a,n,{"credit_id":credit_id,"amount":str(amount)});return {"amount":amount,"invoice_balance":balance}
def reverse_payment(o,d,payment_id,a,n,reason):
 with engine.begin() as c:
  p=c.execute(text("select * from finance_payments where org_id=:o and document_id=:d and id=:p and status='CONFIRMED' for update"),{"o":o,"d":d,"p":payment_id}).mappings().first();doc=c.execute(text("select * from finance_documents where org_id=:o and id=:d for update"),{"o":o,"d":d}).mappings().first()
  if not p or not doc:raise HTTPException(409,'payment_not_reversible')
  paid=max(D('0'),money(doc['amount_paid'])-money(p['amount']));balance=money(doc['total'])-money(doc.get('credit_applied'))-paid;status='ISSUED' if paid==0 else 'PARTIALLY_PAID'
  c.execute(text("update finance_payments set status='REVERSED',reversed_at=now(),reversed_by=:a,reversal_reason=:r where id=:p and org_id=:o"),{"a":a,"r":reason,"p":payment_id,"o":o});c.execute(text("update finance_documents set amount_paid=:paid,balance_due=:balance,status=:status,row_version=row_version+1,updated_at=now() where id=:d and org_id=:o"),{"paid":paid,"balance":balance,"status":status,"d":d,"o":o});event(c,o,d,'PAYMENT_REVERSED',a,n,{"payment_id":payment_id,"reason":reason},payment_id);return {"amount_paid":paid,"balance_due":balance,"status":status}
def refresh_overdue(o):
 with engine.begin() as c:return c.execute(text("update finance_documents set status='OVERDUE',row_version=row_version+1,updated_at=now() where org_id=:o and document_type='INVOICE' and status in ('ISSUED','PARTIALLY_PAID') and balance_due>0 and due_date<current_date"),{"o":o}).rowcount
def printable(o,d):
 x=detail(o,d);cfg=settings_for(o);esc=lambda v:html.escape(str(v or '—'));line_html=''.join(f"<tr><td>{esc(v['description'])}</td><td>{v['quantity']}</td><td>{v['unit_price']}</td><td>{v['line_total']}</td></tr>" for v in x['lines']);kind={'QUOTE':'DEVIS','INVOICE':'FACTURE','CREDIT_NOTE':'AVOIR'}[x['document_type']]
 return f"""<!doctype html><html><head><meta charset=utf-8><title>{esc(x['document_number'])}</title><style>body{{font:14px Arial;color:#17202a;max-width:900px;margin:40px auto}}header{{display:flex;justify-content:space-between;border-bottom:2px solid #222;padding-bottom:20px}}h1{{font-size:28px}}table{{width:100%;border-collapse:collapse;margin-top:30px}}th,td{{padding:12px;border-bottom:1px solid #ddd;text-align:left}}.totals{{margin:25px 0 0 auto;width:320px}}.totals p{{display:flex;justify-content:space-between}}@media print{{button{{display:none}}}}</style></head><body><button onclick=window.print()>Imprimer / Enregistrer en PDF</button><header><div><h2>{esc(cfg.get('legal_name') or 'SLAIVIO')}</h2><p>{esc(cfg.get('billing_address'))}</p><p>{esc(cfg.get('tax_identifier'))}</p></div><div><h1>{kind}</h1><b>{esc(x['document_number'])}</b><p>Date: {esc(x.get('issue_date') or x['created_at'].date())}</p><p>Échéance: {esc(x.get('due_date'))}</p></div></header><h3>Client</h3><p>{esc(x['client_name'])}<br>{esc(x.get('client_phone'))}<br>{esc(x.get('client_email'))}</p><table><thead><tr><th>Description</th><th>Quantité</th><th>Prix</th><th>Total</th></tr></thead><tbody>{line_html}</tbody></table><div class=totals><p><span>Sous-total</span><b>{x['subtotal']} {x['currency']}</b></p><p><span>Remise</span><b>-{x['discount_total']} {x['currency']}</b></p><p><span>Taxes</span><b>{x['tax_total']} {x['currency']}</b></p><p><span>Total</span><b>{x['total']} {x['currency']}</b></p><p><span>Solde</span><b>{x['balance_due']} {x['currency']}</b></p></div><p>{esc(x.get('terms'))}</p><footer>{esc(cfg.get('document_footer'))}</footer></body></html>"""
