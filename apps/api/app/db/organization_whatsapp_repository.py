from sqlalchemy import text

from app.db.database import engine


def upsert_whatsapp_settings(
    org_id: str,
    provider: str = "meta",
    environment: str = "production",
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
    if provider != "meta":
        raise ValueError("Only the Meta WhatsApp provider is supported")
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                insert into organization_whatsapp_settings (
                    org_id, provider, environment, meta_phone_number_id,
                    meta_waba_id, meta_whatsapp_display_phone, meta_app_id,
                    inbound_webhook_url, status_callback_url, sender_status,
                    sender_country, default_language, default_timezone, is_active
                ) values (
                    :org_id, 'meta', :environment, :meta_phone_number_id,
                    :meta_waba_id, :meta_whatsapp_display_phone, :meta_app_id,
                    :inbound_webhook_url, :status_callback_url, :sender_status,
                    :sender_country, :default_language, :default_timezone, :is_active
                )
                on conflict (org_id, provider, environment) do update set
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
                "environment": environment,
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
        ).fetchone()
        return dict(row._mapping) if row else None


def get_active_whatsapp_settings(
    org_id: str,
    provider: str = "meta",
    environment: str | None = None,
):
    if provider != "meta":
        return None
    filters = ["org_id = :org_id", "provider = 'meta'", "is_active = true"]
    params = {"org_id": org_id}
    if environment:
        filters.append("environment = :environment")
        params["environment"] = environment.strip().lower()
    with engine.connect() as conn:
        row = conn.execute(
            text(f"""
                select * from organization_whatsapp_settings
                where {' and '.join(filters)}
                order by updated_at desc
                limit 1
            """),
            params,
        ).fetchone()
        return dict(row._mapping) if row else None


def list_whatsapp_settings(org_id: str):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select * from organization_whatsapp_settings
                where org_id = :org_id and provider = 'meta'
                order by created_at desc
            """),
            {"org_id": org_id},
        ).fetchall()
        return [dict(row._mapping) for row in rows]


def find_org_by_meta_phone_number_id(meta_phone_number_id: str):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select * from organization_whatsapp_settings
                where provider = 'meta'
                  and meta_phone_number_id = :meta_phone_number_id
                  and is_active = true
                limit 1
            """),
            {"meta_phone_number_id": meta_phone_number_id},
        ).fetchone()
        return dict(row._mapping) if row else None
