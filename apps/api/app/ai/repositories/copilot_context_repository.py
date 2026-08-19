from sqlalchemy import text

from app.db.database import engine


def find_client_by_phone(org_id: str, phone: str) -> dict | None:
    digits = "".join(char for char in phone if char.isdigit())
    with engine.connect() as conn:
        row = conn.execute(text("""
            select id::text,coalesce(display_name,name,company_name,phone) display_name,
                   phone,whatsapp_phone,lifecycle_status,preferred_language
            from clients
            where org_id=:org and deleted_at is null
              and (regexp_replace(coalesce(phone,''),'[^0-9]','','g')=:phone
                or regexp_replace(coalesce(whatsapp_phone,''),'[^0-9]','','g')=:phone)
            order by updated_at desc limit 1
        """), {"org": org_id, "phone": digits}).fetchone()
        return dict(row._mapping) if row else None


def client_dossier_choices(org_id: str, client_id: str) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            select id::text,dossier_reference,status_global,origin_country,origin_city,
                   destination_country,destination_city,goods_type,updated_at
            from dossiers where org_id=:org and client_id=cast(:client as uuid)
              and deleted_at is null and status_global not in ('CLOSED','ARCHIVED','CANCELLED')
            order by updated_at desc limit 8
        """), {"org": org_id, "client": client_id}).fetchall()
        return [dict(row._mapping) for row in rows]


def location_choices(org_id: str, field: str) -> list[dict]:
    if field == "origin_country":
        sql = """select distinct origin_country value,origin_country label from shipping_routes
                 where org_id=:org and status in ('ACTIVE','LIMITED') and origin_country is not null order by 2 limit 12"""
    else:
        sql = """select distinct destination_city value,
                 coalesce(destination_city,destination_country) label from shipping_routes
                 where org_id=:org and status in ('ACTIVE','LIMITED') and destination_city is not null order by 2 limit 12"""
    with engine.connect() as conn:
        return [dict(row._mapping) for row in conn.execute(text(sql), {"org": org_id}).fetchall()]


def resolve_location(org_id: str, field: str, value: str) -> dict:
    choices = location_choices(org_id, field)
    matches = [item for item in choices if str(item["value"]).casefold() == value.casefold()]
    if len(matches) == 1:
        return {"status": "VALID", "value": matches[0]["value"], "choices": []}
    partial = [item for item in choices if value.casefold() in str(item["label"]).casefold()]
    if len(partial) == 1:
        return {"status": "VALID", "value": partial[0]["value"], "choices": []}
    return {"status": "AMBIGUOUS" if partial else "INVALID", "value": None, "choices": partial or choices}
