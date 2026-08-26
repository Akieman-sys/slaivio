import json

from sqlalchemy import text

from app.db.database import engine


DEFAULT_MODE = "SUGGESTION_ONLY"


def get_pilot_ai_settings(org_id: str) -> dict:
    with engine.begin() as conn:
        conn.execute(text("insert into ai_settings(org_id) values(:org_id) on conflict(org_id) do nothing"), {"org_id": org_id})
        row = conn.execute(text("""
          select enabled, provider, model_name, temperature, max_tokens,
                 auto_reply_min_confidence, pilot_response_mode,
                 pilot_require_published_knowledge, updated_at
          from ai_settings where org_id=:org_id
        """), {"org_id": org_id}).mappings().one()
        return dict(row)


def update_pilot_ai_settings(org_id: str, mode: str, actor_id: str) -> dict:
    with engine.begin() as conn:
        conn.execute(text("insert into ai_settings(org_id) values(:org_id) on conflict(org_id) do nothing"), {"org_id": org_id})
        previous_mode = conn.execute(text("""
          select pilot_response_mode from ai_settings
          where org_id=:org_id for update
        """), {"org_id": org_id}).scalar_one()
        row = conn.execute(text("""
          update ai_settings
          set pilot_response_mode=:mode,
              auto_reply_enabled=(:mode = 'CONTROLLED_AUTO'),
              enabled=case when :mode = 'PAUSED' then enabled else true end,
              pilot_updated_by=:actor_id,
              updated_at=now()
          where org_id=:org_id
          returning enabled, provider, model_name, temperature, max_tokens,
                    auto_reply_min_confidence, pilot_response_mode,
                    pilot_require_published_knowledge, updated_at
        """), {"org_id": org_id, "mode": mode, "actor_id": actor_id}).mappings().one()
        if previous_mode != mode:
            conn.execute(text("""
              insert into pilot_inbox_ai_setting_events(org_id,previous_mode,new_mode,actor_id)
              values(:org_id,:previous_mode,:new_mode,:actor_id)
            """), {
                "org_id": org_id, "previous_mode": previous_mode,
                "new_mode": mode, "actor_id": actor_id,
            })
        return dict(row)


def conversation_ai_context(org_id: str, client_phone: str) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(text("""
          select assignment.client_id, assignment.dossier_id,
                 coalesce(client.display_name, client.name) client_name,
                 client.preferred_language,
                 client.client_reference,
                 dossier.dossier_reference, dossier.title dossier_title,
                 organization.name organization_name,
                 message.id source_message_id,
                 message.text_body source_message,
                 message.created_at source_message_at
          from conversation_assignments assignment
          join organizations organization on organization.id=assignment.org_id
          left join clients client
            on client.org_id=assignment.org_id and client.id=assignment.client_id
          left join dossiers dossier
            on dossier.org_id=assignment.org_id and dossier.id=assignment.dossier_id
          left join lateral (
            select candidate.id, candidate.text_body, candidate.created_at
            from messages candidate
            where candidate.org_id=assignment.org_id
              and candidate.from_phone=assignment.client_phone
              and candidate.direction='inbound'
            order by candidate.created_at desc
            limit 1
          ) message on true
          where assignment.org_id=:org_id and assignment.client_phone=:phone
        """), {"org_id": org_id, "phone": client_phone}).mappings().first()
        if not row:
            return None
        context = dict(row)
        context["recent_messages"] = [dict(item) for item in conn.execute(text("""
          select direction, text_body, created_at
          from (
            select direction, text_body, created_at
            from messages
            where org_id=:org_id and (from_phone=:phone or to_phone=:phone)
            order by created_at desc limit 12
          ) recent order by created_at
        """), {"org_id": org_id, "phone": client_phone}).mappings()]
        return context


def log_ai_run(
    *, org_id: str, client_phone: str, event_key: str, response_mode: str,
    outcome: str, client_id=None, dossier_id=None, source_message_id=None,
    intent=None, confidence=None, risk_level="REVIEW", reason=None,
    source_ids=None, draft_id=None, outbound_message_id=None, metadata=None,
) -> dict:
    with engine.begin() as conn:
        row = conn.execute(text("""
          insert into pilot_inbox_ai_runs(
            org_id,client_phone,client_id,dossier_id,source_message_id,event_key,
            response_mode,outcome,intent,confidence,risk_level,reason,source_ids,
            draft_id,outbound_message_id,metadata
          ) values(
            :org_id,:client_phone,cast(:client_id as uuid),cast(:dossier_id as uuid),
            cast(:source_message_id as uuid),:event_key,:response_mode,:outcome,
            :intent,:confidence,:risk_level,:reason,cast(:source_ids as uuid[]),
            cast(:draft_id as uuid),cast(:outbound_message_id as uuid),cast(:metadata as jsonb)
          )
          on conflict(org_id,event_key) do update set
            outcome=excluded.outcome, intent=excluded.intent,
            confidence=excluded.confidence, risk_level=excluded.risk_level,
            reason=excluded.reason, source_ids=excluded.source_ids,
            draft_id=coalesce(pilot_inbox_ai_runs.draft_id,excluded.draft_id),
            outbound_message_id=coalesce(pilot_inbox_ai_runs.outbound_message_id,excluded.outbound_message_id),
            metadata=pilot_inbox_ai_runs.metadata || excluded.metadata
          returning *
        """), {
            "org_id": org_id, "client_phone": client_phone,
            "client_id": client_id, "dossier_id": dossier_id,
            "source_message_id": source_message_id, "event_key": event_key,
            "response_mode": response_mode, "outcome": outcome,
            "intent": intent, "confidence": confidence,
            "risk_level": risk_level, "reason": reason,
            "source_ids": source_ids or [], "draft_id": draft_id,
            "outbound_message_id": outbound_message_id,
            "metadata": json.dumps(metadata or {}, default=str),
        }).mappings().one()
        return dict(row)


def get_ai_run(org_id: str, event_key: str) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(text("""
          select * from pilot_inbox_ai_runs
          where org_id=:org_id and event_key=:event_key
        """), {"org_id": org_id, "event_key": event_key}).mappings().first()
        return dict(row) if row else None


def list_conversation_ai_runs(org_id: str, client_phone: str, limit: int = 20) -> list[dict]:
    with engine.connect() as conn:
        return [dict(row) for row in conn.execute(text("""
          select id,response_mode,outcome,intent,confidence,risk_level,reason,
                 source_ids,draft_id,outbound_message_id,created_at
          from pilot_inbox_ai_runs
          where org_id=:org_id and client_phone=:phone
          order by created_at desc limit :limit
        """), {"org_id": org_id, "phone": client_phone, "limit": min(limit, 50)}).mappings()]
