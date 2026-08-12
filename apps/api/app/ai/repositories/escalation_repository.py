from sqlalchemy import text

from app.db.database import engine


def list_ai_escalation_events(org_id: str, limit: int = 30):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select *
                from ai_escalation_events
                where org_id = :org_id
                order by created_at desc
                limit :limit
            """),
            {"org_id": org_id, "limit": min(max(limit, 1), 100)},
        ).fetchall()

        return [dict(row._mapping) for row in rows]


def log_escalation_event(
    org_id: str,
    client_phone: str | None,
    message: str,
    intent: str,
    escalation_score: float,
    escalation_reason: str,
    triggered_rules: list[str],
    decision: str,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into ai_escalation_events (
                    org_id,
                    client_phone,
                    message,
                    intent,
                    escalation_score,
                    escalation_reason,
                    triggered_rules,
                    decision
                )
                values (
                    :org_id,
                    :client_phone,
                    :message,
                    :intent,
                    :escalation_score,
                    :escalation_reason,
                    :triggered_rules,
                    :decision
                )
                returning *
            """),
            {
                "org_id": org_id,
                "client_phone": client_phone,
                "message": message,
                "intent": intent,
                "escalation_score": escalation_score,
                "escalation_reason": escalation_reason,
                "triggered_rules": triggered_rules,
                "decision": decision,
            },
        ).fetchone()

        conn.commit()
        return dict(row._mapping)
