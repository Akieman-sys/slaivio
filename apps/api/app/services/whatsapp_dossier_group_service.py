from __future__ import annotations

from sqlalchemy import text

from app.db.database import engine
from app.services.whatsapp_qr_gateway_client import qr_gateway_request


def _context(org_id: str, dossier_id: str) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(text("""
          select d.id::text,d.dossier_reference,d.title,
                 to_jsonb(d)->>'whatsapp_group_jid' whatsapp_group_jid,
                 coalesce((to_jsonb(o)->>'whatsapp_group_on_dossier_create')::boolean,false) whatsapp_group_on_dossier_create,
                 connection.id::text connection_id
          from dossiers d
          join organizations o on o.id=d.org_id
          left join lateral (
            select id from whatsapp_qr_connections
            where org_id=d.org_id and status='CONNECTED'
            order by updated_at desc limit 1
          ) connection on true
          where d.org_id=:org_id and d.id=cast(:dossier_id as uuid)
        """), {"org_id": org_id, "dossier_id": dossier_id}).mappings().first()
        if not row:
            return None
        phones = conn.execute(text("""
          select distinct coalesce(c.whatsapp_phone,c.phone) phone
          from clients c
          where c.org_id=:org_id and c.deleted_at is null
            and coalesce(c.whatsapp_phone,c.phone) is not null
            and (
              c.id=(select client_id from dossiers where org_id=:org_id and id=cast(:dossier_id as uuid))
              or exists(select 1 from dossier_clients dc where dc.org_id=:org_id
                and dc.dossier_id=cast(:dossier_id as uuid) and dc.client_id=c.id and dc.archived_at is null)
            )
        """), {"org_id": org_id, "dossier_id": dossier_id}).scalars().all()
    return {**dict(row), "phones": [phone for phone in phones if phone]}


def sync_dossier_whatsapp_group(org_id: str, dossier_id: str) -> dict:
    context = _context(org_id, dossier_id)
    if not context or not context["whatsapp_group_on_dossier_create"]:
        return {"status": "disabled"}
    if not context["connection_id"]:
        _save_status(org_id, dossier_id, "FAILED", "whatsapp_connection_not_available")
        return {"status": "failed", "reason": "whatsapp_connection_not_available"}
    if not context["phones"]:
        _save_status(org_id, dossier_id, "WAITING_FOR_PARTICIPANT", None)
        return {"status": "waiting_for_participant"}
    try:
        if context["whatsapp_group_jid"]:
            result = qr_gateway_request("POST", f"/connections/{context['connection_id']}/groups/participants", {
                "group_jid": context["whatsapp_group_jid"], "participants": context["phones"],
            })
            _save_status(org_id, dossier_id, "CONNECTED", None)
        else:
            _save_status(org_id, dossier_id, "CREATING", None)
            subject = context["title"] or context["dossier_reference"] or "Dossier SLAIVIO"
            result = qr_gateway_request("POST", f"/connections/{context['connection_id']}/groups", {
                "subject": subject, "participants": context["phones"],
            })
            if not result.get("group_jid"):
                raise ValueError("whatsapp_group_creation_missing_id")
            with engine.begin() as conn:
                conn.execute(text("""
                  update dossiers set whatsapp_group_jid=:jid,whatsapp_group_status='CONNECTED',
                    whatsapp_group_created_at=coalesce(whatsapp_group_created_at,now()),
                    whatsapp_group_last_error=null,updated_at=now()
                  where org_id=:org_id and id=cast(:dossier_id as uuid)
                """), {"org_id": org_id, "dossier_id": dossier_id, "jid": result.get("group_jid")})
        return {"status": "connected", **result}
    except Exception as exc:
        _save_status(org_id, dossier_id, "FAILED", str(exc)[:500])
        return {"status": "failed", "reason": str(exc)}


def _save_status(org_id: str, dossier_id: str, status: str, error: str | None) -> None:
    with engine.begin() as conn:
        conn.execute(text("""
          update dossiers set whatsapp_group_status=:status,whatsapp_group_last_error=:error,updated_at=now()
          where org_id=:org_id and id=cast(:dossier_id as uuid)
        """), {"org_id": org_id, "dossier_id": dossier_id, "status": status, "error": error})
