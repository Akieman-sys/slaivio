from sqlalchemy import text

from app.db.database import engine


def create_outbound_message(
    org_id: str,
    to_phone: str,
    text_body: str,
    from_phone: str | None = None,
    provider: str = "META",
    provider_phone_number_id: str | None = None,
    whatsapp_number_id: str | None = None,
    waba_id: str | None = None,
    number_role: str | None = None,
    send_status: str = "PENDING",
    dedupe_key: str | None = None,
    conversation_jid: str | None = None,
    is_group: bool = False,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into messages (
                    org_id,
                    from_phone,
                    to_phone,
                    direction,
                    text_body,
                    message_type,
                    source_channel,
                    dedupe_key,
                    received_at,
                    provider,
                    provider_phone_number_id,
                    whatsapp_number_id,
                    waba_id,
                    number_role,
                    send_status,
                    conversation_jid,
                    is_group
                )
                values (
                    :org_id,
                    :from_phone,
                    :to_phone,
                    'outbound',
                    :text_body,
                    'text',
                    'whatsapp',
                    coalesce(:dedupe_key, gen_random_uuid()::text),
                    now(),
                    :provider,
                    :provider_phone_number_id,
                    :whatsapp_number_id,
                    :waba_id,
                    :number_role,
                    :send_status,
                    :conversation_jid,
                    :is_group
                )
                on conflict(dedupe_key) do nothing
                returning *
            """),
            {
                "org_id": org_id,
                "from_phone": from_phone,
                "to_phone": to_phone,
                "text_body": text_body,
                "provider": provider,
                "provider_phone_number_id": provider_phone_number_id,
                "whatsapp_number_id": whatsapp_number_id,
                "waba_id": waba_id,
                "number_role": number_role,
                "send_status": send_status,
                "dedupe_key": dedupe_key,
                "conversation_jid": conversation_jid,
                "is_group": is_group,
            },
        ).fetchone()

        if not row and dedupe_key:
            row = conn.execute(
                text("select * from messages where org_id=:org_id and dedupe_key=:dedupe_key limit 1"),
                {"org_id": org_id, "dedupe_key": dedupe_key},
            ).fetchone()
            replay = dict(row._mapping) if row else None
            if replay is not None:
                replay["idempotent_replay"] = True
            return replay

        conn.commit()
        return dict(row._mapping)


def mark_outbound_message_sent(
    message_id: str,
    provider_message_id: str | None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                update messages
                set
                    send_status = 'SENT',
                    provider_message_id = :provider_message_id
                where id = :message_id
                returning *
            """),
            {
                "message_id": message_id,
                "provider_message_id": provider_message_id,
            },
        ).fetchone()

        conn.commit()
        return dict(row._mapping) if row else None


def mark_outbound_message_failed(
    message_id: str,
    error_message: str,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                update messages
                set
                    send_status = 'FAILED',
                    error_message = :error_message
                where id = :message_id
                returning *
            """),
            {
                "message_id": message_id,
                "error_message": error_message,
            },
        ).fetchone()

        conn.commit()
        return dict(row._mapping) if row else None
