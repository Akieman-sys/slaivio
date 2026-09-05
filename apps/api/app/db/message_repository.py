import json
from sqlalchemy import text
from app.db.database import engine
from uuid import UUID
from datetime import datetime, date



def insert_raw_message(
    org_id: str,
    phone: str,
    text_msg: str,
    payload: dict,
    client_id: str | None,
    dossier_id: str | None,
):
    with engine.connect() as conn:
        conn.execute(
            text("""
                insert into messages_raw (
                    org_id,
                    sender_phone,
                    message_text,
                    raw_payload,
                    client_id,
                    dossier_id
                )
                values (
                    :org_id,
                    :phone,
                    :text_msg,
                    CAST(:payload AS jsonb),
                    :client_id,
                    :dossier_id
                )
            """),
            {
                "org_id": org_id,
                "phone": phone,
                "text_msg": text_msg,
                "payload": json.dumps(payload),
                "client_id": client_id,
                "dossier_id": dossier_id,
            },
        )

        conn.commit()


def find_client_by_phone(org_id: str, phone: str):
    """Return an existing client without turning an inbound contact into CRM data."""
    normalized_phone = "+" + "".join(character for character in phone if character.isdigit())
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select id
                from clients
                where org_id = :org_id
                  and deleted_at is null
                  and (
                    normalized_phone = :normalized_phone
                    or regexp_replace(coalesce(phone, whatsapp_phone, ''), '[^0-9]', '', 'g') = :digits
                  )
                limit 1
            """),
            {
                "org_id": org_id,
                "normalized_phone": normalized_phone,
                "digits": normalized_phone.lstrip("+"),
            },
        ).fetchone()

        return result[0] if result else None


def find_active_dossier(org_id: str, client_id: str | None):
    """Return an existing dossier selected by the agency; never create one."""
    if not client_id:
        return None

    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select dossier.id
                from dossier_clients relation
                join dossiers dossier
                  on dossier.org_id = relation.org_id
                 and dossier.id = relation.dossier_id
                where relation.org_id = :org_id
                  and relation.client_id = :client_id
                  and relation.archived_at is null
                  and dossier.archived_at is null
                order by relation.last_updated_at desc, dossier.updated_at desc
                limit 1
            """),
            {
                "org_id": org_id,
                "client_id": client_id,
            },
        ).fetchone()

        return result[0] if result else None


def find_dossier_by_whatsapp_group(org_id: str, group_jid: str | None):
    if not group_jid:
        return None
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select id
                from dossiers
                where org_id = :org_id
                  and whatsapp_group_jid = :group_jid
                  and archived_at is null
                limit 1
            """),
            {"org_id": org_id, "group_jid": group_jid},
        ).fetchone()
        return result[0] if result else None
    

def make_json_safe(value):
    if isinstance(value, UUID):
        return str(value)

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, dict):
        return {
            key: make_json_safe(item)
            for key, item in value.items()
        }

    if isinstance(value, list):
        return [
            make_json_safe(item)
            for item in value
        ]

    return value



def create_dossier_event(
    org_id: str,
    dossier_id: str,
    event_type: str,
    payload: dict,
):
    with engine.connect() as conn:
        conn.execute(
            text("""
                insert into dossier_events (
                    org_id,
                    dossier_id,
                    event_type,
                    payload
                )
                values (
                    :org_id,
                    :dossier_id,
                    :event_type,
                    CAST(:payload AS jsonb)
                )
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
                "event_type": event_type,
                "payload": json.dumps(make_json_safe(payload or {})),
            },
        )

        conn.commit()


def update_dossier_from_intent(org_id: str, dossier_id: str, intent: str):
    case_type = None
    status_global = None

    if intent == "SEND_CARGO_REQUEST":
        case_type = "COMMERCIAL_CARGO"
        status_global = "DRAFT"

    elif intent == "TRANSITAIRE_REQUEST":
        case_type = "IMPORT"
        status_global = "DRAFT"

    elif intent in ["PRICE_REQUEST", "PRICING_REQUEST"]:
        case_type = "QUOTE"
        status_global = "LEAD"

    elif intent == "TRACKING_REQUEST":
        case_type = "UNKNOWN"
        status_global = "DRAFT"

    elif intent in ["WAREHOUSE_ADDRESS_REQUEST", "ADDRESS_REQUEST"]:
        case_type = "UNKNOWN"
        status_global = "LEAD"

    elif intent == "DEPARTURE_SCHEDULE_REQUEST":
        case_type = "UNKNOWN"
        status_global = "LEAD"

    elif intent == "SUPPLIER_PAYMENT_REQUEST":
        case_type = "PURCHASE"
        status_global = "DRAFT"

    elif intent == "HUMAN_HELP_REQUEST":
        case_type = "UNKNOWN"
        status_global = "DRAFT"

    elif intent == "GREETING":
        case_type = "UNKNOWN"
        status_global = "LEAD"

    elif intent == "CONFIRMATION":
        return None

    else:
        return None

    fields = []
    params = {
        "org_id": org_id,
        "dossier_id": dossier_id,
    }

    if case_type:
        fields.append("case_type = :case_type")
        params["case_type"] = case_type

    if status_global:
        fields.append("status_global = :status_global")
        params["status_global"] = status_global

    fields.append("updated_at = now()")

    query = text(f"""
        update dossiers
        set {", ".join(fields)}
        where org_id = :org_id
          and id = :dossier_id
        returning id, case_type, status_global, intake_status, validation_status
    """)

    with engine.connect() as conn:
        result = conn.execute(query, params).fetchone()
        conn.commit()

        if not result:
            return None

        return {
            "id": result[0],
            "case_type": result[1],
            "status_global": result[2],
            "intake_status": result[3],
            "validation_status": result[4],
        }


def get_organization(org_id: str):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                select id, name, country, city
                from organizations
                where id = :org_id
                limit 1
            """),
            {"org_id": org_id},
        ).fetchone()

        if not result:
            return None

        return {
            "id": result[0],
            "name": result[1],
            "country": result[2],
            "city": result[3],
        }


def update_dossier_from_ai_fields(org_id: str, dossier_id: str, fields: dict):
    if not fields:
        return None

    allowed_fields = {
        "origin_country": fields.get("origin_country"),
        "origin_city": fields.get("origin_city"),
        "destination_country": fields.get("destination_country"),
        "destination_city": fields.get("destination_city"),
        "goods_type": fields.get("goods_type"),
        "estimated_weight_kg": fields.get("estimated_weight_kg"),
        "estimated_volume_cbm": fields.get("estimated_volume_cbm"),
        "shipping_mode": fields.get("shipping_mode"),
        "tracking_id": fields.get("tracking_id"),
        "supplier_payment_amount": fields.get("supplier_payment_amount"),
        "supplier_payment_currency": fields.get("supplier_payment_currency"),
    }

    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update dossiers
                set
                    origin_country = coalesce(:origin_country, origin_country),
                    origin_city = coalesce(:origin_city, origin_city),
                    destination_country = coalesce(:destination_country, destination_country),
                    destination_city = coalesce(:destination_city, destination_city),
                    goods_type = coalesce(:goods_type, goods_type),
                    estimated_weight_kg = coalesce(:estimated_weight_kg, estimated_weight_kg),
                    estimated_volume_cbm = coalesce(:estimated_volume_cbm, estimated_volume_cbm),
                    shipping_mode = coalesce(:shipping_mode, shipping_mode),
                    tracking_id = coalesce(:tracking_id, tracking_id),
                    supplier_payment_amount = coalesce(:supplier_payment_amount, supplier_payment_amount),
                    supplier_payment_currency = coalesce(:supplier_payment_currency, supplier_payment_currency),
                    updated_at = now()
                where id = :dossier_id
                  and org_id = :org_id
                returning *
            """),
            {
                "dossier_id": dossier_id,
                "org_id": org_id,
                **allowed_fields,
            },
        )

        conn.commit()

        row = result.fetchone()
        return dict(row._mapping) if row else None


def get_dossier_full(org_id: str, dossier_id: str):
    with engine.connect() as conn:

        dossier = conn.execute(
            text("""
                select *
                from dossiers
                where id = :dossier_id
                  and org_id = :org_id
                limit 1
            """),
            {
                "dossier_id": dossier_id,
                "org_id": org_id,
            },
        ).fetchone()

        if not dossier:
            return None

        dossier_dict = dict(dossier._mapping)

        client = conn.execute(
            text("""
                select *
                from clients
                where id = :client_id
                limit 1
            """),
            {
                "client_id": dossier_dict["client_id"],
            },
        ).fetchone()

        shipment = conn.execute(
            text("""
                select *
                from shipments
                where dossier_id = :dossier_id
                order by created_at desc
                limit 1
            """),
            {
                "dossier_id": dossier_id,
            },
        ).fetchone()

        dossier_dict["client"] = (
            dict(client._mapping)
            if client
            else None
        )

        dossier_dict["shipment"] = (
            dict(shipment._mapping)
            if shipment
            else None
        )

        return dossier_dict


def update_dossier_from_action(org_id: str, dossier_id: str, action: dict):
    action_type = action.get("action_type")

    intake_status = None
    validation_status = None

    if action_type in [
        "CONTINUE_SHIPPING_INTAKE",
        "CONTINUE_TRANSITAIRE_INTAKE",
        "CONTINUE_SUPPLIER_PAYMENT_INTAKE",
        "CHECK_PRICING_REQUIREMENTS",
        "ASK_CLARIFICATION",
    ]:
        intake_status = "PARTIAL"

    if action_type in [
        "READY_FOR_SHIPPING_REVIEW",
        "READY_FOR_TRANSITAIRE_REVIEW",
        "READY_FOR_SUPPLIER_PAYMENT_REVIEW",
    ]:
        intake_status = "COMPLETE"
        validation_status = "READY_FOR_REVIEW"

    if action_type == "ESCALATE_TO_HUMAN":
        validation_status = "NEEDS_HUMAN"

    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update dossiers
                set
                    intake_status = coalesce(:intake_status, intake_status),
                    validation_status = coalesce(:validation_status, validation_status),
                    updated_at = now()
                where id = :dossier_id
                  and org_id = :org_id
                returning *
            """),
            {
                "dossier_id": dossier_id,
                "org_id": org_id,
                "intake_status": intake_status,
                "validation_status": validation_status,
            },
        )

        conn.commit()

        row = result.fetchone()
        return dict(row._mapping) if row else None


def update_dossier_pricing(
    org_id: str,
    dossier_id: str,
    origin_country: str | None,
    destination_country: str | None,
    weight_kg: float | None,
    quoted_total: float | None,
    quoted_currency: str | None,
    pricing_status: str,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update dossiers
                set
                    origin_country = coalesce(:origin_country, origin_country),
                    destination_country = coalesce(:destination_country, destination_country),
                    estimated_weight_kg = coalesce(:weight_kg, estimated_weight_kg),
                    quoted_total = :quoted_total,
                    quoted_currency = :quoted_currency,
                    pricing_status = :pricing_status,
                    updated_at = now()
                where id = :dossier_id
                  and org_id = :org_id
                returning *
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
                "origin_country": origin_country,
                "destination_country": destination_country,
                "weight_kg": weight_kg,
                "quoted_total": quoted_total,
                "quoted_currency": quoted_currency,
                "pricing_status": pricing_status,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def mark_dossier_confirmed(org_id: str, dossier_id: str):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update dossiers
                set
                    validation_status = 'CONFIRMED_BY_CLIENT',
                    intake_status = 'PARTIAL',
                    updated_at = now()
                where id = :dossier_id
                  and org_id = :org_id
                returning *
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def update_dossier_intake_fields(
    org_id: str,
    dossier_id: str,
    fields: dict,
):
    if not fields:
        return None

    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update dossiers
                set
                    client_full_name = coalesce(:client_full_name, client_full_name),
                    destination_country = coalesce(:destination_country, destination_country),
                    destination_city = coalesce(:destination_city, destination_city),
                    shipping_mode = coalesce(:shipping_mode, shipping_mode),
                    goods_type = coalesce(:goods_type, goods_type),
                    updated_at = now()
                where id = :dossier_id
                  and org_id = :org_id
                returning *
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
                "client_full_name": fields.get("client_full_name"),
                "destination_country": fields.get("destination_country"),
                "destination_city": fields.get("destination_city"),
                "shipping_mode": fields.get("shipping_mode"),
                "goods_type": fields.get("goods_type"),
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def mark_dossier_intake_complete(org_id: str, dossier_id: str):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update dossiers
                set
                    intake_status = 'COMPLETE',
                    updated_at = now()
                where id = :dossier_id
                  and org_id = :org_id
                returning *
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None


def mark_dossier_waiting_for_package(org_id: str, dossier_id: str):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update dossiers
                set
                    status_global = 'WAITING_PACKAGES',
                    updated_at = now()
                where id = :dossier_id
                  and org_id = :org_id
                returning *
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
            },
        )

        conn.commit()

        row = result.fetchone()

        return dict(row._mapping) if row else None


def update_dossier_final_pricing(
    org_id: str,
    dossier_id: str,
    total: float | None,
    currency: str | None,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                update dossiers
                set
                    final_total = :total,
                    final_currency = :currency,
                    payment_status = 'WAITING',
                    status_global = 'QUOTED',
                    updated_at = now()
                where id = :dossier_id
                  and org_id = :org_id
                returning *
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
                "total": total,
                "currency": currency,
            },
        )

        conn.commit()
        row = result.fetchone()

        return dict(row._mapping) if row else None

def create_message(
    org_id: str,
    dossier_id: str | None,
    client_id: str | None,
    provider_message_id: str | None,
    from_phone: str,
    to_phone: str | None,
    text_body: str | None,
    message_type: str,
    source_channel: str,
    direction: str,
    dedupe_key: str,
    received_at,
    provider: str | None = None,
    provider_phone_number_id: str | None = None,
    whatsapp_number_id: str | None = None,
    waba_id: str | None = None,
    number_role: str | None = None,
    conversation_jid: str | None = None,
    sender_name: str | None = None,
    conversation_name: str | None = None,
    is_group: bool = False,
    sender_jid: str | None = None,
    media_object_path: str | None = None,
    media_mime_type: str | None = None,
    media_file_name: str | None = None,
    media_size_bytes: int | None = None,
):
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                insert into messages (
                    org_id,
                    dossier_id,
                    client_id,
                    provider_message_id,
                    from_phone,
                    to_phone,
                    text_body,
                    message_type,
                    source_channel,
                    direction,
                    dedupe_key,
                    received_at,
                    provider,
                    provider_phone_number_id,
                    whatsapp_number_id,
                    waba_id,
                    number_role,
                    conversation_jid,
                    sender_name,
                    conversation_name,
                    is_group,
                    sender_jid,
                    media_object_path,
                    media_mime_type,
                    media_file_name,
                    media_size_bytes
                )
                values (
                    :org_id,
                    :dossier_id,
                    :client_id,
                    :provider_message_id,
                    :from_phone,
                    :to_phone,
                    :text_body,
                    :message_type,
                    :source_channel,
                    :direction,
                    :dedupe_key,
                    :received_at,
                    :provider,
                    :provider_phone_number_id,
                    :whatsapp_number_id,
                    :waba_id,
                    :number_role,
                    :conversation_jid,
                    :sender_name,
                    :conversation_name,
                    :is_group,
                    :sender_jid,
                    :media_object_path,
                    :media_mime_type,
                    :media_file_name,
                    :media_size_bytes
                )
                on conflict (dedupe_key) do nothing
                returning *
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
                "client_id": client_id,
                "provider_message_id": provider_message_id,
                "from_phone": from_phone,
                "to_phone": to_phone,
                "text_body": text_body,
                "message_type": message_type,
                "source_channel": source_channel,
                "direction": direction,
                "dedupe_key": dedupe_key,
                "received_at": received_at,
                "provider": provider,
                "provider_phone_number_id": provider_phone_number_id,
                "whatsapp_number_id": whatsapp_number_id,
                "waba_id": waba_id,
                "number_role": number_role,
                "conversation_jid": conversation_jid,
                "sender_name": sender_name,
                "conversation_name": conversation_name,
                "is_group": is_group,
                "sender_jid": sender_jid,
                "media_object_path": media_object_path,
                "media_mime_type": media_mime_type,
                "media_file_name": media_file_name,
                "media_size_bytes": media_size_bytes,
            },
        )

        conn.commit()
        row = result.fetchone()
        return dict(row._mapping) if row else None
