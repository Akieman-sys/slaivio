from __future__ import annotations

import json

from fastapi import HTTPException
from sqlalchemy import text

from app.db.database import engine
from app.core.config import settings


def get_connection(org_id: str, connection_id: str | None = None) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(text("""
          select id::text,org_id,whatsapp_number_id::text,status,linked_jid,
                 display_phone_number,verified_name,qr_generation,qr_expires_at,
                 last_connected_at,last_disconnected_at,last_error,row_version,
                 terms_accepted_at,created_at,updated_at
          from whatsapp_qr_connections
          where org_id=:org_id
            and (:connection_id is null or id=cast(:connection_id as uuid))
            and status<>'REVOKED'
          order by updated_at desc limit 1
        """), {"org_id": org_id, "connection_id": connection_id}).mappings().first()
    return dict(row) if row else None


def create_or_restart_connection(org_id: str, actor_id: str, terms_accepted: bool) -> dict:
    if not terms_accepted:
        raise HTTPException(422, "pilot_whatsapp_qr_terms_required")
    with engine.begin() as conn:
        conn.execute(text("select pg_advisory_xact_lock(hashtext('whatsapp_qr_pilot_cohort'))"))
        conn.execute(text("select pg_advisory_xact_lock(hashtext(:key))"), {"key": f"qr:{org_id}"})
        existing = conn.execute(text("""
          select id::text from whatsapp_qr_connections
          where org_id=:org_id and status not in('LOGGED_OUT','REVOKED')
          order by created_at desc limit 1 for update
        """), {"org_id": org_id}).scalar()
        if existing:
            row = conn.execute(text("""
              update whatsapp_qr_connections set status='CONNECTING',last_error=null,
                qr_expires_at=null,updated_by=:actor,row_version=row_version+1,updated_at=now()
              where id=cast(:id as uuid)
              returning id::text,org_id,status,row_version,terms_accepted_at
            """), {"id": existing, "actor": actor_id}).mappings().one()
        else:
            active_organizations = conn.execute(text("""
              select count(distinct org_id) from whatsapp_qr_connections
              where status not in('LOGGED_OUT','REVOKED')
            """)).scalar_one()
            if active_organizations >= settings.whatsapp_qr_pilot_max_organizations:
                raise HTTPException(409, "pilot_whatsapp_qr_cohort_full")
            row = conn.execute(text("""
              insert into whatsapp_qr_connections(
                org_id,status,terms_accepted_at,terms_accepted_by,created_by
              ) values(:org_id,'CONNECTING',now(),:actor,:actor)
              returning id::text,org_id,status,row_version,terms_accepted_at
            """), {"org_id": org_id, "actor": actor_id}).mappings().one()
    return dict(row)


def update_connection_from_gateway(connection_id: str, org_id: str, event_type: str, payload: dict) -> dict:
    status_by_event = {
        "QR_READY": "QR_READY", "CONNECTING": "CONNECTING", "CONNECTED": "CONNECTED",
        "DISCONNECTED": "DISCONNECTED", "LOGGED_OUT": "LOGGED_OUT", "FAILED": "FAILED",
    }
    status = status_by_event.get(event_type)
    with engine.begin() as conn:
        row = conn.execute(text("""
          update whatsapp_qr_connections set
            status=coalesce(:status,status),
            linked_jid=coalesce(:linked_jid,linked_jid),
            display_phone_number=coalesce(:phone,display_phone_number),
            verified_name=coalesce(:name,verified_name),
            qr_generation=qr_generation+(case when :event_type='QR_READY' then 1 else 0 end),
            qr_expires_at=case when :event_type='QR_READY' then now()+interval '55 seconds' else qr_expires_at end,
            last_connected_at=case when :event_type='CONNECTED' then now() else last_connected_at end,
            last_disconnected_at=case when :event_type in('DISCONNECTED','LOGGED_OUT') then now() else last_disconnected_at end,
            last_error=case when :event_type='FAILED' then :error when :event_type='CONNECTED' then null else last_error end,
            row_version=row_version+1,updated_at=now()
          where id=cast(:id as uuid) and org_id=:org_id
          returning id::text,org_id,status,linked_jid,display_phone_number,verified_name,
                    whatsapp_number_id::text,row_version,updated_at
        """), {
            "id": connection_id, "org_id": org_id, "status": status,
            "linked_jid": payload.get("linked_jid"), "phone": payload.get("phone_number"),
            "name": payload.get("verified_name"), "event_type": event_type,
            "error": str(payload.get("error") or "")[:500] or None,
        }).mappings().first()
    if not row:
        raise HTTPException(404, "pilot_whatsapp_qr_connection_not_found")
    return dict(row)


def link_number(connection_id: str, org_id: str, number_id: str) -> None:
    with engine.begin() as conn:
        conn.execute(text("""
          update whatsapp_qr_connections set whatsapp_number_id=cast(:number_id as uuid),updated_at=now()
          where id=cast(:id as uuid) and org_id=:org_id
        """), {"id": connection_id, "org_id": org_id, "number_id": number_id})


def disable_linked_number(connection_id: str, org_id: str, status: str) -> None:
    with engine.begin() as conn:
        was_default = conn.execute(text("""
          select number.is_default
          from whatsapp_qr_connections connection
          join organization_whatsapp_numbers number on number.id=connection.whatsapp_number_id
          where connection.id=cast(:id as uuid) and connection.org_id=:org_id
        """), {"id": connection_id, "org_id": org_id}).scalar()
        conn.execute(text("""
          update organization_whatsapp_numbers number
          set connection_status=:status,is_active=false,is_default=false,last_sync_at=now(),updated_at=now()
          from whatsapp_qr_connections connection
          where connection.id=cast(:id as uuid) and connection.org_id=:org_id
            and number.id=connection.whatsapp_number_id and number.org_id=connection.org_id
        """), {"id": connection_id, "org_id": org_id, "status": status})
        if was_default:
            conn.execute(text("""
              update organization_whatsapp_numbers set is_default=true,updated_at=now()
              where id=(
                select id from organization_whatsapp_numbers
                where org_id=:org_id and is_active=true and connection_status='CONNECTED'
                order by case when upper(provider)='META' then 0 else 1 end,last_sync_at desc nulls last
                limit 1
              )
            """), {"org_id": org_id})


def store_event(org_id: str, connection_id: str, event_key: str, event_type: str, payload: dict) -> bool:
    with engine.begin() as conn:
        row = conn.execute(text("""
          insert into whatsapp_qr_events(org_id,connection_id,event_key,event_type,payload)
          values(:org_id,cast(:connection_id as uuid),:event_key,:event_type,cast(:payload as jsonb))
          on conflict(org_id,event_key) do nothing returning id
        """), {"org_id": org_id, "connection_id": connection_id, "event_key": event_key,
                 "event_type": event_type, "payload": json.dumps(payload)}).first()
    return bool(row)


def finish_event(org_id: str, event_key: str, status: str, error: str | None = None) -> None:
    with engine.begin() as conn:
        conn.execute(text("""
          update whatsapp_qr_events set status=:status,attempts=attempts+1,last_error=:error,
            processed_at=case when :status in('PROCESSED','IGNORED') then now() else null end
          where org_id=:org_id and event_key=:event_key
        """), {"org_id": org_id, "event_key": event_key, "status": status, "error": error})


def revoke_connection(org_id: str, connection_id: str, actor_id: str) -> dict:
    with engine.begin() as conn:
        row = conn.execute(text("""
          update whatsapp_qr_connections set status='REVOKED',updated_by=:actor,
            row_version=row_version+1,updated_at=now()
          where org_id=:org_id and id=cast(:id as uuid) and status<>'REVOKED'
          returning id::text,status,whatsapp_number_id::text
        """), {"org_id": org_id, "id": connection_id, "actor": actor_id}).mappings().first()
        if row and row["whatsapp_number_id"]:
            conn.execute(text("""
              update organization_whatsapp_numbers set is_active=false,is_default=false,
                connection_status='DISCONNECTED',updated_at=now()
              where org_id=:org_id and id=cast(:id as uuid)
            """), {"org_id": org_id, "id": row["whatsapp_number_id"]})
        if row:
            conn.execute(
                text("delete from whatsapp_qr_auth_state where connection_id=cast(:id as uuid)"),
                {"id": connection_id},
            )
    if not row:
        raise HTTPException(404, "pilot_whatsapp_qr_connection_not_found")
    return dict(row)
