from sqlalchemy import text
from app.db.database import engine
from app.core.config import settings
import json



def create_notification_outbox(
    org_id: str,
    client_id: str,
    dossier_id: str,
    recipient_phone: str,
    notification_type: str,
    message: str,
    channel: str = "whatsapp",
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                insert into notification_outbox (
                    org_id,
                    client_id,
                    dossier_id,
                    channel,
                    recipient_phone,
                    notification_type,
                    message
                )
                values (
                    :org_id,
                    :client_id,
                    :dossier_id,
                    :channel,
                    :recipient_phone,
                    :notification_type,
                    :message
                )
                returning *
            """),
            {
                "org_id": org_id,
                "client_id": client_id,
                "dossier_id": dossier_id,
                "channel": channel,
                "recipient_phone": recipient_phone,
                "notification_type": notification_type,
                "message": message,
            },
        )

        conn.commit()

        row = result.fetchone()

        return dict(row._mapping) if row else None


def list_pending_notifications(
    org_id: str,
    limit: int = 20,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select
                    id,
                    org_id,
                    client_id,
                    dossier_id,
                    channel,
                    recipient_phone,
                    notification_type,
                    message,
                    status,
                    provider,
                    provider_message_id,
                    error_message,
                    created_at,
                    sent_at,
                    failed_at
                from notification_outbox
                where org_id = :org_id
                  and status = 'PENDING'
                order by created_at asc
                limit :limit
            """),
            {
                "org_id": org_id,
                "limit": limit,
            },
        )

        return [dict(row._mapping) for row in result.fetchall()]


def get_notification_by_id(
    org_id: str,
    notification_id: str,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select *
                from notification_outbox
                where org_id = :org_id
                  and id = :notification_id
                limit 1
            """),
            {
                "org_id": org_id,
                "notification_id": notification_id,
            },
        ).fetchone()

        return dict(result._mapping) if result else None


def mark_notification_sent(
    notification_id: str,
    provider_message_id: str | None = None,
    provider: str = "meta",
    provider_status: str | None = None,
):
    with engine.connect() as conn:
        conn.execute(
            text("""
                update notification_outbox
                set
                    status = 'SENT',
                    sent_at = now(),
                    provider = :provider,
                    provider_message_id = :provider_message_id,
                    last_provider_status = :provider_status
                where id = :id
            """),
            {
                "id": notification_id,
                "provider": provider,
                "provider_message_id": provider_message_id,
                "provider_status": provider_status,
            },
        )

        conn.commit()


def mark_notification_failed(
    org_id: str,
    notification_id: str,
    error: str,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update notification_outbox
                set
                    status = 'FAILED',
                    failed_at = now(),
                    error_message = :error
                where org_id = :org_id
                  and id = :notification_id
                returning *
            """),
            {
                "org_id": org_id,
                "notification_id": notification_id,
                "error": error,
            },
        )

        conn.commit()

        row = result.fetchone()

        return dict(row._mapping) if row else None


def get_notification_by_provider_message_id(
    provider_message_id: str,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select *
                from notification_outbox
                where provider_message_id = :provider_message_id
                limit 1
            """),
            {
                "provider_message_id": provider_message_id,
            },
        ).fetchone()

        return dict(result._mapping) if result else None


def create_notification_delivery_event(
    org_id: str,
    notification_id: str | None,
    provider_message_id: str | None,
    status: str,
    error_code: str | None = None,
    error_message: str | None = None,
    raw_payload: dict | None = None,
    provider: str = "meta",
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                insert into notification_delivery_events (
                    org_id,
                    notification_id,
                    provider,
                    provider_message_id,
                    status,
                    error_code,
                    error_message,
                    raw_payload
                )
                values (
                    :org_id,
                    :notification_id,
                    :provider,
                    :provider_message_id,
                    :status,
                    :error_code,
                    :error_message,
                    CAST(:raw_payload AS jsonb)
                )
                returning *
            """),
            {
                "org_id": org_id,
                "notification_id": notification_id,
                "provider": provider,
                "provider_message_id": provider_message_id,
                "status": status,
                "error_code": error_code,
                "error_message": error_message,
                "raw_payload": json.dumps(raw_payload or {}),
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def update_notification_provider_status(
    provider_message_id: str,
    provider_status: str,
    error_code: str | None = None,
    error_message: str | None = None,
):
    status = provider_status.strip().upper()

    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update notification_outbox
                set
                    last_provider_status = :provider_status,
                    error_code = coalesce(:error_code, error_code),
                    error_message = coalesce(:error_message, error_message),

                    status = case
                        when :status in ('DELIVERED', 'READ') then 'SENT'
                        when :status in ('FAILED', 'UNDELIVERED') then 'FAILED'
                        else status
                    end,

                    delivered_at = case
                        when :status = 'DELIVERED' then coalesce(delivered_at, now())
                        else delivered_at
                    end,

                    read_at = case
                        when :status = 'READ' then coalesce(read_at, now())
                        else read_at
                    end,

                    undelivered_at = case
                        when :status = 'UNDELIVERED' then coalesce(undelivered_at, now())
                        else undelivered_at
                    end,

                    failed_at = case
                        when :status = 'FAILED' then coalesce(failed_at, now())
                        else failed_at
                    end
                where provider_message_id = :provider_message_id
                returning *
            """),
            {
                "provider_message_id": provider_message_id,
                "provider_status": provider_status,
                "status": status,
                "error_code": error_code,
                "error_message": error_message,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def mark_notification_retryable(
    notification_id: str,
    reason: str,
    error_code: str | None = None,
    error_message: str | None = None,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update notification_outbox
                set
                    retry_status = case
                        when retry_count + 1 >= max_retry_count then 'EXHAUSTED'
                        else 'RETRYABLE'
                    end,
                    retry_count = retry_count + 1,
                    next_retry_at = case
                        when retry_count + 1 >= max_retry_count then null
                        else now() + ((retry_count + 1) * interval '5 minutes')
                    end,
                    error_code = coalesce(:error_code, error_code),
                    error_message = coalesce(:error_message, :reason, error_message)
                where id = :notification_id
                returning *
            """),
            {
                "notification_id": notification_id,
                "reason": reason,
                "error_code": error_code,
                "error_message": error_message,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def list_retryable_notifications(
    org_id: str,
    limit: int = 50,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select *
                from notification_outbox
                where org_id = :org_id
                  and status = 'FAILED'
                  and retry_status = 'RETRYABLE'
                  and next_retry_at <= now()
                order by next_retry_at asc
                limit :limit
            """),
            {
                "org_id": org_id,
                "limit": limit,
            },
        )

        return [dict(row._mapping) for row in result.fetchall()]


def reset_notification_for_retry(notification_id: str):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update notification_outbox
                set
                    status = 'PENDING',
                    retry_status = 'RETRYING',
                    failed_at = null,
                    error_message = null
                where id = :notification_id
                returning *
            """),
            {"notification_id": notification_id},
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def mark_notification_retry_success(notification_id: str):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update notification_outbox
                set
                    retry_status = 'SUCCESS'
                where id = :notification_id
                returning *
            """),
            {"notification_id": notification_id},
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def create_notification_retry_event(
    org_id: str,
    notification_id: str | None,
    provider_message_id: str | None,
    retry_number: int,
    status: str,
    reason: str | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    provider: str = "meta",
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                insert into notification_retry_events (
                    org_id,
                    notification_id,
                    provider,
                    provider_message_id,
                    retry_number,
                    status,
                    reason,
                    error_code,
                    error_message
                )
                values (
                    :org_id,
                    :notification_id,
                    :provider,
                    :provider_message_id,
                    :retry_number,
                    :status,
                    :reason,
                    :error_code,
                    :error_message
                )
                returning *
            """),
            {
                "org_id": org_id,
                "notification_id": notification_id,
                "provider": provider,
                "provider_message_id": provider_message_id,
                "retry_number": retry_number,
                "status": status,
                "reason": reason,
                "error_code": error_code,
                "error_message": error_message,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None
