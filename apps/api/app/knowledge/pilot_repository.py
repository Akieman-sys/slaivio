from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import text

from app.db.database import engine
from app.knowledge import repository as core


KINDS = {"CLIENT_ANSWER", "COMPANY_INFORMATION", "INTERNAL_INSTRUCTION"}


def _dict(row):
    return dict(row._mapping) if row else None


def _mapped(data: dict) -> dict:
    kind = data.get("kind") or "CLIENT_ANSWER"
    if kind not in KINDS:
        raise HTTPException(422, "pilot_knowledge_kind_invalid")
    visible = bool(data.get("client_visible")) and kind != "INTERNAL_INSTRUCTION"
    knowledge_type = {
        "CLIENT_ANSWER": "FAQ",
        "COMPANY_INFORMATION": "TEXT",
        "INTERNAL_INSTRUCTION": "PROCEDURE",
    }[kind]
    return {
        "title": (data.get("subject") or "").strip(),
        "content": (data.get("answer") or "").strip(),
        "pilot_kind": kind,
        "pilot_client_visible": visible,
        "knowledge_type": knowledge_type,
        "category": (data.get("category") or "OTHER").upper(),
        "language": (data.get("language") or "FR").upper(),
        "audiences": ["PUBLIC", "EMPLOYEES"] if visible else ["EMPLOYEES"],
        "ai_scope": "BOTH" if visible else "INTERNAL",
        "review_due_at": data.get("review_due_at"),
    }


def _validate(values: dict):
    if len(values["title"]) < 2:
        raise HTTPException(422, "pilot_knowledge_subject_required")
    if len(values["content"]) < 2:
        raise HTTPException(422, "pilot_knowledge_answer_required")


def listing(org_id: str, *, view: str | None = None, q: str | None = None, category: str | None = None) -> dict:
    clauses = ["entry.org_id=:org_id"]
    params = {"org_id": org_id, "q": f"%{(q or '').strip()}%", "category": (category or "").upper()}
    if q:
        clauses.append("(entry.title ilike :q or entry.content ilike :q or coalesce(draft.subject,'') ilike :q or coalesce(draft.answer,'') ilike :q)")
    if category:
        clauses.append("coalesce(draft.category,entry.category)=:category")
    if view == "published":
        clauses.append("entry.status='PUBLISHED'")
    elif view == "drafts":
        clauses.append("entry.status<>'ARCHIVED' and (entry.status<>'PUBLISHED' or draft.id is not null)")
    elif view == "review":
        clauses.append("entry.status<>'ARCHIVED' and (entry.status in('NEEDS_REVIEW','EXPIRED') or entry.review_due_at<=now() or entry.expires_at<=now())")
    elif view == "archived":
        clauses.append("entry.status='ARCHIVED'")
    else:
        clauses.append("entry.status<>'ARCHIVED'")
    where = " and ".join(clauses)
    with engine.connect() as conn:
        rows = conn.execute(text(f"""
          select entry.id::text,entry.reference,entry.title subject,entry.content answer,
            coalesce(entry.pilot_kind,case when entry.knowledge_type='FAQ' then 'CLIENT_ANSWER' when entry.knowledge_type in('PROCEDURE','POLICY','RULE') then 'INTERNAL_INSTRUCTION' else 'COMPANY_INFORMATION' end) kind,
            entry.category,coalesce(entry.pilot_client_visible,entry.ai_scope in('CLIENT','BOTH')) client_visible,
            case when entry.status='ARCHIVED' then 'ARCHIVED' when entry.status='PUBLISHED' then 'PUBLISHED' else 'DRAFT' end status,
            entry.status internal_status,entry.language,entry.review_due_at,entry.expires_at,
            entry.version,entry.updated_by_name,entry.updated_at,entry.published_at,
            draft.id is not null has_pending_draft,draft.updated_at draft_updated_at,draft.updated_by_name draft_updated_by_name,
            greatest(entry.updated_at,coalesce(draft.updated_at,entry.updated_at)) display_updated_at,
            coalesce(usage.usage_count,0)::int usage_count
          from knowledge_entries entry
          left join pilot_knowledge_drafts draft on draft.org_id=entry.org_id and draft.knowledge_id=entry.id
          left join (
            select unnest(source_ids) knowledge_id,count(*) usage_count
            from knowledge_response_logs where org_id=:org_id group by 1
          ) usage on usage.knowledge_id=entry.id
          where {where}
          order by greatest(entry.updated_at,coalesce(draft.updated_at,entry.updated_at)) desc
          limit 200
        """), params).fetchall()
    return {"items": [_dict(row) for row in rows], "total": len(rows)}


def stats(org_id: str) -> dict:
    with engine.connect() as conn:
        row = conn.execute(text("""
          select count(*) filter(where entry.status='PUBLISHED')::int published,
            count(*) filter(where entry.status<>'ARCHIVED' and (entry.status<>'PUBLISHED' or draft.id is not null))::int drafts,
            count(*) filter(where entry.status<>'ARCHIVED' and (entry.status in('NEEDS_REVIEW','EXPIRED') or entry.review_due_at<=now() or entry.expires_at<=now()))::int needs_review,
            count(*) filter(where entry.status='PUBLISHED' and entry.ai_scope in('CLIENT','BOTH') and entry.sensitive=false and (entry.review_due_at is null or entry.review_due_at>now()) and (entry.expires_at is null or entry.expires_at>now()))::int available_to_ai,
            count(*) filter(where entry.status='ARCHIVED')::int archived
          from knowledge_entries entry
          left join pilot_knowledge_drafts draft on draft.org_id=entry.org_id and draft.knowledge_id=entry.id
          where entry.org_id=:org_id
        """), {"org_id": org_id}).fetchone()
        defaults = conn.execute(text("""
          select default_language,pilot_default_review_days
          from knowledge_settings where org_id=:org_id
        """), {"org_id": org_id}).mappings().first()
    result = _dict(row)
    result.update(dict(defaults) if defaults else {"default_language": "FR", "pilot_default_review_days": 180})
    return result


def detail(org_id: str, entry_id: str) -> dict:
    with engine.connect() as conn:
        row = conn.execute(text("""
          select entry.*,
            coalesce(entry.pilot_kind,case when entry.knowledge_type='FAQ' then 'CLIENT_ANSWER' when entry.knowledge_type in('PROCEDURE','POLICY','RULE') then 'INTERNAL_INSTRUCTION' else 'COMPANY_INFORMATION' end) resolved_pilot_kind,
            coalesce(entry.pilot_client_visible,entry.ai_scope in('CLIENT','BOTH')) resolved_client_visible
          from knowledge_entries entry where entry.org_id=:org_id and entry.id=:entry_id
        """), {"org_id": org_id, "entry_id": entry_id}).fetchone()
        if not row:
            raise HTTPException(404, "pilot_knowledge_not_found")
        item = _dict(row)
        source_file = None
        if item.get("source_file_id"):
            source_file = _dict(conn.execute(text("""
              select id::text,file_name,mime_type,size_bytes,extraction_status,confidence,created_at
              from knowledge_files where org_id=:org_id and id=:source_file_id
            """), {"org_id": org_id, "source_file_id": item["source_file_id"]}).fetchone())
        draft = _dict(conn.execute(text("select * from pilot_knowledge_drafts where org_id=:org_id and knowledge_id=:entry_id"), {"org_id": org_id, "entry_id": entry_id}).fetchone())
        history = [_dict(value) for value in conn.execute(text("""
          select event_type,actor_name,created_at from knowledge_audit_events
          where org_id=:org_id and knowledge_id=:entry_id order by created_at desc limit 50
        """), {"org_id": org_id, "entry_id": entry_id}).fetchall()]
    return {
        "id": str(item["id"]), "reference": item["reference"], "subject": item["title"], "answer": item["content"],
        "kind": item["resolved_pilot_kind"], "category": item["category"], "client_visible": item["resolved_client_visible"],
        "status": "ARCHIVED" if item["status"] == "ARCHIVED" else "PUBLISHED" if item["status"] == "PUBLISHED" else "DRAFT",
        "internal_status": item["status"], "language": item["language"], "review_due_at": item.get("review_due_at"),
        "version": item["version"], "updated_by_name": item.get("updated_by_name"), "updated_at": item["updated_at"],
        "published_at": item.get("published_at"), "pending_draft": draft, "history": history,
        "source_file": source_file,
    }


def create(org_id: str, actor_id: str, actor_name: str, data: dict) -> tuple[dict, bool]:
    values = _mapped(data); _validate(values)
    idempotency_key = data.get("idempotency_key")
    source_file_id = str(data["source_file_id"]) if data.get("source_file_id") else None
    replayed = False
    with engine.begin() as conn:
        if source_file_id:
            source = conn.execute(text("""
              select id,scan_status,extraction_status,prompt_injection_detected
              from knowledge_files where org_id=:org_id and id=:source_file_id for update
            """), {"org_id": org_id, "source_file_id": source_file_id}).mappings().first()
            if not source:
                raise HTTPException(404, "pilot_knowledge_source_not_found")
            if source["scan_status"] != "CLEAN" or source["prompt_injection_detected"]:
                raise HTTPException(409, "pilot_knowledge_source_security_review_required")
            if source["extraction_status"] not in {"EXTRACTED", "NEEDS_REVIEW"}:
                raise HTTPException(409, "pilot_knowledge_source_not_ready")
        if idempotency_key:
            existing = conn.execute(text("select id from knowledge_entries where org_id=:org_id and pilot_idempotency_key=:key"), {"org_id": org_id, "key": idempotency_key}).scalar()
            if existing:
                entry_id = str(existing)
                replayed = True
        if replayed:
            row = None
        else:
            reference = f"KNW-{datetime.now(timezone.utc):%Y}-{uuid4().hex[:8].upper()}"
            row = conn.execute(text("""
              insert into knowledge_entries(
                org_id,reference,title,knowledge_type,category,content,structured_data,question_variants,tags,
                language,audiences,ai_scope,source_type,source_entity_type,source_entity_id,source_file_id,status,sensitive,review_due_at,pilot_kind,
                pilot_client_visible,pilot_idempotency_key,created_by,created_by_name,updated_by,updated_by_name
              ) values(
                :org_id,:reference,:title,:knowledge_type,:category,:content,'{}'::jsonb,'{}'::text[],'{}'::text[],
                :language,:audiences,:ai_scope,:source_type,:source_entity_type,:source_entity_id,:source_file_id,'DRAFT',false,:review_due_at,:pilot_kind,
                :pilot_client_visible,:idempotency_key,:actor_id,:actor_name,:actor_id,:actor_name
              ) on conflict(org_id,pilot_idempotency_key)
                where pilot_idempotency_key is not null
              do nothing returning *
            """), {"org_id": org_id, "reference": reference, "idempotency_key": idempotency_key,
                    "source_type": "IMPORT" if source_file_id else "MANUAL",
                    "source_entity_type": "KNOWLEDGE_FILE" if source_file_id else None,
                    "source_entity_id": source_file_id, "source_file_id": source_file_id,
                    "actor_id": actor_id, "actor_name": actor_name, **values}).fetchone()
            if row is None:
                entry_id = str(conn.execute(text("select id from knowledge_entries where org_id=:org_id and pilot_idempotency_key=:key"), {"org_id": org_id, "key": idempotency_key}).scalar_one())
                replayed = True
            else:
                item = _dict(row)
                core._snapshot(conn, item, "Création du brouillon", actor_id, actor_name)
                core._audit(conn, org_id, item["id"], "CREATED", actor_id, actor_name, new=item)
                core._replace_chunks(conn, item)
                entry_id = str(item["id"])
                if source_file_id:
                    conn.execute(text("""
                      update knowledge_files set import_status='IMPORTED',updated_at=now()
                      where org_id=:org_id and id=:source_file_id
                    """), {"org_id": org_id, "source_file_id": source_file_id})
    return detail(org_id, entry_id), replayed


def save_draft(org_id: str, entry_id: str, actor_id: str, actor_name: str, expected_version: int, data: dict) -> dict:
    values = _mapped(data); _validate(values)
    with engine.begin() as conn:
        current = core._entry(conn, org_id, entry_id, True)
        if current["status"] == "ARCHIVED":
            raise HTTPException(409, "pilot_knowledge_archived")
        if current["version"] != expected_version:
            raise HTTPException(409, "pilot_knowledge_version_conflict")
        if current["status"] == "PUBLISHED":
            conn.execute(text("""
              insert into pilot_knowledge_drafts(
                org_id,knowledge_id,subject,answer,kind,category,client_visible,language,review_due_at,
                base_version,idempotency_key,created_by,created_by_name,updated_by,updated_by_name
              ) values(
                :org_id,:entry_id,:title,:content,:pilot_kind,:category,:pilot_client_visible,:language,:review_due_at,
                :base_version,:idempotency_key,:actor_id,:actor_name,:actor_id,:actor_name
              ) on conflict(org_id,knowledge_id) do update set
                subject=excluded.subject,answer=excluded.answer,kind=excluded.kind,category=excluded.category,
                client_visible=excluded.client_visible,language=excluded.language,review_due_at=excluded.review_due_at,
                base_version=excluded.base_version,updated_by=:actor_id,updated_by_name=:actor_name,updated_at=now()
            """), {"org_id": org_id, "entry_id": entry_id, "base_version": expected_version, "idempotency_key": data.get("idempotency_key"), "actor_id": actor_id, "actor_name": actor_name, **values})
            core._audit(conn, org_id, entry_id, "PILOT_DRAFT_UPDATED", actor_id, actor_name, new={"subject": values["title"]})
        else:
            old = current
            row = conn.execute(text("""
              update knowledge_entries set title=:title,content=:content,knowledge_type=:knowledge_type,
                category=:category,language=:language,audiences=:audiences,ai_scope=:ai_scope,
                review_due_at=:review_due_at,pilot_kind=:pilot_kind,pilot_client_visible=:pilot_client_visible,
                status='DRAFT',version=version+1,updated_by=:actor_id,updated_by_name=:actor_name,updated_at=now()
              where org_id=:org_id and id=:entry_id and version=:base_version returning *
            """), {"org_id": org_id, "entry_id": entry_id, "base_version": expected_version, "actor_id": actor_id, "actor_name": actor_name, **values}).fetchone()
            item = _dict(row)
            core._snapshot(conn, item, "Modification du brouillon", actor_id, actor_name)
            core._audit(conn, org_id, entry_id, "UPDATED", actor_id, actor_name, old, item)
            core._replace_chunks(conn, item)
    return detail(org_id, entry_id)


def publish(org_id: str, entry_id: str, actor_id: str, actor_name: str, expected_version: int) -> dict:
    with engine.begin() as conn:
        old = core._entry(conn, org_id, entry_id, True)
        if old["status"] == "ARCHIVED":
            raise HTTPException(409, "pilot_knowledge_archived")
        if old["version"] != expected_version:
            raise HTTPException(409, "pilot_knowledge_version_conflict")
        draft = _dict(conn.execute(text("select * from pilot_knowledge_drafts where org_id=:org_id and knowledge_id=:entry_id for update"), {"org_id": org_id, "entry_id": entry_id}).fetchone())
        if draft and draft["base_version"] != expected_version:
            raise HTTPException(409, "pilot_knowledge_draft_outdated")
        source = {
            "subject": draft["subject"], "answer": draft["answer"], "kind": draft["kind"],
            "category": draft["category"], "client_visible": draft["client_visible"],
            "language": draft["language"], "review_due_at": draft["review_due_at"],
        } if draft else {
            "subject": old["title"], "answer": old["content"], "kind": old.get("pilot_kind") or "COMPANY_INFORMATION",
            "category": old["category"], "client_visible": old.get("pilot_client_visible", old["ai_scope"] in ("CLIENT", "BOTH")),
            "language": old["language"], "review_due_at": old.get("review_due_at"),
        }
        values = _mapped(source); _validate(values)
        row = conn.execute(text("""
          update knowledge_entries set title=:title,content=:content,knowledge_type=:knowledge_type,
            category=:category,language=:language,audiences=:audiences,ai_scope=:ai_scope,
            review_due_at=:review_due_at,pilot_kind=:pilot_kind,pilot_client_visible=:pilot_client_visible,
            status='PUBLISHED',approved_by=:actor_id,approved_at=now(),published_by=:actor_id,published_at=now(),
            version=version+1,updated_by=:actor_id,updated_by_name=:actor_name,updated_at=now()
          where org_id=:org_id and id=:entry_id returning *
        """), {"org_id": org_id, "entry_id": entry_id, "actor_id": actor_id, "actor_name": actor_name, **values}).fetchone()
        item = _dict(row)
        conn.execute(text("delete from pilot_knowledge_drafts where org_id=:org_id and knowledge_id=:entry_id"), {"org_id": org_id, "entry_id": entry_id})
        core._snapshot(conn, item, "Publication", actor_id, actor_name)
        core._audit(conn, org_id, entry_id, "PUBLISHED", actor_id, actor_name, old, item)
        core._replace_chunks(conn, item)
    return detail(org_id, entry_id)


def change_state(org_id: str, entry_id: str, actor_id: str, actor_name: str, action: str, expected_version: int) -> dict:
    if action not in {"unpublish", "archive", "restore"}:
        raise HTTPException(422, "pilot_knowledge_action_invalid")
    unchanged = False
    with engine.begin() as conn:
        old = core._entry(conn, org_id, entry_id, True)
        if old["version"] != expected_version:
            raise HTTPException(409, "pilot_knowledge_version_conflict")
        unchanged = (
            (action == "unpublish" and old["status"] != "PUBLISHED")
            or (action == "archive" and old["status"] == "ARCHIVED")
            or (action == "restore" and old["status"] != "ARCHIVED")
        )
        if not unchanged:
            target = "DRAFT" if action in {"unpublish", "restore"} else "ARCHIVED"
            extra = ",archived_by=:actor_id,archived_at=now()" if action == "archive" else ",archived_by=null,archived_at=null"
            row = conn.execute(text(f"""
              update knowledge_entries set status=:status,version=version+1,updated_by=:actor_id,
                updated_by_name=:actor_name,updated_at=now(){extra}
              where org_id=:org_id and id=:entry_id returning *
            """), {"status": target, "actor_id": actor_id, "actor_name": actor_name, "org_id": org_id, "entry_id": entry_id}).fetchone()
            item = _dict(row)
            core._snapshot(conn, item, {"unpublish": "Retrait de la publication", "archive": "Archivage", "restore": "Restauration"}[action], actor_id, actor_name)
            core._audit(conn, org_id, entry_id, action.upper(), actor_id, actor_name, old, item)
    return detail(org_id, entry_id)
