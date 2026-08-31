import json

from sqlalchemy import text

from app.db.database import engine
from app.services.meta_credentials import reveal_access_token, token_for_storage


def upsert_whatsapp_number(
    org_id: str,
    whatsapp_account_id: str | None = None,
    provider: str = "META",
    business_id: str | None = None,
    waba_id: str | None = None,
    phone_number_id: str | None = None,
    display_phone_number: str | None = None,
    verified_name: str | None = None,
    number_role: str = "SUPPORT",
    country_code: str | None = None,
    default_language: str = "fr",
    default_timezone: str = "Africa/Kinshasa",
    connection_status: str = "CONNECTED",
    quality_rating: str | None = None,
    messaging_limit_tier: str | None = None,
    is_default: bool = False,
    access_token: str | None = None,
    provider_organization_id: str | None = None,
    webhook_secret: str | None = None,
    provider_metadata: dict | None = None,
):
    if not phone_number_id:
        raise ValueError("phone_number_id is required")

    plain_token, encrypted_token = token_for_storage(access_token)
    _, encrypted_webhook_secret = token_for_storage(webhook_secret)
    with engine.connect() as conn:
        if is_default:
            conn.execute(
                text("""
                    update organization_whatsapp_numbers
                    set is_default = false
                    where org_id = :org_id
                """),
                {"org_id": org_id},
            )

        row = conn.execute(
            text("""
                insert into organization_whatsapp_numbers (
                    org_id,
                    whatsapp_account_id,
                    provider,
                    business_id,
                    waba_id,
                    phone_number_id,
                    display_phone_number,
                    verified_name,
                    number_role,
                    country_code,
                    default_language,
                    default_timezone,
                    connection_status,
                    quality_rating,
                    messaging_limit_tier,
                    is_default,
                    access_token,
                    access_token_encrypted,
                    provider_organization_id,
                    webhook_secret_encrypted,
                    provider_metadata,
                    connected_at,
                    last_sync_at
                )
                values (
                    :org_id,
                    :whatsapp_account_id,
                    :provider,
                    :business_id,
                    :waba_id,
                    :phone_number_id,
                    :display_phone_number,
                    :verified_name,
                    :number_role,
                    :country_code,
                    :default_language,
                    :default_timezone,
                    :connection_status,
                    :quality_rating,
                    :messaging_limit_tier,
                    :is_default,
                    :access_token,
                    :access_token_encrypted,
                    :provider_organization_id,
                    :webhook_secret_encrypted,
                    cast(:provider_metadata as jsonb),
                    now(),
                    now()
                )
                on conflict (org_id, phone_number_id)
                do update set
                    whatsapp_account_id = excluded.whatsapp_account_id,
                    provider = excluded.provider,
                    business_id = excluded.business_id,
                    waba_id = excluded.waba_id,
                    display_phone_number = excluded.display_phone_number,
                    verified_name = excluded.verified_name,
                    number_role = excluded.number_role,
                    country_code = excluded.country_code,
                    default_language = excluded.default_language,
                    default_timezone = excluded.default_timezone,
                    connection_status = excluded.connection_status,
                    quality_rating = excluded.quality_rating,
                    messaging_limit_tier = excluded.messaging_limit_tier,
                    is_default = excluded.is_default,
                    access_token = excluded.access_token,
                    access_token_encrypted = excluded.access_token_encrypted,
                    provider_organization_id = excluded.provider_organization_id,
                    webhook_secret_encrypted = excluded.webhook_secret_encrypted,
                    provider_metadata = excluded.provider_metadata,
                    is_active = true,
                    last_sync_at = now(),
                    updated_at = now()
                returning *
            """),
            {
                "org_id": org_id,
                "whatsapp_account_id": whatsapp_account_id,
                "provider": provider,
                "business_id": business_id,
                "waba_id": waba_id,
                "phone_number_id": phone_number_id,
                "display_phone_number": display_phone_number,
                "verified_name": verified_name,
                "number_role": number_role,
                "country_code": country_code,
                "default_language": default_language,
                "default_timezone": default_timezone,
                "connection_status": connection_status,
                "quality_rating": quality_rating,
                "messaging_limit_tier": messaging_limit_tier,
                "is_default": is_default,
                "access_token": plain_token,
                "access_token_encrypted": encrypted_token,
                "provider_organization_id": provider_organization_id,
                "webhook_secret_encrypted": encrypted_webhook_secret,
                "provider_metadata": json.dumps(provider_metadata or {}),
            },
        ).fetchone()

        conn.commit()

        return reveal_access_token(dict(row._mapping) if row else None)


def list_whatsapp_numbers(org_id: str):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select *
                from organization_whatsapp_numbers
                where org_id = :org_id
                  and is_active = true
                order by is_default desc, created_at desc
            """),
            {"org_id": org_id},
        ).fetchall()

        return [reveal_access_token(dict(row._mapping)) for row in rows]


def get_default_whatsapp_number(org_id: str):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select *
                from organization_whatsapp_numbers
                where org_id = :org_id
                  and is_default = true
                  and is_active = true
                limit 1
            """),
            {"org_id": org_id},
        ).fetchone()

        return reveal_access_token(dict(row._mapping) if row else None)


def find_whatsapp_number_by_phone_number_id(
    phone_number_id: str,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select *
                from organization_whatsapp_numbers
                where phone_number_id = :phone_number_id
                  and is_active = true
                limit 1
            """),
            {"phone_number_id": phone_number_id},
        ).fetchone()

        return reveal_access_token(dict(row._mapping) if row else None)


def update_whatsapp_number_role(
    org_id: str,
    number_id: str,
    number_role: str,
    is_default: bool = False,
):
    with engine.connect() as conn:
        if is_default:
            conn.execute(
                text("""
                    update organization_whatsapp_numbers
                    set is_default = false
                    where org_id = :org_id
                """),
                {"org_id": org_id},
            )

        row = conn.execute(
            text("""
                update organization_whatsapp_numbers
                set
                    number_role = :number_role,
                    is_default = :is_default,
                    updated_at = now()
                where id = :number_id
                  and org_id = :org_id
                returning *
            """),
            {
                "org_id": org_id,
                "number_id": number_id,
                "number_role": number_role,
                "is_default": is_default,
            },
        ).fetchone()

        conn.commit()

        return reveal_access_token(dict(row._mapping) if row else None)
