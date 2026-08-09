from __future__ import annotations
import csv,hashlib,hmac,html,io,json,secrets
from datetime import datetime,timezone,timedelta
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import text
from app.core.config import settings
from app.db.database import engine

def _rows(r):return [dict(x) for x in r.mappings().all()]
def _ref():return f"RET-{datetime.now(timezone.utc):%Y%m%d}-{uuid4().hex[:7].upper()}"
def _hash(pickup_id,code):return hmac.new((settings.platform_quarantine_encryption_key or settings.manager_api_key).encode(),f"{pickup_id}:{code}".encode(),hashlib.sha256).hexdigest()
def _event(c,o,p,event,actor,name,payload=None):c.execute(text("insert into pickup_events(org_id,pickup_id,event_type,actor_id,actor_name,payload) values(:o,:p,:e,:a,:n,cast(:d as jsonb))"),{"o":o,"p":p,"e":event,"a":actor,"n":name,"d":json.dumps(payload or {},default=str)})

def settings_for(org_id):
 with engine.begin() as c:
  c.execute(text("insert into pickup_settings(org_id) values(:o) on conflict do nothing"),{"o":org_id})
  return dict(c.execute(text("select * from pickup_settings where org_id=:o"),{"o":org_id}).mappings().one())
def update_settings(org_id,actor,payload):
 with engine.begin() as c:return dict(c.execute(text("""insert into pickup_settings(org_id,grace_days,daily_storage_fee,currency,otp_ttl_minutes,max_otp_attempts,require_payment,require_identity,require_signature,updated_by) values(:o,:grace_days,:daily_storage_fee,:currency,:otp_ttl_minutes,:max_otp_attempts,:require_payment,:require_identity,:require_signature,:u) on conflict(org_id) do update set grace_days=excluded.grace_days,daily_storage_fee=excluded.daily_storage_fee,currency=excluded.currency,otp_ttl_minutes=excluded.otp_ttl_minutes,max_otp_attempts=excluded.max_otp_attempts,require_payment=excluded.require_payment,require_identity=excluded.require_identity,require_signature=excluded.require_signature,updated_by=excluded.updated_by,updated_at=now() returning *"""),{"o":org_id,"u":actor,**payload}).mappings().one())

def queue(org_id,q=None,status=None,page=1,page_size=50):
 filters=["p.org_id=:o"];params={"o":org_id,"limit":page_size,"offset":(page-1)*page_size}
 if status:filters.append("p.status=:s");params["s"]=status
 if q:filters.append("(p.pickup_reference ilike :q or coalesce(p.recipient_name,'') ilike :q or coalesce(p.recipient_phone,'') ilike :q or exists(select 1 from pickup_order_items i join cargo_packages cp on cp.id=i.package_id where i.pickup_id=p.id and (cp.package_reference ilike :q or coalesce(cp.tracking_id,'') ilike :q)))");params["q"]=f"%{q}%"
 where=' and '.join(filters)
 with engine.connect() as c:
  total=c.execute(text(f"select count(*) from pickup_orders p where {where}"),params).scalar_one()
  items=_rows(c.execute(text(f"""select p.*,coalesce(c.name,to_jsonb(c)->>'display_name',c.phone,c.email,'Client') client_name,
   (select count(*) from pickup_order_items i where i.pickup_id=p.id)::int package_count,
   (select string_agg(cp.package_reference,', ' order by cp.package_reference) from pickup_order_items i join cargo_packages cp on cp.id=i.package_id and cp.org_id=i.org_id where i.pickup_id=p.id) package_references
   from pickup_orders p left join clients c on c.id=p.client_id and c.org_id=p.org_id where {where} order by case p.status when 'CHECKED_IN' then 1 when 'VERIFIED' then 2 when 'READY' then 3 else 4 end,p.ready_at limit :limit offset :offset"""),params))
  return {"items":items,"pagination":{"page":page,"page_size":page_size,"total":total,"total_pages":(total+page_size-1)//page_size}}

def eligible_packages(org_id,q=None):
 params={"o":org_id,"q":f"%{q or ''}%"}
 with engine.connect() as c:return _rows(c.execute(text("""select p.id::text,p.package_reference,p.tracking_id,p.client_id::text,p.status,p.payment_status,p.fees_total,p.fees_paid,p.currency,p.received_at,
  coalesce(to_jsonb(c)->>'display_name',c.name,to_jsonb(c)->>'company_name',c.phone,c.email,'Client sans nom') client_name,c.phone client_phone
  from cargo_packages p left join clients c on c.id=p.client_id and c.org_id=p.org_id
  where p.org_id=:o and p.deleted_at is null and p.status='READY_FOR_PICKUP' and p.inventory_status<>'RELEASED'
  and (:q='%%' or p.package_reference ilike :q or coalesce(p.tracking_id,'') ilike :q or c.phone ilike :q or coalesce(c.name,'') ilike :q)
  and not exists(select 1 from pickup_order_items i where i.org_id=:o and i.package_id=p.id and i.released_at is null) order by p.received_at limit 200"""),params))

def create(org_id,actor,actor_name,payload):
 ids=payload.pop("package_ids");reference=_ref();pickup_id=str(uuid4());cfg=settings_for(org_id)
 with engine.begin() as c:
  rows=_rows(c.execute(text("""select p.*,coalesce(c.name,to_jsonb(c)->>'display_name',c.phone,c.email) client_name,c.phone client_phone from cargo_packages p left join clients c on c.id=p.client_id and c.org_id=p.org_id where p.org_id=:o and p.id=any(cast(:ids as uuid[])) and p.status='READY_FOR_PICKUP' and p.deleted_at is null for update of p"""),{"o":org_id,"ids":ids}))
  if len(rows)!=len(set(ids)):raise HTTPException(422,"packages_not_eligible_for_pickup")
  clients={str(r["client_id"]) for r in rows};
  if len(clients)!=1:raise HTTPException(422,"pickup_packages_must_share_client")
  outstanding=sum(max(0,float(r.get("fees_total") or 0)-float(r.get("fees_paid") or 0)) for r in rows)
  oldest=min((r.get("received_at") for r in rows if r.get("received_at")),default=datetime.now(timezone.utc));days=max(0,(datetime.now(timezone.utc).date()-oldest.date()).days-int(cfg["grace_days"]));storage=round(days*float(cfg["daily_storage_fee"])*len(rows),2)
  required=round(outstanding+storage,2);paid=sum(float(r.get("fees_paid") or 0) for r in rows);payment_status="PAID" if required<=0 or all(r.get("payment_status") in ('PAID','CLEARED') for r in rows) else "PARTIAL" if paid>0 else "PENDING"
  recipient=rows[0].get("client_name");phone=rows[0].get("client_phone")
  row=c.execute(text("""insert into pickup_orders(id,org_id,pickup_reference,client_id,office_id,warehouse_id,recipient_name,recipient_phone,payment_status,required_amount,paid_amount,storage_fee,currency,release_blocked_reason,assigned_to,assigned_name,notes,created_by,created_by_name)
   values(:id,:o,:r,:client_id,:office_id,:warehouse_id,:rn,:rp,:ps,:required,:paid,:storage,:currency,:blocked,:assigned_to,:assigned_name,:notes,:u,:un) returning *"""),{"id":pickup_id,"o":org_id,"r":reference,"client_id":rows[0]["client_id"],"office_id":payload.get("office_id"),"warehouse_id":payload.get("warehouse_id"),"rn":recipient,"rp":phone,"ps":payment_status,"required":required,"paid":paid,"storage":storage,"currency":rows[0].get("currency") or cfg["currency"],"blocked":"PAYMENT_NOT_CLEARED" if cfg["require_payment"] and payment_status!='PAID' else None,"assigned_to":payload.get("assigned_to") or actor,"assigned_name":payload.get("assigned_name") or actor_name,"notes":payload.get("notes"),"u":actor,"un":actor_name}).mappings().one()
  for package_id in ids:c.execute(text("insert into pickup_order_items(org_id,pickup_id,package_id) values(:o,:p,:i)"),{"o":org_id,"p":pickup_id,"i":package_id})
  _event(c,org_id,pickup_id,"CREATED",actor,actor_name,{"packages":ids,"storage_fee":storage});return dict(row)

def detail(org_id,pickup_id):
 with engine.connect() as c:
  order=c.execute(text("select * from pickup_orders where id=:p and org_id=:o"),{"p":pickup_id,"o":org_id}).mappings().first()
  if not order:raise HTTPException(404,"pickup_not_found")
  result=dict(order);result["packages"]=_rows(c.execute(text("select cp.id::text,cp.package_reference,cp.tracking_id,cp.description,cp.weight_kg,cp.payment_status,cp.fees_total,cp.fees_paid,i.released_at from pickup_order_items i join cargo_packages cp on cp.id=i.package_id and cp.org_id=i.org_id where i.pickup_id=:p and i.org_id=:o"),{"p":pickup_id,"o":org_id}));result["verifications"]=_rows(c.execute(text("select * from pickup_verifications where pickup_id=:p and org_id=:o order by created_at desc"),{"p":pickup_id,"o":org_id}));result["proofs"]=_rows(c.execute(text("select * from pickup_proofs where pickup_id=:p and org_id=:o order by created_at desc"),{"p":pickup_id,"o":org_id}));result["events"]=_rows(c.execute(text("select * from pickup_events where pickup_id=:p and org_id=:o order by created_at desc"),{"p":pickup_id,"o":org_id}));return result

def notify(org_id,pickup_id,actor,actor_name):
 cfg=settings_for(org_id);code=f"{secrets.randbelow(1_000_000):06d}"
 with engine.begin() as c:
  order=c.execute(text("select * from pickup_orders where id=:p and org_id=:o and status in ('READY','NOTIFIED') for update"),{"p":pickup_id,"o":org_id}).mappings().first()
  if not order:raise HTTPException(409,"pickup_not_notifiable")
  c.execute(text("update pickup_otps set status='REVOKED' where pickup_id=:p and status='PENDING'"),{"p":pickup_id});c.execute(text("insert into pickup_otps(org_id,pickup_id,code_hash,expires_at,created_by) values(:o,:p,:h,now()+(:ttl||' minutes')::interval,:u)"),{"o":org_id,"p":pickup_id,"h":_hash(pickup_id,code),"ttl":cfg["otp_ttl_minutes"],"u":actor})
  message=f"Votre retrait {order['pickup_reference']} est prêt. Code confidentiel : {code}. Valable {cfg['otp_ttl_minutes']} minutes."
  package_ids=c.execute(text("select package_id from pickup_order_items where pickup_id=:p"),{"p":pickup_id}).scalars().all()
  for package_id in package_ids:c.execute(text("insert into package_notifications(org_id,package_id,channel,notification_type,recipient,message,status) values(:o,:pkg,'whatsapp','PICKUP_READY',:r,:m,'PENDING')"),{"o":org_id,"pkg":package_id,"r":order["recipient_phone"],"m":message})
  c.execute(text("update pickup_orders set status='NOTIFIED',notified_at=now(),row_version=row_version+1,updated_at=now() where id=:p"),{"p":pickup_id});_event(c,org_id,pickup_id,"CLIENT_NOTIFIED",actor,actor_name);return {"status":"NOTIFIED","expires_in":int(cfg["otp_ttl_minutes"])*60}

def check_in(org_id,pickup_id,actor,actor_name,version):
 with engine.begin() as c:
  row=c.execute(text("update pickup_orders set status='CHECKED_IN',checked_in_at=now(),row_version=row_version+1,updated_at=now() where id=:p and org_id=:o and status in ('READY','NOTIFIED') and row_version=:v returning *"),{"p":pickup_id,"o":org_id,"v":version}).mappings().first()
  if not row:raise HTTPException(409,"pickup_state_conflict")
  _event(c,org_id,pickup_id,"CLIENT_CHECKED_IN",actor,actor_name);return dict(row)

def verify_otp(org_id,pickup_id,actor,actor_name,code):
 cfg=settings_for(org_id)
 with engine.begin() as c:
  otp=c.execute(text("select * from pickup_otps where pickup_id=:p and org_id=:o and status='PENDING' order by created_at desc limit 1 for update"),{"p":pickup_id,"o":org_id}).mappings().first()
  if not otp:raise HTTPException(409,"pickup_otp_unavailable")
  if otp["expires_at"]<datetime.now(timezone.utc):c.execute(text("update pickup_otps set status='EXPIRED' where id=:id"),{"id":otp["id"]});raise HTTPException(422,"pickup_otp_expired")
  if not hmac.compare_digest(otp["code_hash"],_hash(pickup_id,code)):
   attempts=otp["attempts"]+1;status="LOCKED" if attempts>=cfg["max_otp_attempts"] else "PENDING";c.execute(text("update pickup_otps set attempts=:a,status=:s where id=:id"),{"a":attempts,"s":status,"id":otp["id"]});raise HTTPException(422,"pickup_otp_invalid")
  c.execute(text("update pickup_otps set status='VERIFIED',verified_at=now() where id=:id"),{"id":otp["id"]});c.execute(text("insert into pickup_verifications(org_id,pickup_id,verification_type,verification_status,verified_by,verified_by_name) values(:o,:p,'OTP','PASSED',:u,:un)"),{"o":org_id,"p":pickup_id,"u":actor,"un":actor_name});_event(c,org_id,pickup_id,"OTP_VERIFIED",actor,actor_name);return {"verified":True}

def verify_identity(org_id,pickup_id,actor,actor_name,payload):
 masked=f"***{payload['identity_reference'][-4:]}" if payload.get("identity_reference") else None
 with engine.begin() as c:
  row=c.execute(text("update pickup_orders set recipient_type=:recipient_type,authorized_person_name=:authorized_person_name,authorized_person_phone=:authorized_person_phone,identity_type=:identity_type,identity_reference_masked=:masked,row_version=row_version+1,updated_at=now() where id=:p and org_id=:o and status='CHECKED_IN' returning *"),{"p":pickup_id,"o":org_id,"masked":masked,**payload}).mappings().first()
  if not row:raise HTTPException(409,"pickup_not_checked_in")
  c.execute(text("insert into pickup_verifications(org_id,pickup_id,verification_type,verification_status,checked_value,verified_by,verified_by_name) values(:o,:p,'IDENTITY','PASSED',:v,:u,:un)"),{"o":org_id,"p":pickup_id,"v":masked,"u":actor,"un":actor_name});_event(c,org_id,pickup_id,"IDENTITY_VERIFIED",actor,actor_name,{"type":payload["identity_type"]});return dict(row)

def verify_payment(org_id,pickup_id,actor,actor_name,payload):
 status=payload["payment_status"]
 with engine.begin() as c:
  row=c.execute(text("update pickup_orders set payment_status=:s,paid_amount=:a,release_blocked_reason=case when :s in ('PAID','CLEARED') then null else 'PAYMENT_NOT_CLEARED' end,row_version=row_version+1,updated_at=now() where id=:p and org_id=:o and status in ('CHECKED_IN','VERIFIED') returning *"),{"s":status,"a":payload["paid_amount"],"p":pickup_id,"o":org_id}).mappings().first()
  if not row:raise HTTPException(409,"pickup_not_payment_verifiable")
  c.execute(text("insert into pickup_verifications(org_id,pickup_id,verification_type,verification_status,checked_value,verified_by,verified_by_name) values(:o,:p,'PAYMENT',:s,:v,:u,:un)"),{"o":org_id,"p":pickup_id,"s":"PASSED" if status in ('PAID','CLEARED') else "FAILED","v":status,"u":actor,"un":actor_name});_event(c,org_id,pickup_id,"PAYMENT_CHECKED",actor,actor_name,{"status":status});return dict(row)

def mark_verified(org_id,pickup_id,actor,actor_name,version):
 cfg=settings_for(org_id)
 with engine.begin() as c:
  order=c.execute(text("select * from pickup_orders where id=:p and org_id=:o and status='CHECKED_IN' and row_version=:v for update"),{"p":pickup_id,"o":org_id,"v":version}).mappings().first()
  if not order:raise HTTPException(409,"pickup_state_conflict")
  passed=set(c.execute(text("select verification_type from pickup_verifications where pickup_id=:p and org_id=:o and verification_status in ('PASSED','OVERRIDDEN')"),{"p":pickup_id,"o":org_id}).scalars().all())
  required={"OTP"};
  if cfg["require_identity"]:required.add("IDENTITY")
  if cfg["require_payment"] and order["payment_status"] not in ('PAID','CLEARED'):required.add("PAYMENT")
  missing=required-passed
  if missing:raise HTTPException(409,"pickup_verifications_missing:"+",".join(sorted(missing)))
  row=c.execute(text("update pickup_orders set status='VERIFIED',verified_at=now(),release_blocked_reason=null,row_version=row_version+1,updated_at=now() where id=:p returning *"),{"p":pickup_id}).mappings().one();_event(c,org_id,pickup_id,"VERIFIED",actor,actor_name);return dict(row)

def release(org_id,pickup_id,actor,actor_name,payload,override=False):
 cfg=settings_for(org_id)
 if cfg["require_signature"] and not payload.get("signature_text") and not override:raise HTTPException(422,"pickup_signature_required")
 with engine.begin() as c:
  order=c.execute(text("select * from pickup_orders where id=:p and org_id=:o for update"),{"p":pickup_id,"o":org_id}).mappings().first()
  if not order:raise HTTPException(404,"pickup_not_found")
  if order["row_version"]!=payload["expected_version"] or (order["status"]!='VERIFIED' and not override):raise HTTPException(409,"pickup_not_verified_or_version_conflict")
  if override:c.execute(text("insert into pickup_verifications(org_id,pickup_id,verification_type,verification_status,reason,verified_by,verified_by_name) values(:o,:p,'RELEASE','OVERRIDDEN',:r,:u,:un)"),{"o":org_id,"p":pickup_id,"r":payload.get("override_reason"),"u":actor,"un":actor_name})
  c.execute(text("insert into pickup_proofs(org_id,pickup_id,signed_by,signature_text,identity_type,identity_reference_masked,captured_by,captured_by_name) values(:o,:p,:signed,:signature,:identity,:masked,:u,:un)"),{"o":org_id,"p":pickup_id,"signed":payload["signed_by"],"signature":payload.get("signature_text"),"identity":order["identity_type"],"masked":order["identity_reference_masked"],"u":actor,"un":actor_name})
  receipt=f"REC-{datetime.now(timezone.utc):%Y%m%d}-{secrets.token_hex(3).upper()}";c.execute(text("update pickup_order_items set released_at=now() where pickup_id=:p and org_id=:o"),{"p":pickup_id,"o":org_id});c.execute(text("""update cargo_packages cp set status='DELIVERED',inventory_status='RELEASED',delivered_at=now(),updated_at=now(),row_version=row_version+1 from pickup_order_items i where i.pickup_id=:p and i.package_id=cp.id and cp.org_id=:o"""),{"p":pickup_id,"o":org_id});row=c.execute(text("update pickup_orders set status='RELEASED',released_at=now(),receipt_number=:r,release_blocked_reason=null,row_version=row_version+1,updated_at=now() where id=:p returning *"),{"p":pickup_id,"r":receipt}).mappings().one();_event(c,org_id,pickup_id,"PACKAGES_RELEASED",actor,actor_name,{"override":override,"receipt":receipt});return dict(row)

def add_proof_file(org_id,pickup_id,actor,actor_name,payload):
 with engine.begin() as c:
  order=c.execute(text("select recipient_name,authorized_person_name,status from pickup_orders where id=:p and org_id=:o"),{"p":pickup_id,"o":org_id}).mappings().first()
  if not order or order["status"] not in ('CHECKED_IN','VERIFIED','RELEASED'):raise HTTPException(409,"pickup_not_ready_for_proof")
  row=c.execute(text("""insert into pickup_proofs(org_id,pickup_id,signed_by,proof_type,object_path,file_name,mime_type,size_bytes,checksum_sha256,notes,captured_by,captured_by_name) values(:o,:p,:s,:t,:path,:file,:mime,:size,:checksum,:notes,:u,:un) returning *"""),{"o":org_id,"p":pickup_id,"s":order["authorized_person_name"] or order["recipient_name"] or "Destinataire","u":actor,"un":actor_name,**payload}).mappings().one();_event(c,org_id,pickup_id,"PROOF_FILE_ADDED",actor,actor_name,{"type":payload["t"]});return dict(row)

def get_proof(org_id,pickup_id,proof_id):
 with engine.connect() as c:
  row=c.execute(text("select id::text,object_path,file_name,mime_type from pickup_proofs where id=:id and pickup_id=:p and org_id=:o and object_path is not null"),{"id":proof_id,"p":pickup_id,"o":org_id}).mappings().first();return dict(row) if row else None

def reminders(org_id,actor,actor_name,min_days=3):
 with engine.begin() as c:
  orders=_rows(c.execute(text("""select * from pickup_orders p where org_id=:o and status in ('READY','NOTIFIED') and ready_at<now()-(:days||' days')::interval and (last_reminded_at is null or last_reminded_at<now()-interval '24 hours') for update"""),{"o":org_id,"days":min_days}))
  queued=0
  for order in orders:
   message=f"Rappel : vos colis du retrait {order['pickup_reference']} sont disponibles. Frais de garde actuels : {order['storage_fee']} {order['currency']}."
   ids=c.execute(text("select package_id from pickup_order_items where pickup_id=:p"),{"p":order["id"]}).scalars().all()
   for package_id in ids:c.execute(text("insert into package_notifications(org_id,package_id,channel,notification_type,recipient,message,status) values(:o,:pkg,'whatsapp','PICKUP_REMINDER',:r,:m,'PENDING')"),{"o":org_id,"pkg":package_id,"r":order["recipient_phone"],"m":message});queued+=1
   c.execute(text("update pickup_orders set last_reminded_at=now(),reminder_count=reminder_count+1,updated_at=now() where id=:p"),{"p":order["id"]});_event(c,org_id,order["id"],"REMINDER_QUEUED",actor,actor_name)
  return {"pickups":len(orders),"notifications":queued}

def analytics(org_id):
 with engine.connect() as c:return {"summary":dict(c.execute(text("""select count(*)::int total,count(*) filter(where status='RELEASED')::int released,count(*) filter(where status='REFUSED')::int refused,coalesce(avg(extract(epoch from (released_at-ready_at))/3600) filter(where released_at is not null),0)::float average_wait_hours,coalesce(avg(extract(epoch from (released_at-checked_in_at))/60) filter(where released_at is not null and checked_in_at is not null),0)::float average_counter_minutes,coalesce(sum(storage_fee) filter(where status='RELEASED'),0)::float storage_fees_collected from pickup_orders where org_id=:o"""),{"o":org_id}).mappings().one()),"daily":_rows(c.execute(text("select released_at::date day,count(*)::int count from pickup_orders where org_id=:o and status='RELEASED' and released_at>=current_date-30 group by 1 order by 1"),{"o":org_id})),"operators":_rows(c.execute(text("select coalesce(assigned_name,'Non assigné') label,count(*) filter(where status='RELEASED')::int released,round(coalesce(avg(extract(epoch from (released_at-checked_in_at))/60) filter(where released_at is not null),0))::int average_minutes from pickup_orders where org_id=:o group by 1 order by released desc"),{"o":org_id}))}

def receipt_html(org_id,pickup_id):
 data=detail(org_id,pickup_id)
 if data["status"]!='RELEASED':raise HTTPException(409,"pickup_not_released")
 rows=''.join(f"<tr><td>{html.escape(str(p['package_reference']))}</td><td>{html.escape(str(p.get('tracking_id') or '—'))}</td><td>{float(p.get('weight_kg') or 0):.2f} kg</td></tr>" for p in data["packages"])
 return f"""<!doctype html><html lang='fr'><head><meta charset='utf-8'><title>Reçu {html.escape(str(data.get('receipt_number') or data['pickup_reference']))}</title><style>body{{font:14px Arial;color:#202124;max-width:760px;margin:40px auto}}header{{display:flex;justify-content:space-between;border-bottom:2px solid #222;padding-bottom:16px}}table{{width:100%;border-collapse:collapse;margin:24px 0}}th,td{{padding:10px;border-bottom:1px solid #ddd;text-align:left}}.totals{{margin-left:auto;width:320px}}@media print{{button{{display:none}}}}</style></head><body><button onclick='print()'>Imprimer / Enregistrer en PDF</button><header><div><h1>Slaivio</h1><p>Reçu de remise de colis</p></div><div><b>{html.escape(str(data.get('receipt_number') or ''))}</b><p>{html.escape(str(data['pickup_reference']))}</p></div></header><h2>{html.escape(str(data.get('recipient_name') or 'Client'))}</h2><p>Téléphone : {html.escape(str(data.get('recipient_phone') or '—'))}<br>Remis le : {html.escape(str(data.get('released_at') or '—'))}</p><table><thead><tr><th>Colis</th><th>Tracking</th><th>Poids</th></tr></thead><tbody>{rows}</tbody></table><div class='totals'><p>Frais de garde : <b>{data['storage_fee']} {html.escape(data['currency'])}</b></p><p>Total requis : <b>{data['required_amount']} {html.escape(data['currency'])}</b></p><p>Montant payé : <b>{data['paid_amount']} {html.escape(data['currency'])}</b></p></div><p>Signature : {html.escape(str(data['proofs'][0]['signed_by'] if data['proofs'] else '—'))}</p></body></html>"""

def stats(org_id):
 with engine.connect() as c:return dict(c.execute(text("""select count(*) filter(where status in ('READY','NOTIFIED'))::int waiting,count(*) filter(where status='CHECKED_IN')::int at_counter,count(*) filter(where status='VERIFIED')::int verified,count(*) filter(where status='RELEASED' and released_at::date=current_date)::int released_today,count(*) filter(where status not in ('RELEASED','CANCELLED') and ready_at<now()-interval '7 days')::int overdue,coalesce(sum(storage_fee) filter(where status not in ('RELEASED','CANCELLED')),0)::float storage_fees_due,coalesce(avg(extract(epoch from (released_at-checked_in_at))/60) filter(where status='RELEASED'),0)::float average_counter_minutes from pickup_orders where org_id=:o"""),{"o":org_id}).mappings().one())
def export(org_id):
 with engine.connect() as c:rows=_rows(c.execute(text("select pickup_reference,status,recipient_name,recipient_phone,payment_status,required_amount,paid_amount,storage_fee,currency,ready_at,released_at from pickup_orders where org_id=:o order by created_at desc"),{"o":org_id}))
 out=io.StringIO();w=csv.DictWriter(out,fieldnames=list(rows[0]) if rows else ["pickup_reference","status"]);w.writeheader();w.writerows(rows);return out.getvalue()
