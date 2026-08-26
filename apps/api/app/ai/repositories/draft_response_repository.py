import json

from sqlalchemy import text

from app.db.database import engine


def create_ai_draft(
    org_id: str,
    client_phone: str,
    source_message: str,
    draft_text: str,
    intent: str | None = None,
    decision: str | None = None,
    manager_id: str | None = None,
    manager_name: str | None = None,
    source_message_id: str | None = None,
    source_ids: list[str] | None = None,
    confidence: float | None = None,
    risk_level: str = "REVIEW",
    review_reason: str | None = None,
    context_snapshot: dict | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into ai_draft_responses (
                    org_id,
                    client_phone,
                    source_message,
                    intent,
                    decision,
                    draft_text,
                    manager_id,
                    manager_name,
                    source_message_id,
                    source_ids,
                    confidence,
                    risk_level,
                    review_reason,
                    context_snapshot
                )
                values (
                    :org_id,
                    :client_phone,
                    :source_message,
                    :intent,
                    :decision,
                    :draft_text,
                    :manager_id,
                    :manager_name,
                    cast(:source_message_id as uuid),
                    cast(:source_ids as uuid[]),
                    :confidence,
                    :risk_level,
                    :review_reason,
                    cast(:context_snapshot as jsonb)
                )
                returning *
            """),
            {
                "org_id": org_id,
                "client_phone": client_phone,
                "source_message": source_message,
                "intent": intent,
                "decision": decision,
                "draft_text": draft_text,
                "manager_id": manager_id,
                "manager_name": manager_name,
                "source_message_id": source_message_id,
                "source_ids": source_ids or [],
                "confidence": confidence,
                "risk_level": risk_level,
                "review_reason": review_reason,
                "context_snapshot": json.dumps(context_snapshot or {}, default=str),
            },
        ).fetchone()

        conn.commit()
        return dict(row._mapping)


def mark_ai_draft_used(draft_id: str, org_id: str):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                update ai_draft_responses
                set
                    status = 'USED',
                    updated_at = now()
                where id = :draft_id
                  and org_id = :org_id
                returning *
            """),
            {
                "draft_id": draft_id,
                "org_id": org_id,
            },
        ).fetchone()

        conn.commit()
        return dict(row._mapping) if row else None


def list_ai_drafts(
    org_id: str,
    client_phone: str,
):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select draft.*,
                       coalesce(array(
                         select entry.title from knowledge_entries entry
                         where entry.org_id=draft.org_id and entry.id=any(draft.source_ids)
                       ), '{}') source_titles
                from ai_draft_responses draft
                where draft.org_id = :org_id
                  and client_phone = :client_phone
                order by created_at desc
                limit 20
            """),
            {
                "org_id": org_id,
                "client_phone": client_phone,
            },
        ).fetchall()

        return [dict(row._mapping) for row in rows]

