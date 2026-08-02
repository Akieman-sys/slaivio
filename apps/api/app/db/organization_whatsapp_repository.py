from sqlalchemy import text
from app.db.database import engine


def normalize_whatsapp_number(value: str | None) -> str | None:
    if not value:
        return None

    clean = value.strip()

    if clean.startswith("whatsapp:"):
        return clean

    return f"whatsapp:{clean}"


def upsert_whatsapp_settings(
    org_id: str,
    provider: str = "meta",
    environment: str = "production",

    twilio_account_sid: str | None = None,
    twilio_subaccount_sid: str | None = None,
    twilio_whatsapp_from: str | None = None,
    twilio_messaging_service_sid: str | None = None,

    infobip_whatsapp_from: str | None = None,
    infobip_sender_name: str | None = None,
    infobip_webhook_secret: str | None = None,

    meta_phone_number_id: str | None = None,
    meta_waba_id: str | None = None,
    meta_whatsapp_display_phone: str | None = None,
    meta_app_id: str | None = None,

    inbound_webhook_url: str | None = None,
    status_callback_url: str | None = None,

    sender_status: str = "ACTIVE",
    sender_country: str | None = None,
    default_language: str = "fr",
    default_timezone: str = "Africa/Kinshasa",
    is_active: bool = True,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                insert into organization_whatsapp_settings (
                    org_id,
                    provider,
                    environment,

                    twilio_account_sid,
                    twilio_subaccount_sid,
                    twilio_whatsapp_from,
                    twilio_messaging_service_sid,

                    infobip_whatsapp_from,
                    infobip_sender_name,
                    infobip_webhook_secret,

                    meta_phone_number_id,
                    meta_waba_id,
                    meta_whatsapp_display_phone,
                    meta_app_id,

                    inbound_webhook_url,
                    status_callback_url,

                    sender_status,
                    sender_country,
                    default_language,
                    default_timezone,
                    is_active
                )
                values (
                    :org_id,
                    :provider,
                    :environment,

                    :twilio_account_sid,
                    :twilio_subaccount_sid,
                    :twilio_whatsapp_from,
                    :twilio_messaging_service_sid,

                    :infobip_whatsapp_from,
                    :infobip_sender_name,
                    :infobip_webhook_secret,

                    :meta_phone_number_id,
                    :meta_waba_id,
                    :meta_whatsapp_display_phone,
                    :meta_app_id,

                    :inbound_webhook_url,
                    :status_callback_url,

                    :sender_status,
                    :sender_country,
                    :default_language,
                    :default_timezone,
                    :is_active
                )
                on conflict (org_id, provider, environment)
                do update set
                    twilio_account_sid = excluded.twilio_account_sid,
                    twilio_subaccount_sid = excluded.twilio_subaccount_sid,
                    twilio_whatsapp_from = excluded.twilio_whatsapp_from,
                    twilio_messaging_service_sid = excluded.twilio_messaging_service_sid,

                    infobip_whatsapp_from = excluded.infobip_whatsapp_from,
                    infobip_sender_name = excluded.infobip_sender_name,
                    infobip_webhook_secret = excluded.infobip_webhook_secret,

                    meta_phone_number_id = excluded.meta_phone_number_id,
                    meta_waba_id = excluded.meta_waba_id,
                    meta_whatsapp_display_phone = excluded.meta_whatsapp_display_phone,
                    meta_app_id = excluded.meta_app_id,

                    inbound_webhook_url = excluded.inbound_webhook_url,
                    status_callback_url = excluded.status_callback_url,

                    sender_status = excluded.sender_status,
                    sender_country = excluded.sender_country,
                    default_language = excluded.default_language,
                    default_timezone = excluded.default_timezone,
                    is_active = excluded.is_active,
                    updated_at = now()
                returning *
            """),
            {
                "org_id": org_id,
                "provider": provider,
                "environment": environment,

                "twilio_account_sid": twilio_account_sid,
                "twilio_subaccount_sid": twilio_subaccount_sid,
                "twilio_whatsapp_from": twilio_whatsapp_from,
                "twilio_messaging_service_sid": twilio_messaging_service_sid,

                "infobip_whatsapp_from": infobip_whatsapp_from,
                "infobip_sender_name": infobip_sender_name,
                "infobip_webhook_secret": infobip_webhook_secret,

                "meta_phone_number_id": meta_phone_number_id,
                "meta_waba_id": meta_waba_id,
                "meta_whatsapp_display_phone": meta_whatsapp_display_phone,
                "meta_app_id": meta_app_id,

                "inbound_webhook_url": inbound_webhook_url,
                "status_callback_url": status_callback_url,

                "sender_status": sender_status,
                "sender_country": sender_country,
                "default_language": default_language,
                "default_timezone": default_timezone,
                "is_active": is_active,
            },
        )

        conn.commit()
        row = result.fetchone()
        return dict(row._mapping) if row else None


def get_active_whatsapp_settings(
    org_id: str,
    provider: str = "twilio",
    environment: str | None = None,
):
    filters = [
        "org_id = :org_id",
        "provider = :provider",
        "is_active = true",
    ]

    params = {
        "org_id": org_id,
        "provider": provider.strip().lower(),

    }

    if environment:
        filters.append("environment = :environment")
        params["environment"] = environment.strip().lower()

    where_clause = " and ".join(filters)

    with engine.connect() as conn:
        result = conn.execute(
            text(f"""
                select *
                from organization_whatsapp_settings
                where {where_clause}
                order by
                    case environment
                        when 'production' then 2
                        when 'sandbox' then 1
                        else 0
                    end desc,
                    updated_at desc
                limit 1
            """),
            params,
        ).fetchone()

        return dict(result._mapping) if result else None


def find_org_by_infobip_number(
    infobip_whatsapp_from: str,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select *
                from organization_whatsapp_settings
                where infobip_whatsapp_from = :infobip_whatsapp_from
                  and is_active = true
                limit 1
            """),
            {
                "infobip_whatsapp_from": infobip_whatsapp_from,
            },
        ).fetchone()

        return dict(result._mapping) if result else None


def find_org_by_twilio_number(twilio_whatsapp_from: str):
    normalized = normalize_whatsapp_number(twilio_whatsapp_from)
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select *
                from organization_whatsapp_settings
                where provider = 'twilio'
                  and twilio_whatsapp_from = :twilio_whatsapp_from
                  and is_active = true
                limit 1
            """),
            {"twilio_whatsapp_from": normalized},
        ).fetchone()
        return dict(result._mapping) if result else None



def list_whatsapp_settings(org_id: str):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select *
                from organization_whatsapp_settings
                where org_id = :org_id
                order by created_at desc
            """),
            {"org_id": org_id},
        )

        return [dict(row._mapping) for row in result.fetchall()]


def find_org_by_meta_phone_number_id(
    meta_phone_number_id: str,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select *
                from organization_whatsapp_settings
                where provider = 'meta'
                  and meta_phone_number_id = :meta_phone_number_id
                  and is_active = true
                limit 1
            """),
            {
                "meta_phone_number_id": meta_phone_number_id,
            },
        ).fetchone()

        return dict(result._mapping) if result else None
