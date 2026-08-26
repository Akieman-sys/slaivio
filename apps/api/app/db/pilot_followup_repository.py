import json
import re
from typing import Any

from sqlalchemy import text

from app.db.database import engine
from app.db import followup_repository


def _rows(result):
    return [dict(row._mapping) for row in result]


def _event(conn, org_id: str, batch_id: str, event_type: str, actor: str, payload: dict | None = None):
    conn.execute(text("""
        insert into pilot_followup_events(org_id,batch_id,event_type,actor_id,payload)
        values(:org_id,:batch_id,:event_type,:actor,cast(:payload as jsonb))
    """), {
        "org_id": org_id, "batch_id": batch_id, "event_type": event_type,
        "actor": actor, "payload": json.dumps(payload or {}, default=str),
    })


def _phone(value: str | None) -> str:
    return re.sub(r"[^0-9]", "", value or "")


def _render(body: str, client: dict, organization_name: str) -> str:
    values = {
        "{nom_client}": client.get("display_name") or "Client",
        "{reference_client}": client.get("client_reference") or "",
        "{reference_dossier}": client.get("dossier_reference") or "",
        "{nom_entreprise}": organization_name,
    }
    rendered = body
    for token, value in values.items():
        rendered = rendered.replace(token, value)
    return rendered.strip()


def options(org_id: str, q: str | None = None, limit: int = 40) -> dict:
    params = {"org_id": org_id, "q": f"%{(q or '').strip()}%", "limit": limit}
    query_filter = "" if not q else """and (
      coalesce(client.client_reference,'') ilike :q
      or coalesce(client.display_name,client.name,client.phone,'') ilike :q
      or coalesce(client.phone,'') ilike :q
    )"""
    dossier_filter = "" if not q else """and (
      coalesce(dossier.title,dossier.dossier_reference,dossier.tracking_id,'') ilike :q
      or exists (
        select 1 from dossier_clients relation_search
        join clients client_search on client_search.org_id=relation_search.org_id and client_search.id=relation_search.client_id
        where relation_search.org_id=dossier.org_id and relation_search.dossier_id=dossier.id and relation_search.archived_at is null
          and coalesce(client_search.display_name,client_search.name,client_search.phone,'') ilike :q
      )
    )"""
    with engine.connect() as conn:
        clients = _rows(conn.execute(text(f"""
          select client.id::text,client.client_reference,
            coalesce(client.display_name,client.name,client.phone,'Client') display_name,
            client.phone,client.email,client.customer_type,
            (select count(*)::int from dossier_clients relation
             where relation.org_id=client.org_id and relation.client_id=client.id and relation.archived_at is null) dossier_count
          from clients client
          where client.org_id=:org_id and client.deleted_at is null {query_filter}
          order by client.updated_at desc nulls last,client.created_at desc
          limit :limit
        """), params))
        dossiers = _rows(conn.execute(text(f"""
          select dossier.id::text,coalesce(dossier.title,dossier.dossier_reference,dossier.tracking_id,'Dossier') title,
            coalesce(dossier.dossier_reference,dossier.tracking_id) reference,
            count(relation.id)::int client_count,
            count(relation.id) filter(where coalesce(client.phone,'')<>'')::int reachable_count,
            dossier.updated_at
          from dossiers dossier
          left join dossier_clients relation on relation.org_id=dossier.org_id and relation.dossier_id=dossier.id and relation.archived_at is null
          left join clients client on client.org_id=relation.org_id and client.id=relation.client_id and client.deleted_at is null
          where dossier.org_id=:org_id and dossier.archived_at is null {dossier_filter}
          group by dossier.id
          order by dossier.updated_at desc nulls last,dossier.created_at desc
          limit :limit
        """), params))
    return {"clients": clients, "dossiers": dossiers}


def _audience(conn, org_id: str, client_ids: list[str], dossier_ids: list[str], excluded_ids: list[str]) -> dict:
    direct = set(str(value) for value in client_ids)
    params = {
        "org_id": org_id,
        "client_ids": list(direct),
        "dossier_ids": [str(value) for value in dossier_ids],
    }
    candidates = _rows(conn.execute(text("""
      with selected as (
        select client.id client_id,null::uuid dossier_id
        from clients client
        where client.org_id=:org_id and client.id=any(cast(:client_ids as uuid[])) and client.deleted_at is null
        union
        select relation.client_id,relation.dossier_id
        from dossier_clients relation
        join dossiers dossier on dossier.org_id=relation.org_id and dossier.id=relation.dossier_id and dossier.archived_at is null
        where relation.org_id=:org_id and relation.dossier_id=any(cast(:dossier_ids as uuid[])) and relation.archived_at is null
      )
      select client.id::text client_id,selected.dossier_id::text,
        coalesce(client.display_name,client.name,client.phone,'Client') display_name,
        client.client_reference,client.phone,
        coalesce(dossier.dossier_reference,dossier.tracking_id,dossier.title) dossier_reference
      from selected
      join clients client on client.org_id=:org_id and client.id=selected.client_id and client.deleted_at is null
      left join dossiers dossier on dossier.org_id=:org_id and dossier.id=selected.dossier_id
      order by client.updated_at desc nulls last,client.created_at desc
    """), params))
    excluded = set(str(value) for value in excluded_ids)
    chosen: dict[str, dict] = {}
    skipped: list[dict] = []
    for candidate in candidates:
        normalized = _phone(candidate.get("phone"))
        reason = None
        if candidate["client_id"] in excluded:
            reason = "Exclu de cette relance"
        elif not normalized:
            reason = "Téléphone manquant"
        elif normalized in chosen:
            reason = "Numéro déjà retenu pour un autre client"
        if reason:
            skipped.append({**candidate, "reason": reason})
            continue
        chosen[normalized] = {**candidate, "normalized_phone": normalized}
    return {"recipients": list(chosen.values()), "skipped": skipped}


def preview(org_id: str, client_ids: list[str], dossier_ids: list[str], excluded_ids: list[str]) -> dict:
    with engine.connect() as conn:
        audience = _audience(conn, org_id, client_ids, dossier_ids, excluded_ids)
    return {**audience, "recipient_count": len(audience["recipients"]), "skipped_count": len(audience["skipped"])}


def save_draft(org_id: str, actor: str, data: dict) -> tuple[dict, bool]:
    idempotency_key = data.get("idempotency_key")
    with engine.begin() as conn:
        if idempotency_key:
            existing = conn.execute(text("""
              select * from pilot_followup_batches where org_id=:org_id and idempotency_key=:idempotency_key
            """), {"org_id": org_id, "idempotency_key": idempotency_key}).mappings().first()
            if existing:
                return dict(existing), True
        row = dict(conn.execute(text("""
          insert into pilot_followup_batches(
            org_id,title,message,selected_client_ids,selected_dossier_ids,excluded_client_ids,
            idempotency_key,created_by,updated_by
          ) values(
            :org_id,:title,:message,cast(:client_ids as uuid[]),cast(:dossier_ids as uuid[]),
            cast(:excluded_ids as uuid[]),:idempotency_key,:actor,:actor
          ) returning *
        """), {
            "org_id": org_id, "title": data["title"].strip(), "message": data["message"].strip(),
            "client_ids": data.get("client_ids") or [], "dossier_ids": data.get("dossier_ids") or [],
            "excluded_ids": data.get("excluded_client_ids") or [], "idempotency_key": idempotency_key,
            "actor": actor,
        }).mappings().one())
        _event(conn, org_id, str(row["id"]), "DRAFT_CREATED", actor)
        return row, False


def confirm(org_id: str, batch_id: str, actor: str, expected_version: int) -> dict | None:
    with engine.begin() as conn:
        batch = conn.execute(text("""
          select * from pilot_followup_batches
          where org_id=:org_id and id=:batch_id and status='DRAFT' and row_version=:version
          for update
        """), {"org_id": org_id, "batch_id": batch_id, "version": expected_version}).mappings().first()
        if not batch:
            return None
        audience = _audience(conn, org_id, list(batch["selected_client_ids"] or []), list(batch["selected_dossier_ids"] or []), list(batch["excluded_client_ids"] or []))
        if not audience["recipients"]:
            raise ValueError("no_reachable_recipient")
        organization_name = conn.execute(text("select name from organizations where id=:org_id"), {"org_id": org_id}).scalar() or "Notre entreprise"
        for recipient in audience["recipients"]:
            rendered = _render(batch["message"], recipient, organization_name)
            conn.execute(text("""
              insert into pilot_followup_recipients(
                org_id,batch_id,client_id,dossier_id,normalized_phone,phone_snapshot,
                client_name_snapshot,client_reference_snapshot,dossier_reference_snapshot,rendered_message
              ) values(
                :org_id,:batch_id,:client_id,cast(:dossier_id as uuid),:normalized_phone,:phone,
                :display_name,:client_reference,:dossier_reference,:rendered_message
              ) on conflict(batch_id,normalized_phone) do nothing
            """), {"org_id": org_id, "batch_id": batch_id, "rendered_message": rendered, **recipient})
        row = dict(conn.execute(text("""
          update pilot_followup_batches set status='CONFIRMED',confirmed_at=now(),updated_at=now(),
            updated_by=:actor,row_version=row_version+1 where id=:batch_id returning *
        """), {"batch_id": batch_id, "actor": actor}).mappings().one())
        _event(conn, org_id, batch_id, "AUDIENCE_CONFIRMED", actor, {
            "recipients": len(audience["recipients"]), "skipped": len(audience["skipped"]),
        })
        return row


def send(org_id: str, batch_id: str, actor: str) -> dict | None:
    with engine.connect() as conn:
        batch = conn.execute(text("""
          select * from pilot_followup_batches where org_id=:org_id and id=:batch_id
        """), {"org_id": org_id, "batch_id": batch_id}).mappings().first()
        if not batch:
            return None
        if batch["status"] not in ("CONFIRMED", "QUEUED"):
            raise ValueError("batch_not_confirmed")
        recipients = _rows(conn.execute(text("""
          select * from pilot_followup_recipients
          where org_id=:org_id and batch_id=:batch_id and status='PENDING'
          order by created_at
        """), {"org_id": org_id, "batch_id": batch_id}))
        if not recipients and batch["status"] == "QUEUED":
            existing = conn.execute(text("""
              select count(*)::int from pilot_followup_recipients
              where org_id=:org_id and batch_id=:batch_id and status in('QUEUED','SENT','DELIVERED','READ','RESPONDED')
            """), {"org_id": org_id, "batch_id": batch_id}).scalar() or 0
            return {"batch_id": batch_id, "queued": existing, "failed": 0, "replayed": True}
    queued = failed = 0
    for recipient in recipients:
        try:
            task = followup_repository.create_manual_followup(org_id, actor, {
                "workspace_id": None,
                "client_id": str(recipient["client_id"]),
                "dossier_id": str(recipient["dossier_id"]) if recipient.get("dossier_id") else None,
                "followup_type": "PILOT_MANUAL",
                "subject_type": "CLIENT",
                "subject_id": str(recipient["client_id"]),
                "subject_reference": recipient.get("client_reference_snapshot"),
                "reason": batch["title"],
                "channel": "WHATSAPP",
                "message": recipient["rendered_message"],
                "due_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
                "priority": "NORMAL", "responsible_id": None, "responsible_name": None,
                "amount_context": None, "currency": None, "consent_type": "OPERATIONAL",
                "condition_snapshot": {"pilot_batch_id": batch_id},
                "idempotency_key": f"pilot:{batch_id}:{recipient['normalized_phone']}",
            })
            with engine.begin() as conn:
                links = {"batch_id": batch_id, "recipient_id": recipient["id"], "task_id": task["id"]}
                conn.execute(text("""
                  update followup_tasks set pilot_batch_id=:batch_id,pilot_recipient_id=:recipient_id where id=:task_id
                """), links)
                conn.execute(text("""
                  update pilot_followup_recipients set followup_task_id=:task_id,updated_at=now() where id=:recipient_id
                """), links)
            result = followup_repository.queue_followup(org_id, str(task["id"]), actor)
            if result == "closed":
                with engine.connect() as conn:
                    already_queued = conn.execute(text("""
                      select 1 from followup_tasks
                      where org_id=:org_id and id=:task_id
                        and status in('WAITING_RESPONSE','SENT','DELIVERED','READ','RESPONDED','ESCALATED')
                    """), {"org_id": org_id, "task_id": task["id"]}).first()
                if not already_queued:
                    raise ValueError("closed")
            if isinstance(result, dict) or result == "closed":
                with engine.begin() as conn:
                    conn.execute(text("update pilot_followup_recipients set status='QUEUED',updated_at=now() where id=:id"), {"id": recipient["id"]})
                queued += 1
            else:
                raise ValueError(str(result))
        except Exception as exc:
            with engine.begin() as conn:
                conn.execute(text("""
                  update pilot_followup_recipients set status='FAILED',error_message=:error,updated_at=now() where id=:id
                """), {"id": recipient["id"], "error": str(exc)[:500]})
            failed += 1
    with engine.begin() as conn:
        status = "QUEUED" if queued else "PARTIAL_FAILED"
        conn.execute(text("""
          update pilot_followup_batches set status=:status,queued_at=case when :queued>0 then now() else queued_at end,
            updated_at=now(),updated_by=:actor,row_version=row_version+1 where org_id=:org_id and id=:batch_id
        """), {"status": status, "queued": queued, "actor": actor, "org_id": org_id, "batch_id": batch_id})
        _event(conn, org_id, batch_id, "SEND_QUEUED", actor, {"queued": queued, "failed": failed})
    return {"batch_id": batch_id, "queued": queued, "failed": failed}


def _status_filter(view: str | None) -> tuple[str, dict]:
    mapping = {
        "drafts": "batch.status='DRAFT'", "confirm": "batch.status='CONFIRMED'",
        "pending": "batch.status='QUEUED'", "sent": "batch.status='COMPLETED'",
        "failed": "batch.status='PARTIAL_FAILED'",
    }
    return mapping.get(view or "", "true"), {}


def list_batches(org_id: str, view: str | None = None, q: str | None = None) -> dict:
    status_sql, params = _status_filter(view)
    params.update({"org_id": org_id, "q": f"%{(q or '').strip()}%"})
    q_sql = "" if not q else "and (batch.title ilike :q or batch.message ilike :q)"
    with engine.begin() as conn:
        conn.execute(text("""
          update pilot_followup_batches batch
          set status='COMPLETED',completed_at=coalesce(completed_at,now()),updated_at=now()
          where batch.org_id=:org_id and batch.status='QUEUED'
            and exists(select 1 from pilot_followup_recipients recipient where recipient.batch_id=batch.id)
            and not exists(
              select 1 from pilot_followup_recipients recipient
              left join followup_attempts attempt on attempt.followup_id=recipient.followup_task_id
              where recipient.batch_id=batch.id and (attempt.id is null or attempt.status not in('SENT','DELIVERED','READ'))
            )
        """), {"org_id": org_id})
        items = _rows(conn.execute(text(f"""
          select batch.*,
            count(recipient.id)::int recipient_count,
            count(recipient.id) filter(where coalesce(task.status,recipient.status) in ('WAITING_RESPONSE','SENT','DELIVERED','READ','RESPONDED'))::int sent_count,
            count(recipient.id) filter(where coalesce(task.status,recipient.status) in ('FAILED'))::int failed_count,
            count(recipient.id) filter(where coalesce(task.status,recipient.status) in ('RESPONDED','ESCALATED'))::int response_count
          from pilot_followup_batches batch
          left join pilot_followup_recipients recipient on recipient.org_id=batch.org_id and recipient.batch_id=batch.id
          left join followup_tasks task on task.org_id=recipient.org_id and task.id=recipient.followup_task_id
          where batch.org_id=:org_id and {status_sql} {q_sql}
          group by batch.id order by batch.updated_at desc limit 100
        """), params))
        stats = dict(conn.execute(text("""
          select count(*) filter(where status='DRAFT')::int drafts,
            count(*) filter(where status='CONFIRMED')::int to_confirm,
            count(*) filter(where status='QUEUED')::int pending,
            count(*) filter(where status='COMPLETED')::int completed,
            count(*) filter(where status='PARTIAL_FAILED')::int failed
          from pilot_followup_batches where org_id=:org_id
        """), {"org_id": org_id}).mappings().one())
        templates = _rows(conn.execute(text("""
          select * from pilot_followup_saved_messages where org_id=:org_id and active order by name
        """), {"org_id": org_id}))
    return {"items": items, "stats": stats, "templates": templates}


def detail(org_id: str, batch_id: str) -> dict | None:
    with engine.connect() as conn:
        batch = conn.execute(text("select * from pilot_followup_batches where org_id=:org_id and id=:batch_id"), {"org_id": org_id, "batch_id": batch_id}).mappings().first()
        if not batch:
            return None
        recipients = _rows(conn.execute(text("""
          select recipient.*,coalesce(attempt.status,task.status,recipient.status) delivery_status,task.response_classification
          from pilot_followup_recipients recipient
          left join followup_tasks task on task.org_id=recipient.org_id and task.id=recipient.followup_task_id
          left join lateral(
            select followup_attempt.status from followup_attempts followup_attempt
            where followup_attempt.org_id=recipient.org_id and followup_attempt.followup_id=recipient.followup_task_id
            order by followup_attempt.queued_at desc limit 1
          ) attempt on true
          where recipient.org_id=:org_id and recipient.batch_id=:batch_id order by recipient.client_name_snapshot
        """), {"org_id": org_id, "batch_id": batch_id}))
        events = _rows(conn.execute(text("select * from pilot_followup_events where org_id=:org_id and batch_id=:batch_id order by created_at desc"), {"org_id": org_id, "batch_id": batch_id}))
    return {**dict(batch), "recipients": recipients, "events": events}


def save_message(org_id: str, actor: str, name: str, body: str) -> dict:
    with engine.begin() as conn:
        return dict(conn.execute(text("""
          insert into pilot_followup_saved_messages(org_id,name,body,created_by,updated_by)
          values(:org_id,:name,:body,:actor,:actor)
          on conflict(org_id,name) do update set body=excluded.body,active=true,updated_by=:actor,updated_at=now()
          returning *
        """), {"org_id": org_id, "name": name.strip(), "body": body.strip(), "actor": actor}).mappings().one())


def suggest_message(org_id: str, purpose: str, current_message: str | None = None) -> dict:
    from app.ai.providers.provider_factory import get_provider
    from app.ai.repositories.ai_settings_repository import get_ai_settings

    with engine.connect() as conn:
        organization_name = conn.execute(text("select name from organizations where id=:org_id"), {"org_id": org_id}).scalar() or "Notre entreprise"
    settings = get_ai_settings(org_id)
    instruction = f"""Tu aides {organization_name} à rédiger une relance WhatsApp professionnelle et humaine.
Rédige un message court en français. Utilise {{nom_client}} pour le nom du destinataire.
N'ajoute aucun prix, délai, promesse, statut ou fait qui n'est pas fourni.
N'invente aucune information sur un dossier. Ne donne aucune instruction interne.
Objectif de la relance : {purpose.strip()}
Message déjà commencé : {(current_message or '').strip() or '[aucun]'}
Retourne uniquement le message final."""
    try:
        result = get_provider(settings.get("provider") or "MISTRAL").generate(
            messages=[{"role": "system", "content": instruction}],
            model_name=settings.get("model_name") or "mistral-large-latest",
            temperature=min(float(settings.get("temperature") or 0.2), 0.3),
            max_tokens=350,
        )
    except Exception:
        result = {"success": False}
    if result.get("success") and result.get("content"):
        return {"message": result["content"].strip(), "generated": True}
    fallback = (current_message or "").strip() or f"Bonjour {{nom_client}}, {organization_name} revient vers vous concernant {purpose.strip().lower()}. Merci de nous répondre directement sur WhatsApp."
    return {"message": fallback, "generated": False, "reason": "ai_provider_unavailable"}
