from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import text

from app.db.database import engine
from app.organization_admin import repository as administration


def _dict(row):
    return dict(row._mapping) if row else None


def overview(org_id: str) -> dict:
    with engine.begin() as conn:
        conn.execute(
            text("insert into knowledge_settings(org_id) values(:org_id) on conflict(org_id) do nothing"),
            {"org_id": org_id},
        )
        conn.execute(
            text("insert into ai_settings(org_id) values(:org_id) on conflict(org_id) do nothing"),
            {"org_id": org_id},
        )
        organization = _dict(conn.execute(text("""
          select id,coalesce(organization_name,name) organization_name,legal_name,
                 country,city,address,phone,email,website,logo_url,row_version
          from organizations where id=:org_id
        """), {"org_id": org_id}).fetchone())
        responsible = _dict(conn.execute(text("""
          select id::text,member_display_name,member_email,role_code,status,last_seen_at
          from organization_memberships
          where org_id=:org_id and status='ACTIVE'
          order by case role_code when 'OWNER' then 0 when 'MANAGER' then 1 else 2 end,
                   created_at
          limit 1
        """), {"org_id": org_id}).fetchone())
        numbering = [dict(row._mapping) for row in conn.execute(text("""
          select document_type,prefix_format,next_number,row_version,updated_at
          from document_numbering_settings
          where org_id=:org_id and document_type in('CLIENT','DOSSIER')
          order by case document_type when 'CLIENT' then 0 else 1 end
        """), {"org_id": org_id}).fetchall()]
        numbers = [dict(row._mapping) for row in conn.execute(text("""
          select id::text,display_phone_number,verified_name,connection_status,
                 quality_rating,is_default,last_sync_at
          from organization_whatsapp_numbers
          where org_id=:org_id and is_active=true
          order by is_default desc,created_at desc
        """), {"org_id": org_id}).fetchall()]
        ai = _dict(conn.execute(text("""
          select pilot_response_mode,pilot_require_published_knowledge,updated_at
          from ai_settings where org_id=:org_id
        """), {"org_id": org_id}).fetchone())
        knowledge = _dict(conn.execute(text("""
          select settings.default_language,settings.pilot_default_review_days,
                 settings.pilot_row_version,
                 count(entry.id) filter(where entry.status='PUBLISHED')::int published_count,
                 count(entry.id) filter(where entry.status<>'PUBLISHED' and entry.status<>'ARCHIVED')::int draft_count,
                 count(entry.id) filter(where entry.status='PUBLISHED'
                   and entry.ai_scope in('CLIENT','BOTH') and entry.sensitive=false
                   and (entry.expires_at is null or entry.expires_at>now())
                   and (entry.review_due_at is null or entry.review_due_at>now()))::int whatsapp_ready_count
          from knowledge_settings settings
          left join knowledge_entries entry on entry.org_id=settings.org_id
          where settings.org_id=:org_id
          group by settings.id
        """), {"org_id": org_id}).fetchone())
    if not organization:
        raise HTTPException(404, "pilot_organization_not_found")
    return {
        "organization": organization,
        "responsible": responsible,
        "numbering": numbering,
        "whatsapp_numbers": numbers,
        "ai": ai,
        "knowledge": knowledge,
    }


def select_whatsapp_number(org_id: str, actor_id: str, number_id: str) -> dict:
    with engine.begin() as conn:
        selected = conn.execute(text("""
          select id,display_phone_number,verified_name,connection_status,is_default
          from organization_whatsapp_numbers
          where org_id=:org_id and id=:number_id and is_active=true
          for update
        """), {"org_id": org_id, "number_id": number_id}).mappings().first()
        if not selected:
            raise HTTPException(404, "pilot_whatsapp_number_not_found")
        if selected["connection_status"] != "CONNECTED":
            raise HTTPException(409, "pilot_whatsapp_number_not_connected")
        if not selected["is_default"]:
            conn.execute(
                text("update organization_whatsapp_numbers set is_default=false,updated_at=now() where org_id=:org_id and is_default=true"),
                {"org_id": org_id},
            )
            row = conn.execute(text("""
              update organization_whatsapp_numbers
              set is_default=true,number_role='SUPPORT',updated_at=now()
              where org_id=:org_id and id=:number_id
              returning id::text,display_phone_number,verified_name,connection_status,
                        quality_rating,is_default,last_sync_at
            """), {"org_id": org_id, "number_id": number_id}).mappings().one()
            administration._audit(
                conn, org_id, actor_id, "PILOT_WHATSAPP_NUMBER_SELECTED",
                "whatsapp_number", number_id, dict(selected), dict(row),
            )
            return dict(row)
        return dict(selected)


def save_knowledge_defaults(
    org_id: str,
    actor_id: str,
    default_language: str,
    default_review_days: int,
    expected_version: int,
) -> dict:
    with engine.begin() as conn:
        old = conn.execute(text("""
          select default_language,pilot_default_review_days,pilot_row_version
          from knowledge_settings where org_id=:org_id for update
        """), {"org_id": org_id}).mappings().first()
        if not old:
            raise HTTPException(404, "pilot_knowledge_settings_not_found")
        row = conn.execute(text("""
          update knowledge_settings
          set default_language=:default_language,
              pilot_default_review_days=:default_review_days,
              pilot_row_version=pilot_row_version+1,
              updated_by=:actor_id,updated_at=now()
          where org_id=:org_id and pilot_row_version=:expected_version
          returning default_language,pilot_default_review_days,pilot_row_version,updated_at
        """), {
            "org_id": org_id,
            "actor_id": actor_id,
            "default_language": default_language,
            "default_review_days": default_review_days,
            "expected_version": expected_version,
        }).mappings().first()
        if not row:
            raise HTTPException(409, "pilot_knowledge_settings_modified")
        administration._audit(
            conn, org_id, actor_id, "PILOT_KNOWLEDGE_DEFAULTS_UPDATED",
            "knowledge_settings", org_id, dict(old), dict(row),
        )
        return dict(row)
