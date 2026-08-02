import json
from sqlalchemy import text

from app.db.database import engine


def create_whatsapp_template(
    org_id: str,
    template_key: str,
    template_name: str,
    content_sid: str,
    language: str = "fr",
    category: str | None = None,
    description: str | None = None,
    variables: dict | None = None,
    provider: str = "meta",
    status: str = "APPROVED",
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                insert into whatsapp_templates (
                    org_id,
                    template_key,
                    template_name,
                    provider,
                    content_sid,
                    language,
                    category,
                    description,
                    variables,
                    status
                )
                values (
                    :org_id,
                    :template_key,
                    :template_name,
                    :provider,
                    :content_sid,
                    :language,
                    :category,
                    :description,
                    CAST(:variables AS jsonb),
                    :status
                )
                on conflict (org_id, template_key)
                do update set
                    template_name = excluded.template_name,
                    content_sid = excluded.content_sid,
                    language = excluded.language,
                    category = excluded.category,
                    description = excluded.description,
                    variables = excluded.variables,
                    status = excluded.status,
                    updated_at = now()
                returning *
            """),
            {
                "org_id": org_id,
                "template_key": template_key.strip().upper(),
                "template_name": template_name.strip(),
                "provider": provider.strip().lower(),
                "content_sid": content_sid.strip(),
                "language": language.strip(),
                "category": category.strip().upper() if category else None,
                "description": description,
                "variables": json.dumps(variables or {}),
                "status": status.strip().upper(),
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def get_template_by_key(
    org_id: str,
    template_key: str,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select *
                from whatsapp_templates
                where org_id = :org_id
                  and template_key = :template_key
                  and is_active = true
                limit 1
            """),
            {
                "org_id": org_id,
                "template_key": template_key.strip().upper(),
            },
        ).fetchone()

        return dict(result._mapping) if result else None


def list_whatsapp_templates(
    org_id: str,
    limit: int = 100,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select *
                from whatsapp_templates
                where org_id = :org_id
                  and is_active = true
                order by created_at desc
                limit :limit
            """),
            {
                "org_id": org_id,
                "limit": limit,
            },
        )

        return [dict(row._mapping) for row in result.fetchall()]


def create_template_send_record(
    org_id: str,
    template_id: str,
    recipient_phone: str,
    content_sid: str,
    content_variables: dict,
    notification_id: str | None = None,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                insert into whatsapp_template_sends (
                    org_id,
                    template_id,
                    recipient_phone,
                    content_sid,
                    content_variables,
                    notification_id
                )
                values (
                    :org_id,
                    :template_id,
                    :recipient_phone,
                    :content_sid,
                    CAST(:content_variables AS jsonb),
                    :notification_id
                )
                returning *
            """),
            {
                "org_id": org_id,
                "template_id": template_id,
                "recipient_phone": recipient_phone,
                "content_sid": content_sid,
                "content_variables": json.dumps(content_variables),
                "notification_id": notification_id,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def mark_template_send_sent(
    send_id: str,
    provider_message_id: str,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update whatsapp_template_sends
                set
                    status = 'SENT',
                    provider_message_id = :provider_message_id,
                    sent_at = now()
                where id = :send_id
                returning *
            """),
            {
                "send_id": send_id,
                "provider_message_id": provider_message_id,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def mark_template_send_failed(
    send_id: str,
    error_message: str,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update whatsapp_template_sends
                set
                    status = 'FAILED',
                    error_message = :error_message,
                    failed_at = now()
                where id = :send_id
                returning *
            """),
            {
                "send_id": send_id,
                "error_message": error_message,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None

def update_meta_template_sync(
    template_id: str,
    status: str,
    meta_template_id: str | None = None,
    body_text: str | None = None,
    quality_score: str | None = None,
    rejection_reason: str | None = None,
    raw_payload: dict | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                update whatsapp_templates
                set
                    content_sid = coalesce(:meta_template_id, content_sid),
                    meta_template_id = :meta_template_id,
                    body_text = coalesce(:body_text, body_text),
                    status = :status,
                    quality_score = :quality_score,
                    rejection_reason = :rejection_reason,
                    raw_payload = CAST(:raw_payload AS jsonb),
                    last_synced_at = now(),
                    updated_at = now()
                where id = :template_id
                returning *
            """),
            {
                "template_id": template_id,
                "meta_template_id": meta_template_id,
                "body_text": body_text,
                "status": status.strip().upper(),
                "quality_score": quality_score,
                "rejection_reason": rejection_reason,
                "raw_payload": json.dumps(raw_payload or {}),
            },
        ).fetchone()

        conn.commit()

        return dict(row._mapping) if row else None


def update_meta_template_by_name(
    org_id: str,
    template_name: str,
    language: str,
    status: str,
    meta_template_id: str | None = None,
    quality_score: str | None = None,
    raw_payload: dict | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                update whatsapp_templates
                set
                    content_sid = coalesce(:meta_template_id, content_sid),
                    meta_template_id = :meta_template_id,
                    status = :status,
                    quality_score = :quality_score,
                    raw_payload = CAST(:raw_payload AS jsonb),
                    last_synced_at = now(),
                    updated_at = now()
                where org_id = :org_id
                  and template_name = :template_name
                  and language = :language
                  and provider = 'meta'
                returning *
            """),
            {
                "org_id": org_id,
                "template_name": template_name,
                "language": language,
                "status": status.strip().upper(),
                "meta_template_id": meta_template_id,
                "quality_score": quality_score,
                "raw_payload": json.dumps(raw_payload or {}),
            },
        ).fetchone()

        conn.commit()

        return dict(row._mapping) if row else None
