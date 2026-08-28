import json

from sqlalchemy import text

from app.db.database import engine


def enqueue_wazzap_event(
    *,
    event_key: str,
    provider_event_id: str | None,
    agent_id: str,
    provider_organization_id: str | None,
    org_id: str | None,
    whatsapp_number_id: str | None,
    event_type: str,
    payload: dict,
) -> tuple[dict | None, bool]:
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into wazzap_webhook_events (
                    event_key, provider_event_id, agent_id,
                    provider_organization_id, org_id, whatsapp_number_id,
                    event_type, payload
                ) values (
                    :event_key, :provider_event_id, :agent_id,
                    :provider_organization_id, :org_id, :whatsapp_number_id,
                    :event_type, cast(:payload as jsonb)
                )
                on conflict (event_key) do nothing
                returning *
            """),
            {
                "event_key": event_key,
                "provider_event_id": provider_event_id,
                "agent_id": agent_id,
                "provider_organization_id": provider_organization_id,
                "org_id": org_id,
                "whatsapp_number_id": whatsapp_number_id,
                "event_type": event_type,
                "payload": json.dumps(payload),
            },
        ).fetchone()
        conn.commit()

    if row:
        return dict(row._mapping), True
    return get_wazzap_event(event_key=event_key), False


def get_wazzap_event(*, event_key: str) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(
            text("select * from wazzap_webhook_events where event_key=:event_key"),
            {"event_key": event_key},
        ).fetchone()
    return dict(row._mapping) if row else None


def list_claimable_wazzap_event_keys(
    *,
    limit: int = 100,
    max_attempts: int = 5,
    lease_seconds: int = 900,
) -> list[str]:
    safe_limit = max(1, min(limit, 500))
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select event_key
                from wazzap_webhook_events
                where attempts < :max_attempts
                  and (
                    status in ('PENDING','FAILED')
                    or (
                      status='PROCESSING'
                      and processing_started_at < now() - make_interval(secs => :lease_seconds)
                    )
                  )
                order by received_at, event_key
                limit :limit
            """),
            {
                "limit": safe_limit,
                "max_attempts": max_attempts,
                "lease_seconds": lease_seconds,
            },
        ).fetchall()
    return [str(row.event_key) for row in rows]


def claim_wazzap_event(
    *,
    event_key: str,
    max_attempts: int = 5,
    lease_seconds: int = 900,
) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                update wazzap_webhook_events
                set status='PROCESSING', attempts=attempts+1,
                    processing_started_at=now(), updated_at=now(), last_error=null
                where event_key=:event_key
                  and (
                    status in ('PENDING','FAILED')
                    or (
                      status='PROCESSING'
                      and processing_started_at < now() - make_interval(secs => :lease_seconds)
                    )
                  )
                  and attempts < :max_attempts
                returning *
            """),
            {
                "event_key": event_key,
                "max_attempts": max_attempts,
                "lease_seconds": lease_seconds,
            },
        ).fetchone()
        conn.commit()
    return dict(row._mapping) if row else None


def mark_wazzap_event_processed(*, event_key: str) -> None:
    _finish_wazzap_event(event_key=event_key, status="PROCESSED")


def mark_wazzap_event_ignored(*, event_key: str, reason: str) -> None:
    _finish_wazzap_event(event_key=event_key, status="IGNORED", error=reason)


def mark_wazzap_event_failed(*, event_key: str, error: str) -> None:
    _finish_wazzap_event(event_key=event_key, status="FAILED", error=error)


def _finish_wazzap_event(*, event_key: str, status: str, error: str | None = None) -> None:
    with engine.connect() as conn:
        conn.execute(
            text("""
                update wazzap_webhook_events
                set status=:status, last_error=:error,
                    processed_at=case when :status in ('PROCESSED','IGNORED')
                        then now() else processed_at end,
                    updated_at=now()
                where event_key=:event_key
            """),
            {"event_key": event_key, "status": status, "error": error},
        )
        conn.commit()
