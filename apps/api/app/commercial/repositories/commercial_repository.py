import json
from uuid import uuid4

from sqlalchemy import text

from app.db.database import engine


DOSSIER_CASE_TYPE_ALIASES = {
    "PROCUREMENT_REQUEST": "PURCHASE",
    "QUOTE_REQUEST": "QUOTE",
    "RESTRICTION_CHECK": "UNKNOWN",
    "SEND_CARGO": "COMMERCIAL_CARGO",
}


def _canonical_dossier_case_type(case_type: str) -> str:
    canonical = DOSSIER_CASE_TYPE_ALIASES.get(case_type, case_type)
    allowed = {
        "UNKNOWN",
        "IMPORT",
        "EXPORT",
        "PURCHASE",
        "QUOTE",
        "PERSONAL_EFFECTS",
        "COMMERCIAL_CARGO",
    }
    return canonical if canonical in allowed else "UNKNOWN"


def _json(value):
    return json.dumps(value or {}, default=str)


def _json_list(value):
    return json.dumps(value or [], default=str)


def _one(row):
    return dict(row._mapping) if row else None


def get_or_create_client(
    org_id: str,
    phone: str | None = None,
    client_id: str | None = None,
):
    if client_id:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    select *
                    from clients
                    where org_id = :org_id
                      and id = :client_id
                    limit 1
                """),
                {
                    "org_id": org_id,
                    "client_id": client_id,
                },
            ).fetchone()

        if row:
            return dict(row._mapping)

    phone_value = phone or f"commercial_lead_{uuid4().hex[:12]}"

    with engine.connect() as conn:
        existing = conn.execute(
            text("""
                select *
                from clients
                where org_id = :org_id
                  and phone = :phone
                order by created_at desc
                limit 1
            """),
            {
                "org_id": org_id,
                "phone": phone_value,
            },
        ).fetchone()

        if existing:
            return dict(existing._mapping)

        row = conn.execute(
            text("""
                insert into clients (
                    org_id,
                    phone
                )
                values (
                    :org_id,
                    :phone
                )
                returning *
            """),
            {
                "org_id": org_id,
                "phone": phone_value,
            },
        ).fetchone()

        conn.commit()

    return dict(row._mapping)


def create_commercial_dossier(
    org_id: str,
    client_id: str,
    case_type: str,
    fields: dict | None = None,
):
    fields = fields or {}
    dossier_case_type = _canonical_dossier_case_type(case_type)

    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into dossiers (
                    org_id,
                    client_id,
                    case_type,
                    status_global,
                    intake_status,
                    validation_status,
                    primary_channel,
                    origin_country,
                    origin_city,
                    destination_country,
                    destination_city,
                    goods_type,
                    estimated_weight_kg,
                    estimated_volume_cbm,
                    shipping_mode
                )
                values (
                    :org_id,
                    :client_id,
                    :case_type,
                    'LEAD',
                    'PARTIAL',
                    'PENDING',
                    'whatsapp',
                    :origin_country,
                    :origin_city,
                    :destination_country,
                    :destination_city,
                    :goods_type,
                    :estimated_weight_kg,
                    :estimated_volume_cbm,
                    :shipping_mode
                )
                returning *
            """),
            {
                "org_id": org_id,
                "client_id": client_id,
                "case_type": dossier_case_type,
                "origin_country": fields.get("origin_country"),
                "origin_city": fields.get("origin_city"),
                "destination_country": fields.get("destination_country"),
                "destination_city": fields.get("destination_city"),
                "goods_type": fields.get("goods_description")
                or fields.get("product_description"),
                "estimated_weight_kg": fields.get("weight_kg"),
                "estimated_volume_cbm": fields.get("volume_cbm"),
                "shipping_mode": fields.get("shipping_mode"),
            },
        ).fetchone()

        conn.commit()

    return dict(row._mapping)


def create_commercial_case(
    org_id: str,
    case_type: str,
    client_id: str | None = None,
    dossier_id: str | None = None,
    source_channel: str = "whatsapp",
    status: str = "OPEN",
    priority: str = "NORMAL",
    detected_intent: str | None = None,
    extracted_fields: dict | None = None,
    missing_fields: list | None = None,
    assigned_team: str | None = None,
    last_customer_message: str | None = None,
    last_system_response: str | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into commercial_cases (
                    org_id,
                    client_id,
                    dossier_id,
                    source_channel,
                    case_type,
                    status,
                    priority,
                    detected_intent,
                    extracted_fields,
                    missing_fields,
                    assigned_team,
                    last_customer_message,
                    last_system_response
                )
                values (
                    :org_id,
                    :client_id,
                    :dossier_id,
                    :source_channel,
                    :case_type,
                    :status,
                    :priority,
                    :detected_intent,
                    cast(:extracted_fields as jsonb),
                    cast(:missing_fields as jsonb),
                    :assigned_team,
                    :last_customer_message,
                    :last_system_response
                )
                returning *
            """),
            {
                "org_id": org_id,
                "client_id": client_id,
                "dossier_id": dossier_id,
                "source_channel": source_channel,
                "case_type": case_type,
                "status": status,
                "priority": priority,
                "detected_intent": detected_intent,
                "extracted_fields": _json(extracted_fields),
                "missing_fields": _json_list(missing_fields),
                "assigned_team": assigned_team,
                "last_customer_message": last_customer_message,
                "last_system_response": last_system_response,
            },
        ).fetchone()

        conn.commit()

    return dict(row._mapping)


def create_quote_request(
    org_id: str,
    commercial_case_id: str,
    dossier_id: str,
    client_id: str,
    fields: dict,
    status: str = "PENDING",
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into quote_requests (
                    org_id,
                    commercial_case_id,
                    dossier_id,
                    client_id,
                    origin_country,
                    origin_city,
                    destination_country,
                    destination_city,
                    goods_description,
                    goods_category,
                    weight_kg,
                    volume_cbm,
                    quantity,
                    shipping_mode,
                    requested_currency,
                    requested_eta,
                    status,
                    metadata
                )
                values (
                    :org_id,
                    :commercial_case_id,
                    :dossier_id,
                    :client_id,
                    :origin_country,
                    :origin_city,
                    :destination_country,
                    :destination_city,
                    :goods_description,
                    :goods_category,
                    :weight_kg,
                    :volume_cbm,
                    :quantity,
                    :shipping_mode,
                    :requested_currency,
                    :requested_eta,
                    :status,
                    cast(:metadata as jsonb)
                )
                returning *
            """),
            {
                "org_id": org_id,
                "commercial_case_id": commercial_case_id,
                "dossier_id": dossier_id,
                "client_id": client_id,
                "origin_country": fields.get("origin_country"),
                "origin_city": fields.get("origin_city"),
                "destination_country": fields.get("destination_country"),
                "destination_city": fields.get("destination_city"),
                "goods_description": fields.get("goods_description"),
                "goods_category": fields.get("goods_category"),
                "weight_kg": fields.get("weight_kg"),
                "volume_cbm": fields.get("volume_cbm"),
                "quantity": fields.get("quantity"),
                "shipping_mode": fields.get("shipping_mode"),
                "requested_currency": fields.get("requested_currency"),
                "requested_eta": fields.get("requested_eta"),
                "status": status,
                "metadata": _json(fields.get("metadata")),
            },
        ).fetchone()

        conn.commit()

    return dict(row._mapping)


def create_quotation(
    org_id: str,
    quote_request_id: str,
    commercial_case_id: str,
    dossier_id: str,
    service: dict,
    pricing: dict,
    restriction: dict,
    status: str = "DRAFT",
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into quotations (
                    org_id,
                    quote_request_id,
                    commercial_case_id,
                    dossier_id,
                    shipping_service_id,
                    service_name,
                    shipping_mode,
                    subtotal_minor,
                    total_minor,
                    currency_code,
                    eta_min_days,
                    eta_max_days,
                    pricing_breakdown,
                    restriction_decision,
                    required_documents,
                    required_declarations,
                    status,
                    valid_until
                )
                values (
                    :org_id,
                    :quote_request_id,
                    :commercial_case_id,
                    :dossier_id,
                    :shipping_service_id,
                    :service_name,
                    :shipping_mode,
                    :subtotal_minor,
                    :total_minor,
                    :currency_code,
                    :eta_min_days,
                    :eta_max_days,
                    cast(:pricing_breakdown as jsonb),
                    :restriction_decision,
                    cast(:required_documents as jsonb),
                    cast(:required_declarations as jsonb),
                    :status,
                    now() + interval '7 days'
                )
                returning *
            """),
            {
                "org_id": org_id,
                "quote_request_id": quote_request_id,
                "commercial_case_id": commercial_case_id,
                "dossier_id": dossier_id,
                "shipping_service_id": service["id"],
                "service_name": service["service_name"],
                "shipping_mode": service.get("shipping_mode"),
                "subtotal_minor": pricing.get("subtotal_minor"),
                "total_minor": pricing.get("total_minor"),
                "currency_code": pricing.get("currency_code"),
                "eta_min_days": service.get("eta_min_days"),
                "eta_max_days": service.get("eta_max_days"),
                "pricing_breakdown": _json_list(pricing.get("breakdown")) + [{"pricing_fingerprint": pricing.get("pricing_fingerprint"), "chargeable_weight_kg": pricing.get("chargeable_weight_kg")}],
                "restriction_decision": restriction.get("decision"),
                "required_documents": _json_list(restriction.get("required_documents")),
                "required_declarations": _json_list(restriction.get("required_declarations")),
                "status": status,
            },
        ).fetchone()

        conn.commit()

    return dict(row._mapping)


def create_procurement_request(
    org_id: str,
    commercial_case_id: str,
    dossier_id: str,
    client_id: str,
    fields: dict,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into procurement_requests (
                    org_id,
                    commercial_case_id,
                    dossier_id,
                    client_id,
                    product_description,
                    target_country,
                    destination_country,
                    budget_minor,
                    currency_code,
                    quantity,
                    quality_requirements,
                    status,
                    assigned_team,
                    metadata
                )
                values (
                    :org_id,
                    :commercial_case_id,
                    :dossier_id,
                    :client_id,
                    :product_description,
                    :target_country,
                    :destination_country,
                    :budget_minor,
                    :currency_code,
                    :quantity,
                    :quality_requirements,
                    'NEW',
                    'procurement',
                    cast(:metadata as jsonb)
                )
                returning *
            """),
            {
                "org_id": org_id,
                "commercial_case_id": commercial_case_id,
                "dossier_id": dossier_id,
                "client_id": client_id,
                "product_description": fields.get("product_description"),
                "target_country": fields.get("target_country"),
                "destination_country": fields.get("destination_country"),
                "budget_minor": fields.get("budget_minor"),
                "currency_code": fields.get("currency_code"),
                "quantity": fields.get("quantity"),
                "quality_requirements": fields.get("quality_requirements"),
                "metadata": _json(fields.get("metadata")),
            },
        ).fetchone()

        conn.commit()

    return dict(row._mapping)


def create_restriction_check(
    org_id: str,
    commercial_case_id: str,
    dossier_id: str,
    client_id: str,
    fields: dict,
    restriction: dict,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into cargo_restriction_checks (
                    org_id,
                    commercial_case_id,
                    dossier_id,
                    client_id,
                    goods_description,
                    goods_category,
                    origin_country,
                    destination_country,
                    shipping_mode,
                    decision,
                    handling_instructions,
                    required_documents,
                    required_declarations,
                    escalation_required,
                    raw_rule
                )
                values (
                    :org_id,
                    :commercial_case_id,
                    :dossier_id,
                    :client_id,
                    :goods_description,
                    :goods_category,
                    :origin_country,
                    :destination_country,
                    :shipping_mode,
                    :decision,
                    :handling_instructions,
                    cast(:required_documents as jsonb),
                    cast(:required_declarations as jsonb),
                    :escalation_required,
                    cast(:raw_rule as jsonb)
                )
                returning *
            """),
            {
                "org_id": org_id,
                "commercial_case_id": commercial_case_id,
                "dossier_id": dossier_id,
                "client_id": client_id,
                "goods_description": fields.get("goods_description"),
                "goods_category": fields.get("goods_category"),
                "origin_country": fields.get("origin_country"),
                "destination_country": fields.get("destination_country"),
                "shipping_mode": fields.get("shipping_mode"),
                "decision": restriction["decision"],
                "handling_instructions": restriction.get("handling_instructions"),
                "required_documents": _json_list(restriction.get("required_documents")),
                "required_declarations": _json_list(restriction.get("required_declarations")),
                "escalation_required": restriction.get("escalation_required", False),
                "raw_rule": _json(restriction.get("raw_rule")),
            },
        ).fetchone()

        conn.commit()

    return dict(row._mapping)


def create_commercial_task(
    org_id: str,
    commercial_case_id: str,
    dossier_id: str,
    task_type: str,
    title: str,
    description: str | None = None,
    priority: str = "NORMAL",
    assigned_team: str | None = None,
    metadata: dict | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into commercial_tasks (
                    org_id,
                    commercial_case_id,
                    dossier_id,
                    task_type,
                    title,
                    description,
                    priority,
                    assigned_team,
                    metadata
                )
                values (
                    :org_id,
                    :commercial_case_id,
                    :dossier_id,
                    :task_type,
                    :title,
                    :description,
                    :priority,
                    :assigned_team,
                    cast(:metadata as jsonb)
                )
                returning *
            """),
            {
                "org_id": org_id,
                "commercial_case_id": commercial_case_id,
                "dossier_id": dossier_id,
                "task_type": task_type,
                "title": title,
                "description": description,
                "priority": priority,
                "assigned_team": assigned_team,
                "metadata": _json(metadata),
            },
        ).fetchone()

        conn.commit()

    return dict(row._mapping)


def create_commercial_event(
    org_id: str,
    event_type: str,
    event_title: str,
    commercial_case_id: str | None = None,
    dossier_id: str | None = None,
    event_payload: dict | None = None,
    actor_type: str = "system",
    actor_id: str | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into commercial_events (
                    org_id,
                    commercial_case_id,
                    dossier_id,
                    event_type,
                    event_title,
                    event_payload,
                    actor_type,
                    actor_id
                )
                values (
                    :org_id,
                    :commercial_case_id,
                    :dossier_id,
                    :event_type,
                    :event_title,
                    cast(:event_payload as jsonb),
                    :actor_type,
                    :actor_id
                )
                returning *
            """),
            {
                "org_id": org_id,
                "commercial_case_id": commercial_case_id,
                "dossier_id": dossier_id,
                "event_type": event_type,
                "event_title": event_title,
                "event_payload": _json(event_payload),
                "actor_type": actor_type,
                "actor_id": actor_id,
            },
        ).fetchone()

        conn.commit()

    return dict(row._mapping)


def create_commercial_followup(
    org_id: str,
    commercial_case_id: str,
    dossier_id: str,
    followup_type: str,
    message_template: str,
    metadata: dict | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into commercial_followups (
                    org_id,
                    commercial_case_id,
                    dossier_id,
                    followup_type,
                    scheduled_at,
                    message_template,
                    metadata
                )
                values (
                    :org_id,
                    :commercial_case_id,
                    :dossier_id,
                    :followup_type,
                    now() + interval '24 hours',
                    :message_template,
                    cast(:metadata as jsonb)
                )
                returning *
            """),
            {
                "org_id": org_id,
                "commercial_case_id": commercial_case_id,
                "dossier_id": dossier_id,
                "followup_type": followup_type,
                "message_template": message_template,
                "metadata": _json(metadata),
            },
        ).fetchone()

        conn.commit()

    return dict(row._mapping)


def list_commercial_cases(
    org_id: str,
    status: str | None = None,
    limit: int = 100,
):
    where_sql = "org_id = :org_id"
    params = {
        "org_id": org_id,
        "limit": limit,
    }

    if status:
        where_sql += " and status = :status"
        params["status"] = status

    with engine.connect() as conn:
        rows = conn.execute(
            text(f"""
                select *
                from commercial_cases
                where {where_sql}
                order by created_at desc
                limit :limit
            """),
            params,
        ).fetchall()

    return [dict(row._mapping) for row in rows]


def list_quotations(
    org_id: str,
    limit: int = 100,
):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select *
                from quotations
                where org_id = :org_id
                order by created_at desc
                limit :limit
            """),
            {
                "org_id": org_id,
                "limit": limit,
            },
        ).fetchall()

    return [dict(row._mapping) for row in rows]


def list_procurements(
    org_id: str,
    limit: int = 100,
):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select *
                from procurement_requests
                where org_id = :org_id
                order by created_at desc
                limit :limit
            """),
            {
                "org_id": org_id,
                "limit": limit,
            },
        ).fetchall()

    return [dict(row._mapping) for row in rows]


def list_restrictions(
    org_id: str,
    limit: int = 100,
):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select *
                from cargo_restriction_checks
                where org_id = :org_id
                order by created_at desc
                limit :limit
            """),
            {
                "org_id": org_id,
                "limit": limit,
            },
        ).fetchall()

    return [dict(row._mapping) for row in rows]


def list_commercial_tasks(
    org_id: str,
    status: str | None = None,
    limit: int = 100,
):
    where_sql = "org_id = :org_id"
    params = {
        "org_id": org_id,
        "limit": limit,
    }

    if status:
        where_sql += " and status = :status"
        params["status"] = status

    with engine.connect() as conn:
        rows = conn.execute(
            text(f"""
                select *
                from commercial_tasks
                where {where_sql}
                order by created_at desc
                limit :limit
            """),
            params,
        ).fetchall()

    return [dict(row._mapping) for row in rows]
