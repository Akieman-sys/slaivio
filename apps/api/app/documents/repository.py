import json
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import text
from app.db.database import engine
def rows(r):return[dict(x)for x in r.mappings().all()]
def listing(o,q=None,status=None,entity_type=None):
 f=['org_id=:o'];p={'o':o,'q':f'%{q or ""}%'}
 if q:f.append('(title ilike :q or document_code ilike :q or file_name ilike :q)')
 if status:f.append('status=:s');p['s']=status
 if entity_type:f.append('entity_type=:e');p['e']=entity_type
 with engine.connect()as c:return rows(c.execute(text(f"select * from compliance_documents where {' and '.join(f)} order by created_at desc limit 500"),p))
def add(o,a,n,p):
 with engine.begin()as c:
  latest=c.execute(text('select coalesce(max(version_number),0) from compliance_documents where org_id=:o and document_code=:code'),{'o':o,'code':p['document_code']}).scalar_one();p['version_number']=latest+1
  if latest:c.execute(text("update compliance_documents set status='SUPERSEDED',updated_at=now() where org_id=:o and document_code=:code and status<>'ARCHIVED'"),{'o':o,'code':p['document_code']})
  row=dict(c.execute(text("insert into compliance_documents(org_id,document_code,document_type,title,entity_type,entity_id,object_path,file_name,mime_type,size_bytes,checksum_sha256,version_number,issued_at,expires_at,issuer,metadata,uploaded_by) values(:o,:document_code,:document_type,:title,:entity_type,cast(:entity_id as uuid),:object_path,:file_name,:mime_type,:size_bytes,:checksum_sha256,:version_number,:issued_at,:expires_at,:issuer,cast(:metadata as jsonb),:a) returning *"),{'o':o,'a':a,**p,'metadata':json.dumps(p.get('metadata')or{})}).mappings().one());c.execute(text("insert into compliance_events(org_id,document_id,entity_type,entity_id,event_type,actor_id,actor_name) values(:o,:d,:e,cast(:id as uuid),'UPLOADED',:a,:n)"),{'o':o,'d':row['id'],'e':p['entity_type'],'id':p['entity_id'],'a':a,'n':n});return row
def review(o,d,a,n,status,reason=None):
 with engine.begin()as c:
  row=c.execute(text("update compliance_documents set status=:s,rejection_reason=:r,reviewed_by=:a,reviewed_at=now(),updated_at=now() where id=:d and org_id=:o and status='PENDING_REVIEW' returning *"),{'s':status,'r':reason,'a':a,'d':d,'o':o}).mappings().first()
  if not row:raise HTTPException(409,'document_not_reviewable')
  return dict(row)
def expire(o):
 with engine.begin()as c:return c.execute(text("update compliance_documents set status='EXPIRED',updated_at=now() where org_id=:o and status='VALID' and expires_at<current_date"),{'o':o}).rowcount
def requirements(o):
 with engine.connect()as c:return rows(c.execute(text('select cr.*,s.service_name from compliance_requirements cr left join shipping_services s on s.id=cr.shipping_service_id and s.org_id=cr.org_id where cr.org_id=:o order by cr.priority'),{'o':o}))
def save_requirement(o,p):
 with engine.begin()as c:return dict(c.execute(text("insert into compliance_requirements(org_id,requirement_code,document_type,shipping_service_id,origin_country,destination_country,goods_category,entity_type,mandatory,validity_days,priority) values(:o,:requirement_code,:document_type,cast(:shipping_service_id as uuid),:origin_country,:destination_country,:goods_category,:entity_type,:mandatory,:validity_days,:priority) on conflict(org_id,requirement_code) do update set document_type=excluded.document_type,shipping_service_id=excluded.shipping_service_id,origin_country=excluded.origin_country,destination_country=excluded.destination_country,goods_category=excluded.goods_category,entity_type=excluded.entity_type,mandatory=excluded.mandatory,validity_days=excluded.validity_days,active=true,priority=excluded.priority returning *"),{'o':o,**p}).mappings().one())
def check(o,entity_type,entity_id,actor=None):
 with engine.begin()as c:
  req=rows(c.execute(text("select * from compliance_requirements where org_id=:o and active and mandatory and entity_type=:e order by priority"),{'o':o,'e':entity_type}));valid=set(c.execute(text("select document_type from compliance_documents where org_id=:o and entity_type=:e and entity_id=:id and status='VALID' and (expires_at is null or expires_at>=current_date)"),{'o':o,'e':entity_type,'id':entity_id}).scalars().all());missing=[{'code':x['requirement_code'],'document_type':x['document_type']}for x in req if x['document_type']not in valid];status='BLOCKED'if missing else'CLEAR';c.execute(text("insert into compliance_checks(org_id,entity_type,entity_id,status,missing_requirements,checked_by) values(:o,:e,:id,:s,cast(:m as jsonb),:a) on conflict(org_id,entity_type,entity_id) do update set status=excluded.status,missing_requirements=excluded.missing_requirements,checked_at=now(),checked_by=excluded.checked_by"),{'o':o,'e':entity_type,'id':entity_id,'s':status,'m':json.dumps(missing),'a':actor});return{'status':status,'missing':missing}
