from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db.database import engine
from app.services.knowledge_ai import embed_texts,translate_text
from app.services.knowledge_connectors import encrypt_credentials,decrypt_credentials,discover

EDITABLE = ("title", "knowledge_type", "category", "content", "structured_data", "question_variants", "tags", "language", "audiences", "ai_scope", "source_type", "source_entity_type", "source_entity_id", "effective_at", "expires_at", "review_due_at", "review_interval_days", "owner_id", "owner_name", "sensitive", "workspace_id")
SUSPICIOUS = re.compile(r"(?i)(ignore (all|previous)|system prompt|reveal (the )?(secret|instructions)|jailbreak|developer message)")


def _dict(row):
    return dict(row._mapping) if row else None


def _entry(conn, org_id: str, entry_id: str, lock: bool = False):
    row = conn.execute(text(f"select * from knowledge_entries where org_id=:org and id=:id {'for update' if lock else ''}"), {"org": org_id, "id": entry_id}).fetchone()
    if not row:
        raise HTTPException(404, "knowledge_not_found")
    return _dict(row)


def _audit(conn, org_id, entry_id, event, actor_id, actor_name, old=None, new=None):
    conn.execute(text("insert into knowledge_audit_events(org_id,knowledge_id,event_type,old_values,new_values,actor_id,actor_name) values(:o,:k,:e,cast(:old as jsonb),cast(:new as jsonb),:a,:n)"), {"o": org_id, "k": entry_id, "e": event, "old": json.dumps(old, default=str) if old else None, "new": json.dumps(new, default=str) if new else None, "a": actor_id, "n": actor_name})


def _snapshot(conn, item, reason, actor_id, actor_name):
    conn.execute(text("insert into knowledge_versions(org_id,knowledge_id,version,snapshot,change_reason,created_by,created_by_name) values(:o,:k,:v,cast(:s as jsonb),:r,:a,:n) on conflict(knowledge_id,version) do nothing"), {"o": item["org_id"], "k": item["id"], "v": item["version"], "s": json.dumps(item, default=str), "r": reason, "a": actor_id, "n": actor_name})


def listing(org_id: str, filters: dict[str, Any]):
    clauses = ["e.org_id=:org"]
    params: dict[str, Any] = {"org": org_id, "limit": min(max(int(filters.get("limit") or 50), 1), 200), "offset": max(int(filters.get("offset") or 0), 0)}
    for key in ("status", "category", "knowledge_type", "language", "source_type", "workspace_id"):
        if filters.get(key):
            clauses.append(f"e.{key}=:{key}"); params[key] = filters[key].upper() if key != "workspace_id" else filters[key]
    if filters.get("ai_scope"):
        clauses.append("e.ai_scope=:ai_scope"); params["ai_scope"] = filters["ai_scope"].upper()
    if filters.get("audience"):
        clauses.append(":audience=any(e.audiences)"); params["audience"] = filters["audience"].upper()
    if filters.get("q"):
        clauses.append("(to_tsvector('simple',coalesce(e.title,'')||' '||coalesce(e.content,'')) @@ websearch_to_tsquery('simple',:q) or exists(select 1 from unnest(e.tags||e.question_variants) term where term ilike '%'||:q||'%'))"); params["q"] = filters["q"]
    if filters.get("expired"):
        clauses.append("e.expires_at<now()")
    where = " and ".join(clauses)
    with engine.connect() as conn:
        total = conn.execute(text(f"select count(*) from knowledge_entries e where {where}"), params).scalar_one()
        rows = conn.execute(text(f"select e.*,coalesce(u.usage_count,0) usage_count from knowledge_entries e left join (select unnest(source_ids) id,count(*) usage_count from knowledge_response_logs where org_id=:org group by 1) u on u.id=e.id where {where} order by e.updated_at desc limit :limit offset :offset"), params).fetchall()
        return {"items": [_dict(r) for r in rows], "total": total, "limit": params["limit"], "offset": params["offset"]}


def stats(org_id: str):
    with engine.connect() as conn:
        row = conn.execute(text("""select count(*) filter(where status not in('ARCHIVED','EXPIRED')) active,count(*) filter(where knowledge_type='DOCUMENT') documents,count(*) filter(where knowledge_type='FAQ') faq,count(*) filter(where knowledge_type='PROCEDURE') procedures,count(*) filter(where knowledge_type in('RULE','POLICY')) rules,count(*) filter(where status in('PENDING_REVIEW','NEEDS_REVIEW')) needs_review,count(*) filter(where status='EXPIRED' or expires_at<now()) expired,count(*) filter(where status='PUBLISHED' and ai_scope<>'NONE') ai_enabled,count(*) filter(where status<>'PUBLISHED') unpublished,count(*) filter(where owner_id is null and status not in('ARCHIVED','EXPIRED')) ownerless from knowledge_entries where org_id=:o"""), {"o": org_id}).fetchone()
        conflicts = conn.execute(text("select count(*) from knowledge_conflicts where org_id=:o and status='OPEN'"), {"o": org_id}).scalar_one()
        unanswered = conn.execute(text("select count(*) from knowledge_response_logs where org_id=:o and decision='NO_RESULT' and created_at>now()-interval '30 days'"), {"o": org_id}).scalar_one()
        result = _dict(row); result.update({"conflicts": conflicts, "unanswered": unanswered})
        denominator = max(result["active"], 1)
        result["health"] = max(0, round(100 - (result["needs_review"] + result["expired"] + result["ownerless"] + conflicts) * 100 / denominator))
        return result


def create(org_id, actor_id, actor_name, data):
    title = data["title"].strip(); content = data.get("content", "").strip()
    if not title or (data.get("knowledge_type") != "LIVE_REFERENCE" and not content): raise HTTPException(422, "knowledge_content_required")
    if data.get("sensitive") and data.get("ai_scope") in ("CLIENT", "BOTH"): raise HTTPException(422, "sensitive_client_scope_forbidden")
    with engine.begin() as conn:
        reference = conn.execute(text("select 'KNW-'||to_char(now(),'YYYY')||'-'||lpad((count(*)+1)::text,6,'0') from knowledge_entries where org_id=:o"), {"o": org_id}).scalar_one()
        values = {k: data.get(k) for k in EDITABLE}; values.update({"org": org_id, "ref": reference, "actor": actor_id, "name": actor_name})
        row = conn.execute(text("""insert into knowledge_entries(org_id,reference,title,knowledge_type,category,content,structured_data,question_variants,tags,language,audiences,ai_scope,source_type,source_entity_type,source_entity_id,effective_at,expires_at,review_due_at,review_interval_days,owner_id,owner_name,sensitive,workspace_id,created_by,created_by_name,updated_by,updated_by_name) values(:org,:ref,:title,:knowledge_type,:category,:content,cast(:structured_data as jsonb),:question_variants,:tags,:language,:audiences,:ai_scope,:source_type,:source_entity_type,:source_entity_id,:effective_at,:expires_at,:review_due_at,:review_interval_days,:owner_id,:owner_name,:sensitive,:workspace_id,:actor,:name,:actor,:name) returning *"""), {**values, "structured_data": json.dumps(values.get("structured_data") or {})}).fetchone()
        item = _dict(row); _snapshot(conn, item, "Création", actor_id, actor_name); _audit(conn, org_id, item["id"], "CREATED", actor_id, actor_name, new=item)
        _replace_chunks(conn, item)
        return item


def update(org_id, entry_id, actor_id, actor_name, data):
    expected = data.pop("expected_version")
    reason = data.pop("change_reason", None)
    changes = {k: v for k, v in data.items() if k in EDITABLE and v is not None}
    if not changes: raise HTTPException(422, "no_changes")
    with engine.begin() as conn:
        old = _entry(conn, org_id, entry_id, True)
        if old["version"] != expected: raise HTTPException(409, "knowledge_version_conflict")
        merged = {**old, **changes}
        if merged.get("sensitive") and merged.get("ai_scope") in ("CLIENT", "BOTH"): raise HTTPException(422, "sensitive_client_scope_forbidden")
        sets=[]; params={"o":org_id,"id":entry_id,"expected":expected,"actor":actor_id,"name":actor_name}
        for k,v in changes.items():
            sets.append(f"{k}=:{k}"); params[k]=json.dumps(v) if k=="structured_data" else v
            if k=="structured_data": sets[-1]=f"{k}=cast(:{k} as jsonb)"
        row=conn.execute(text(f"update knowledge_entries set {','.join(sets)},version=version+1,updated_by=:actor,updated_by_name=:name,updated_at=now(),status=case when status='PUBLISHED' then 'NEEDS_REVIEW' else status end where org_id=:o and id=:id and version=:expected returning *"),params).fetchone()
        item=_dict(row); _snapshot(conn,item,reason or "Modification",actor_id,actor_name); _audit(conn,org_id,entry_id,"UPDATED",actor_id,actor_name,old,item); _replace_chunks(conn,item)
        return item


def transition(org_id, entry_id, actor_id, actor_name, action, reason=None):
    targets={"submit":"PENDING_REVIEW","approve":"APPROVED","publish":"PUBLISHED","unpublish":"APPROVED","request-review":"NEEDS_REVIEW","archive":"ARCHIVED","restore":"DRAFT"}
    if action not in targets: raise HTTPException(422,"invalid_knowledge_action")
    with engine.begin() as conn:
        old=_entry(conn,org_id,entry_id,True); target=targets[action]
        allowed={"submit":("DRAFT","NEEDS_REVIEW"),"approve":("PENDING_REVIEW","NEEDS_REVIEW"),"publish":("APPROVED",),"unpublish":("PUBLISHED",),"request-review":("APPROVED","PUBLISHED"),"archive":("DRAFT","PENDING_REVIEW","APPROVED","PUBLISHED","NEEDS_REVIEW","EXPIRED"),"restore":("ARCHIVED",)}
        if old["status"] not in allowed[action]: raise HTTPException(409,"invalid_knowledge_transition")
        if action=="publish" and (old["expires_at"] and old["expires_at"]<=datetime.now(timezone.utc)): raise HTTPException(409,"expired_knowledge_cannot_publish")
        extra=""
        if action=="approve": extra=",approved_by=:a,approved_at=now()"
        elif action=="publish": extra=",published_by=:a,published_at=now()"
        elif action=="archive": extra=",archived_by=:a,archived_at=now()"
        elif action=="restore": extra=",archived_by=null,archived_at=null"
        item=_dict(conn.execute(text(f"update knowledge_entries set status=:s,version=version+1,updated_by=:a,updated_by_name=:n,updated_at=now(){extra} where org_id=:o and id=:id returning *"),{"s":target,"a":actor_id,"n":actor_name,"o":org_id,"id":entry_id}).fetchone())
        _snapshot(conn,item,reason or action,actor_id,actor_name); _audit(conn,org_id,entry_id,action.upper(),actor_id,actor_name,old,item)
        return item


def detail(org_id, entry_id):
    with engine.connect() as conn:
        item=_entry(conn,org_id,entry_id)
        item["versions"]=[_dict(r) for r in conn.execute(text("select id,version,change_reason,created_by_name,created_at from knowledge_versions where org_id=:o and knowledge_id=:k order by version desc"),{"o":org_id,"k":entry_id}).fetchall()]
        item["relations"]=[_dict(r) for r in conn.execute(text("select * from knowledge_relations where org_id=:o and knowledge_id=:k"),{"o":org_id,"k":entry_id}).fetchall()]
        item["audit"]=[_dict(r) for r in conn.execute(text("select * from knowledge_audit_events where org_id=:o and knowledge_id=:k order by created_at desc limit 100"),{"o":org_id,"k":entry_id}).fetchall()]
        return item


def restore_version(org_id, entry_id, version, actor_id, actor_name):
    with engine.begin() as conn:
        old=_entry(conn,org_id,entry_id,True)
        row=conn.execute(text("select snapshot from knowledge_versions where org_id=:o and knowledge_id=:k and version=:v"),{"o":org_id,"k":entry_id,"v":version}).fetchone()
        if not row: raise HTTPException(404,"knowledge_version_not_found")
        snapshot=row[0]; changes={k:snapshot.get(k) for k in EDITABLE}
        params={"o":org_id,"id":entry_id,"a":actor_id,"n":actor_name,**{k:(json.dumps(v) if k=="structured_data" else v) for k,v in changes.items()}}
        sets=[f"{k}=cast(:{k} as jsonb)" if k=="structured_data" else f"{k}=:{k}" for k in changes]
        item=_dict(conn.execute(text(f"update knowledge_entries set {','.join(sets)},status='DRAFT',version=version+1,updated_by=:a,updated_by_name=:n,updated_at=now() where org_id=:o and id=:id returning *"),params).fetchone())
        _snapshot(conn,item,f"Restauration v{version}",actor_id,actor_name); _audit(conn,org_id,entry_id,"VERSION_RESTORED",actor_id,actor_name,old,item); _replace_chunks(conn,item); return item


def _replace_chunks(conn, item):
    conn.execute(text("delete from knowledge_chunks where org_id=:o and knowledge_id=:k"),{"o":item["org_id"],"k":item["id"]})
    paragraphs=[p.strip() for p in re.split(r"\n\s*\n|(?<=[.!?])\s+(?=[A-ZÀ-Ý])",item.get("content") or "") if p.strip()]
    chunks=[]; current=""
    for part in paragraphs:
        if len(current)+len(part)>1200 and current: chunks.append(current); current=""
        current=(current+" "+part).strip()
    if current: chunks.append(current)
    for idx,chunk in enumerate(chunks): conn.execute(text("insert into knowledge_chunks(org_id,knowledge_id,chunk_index,content,metadata) values(:o,:k,:i,:c,cast(:m as jsonb))"),{"o":item["org_id"],"k":item["id"],"i":idx,"c":chunk,"m":json.dumps({"title":item["title"],"language":item["language"]})})


def search(org_id, query, channel, language="FR", workspace_id=None, limit=8):
    scope = "('CLIENT','BOTH')" if channel in ("CLIENT","WHATSAPP") else "('INTERNAL','BOTH')"
    audience = "PUBLIC" if channel in ("CLIENT","WHATSAPP") else None
    params={"o":org_id,"q":query,"lang":language.upper(),"w":workspace_id,"limit":min(limit,20),"aud":audience}
    sql=f"""select e.id,e.reference,e.title,e.category,e.content,e.source_type,e.source_entity_type,e.source_entity_id,e.updated_at,ts_rank(to_tsvector('simple',coalesce(e.title,'')||' '||coalesce(e.content,'')),websearch_to_tsquery('simple',:q)) rank from knowledge_entries e where e.org_id=:o and e.status='PUBLISHED' and e.ai_scope in {scope} and e.sensitive=false and e.language=:lang and (e.workspace_id is null or e.workspace_id=:w) and (e.effective_at is null or e.effective_at<=now()) and (e.expires_at is null or e.expires_at>now()) and (e.review_due_at is null or e.review_due_at>now()) and (:aud is null or :aud=any(e.audiences)) and (to_tsvector('simple',coalesce(e.title,'')||' '||coalesce(e.content,'')) @@ websearch_to_tsquery('simple',:q) or exists(select 1 from unnest(e.tags||e.question_variants) term where term ilike '%'||:q||'%')) order by case e.source_type when 'ROUTE' then 1 when 'SERVICE' then 2 when 'PRICING' then 3 when 'WAREHOUSE' then 4 else 5 end,rank desc,e.updated_at desc limit :limit"""
    lexical=[]
    with engine.connect() as conn: lexical=[_dict(r) for r in conn.execute(text(sql),params).fetchall()]
    try: vector=embed_texts([query])[0]
    except RuntimeError:return lexical
    vector_literal="["+",".join(str(float(x)) for x in vector)+"]"
    with engine.connect() as conn:
        semantic=[_dict(r) for r in conn.execute(text(f"select e.id,e.reference,e.title,e.category,e.content,e.source_type,e.source_entity_type,e.source_entity_id,e.updated_at,1-(e.embedding<=>cast(:embedding as vector)) rank from knowledge_entries e where e.org_id=:o and e.status='PUBLISHED' and e.ai_scope in {scope} and e.sensitive=false and e.language=:lang and e.embedding is not null and (e.workspace_id is null or e.workspace_id=:w) and (e.effective_at is null or e.effective_at<=now()) and (e.expires_at is null or e.expires_at>now()) and (e.review_due_at is null or e.review_due_at>now()) and (:aud is null or :aud=any(e.audiences)) order by e.embedding<=>cast(:embedding as vector) limit :limit"),{**params,"embedding":vector_literal}).fetchall()]
    merged={str(x["id"]):x for x in semantic};merged.update({str(x["id"]):x for x in lexical});return sorted(merged.values(),key=lambda x:float(x.get("rank") or 0),reverse=True)[:limit]


def log_response(org_id, actor_id, data, items):
    decision="ANSWERED" if items else "NO_RESULT"
    answer=items[0]["content"] if items else None
    with engine.begin() as conn:
        row=conn.execute(text("insert into knowledge_response_logs(org_id,workspace_id,channel,language,question,answer,decision,source_ids,actor_id) values(:o,:w,:c,:l,:q,:a,:d,:s,:u) returning *"),{"o":org_id,"w":data.get("workspace_id"),"c":data["channel"],"l":data.get("language","FR"),"q":data["question"],"a":answer,"d":decision,"s":[x["id"] for x in items],"u":actor_id}).fetchone()
        return _dict(row)

def log_structured_response(org_id,actor_id,data,result):
    with engine.begin() as conn:return _dict(conn.execute(text("insert into knowledge_response_logs(org_id,workspace_id,channel,language,question,answer,decision,structured_sources,actor_id) values(:o,:w,:c,:l,:q,:a,:d,cast(:s as jsonb),:u) returning *"),{"o":org_id,"w":data.get("workspace_id"),"c":data["channel"],"l":data.get("language","FR"),"q":data["question"],"a":result.get("answer"),"d":result["decision"] if result["decision"] in("ANSWERED","NO_RESULT","ESCALATED","BLOCKED") else "ESCALATED","s":json.dumps(result.get("structured_sources",[]),default=str),"u":actor_id}).fetchone())


def settings(org_id):
    with engine.begin() as conn:
        conn.execute(text("insert into knowledge_settings(org_id) values(:o) on conflict(org_id) do nothing"),{"o":org_id})
        return _dict(conn.execute(text("select * from knowledge_settings where org_id=:o"),{"o":org_id}).fetchone())


def update_settings(org_id, actor_id, data):
    allowed=("client_ai_enabled","internal_ai_enabled","default_language","response_tone","escalation_topics","client_fallback_message","system_rules","retention_days")
    changes={k:v for k,v in data.items() if k in allowed and v is not None}
    with engine.begin() as conn:
        conn.execute(text("insert into knowledge_settings(org_id) values(:o) on conflict(org_id) do nothing"),{"o":org_id})
        params={"o":org_id,"a":actor_id,**changes}; sets=[f"{k}=:{k}" for k in changes]
        return _dict(conn.execute(text(f"update knowledge_settings set {','.join(sets)},updated_by=:a,updated_at=now() where org_id=:o returning *"),params).fetchone())


def analytics(org_id):
    with engine.connect() as conn:
        decisions=[_dict(r) for r in conn.execute(text("select decision,count(*) count from knowledge_response_logs where org_id=:o and created_at>now()-interval '30 days' group by decision"),{"o":org_id}).fetchall()]
        top=[_dict(r) for r in conn.execute(text("select e.id,e.title,count(*) usage_count from knowledge_response_logs l cross join unnest(l.source_ids) sid join knowledge_entries e on e.id=sid where l.org_id=:o and l.created_at>now()-interval '30 days' group by e.id,e.title order by usage_count desc limit 10"),{"o":org_id}).fetchall()]
        unanswered=[_dict(r) for r in conn.execute(text("select question,count(*) occurrences,max(created_at) last_asked from knowledge_response_logs where org_id=:o and decision='NO_RESULT' and created_at>now()-interval '30 days' group by question order by occurrences desc limit 20"),{"o":org_id}).fetchall()]
        return {"decisions":decisions,"top":top,"unanswered":unanswered,"stats":stats(org_id)}


def add_file(org_id, workspace_id, actor_id, meta):
    with engine.begin() as conn:
        existing=conn.execute(text("select * from knowledge_files where org_id=:o and checksum_sha256=:h"),{"o":org_id,"h":meta["checksum_sha256"]}).fetchone()
        if existing: raise HTTPException(409,"knowledge_file_duplicate")
        meta["prompt_injection_detected"] = bool(SUSPICIOUS.search(meta.get("extracted_text") or ""))
        row=conn.execute(text("""insert into knowledge_files(org_id,workspace_id,file_name,object_path,mime_type,size_bytes,checksum_sha256,scan_status,scan_engine,scan_signature,scanned_at,extraction_status,extracted_text,detected_data,confidence,prompt_injection_detected,created_by) values(:org,:workspace_id,:file_name,:object_path,:mime_type,:size_bytes,:checksum_sha256,:scan_status,:scan_engine,:scan_signature,now(),:extraction_status,:extracted_text,cast(:detected_data as jsonb),:confidence,:prompt_injection_detected,:actor) returning *"""),{"org":org_id,"workspace_id":workspace_id,"actor":actor_id,**meta,"detected_data":json.dumps(meta.get("detected_data") or {})}).fetchone()
        return _dict(row)


def files(org_id):
    with engine.connect() as conn:return [_dict(r) for r in conn.execute(text("select * from knowledge_files where org_id=:o order by created_at desc limit 200"),{"o":org_id}).fetchall()]


def import_file(org_id, file_id, actor_id, actor_name, data):
    with engine.begin() as conn:
        row=conn.execute(text("select * from knowledge_files where org_id=:o and id=:id for update"),{"o":org_id,"id":file_id}).fetchone()
        if not row: raise HTTPException(404,"knowledge_file_not_found")
        source=_dict(row)
        if source["scan_status"]!="CLEAN" or source["prompt_injection_detected"]: raise HTTPException(409,"knowledge_file_security_review_required")
        content=(data.get("content") or source.get("extracted_text") or "").strip()
        if not content: raise HTTPException(409,"knowledge_file_extraction_required")
    item=create(org_id,actor_id,actor_name,{"title":data["title"],"knowledge_type":data.get("knowledge_type","DOCUMENT"),"category":data.get("category","DOCUMENTS"),"content":content,"structured_data":data.get("structured_data",{}),"question_variants":[],"tags":data.get("tags",[]),"language":data.get("language","FR"),"audiences":data.get("audiences",["EMPLOYEES"]),"ai_scope":"NONE","source_type":"IMPORT","source_entity_type":"KNOWLEDGE_FILE","source_entity_id":file_id,"effective_at":None,"expires_at":None,"review_due_at":None,"review_interval_days":data.get("review_interval_days"),"owner_id":None,"owner_name":data.get("owner_name"),"sensitive":data.get("sensitive",False),"workspace_id":source.get("workspace_id")})
    with engine.begin() as conn:
        conn.execute(text("update knowledge_entries set source_file_id=:f where org_id=:o and id=:k"),{"f":file_id,"o":org_id,"k":item["id"]})
        conn.execute(text("update knowledge_files set import_status='IMPORTED',updated_at=now() where org_id=:o and id=:f"),{"o":org_id,"f":file_id})
    return item


def add_relation(org_id, entry_id, entity_type, entity_id, relation_type):
    with engine.begin() as conn:
        _entry(conn,org_id,entry_id)
        row=conn.execute(text("insert into knowledge_relations(org_id,knowledge_id,entity_type,entity_id,relation_type) values(:o,:k,:t,:e,:r) on conflict(knowledge_id,entity_type,entity_id,relation_type) do update set entity_id=excluded.entity_id returning *"),{"o":org_id,"k":entry_id,"t":entity_type.upper(),"e":entity_id,"r":relation_type.upper()}).fetchone(); return _dict(row)

def remove_relation(org_id,entry_id,relation_id):
    with engine.begin() as conn:
        return bool(conn.execute(text("delete from knowledge_relations where org_id=:o and knowledge_id=:k and id=:id returning id"),{"o":org_id,"k":entry_id,"id":relation_id}).fetchone())


def detect_conflicts(org_id):
    with engine.begin() as conn:
        rows=conn.execute(text("""select a.id left_id,b.id right_id,case when lower(a.title)=lower(b.title) and lower(a.content)=lower(b.content) then 'DUPLICATE' else 'SOURCE_DIVERGENCE' end conflict_type from knowledge_entries a join knowledge_entries b on b.org_id=a.org_id and b.id>a.id and b.category=a.category and (lower(b.title)=lower(a.title) or (a.source_entity_id is not null and b.source_entity_id=a.source_entity_id and b.source_type=a.source_type)) where a.org_id=:o and a.status not in('ARCHIVED','EXPIRED') and b.status not in('ARCHIVED','EXPIRED') and lower(a.content)<>lower(b.content) or (a.org_id=:o and b.org_id=a.org_id and b.id>a.id and lower(a.title)=lower(b.title) and lower(a.content)=lower(b.content))"""),{"o":org_id}).fetchall()
        inserted=0
        for row in rows:
            result=conn.execute(text("insert into knowledge_conflicts(org_id,left_knowledge_id,right_knowledge_id,conflict_type,explanation) values(:o,:l,:r,:t,:e) on conflict(org_id,left_knowledge_id,right_knowledge_id,conflict_type) do nothing returning id"),{"o":org_id,"l":row.left_id,"r":row.right_id,"t":row.conflict_type,"e":"Deux sources applicables présentent le même titre ou la même référence métier. Une validation humaine est requise."}).fetchone(); inserted+=bool(result)
        return {"detected":inserted}


def conflicts(org_id):
    with engine.connect() as conn:return [_dict(r) for r in conn.execute(text("select c.*,l.title left_title,r.title right_title from knowledge_conflicts c join knowledge_entries l on l.id=c.left_knowledge_id join knowledge_entries r on r.id=c.right_knowledge_id where c.org_id=:o order by (c.status='OPEN') desc,c.created_at desc"),{"o":org_id}).fetchall()]


def resolve_conflict(org_id, conflict_id, actor_id, resolution, status="RESOLVED"):
    with engine.begin() as conn:
        row=conn.execute(text("update knowledge_conflicts set status=:s,resolution=:r,resolved_by=:a,resolved_at=now() where org_id=:o and id=:id and status='OPEN' returning *"),{"s":status,"r":resolution,"a":actor_id,"o":org_id,"id":conflict_id}).fetchone()
        if not row: raise HTTPException(404,"knowledge_conflict_not_found")
        return _dict(row)


def feedback(org_id, actor_id, data):
    with engine.begin() as conn:
        row=conn.execute(text("insert into knowledge_feedback(org_id,knowledge_id,response_log_id,rating,comment,created_by) values(:o,:k,:l,:r,:c,:a) returning *"),{"o":org_id,"k":data.get("knowledge_id"),"l":data.get("response_log_id"),"r":data["rating"],"c":data.get("comment"),"a":actor_id}).fetchone(); return _dict(row)

def embed_entry(org_id,entry_id):
    with engine.begin() as conn:item=_entry(conn,org_id,entry_id);chunks=[_dict(r) for r in conn.execute(text("select * from knowledge_chunks where org_id=:o and knowledge_id=:k order by chunk_index"),{"o":org_id,"k":entry_id}).fetchall()]
    values=embed_texts([item["title"]+"\n"+item["content"]]+[x["content"] for x in chunks])
    def literal(v):return "["+",".join(str(float(x)) for x in v)+"]"
    from app.core.config import settings as cfg
    with engine.begin() as conn:
        conn.execute(text("update knowledge_entries set embedding=cast(:v as vector),embedding_model=:m,embedded_at=now() where org_id=:o and id=:k"),{"v":literal(values[0]),"m":cfg.knowledge_embedding_model,"o":org_id,"k":entry_id})
        for chunk,value in zip(chunks,values[1:]):conn.execute(text("update knowledge_chunks set embedding=cast(:v as vector),embedding_model=:m where org_id=:o and id=:id"),{"v":literal(value),"m":cfg.knowledge_embedding_model,"o":org_id,"id":chunk["id"]})
    return {"embedded":1+len(chunks)}

def translate(org_id,entry_id,target,actor_id,actor_name):
    with engine.connect() as conn:source=_entry(conn,org_id,entry_id)
    if target.upper()==source["language"]:raise HTTPException(422,"translation_language_must_differ")
    generated=translate_text(source["title"],source["content"],target.upper());group=source.get("translation_group_id") or source["id"]
    data={k:source.get(k) for k in EDITABLE};data.update(generated);data.update({"language":target.upper(),"ai_scope":"NONE","source_type":"MANUAL"})
    item=create(org_id,actor_id,actor_name,data)
    with engine.begin() as conn:conn.execute(text("update knowledge_entries set translation_group_id=:g,translated_from_id=:s,translation_status='PENDING_REVIEW' where org_id=:o and id=:id"),{"g":group,"s":entry_id,"o":org_id,"id":item["id"]});conn.execute(text("update knowledge_entries set translation_group_id=:g where org_id=:o and id=:s and translation_group_id is null"),{"g":group,"o":org_id,"s":entry_id})
    return detail(org_id,str(item["id"]))

def saved_views(org_id,user_id):
    with engine.connect() as conn:return [_dict(r) for r in conn.execute(text("select * from knowledge_saved_views where org_id=:o and user_id=:u order by name"),{"o":org_id,"u":user_id}).fetchall()]
def save_view(org_id,user_id,name,filters):
    with engine.begin() as conn:return _dict(conn.execute(text("insert into knowledge_saved_views(org_id,user_id,name,filters) values(:o,:u,:n,cast(:f as jsonb)) on conflict(org_id,user_id,name) do update set filters=excluded.filters returning *"),{"o":org_id,"u":user_id,"n":name,"f":json.dumps(filters)}).fetchone())
def delete_view(org_id,user_id,view_id):
    with engine.begin() as conn:return bool(conn.execute(text("delete from knowledge_saved_views where org_id=:o and user_id=:u and id=:id returning id"),{"o":org_id,"u":user_id,"id":view_id}).fetchone())

def generate_suggestions(org_id):
    with engine.begin() as conn:
        rows=conn.execute(text("select question,count(*) occurrences from knowledge_response_logs where org_id=:o and decision='NO_RESULT' and created_at>now()-interval '30 days' group by question having count(*)>=2"),{"o":org_id}).fetchall();created=0
        for row in rows:
            exists=conn.execute(text("select 1 from knowledge_suggestions where org_id=:o and suggestion_type='UNANSWERED_QUESTION' and evidence->>'question'=:q and status='OPEN'"),{"o":org_id,"q":row.question}).first()
            if not exists:conn.execute(text("insert into knowledge_suggestions(org_id,suggestion_type,title,description,evidence,priority) values(:o,'UNANSWERED_QUESTION',:t,:d,cast(:e as jsonb),:p)"),{"o":org_id,"t":"Créer une réponse officielle","d":row.question,"e":json.dumps({"question":row.question,"occurrences":row.occurrences}),"p":"HIGH" if row.occurrences>=10 else "MEDIUM"});created+=1
        return {"created":created}
def suggestions(org_id):
    with engine.connect() as conn:return [_dict(r) for r in conn.execute(text("select * from knowledge_suggestions where org_id=:o order by (status='OPEN') desc,case priority when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end,created_at desc"),{"o":org_id}).fetchall()]
def update_suggestion(org_id,suggestion_id,status,knowledge_id=None):
    with engine.begin() as conn:
        row=conn.execute(text("update knowledge_suggestions set status=:s,knowledge_id=coalesce(:k,knowledge_id),updated_at=now() where org_id=:o and id=:id returning *"),{"s":status,"k":knowledge_id,"o":org_id,"id":suggestion_id}).fetchone()
        if not row:raise HTTPException(404,"knowledge_suggestion_not_found")
        return _dict(row)

def connectors(org_id):
    with engine.connect() as conn:return [_dict(r) for r in conn.execute(text("select id,workspace_id,provider,display_name,configuration,status,last_sync_at,last_sync_status,last_error,created_at,updated_at from knowledge_connectors where org_id=:o order by provider,display_name"),{"o":org_id}).fetchall()]
def create_connector(org_id,actor_id,data):
    encrypted=encrypt_credentials(data["credentials"])
    with engine.begin() as conn:return _dict(conn.execute(text("insert into knowledge_connectors(org_id,workspace_id,provider,display_name,encrypted_credentials,configuration,status,created_by) values(:o,:w,:p,:n,:c,cast(:cfg as jsonb),'CONNECTED',:a) returning id,workspace_id,provider,display_name,configuration,status,last_sync_at,last_sync_status,last_error,created_at,updated_at"),{"o":org_id,"w":data.get("workspace_id"),"p":data["provider"],"n":data["display_name"],"c":encrypted,"cfg":json.dumps(data.get("configuration",{})),"a":actor_id}).fetchone())
def sync_connector(org_id,connector_id):
    with engine.begin() as conn:
        row=conn.execute(text("select * from knowledge_connectors where org_id=:o and id=:id for update"),{"o":org_id,"id":connector_id}).fetchone()
        if not row:raise HTTPException(404,"knowledge_connector_not_found")
        connector=_dict(row);conn.execute(text("update knowledge_connectors set status='SYNCING',updated_at=now() where id=:id"),{"id":connector_id})
    try:items=discover(connector["provider"],decrypt_credentials(connector["encrypted_credentials"]),connector["configuration"])
    except Exception as exc:
        with engine.begin() as conn:conn.execute(text("update knowledge_connectors set status='ERROR',last_sync_status='ERROR',last_error=:e,updated_at=now() where org_id=:o and id=:id"),{"e":str(exc)[:500],"o":org_id,"id":connector_id})
        raise HTTPException(502,"knowledge_connector_sync_failed") from exc
    with engine.begin() as conn:
        for item in items:conn.execute(text("insert into knowledge_connector_documents(org_id,connector_id,external_id,external_url,title,mime_type,external_modified_at,content_hash) values(:o,:c,:external_id,:external_url,:title,:mime_type,:external_modified_at,:content_hash) on conflict(connector_id,external_id) do update set sync_status=case when knowledge_connector_documents.content_hash is distinct from excluded.content_hash and knowledge_connector_documents.knowledge_id is not null then 'CONFLICT' else 'UPDATED' end,external_url=excluded.external_url,title=excluded.title,mime_type=excluded.mime_type,external_modified_at=excluded.external_modified_at,content_hash=excluded.content_hash,updated_at=now()"),{"o":org_id,"c":connector_id,**item})
        conn.execute(text("update knowledge_connectors set status='CONNECTED',last_sync_at=now(),last_sync_status='SUCCESS',last_error=null,updated_at=now() where org_id=:o and id=:id"),{"o":org_id,"id":connector_id})
    return {"discovered":len(items)}

def delete_connector(org_id,connector_id):
    with engine.begin() as conn:
        return bool(conn.execute(text("delete from knowledge_connectors where org_id=:o and id=:id returning id"),{"o":org_id,"id":connector_id}).fetchone())


def maintenance(org_id=None):
    clauses="where org_id=:o" if org_id else ""; params={"o":org_id} if org_id else {}
    with engine.begin() as conn:
        expired=conn.execute(text(f"update knowledge_entries set status='EXPIRED',updated_at=now() {clauses} {'and' if clauses else 'where'} expires_at<=now() and status not in('EXPIRED','ARCHIVED') returning id"),params).fetchall()
        review=conn.execute(text(f"update knowledge_entries set status='NEEDS_REVIEW',updated_at=now() {clauses} {'and' if clauses else 'where'} review_due_at<=now() and status in('APPROVED','PUBLISHED') returning id"),params).fetchall()
        return {"expired":len(expired),"needs_review":len(review)}
