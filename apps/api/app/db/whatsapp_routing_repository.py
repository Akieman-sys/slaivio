from sqlalchemy import text

from app.db.database import engine
from app.services.meta_credentials import reveal_access_token


def find_number_by_phone_number_id(
    phone_number_id: str,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select
                    wn.*,
                    wa.connection_status as account_connection_status,
                    wa.webhook_subscription_status,
                    wa.account_name
                from organization_whatsapp_numbers wn
                left join organization_whatsapp_accounts wa
                    on wa.id = wn.whatsapp_account_id
                where wn.phone_number_id = :phone_number_id
                  and wn.is_active = true
                limit 1
            """),
            {
                "phone_number_id": phone_number_id,
            },
        ).fetchone()

        return reveal_access_token(dict(row._mapping) if row else None)


def get_default_number_for_org(
    org_id: str,
):
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
            {
                "org_id": org_id,
            },
        ).fetchone()

        return reveal_access_token(dict(row._mapping) if row else None)


def get_numbers_by_role(
    org_id: str,
    number_role: str,
):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select *
                from organization_whatsapp_numbers
                where org_id = :org_id
                  and number_role = :number_role
                  and is_active = true
                order by is_default desc
            """),
            {
                "org_id": org_id,
                "number_role": number_role,
            },
        ).fetchall()

        return [reveal_access_token(dict(row._mapping)) for row in rows]
