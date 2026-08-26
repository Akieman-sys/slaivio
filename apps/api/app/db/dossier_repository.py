from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from math import ceil
from typing import Any
from uuid import uuid4

from sqlalchemy import text

from app.db.database import engine


DOSSIER_STATUSES = {
    "LEAD",
    "DRAFT",
    "QUOTED",
    "WAITING_PACKAGES",
    "IN_WAREHOUSE",
    "READY_TO_SHIP",
    "IN_TRANSIT",
    "ARRIVED",
    "CUSTOMS",
    "READY_FOR_DELIVERY",
    "DELIVERED",
    "COMPLETED",
    "CLOSED",
    "CANCELLED",
}
DOSSIER_CASE_TYPES = {
    "UNKNOWN",
    "IMPORT",
    "EXPORT",
    "PURCHASE",
    "QUOTE",
    "PERSONAL_EFFECTS",
    "COMMERCIAL_CARGO",
}
DOSSIER_INTAKE_STATUSES = {"PARTIAL", "COMPLETE", "WAITING_CLIENT", "WAITING_PACKAGE"}
DOSSIER_VALIDATION_STATUSES = {"PENDING", "VALIDATED", "REJECTED", "NEEDS_REVIEW"}
DOSSIER_PAYMENT_STATUSES = {"PENDING", "WAITING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"}

DOSSIER_STATUS_TRANSITIONS = {
    "LEAD": {"DRAFT", "QUOTED", "CANCELLED"},
    "DRAFT": {"LEAD", "QUOTED", "WAITING_PACKAGES", "CANCELLED"},
    "QUOTED": {"DRAFT", "WAITING_PACKAGES", "CANCELLED"},
    "WAITING_PACKAGES": {"IN_WAREHOUSE", "CANCELLED"},
    "IN_WAREHOUSE": {"WAITING_PACKAGES", "READY_TO_SHIP", "CANCELLED"},
    "READY_TO_SHIP": {"IN_WAREHOUSE", "IN_TRANSIT", "CANCELLED"},
    "IN_TRANSIT": {"ARRIVED"},
    "ARRIVED": {"CUSTOMS", "READY_FOR_DELIVERY"},
    "CUSTOMS": {"READY_FOR_DELIVERY"},
    "READY_FOR_DELIVERY": {"DELIVERED"},
    "DELIVERED": {"COMPLETED"},
    "COMPLETED": {"CLOSED"},
    "CLOSED": set(),
    "CANCELLED": set(),
}


def _safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_safe(item) for item in value]
    return value


def _one(row) -> dict | None:
    return _safe(dict(row._mapping)) if row else None


def _table_exists(conn, table_name: str) -> bool:
    return bool(conn.execute(text("select to_regclass(:table_name)"), {"table_name": f"public.{table_name}"}).scalar())


def _dossier_reference_sql() -> str:
    return "d.dossier_reference"


def validate_dossier_transition(existing: dict, updated: dict) -> None:
    previous_status = existing["status_global"]
    next_status = updated["status_global"]
    if next_status != previous_status and next_status not in DOSSIER_STATUS_TRANSITIONS[previous_status]:
        raise ValueError("invalid_dossier_status_transition")
    if next_status in {"READY_TO_SHIP", "IN_TRANSIT"}:
        if updated.get("intake_status") != "COMPLETE":
            raise ValueError("dossier_intake_incomplete")
        if updated.get("validation_status") != "VALIDATED":
            raise ValueError("dossier_not_validated")
        required = ("origin_country", "destination_country", "shipping_mode")
        if any(not updated.get(field) for field in required):
            raise ValueError("dossier_route_incomplete")


def validate_dossier_financials(dossier: dict) -> None:
    if dossier.get("quoted_total") is not None and not dossier.get("quoted_currency"):
        raise ValueError("quoted_currency_required")
    if dossier.get("final_total") is not None and not dossier.get("final_currency"):
        raise ValueError("final_currency_required")
    if dossier.get("supplier_payment_amount") is not None and not dossier.get("supplier_payment_currency"):
        raise ValueError("supplier_payment_currency_required")


def _client_display_sql() -> str:
    return "coalesce(to_jsonb(c)->>'display_name', c.name, to_jsonb(c)->>'company_name', c.phone, c.email, 'Client sans nom')"


def _build_dossier_filters(
    org_id: str,
    *,
    q: str | None,
    status_global: str | None,
    case_type: str | None,
    intake_status: str | None,
    validation_status: str | None,
    payment_status: str | None,
    client_id: str | None,
    active_only: bool = False,
    attention_required: bool = False,
    updated_since_hours: int | None = None,
    archived: bool = False,
) -> tuple[str, dict]:
    filters = ["d.org_id = :org_id", "d.archived_at is not null" if archived else "d.archived_at is null"]
    params: dict[str, Any] = {"org_id": org_id}

    if q:
        filters.append(
            f"""(
                {_dossier_reference_sql()} ilike :q
                or coalesce(d.goods_type, '') ilike :q
                or coalesce(d.origin_city, '') ilike :q
                or coalesce(d.origin_country, '') ilike :q
                or coalesce(d.destination_city, '') ilike :q
                or coalesce(d.destination_country, '') ilike :q
                or {_client_display_sql()} ilike :q
                or coalesce(c.phone, '') ilike :q
                or coalesce(c.email, '') ilike :q
                or exists (
                    select 1
                    from dossier_clients relation
                    join clients member
                      on member.org_id = relation.org_id
                     and member.id = relation.client_id
                    where relation.org_id = d.org_id
                      and relation.dossier_id = d.id
                      and relation.archived_at is null
                      and (
                        coalesce(member.client_reference, '') ilike :q
                        or coalesce(member.display_name, member.name, member.company_name, '') ilike :q
                        or coalesce(member.phone, '') ilike :q
                        or coalesce(member.whatsapp_phone, '') ilike :q
                        or coalesce(member.email, '') ilike :q
                      )
                )
            )"""
        )
        params["q"] = f"%{q.strip()}%"
    if status_global:
        filters.append("d.status_global = :status_global")
        params["status_global"] = status_global
    if case_type:
        filters.append("d.case_type = :case_type")
        params["case_type"] = case_type
    if intake_status:
        filters.append("d.intake_status = :intake_status")
        params["intake_status"] = intake_status
    if validation_status:
        filters.append("d.validation_status = :validation_status")
        params["validation_status"] = validation_status
    if payment_status:
        filters.append("d.payment_status = :payment_status")
        params["payment_status"] = payment_status
    if client_id:
        filters.append("""exists (
            select 1 from dossier_clients relation
            where relation.org_id = d.org_id
              and relation.dossier_id = d.id
              and relation.client_id = :client_id
              and relation.archived_at is null
        )""")
        params["client_id"] = client_id
    if active_only:
        filters.append("d.status_global not in ('COMPLETED', 'CLOSED', 'CANCELLED')")
    if attention_required:
        filters.append("""exists (
            select 1 from dossier_clients relation
            where relation.org_id = d.org_id
              and relation.dossier_id = d.id
              and relation.archived_at is null
              and relation.attention_required
        )""")
    if updated_since_hours is not None:
        filters.append("coalesce(d.updated_at, d.created_at) >= now() - (:updated_since_hours * interval '1 hour')")
        params["updated_since_hours"] = updated_since_hours

    return " and ".join(filters), params


def list_dossiers(
    org_id: str,
    *,
    q: str | None = None,
    status_global: str | None = None,
    case_type: str | None = None,
    intake_status: str | None = None,
    validation_status: str | None = None,
    payment_status: str | None = None,
    client_id: str | None = None,
    active_only: bool = False,
    attention_required: bool = False,
    updated_since_hours: int | None = None,
    page: int = 1,
    page_size: int = 30,
    sort: str = "updated_desc",
    archived: bool = False,
) -> dict:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size
    where_clause, params = _build_dossier_filters(
        org_id,
        q=q,
        status_global=status_global,
        case_type=case_type,
        intake_status=intake_status,
        validation_status=validation_status,
        payment_status=payment_status,
        client_id=client_id,
        active_only=active_only,
        attention_required=attention_required,
        updated_since_hours=updated_since_hours,
        archived=archived,
    )
    order_by = {
        "created_asc": "d.created_at asc",
        "created_desc": "d.created_at desc",
        "updated_asc": "d.updated_at asc nulls last, d.created_at asc",
        "reference_asc": "dossier_reference asc",
        "reference_desc": "dossier_reference desc",
        "client_asc": "client_name asc nulls last",
        "amount_desc": "coalesce(d.final_total, d.quoted_total, 0) desc",
    }.get(sort, "d.updated_at desc nulls last, d.created_at desc")

    with engine.connect() as conn:
        total = conn.execute(
            text(f"""
                select count(*)::int
                from dossiers d
                left join clients c on c.id = d.client_id and c.org_id = d.org_id
                where {where_clause}
            """),
            params,
        ).scalar() or 0

        rows = conn.execute(
            text(f"""
                select
                    d.id::text,
                    d.org_id,
                    d.client_id::text,
                    {_dossier_reference_sql()} dossier_reference,
                    {_client_display_sql()} client_name,
                    c.phone client_phone,
                    c.email client_email,
                    d.case_type,
                    d.status_global,
                    d.intake_status,
                    d.validation_status,
                    d.primary_channel,
                    d.origin_country,
                    d.origin_city,
                    d.destination_country,
                    d.destination_city,
                    d.goods_type,
                    d.estimated_weight_kg,
                    d.estimated_volume_cbm,
                    d.shipping_mode,
                    d.tracking_id,
                    d.quoted_total,
                    d.quoted_currency,
                    d.pricing_status,
                    d.final_total,
                    d.final_currency,
                    d.payment_status,
                    d.client_full_name,
                    d.supplier_payment_amount,
                    d.supplier_payment_currency,
                    d.priority,
                    d.assigned_to,
                    d.assigned_at,
                    d.assigned_by,
                    d.due_at,
                    d.created_at,
                    d.updated_at,
                    d.row_version,
                    d.archived_at,
                    d.archived_by,
                    coalesce(dc.client_count, 0)::int client_count,
                    coalesce(dc.attention_count, 0)::int attention_count,
                    coalesce(m.message_count, 0)::int message_count,
                    coalesce(e.event_count, 0)::int event_count,
                    coalesce(p.package_count, 0)::int package_count,
                    coalesce(s.shipment_count, 0)::int shipment_count
                from dossiers d
                left join clients c on c.id = d.client_id and c.org_id = d.org_id
                left join (
                    select dossier_id,
                           count(*)::int client_count,
                           count(*) filter (where attention_required)::int attention_count
                    from dossier_clients
                    where org_id = :org_id and archived_at is null
                    group by dossier_id
                ) dc on dc.dossier_id = d.id
                left join (
                    select dossier_id, count(*) message_count
                    from messages_raw
                    where org_id = :org_id and dossier_id is not null
                    group by dossier_id
                ) m on m.dossier_id = d.id
                left join (
                    select dossier_id, count(*) event_count
                    from dossier_events
                    where org_id = :org_id
                    group by dossier_id
                ) e on e.dossier_id = d.id
                left join (
                    select dossier_id, count(*) package_count
                    from cargo_packages
                    where org_id = :org_id and dossier_id is not null and deleted_at is null
                    group by dossier_id
                ) p on p.dossier_id = d.id
                left join (
                    select dossier_id, count(*) shipment_count
                    from shipments
                    where org_id = :org_id and dossier_id is not null
                    group by dossier_id
                ) s on s.dossier_id = d.id
                where {where_clause}
                order by {order_by}
                limit :limit offset :offset
            """),
            dict(params, limit=page_size, offset=offset),
        ).fetchall()

    return {
        "items": [_safe(dict(row._mapping)) for row in rows],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": ceil(total / page_size) if total else 0,
        },
    }


def dossier_stats(org_id: str) -> dict:
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select
                    count(*)::int total,
                    count(*) filter (where status_global not in ('COMPLETED', 'CLOSED', 'CANCELLED'))::int active,
                    count(*) filter (where status_global in ('LEAD', 'DRAFT'))::int leads,
                    count(*) filter (where status_global = 'QUOTED')::int quoted,
                    count(*) filter (where status_global in ('WAITING_PACKAGES', 'IN_WAREHOUSE', 'READY_TO_SHIP'))::int waiting_packages,
                    count(*) filter (where status_global = 'IN_TRANSIT')::int in_transit,
                    count(*) filter (where status_global in ('DELIVERED', 'COMPLETED', 'CLOSED'))::int delivered,
                    count(*) filter (where payment_status in ('PENDING', 'WAITING', 'PARTIAL', 'OVERDUE'))::int payment_pending,
                    coalesce(sum(coalesce(final_total, quoted_total, 0)), 0) total_value,
                    (select count(*)::int from dossier_clients relation
                     where relation.org_id = :org_id and relation.archived_at is null) client_memberships,
                    (select count(*)::int from dossier_clients relation
                     where relation.org_id = :org_id and relation.archived_at is null
                       and relation.attention_required) clients_requiring_attention,
                    (select count(distinct relation.dossier_id)::int
                     from dossier_clients relation
                     join dossiers attention_dossier
                       on attention_dossier.org_id = relation.org_id
                      and attention_dossier.id = relation.dossier_id
                     where relation.org_id = :org_id and relation.archived_at is null
                       and relation.attention_required and attention_dossier.archived_at is null)
                      dossiers_requiring_attention,
                    (select count(*)::int from dossiers archived_dossier
                     where archived_dossier.org_id = :org_id
                       and archived_dossier.archived_at is not null) archived
                from dossiers
                where org_id = :org_id and archived_at is null
            """),
            {"org_id": org_id},
        ).fetchone()
    return _one(row) or {
        "total": 0,
        "active": 0,
        "leads": 0,
        "quoted": 0,
        "waiting_packages": 0,
        "in_transit": 0,
        "delivered": 0,
        "payment_pending": 0,
        "total_value": 0,
        "client_memberships": 0,
        "clients_requiring_attention": 0,
        "dossiers_requiring_attention": 0,
        "archived": 0,
    }


def get_dossier(org_id: str, dossier_id: str, *, include_archived: bool = False) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(
            text(f"""
                select
                    d.id::text,
                    d.org_id,
                    d.client_id::text,
                    {_dossier_reference_sql()} dossier_reference,
                    {_client_display_sql()} client_name,
                    c.phone client_phone,
                    c.whatsapp_phone client_whatsapp_phone,
                    c.email client_email,
                    c.country client_country,
                    c.city client_city,
                    d.case_type,
                    d.status_global,
                    d.intake_status,
                    d.validation_status,
                    d.primary_channel,
                    d.origin_country,
                    d.origin_city,
                    d.destination_country,
                    d.destination_city,
                    d.goods_type,
                    d.estimated_weight_kg,
                    d.estimated_volume_cbm,
                    d.shipping_mode,
                    d.tracking_id,
                    d.quoted_total,
                    d.quoted_currency,
                    d.pricing_status,
                    d.final_total,
                    d.final_currency,
                    d.payment_status,
                    d.client_full_name,
                    d.supplier_payment_amount,
                    d.supplier_payment_currency,
                    d.priority,
                    d.assigned_to,
                    d.assigned_at,
                    d.assigned_by,
                    d.due_at,
                    d.created_at,
                    d.updated_at,
                    d.row_version,
                    d.archived_at,
                    d.archived_by,
                    coalesce(dc.client_count, 0)::int client_count,
                    coalesce(dc.attention_count, 0)::int attention_count,
                    coalesce(m.message_count, 0)::int message_count,
                    coalesce(e.event_count, 0)::int event_count,
                    coalesce(p.package_count, 0)::int package_count,
                    coalesce(s.shipment_count, 0)::int shipment_count
                from dossiers d
                left join clients c on c.id = d.client_id and c.org_id = d.org_id
                left join (
                    select dossier_id,
                           count(*)::int client_count,
                           count(*) filter (where attention_required)::int attention_count
                    from dossier_clients
                    where org_id = :org_id and dossier_id = :dossier_id and archived_at is null
                    group by dossier_id
                ) dc on dc.dossier_id = d.id
                left join (
                    select dossier_id, count(*) message_count
                    from messages_raw
                    where org_id = :org_id and dossier_id = :dossier_id
                    group by dossier_id
                ) m on m.dossier_id = d.id
                left join (
                    select dossier_id, count(*) event_count
                    from dossier_events
                    where org_id = :org_id and dossier_id = :dossier_id
                    group by dossier_id
                ) e on e.dossier_id = d.id
                left join (
                    select dossier_id, count(*) package_count
                    from cargo_packages
                    where org_id = :org_id and dossier_id = :dossier_id and deleted_at is null
                    group by dossier_id
                ) p on p.dossier_id = d.id
                left join (
                    select dossier_id, count(*) shipment_count
                    from shipments
                    where org_id = :org_id and dossier_id = :dossier_id
                    group by dossier_id
                ) s on s.dossier_id = d.id
                where d.org_id = :org_id and d.id = :dossier_id
                  and (:include_archived or d.archived_at is null)
                limit 1
            """),
            {"org_id": org_id, "dossier_id": dossier_id, "include_archived": include_archived},
        ).fetchone()

        dossier = _one(row)
        if not dossier:
            return None

        messages = conn.execute(
            text("""
                select id::text, sender_phone, message_text, raw_payload, created_at
                from messages_raw
                where org_id = :org_id and dossier_id = :dossier_id
                order by created_at desc
                limit 30
            """),
            {"org_id": org_id, "dossier_id": dossier_id},
        ).fetchall()
        events = conn.execute(
            text("""
                select id::text, event_type, payload, created_at
                from dossier_events
                where org_id = :org_id and dossier_id = :dossier_id
                order by created_at desc
                limit 40
            """),
            {"org_id": org_id, "dossier_id": dossier_id},
        ).fetchall()
        notifications = conn.execute(
            text("""
                select id::text, channel, recipient_phone, notification_type, message, status, provider, created_at, sent_at, failed_at, error_message
                from notification_outbox
                where org_id = :org_id and dossier_id = :dossier_id
                order by created_at desc
                limit 30
            """),
            {"org_id": org_id, "dossier_id": dossier_id},
        ).fetchall()
        shipments = conn.execute(
            text("""
                select
                    id::text,
                    tracking_id,
                    status,
                    origin_country,
                    origin_city,
                    destination_country,
                    destination_city,
                    weight_kg as total_weight_kg,
                    volume_cbm as total_volume_cbm,
                    created_at,
                    updated_at
                from shipments
                where org_id = :org_id and dossier_id = :dossier_id
                order by created_at desc
                limit 30
            """),
            {"org_id": org_id, "dossier_id": dossier_id},
        ).fetchall()
        clients = conn.execute(
            text("""
                select
                  relation.id::text relation_id,
                  relation.client_id::text,
                  client.client_reference,
                  coalesce(client.display_name, client.name, client.company_name, client.phone, client.email, 'Client sans nom') display_name,
                  client.phone,
                  client.whatsapp_phone,
                  client.email,
                  client.customer_type,
                  relation.relationship_role,
                  relation.situation,
                  relation.status_in_dossier,
                  relation.attention_required,
                  relation.attention_reason,
                  relation.last_updated_at,
                  relation.row_version
                from dossier_clients relation
                join clients client
                  on client.org_id = relation.org_id and client.id = relation.client_id
                where relation.org_id = :org_id and relation.dossier_id = :dossier_id
                  and relation.archived_at is null
                order by (relation.relationship_role = 'PRIMARY') desc,
                         relation.attention_required desc, relation.last_updated_at desc
            """),
            {"org_id": org_id, "dossier_id": dossier_id},
        ).fetchall()

    dossier["messages"] = [_safe(dict(row._mapping)) for row in messages]
    dossier["events"] = [_safe(dict(row._mapping)) for row in events]
    dossier["notifications"] = [_safe(dict(row._mapping)) for row in notifications]
    dossier["shipments"] = [_safe(dict(row._mapping)) for row in shipments]
    dossier["clients"] = [_safe(dict(row._mapping)) for row in clients]
    return dossier


def _client_exists(conn, org_id: str, client_id: str) -> bool:
    return bool(conn.execute(
        text("select 1 from clients where org_id = :org_id and id = :client_id limit 1"),
        {"org_id": org_id, "client_id": client_id},
    ).scalar())


def _hydrate_references(conn, org_id: str, payload: dict) -> dict:
    """Resolve display snapshots from IDs owned by their source modules."""
    data = dict(payload)
    route_id = data.get("route_id")
    service_id = data.get("shipping_service_id")
    if service_id:
        service = conn.execute(text("""
            select id::text,route_id::text,shipping_mode
            from shipping_services where org_id=:org_id and id=:id
        """), {"org_id": org_id, "id": service_id}).mappings().first()
        if not service:
            raise ValueError("shipping_service_not_found")
        if route_id and service.get("route_id") != route_id:
            offered = conn.execute(text("""select 1 from service_route_offerings
                where org_id=:org_id and service_id=:service_id and route_id=:route_id
                and availability in('AVAILABLE','LIMITED') and effective_from<=now()
                and (effective_until is null or effective_until>now())"""),
                {"org_id": org_id, "service_id": service_id, "route_id": route_id}).first()
            if not offered:
                raise ValueError("service_route_mismatch")
        route_id = route_id or service.get("route_id")
        data["route_id"] = route_id
        data["shipping_mode"] = service.get("shipping_mode")
    if route_id:
        route = conn.execute(text("""
            select origin_country,origin_city,destination_country,destination_city,transport_mode
            from shipping_routes where org_id=:org_id and id=:id
        """), {"org_id": org_id, "id": route_id}).mappings().first()
        if not route:
            raise ValueError("route_not_found")
        data.update({
            "origin_country": route["origin_country"], "origin_city": route["origin_city"],
            "destination_country": route["destination_country"], "destination_city": route["destination_city"],
            "shipping_mode": data.get("shipping_mode") or route["transport_mode"],
        })
    return data


def create_dossier(org_id: str, user_id: str, payload: dict) -> dict:
    client_id = payload.get("client_id")
    validate_dossier_financials(payload)

    with engine.begin() as conn:
        if client_id and not _client_exists(conn, org_id, client_id):
            raise ValueError("client_not_found")
        payload = _hydrate_references(conn, org_id, payload)
        row = conn.execute(
            text("""
                insert into dossiers (
                    org_id, client_id, dossier_reference, case_type, status_global, intake_status,
                    validation_status, primary_channel, origin_country, origin_city,
                    destination_country, destination_city, goods_type,
                    estimated_weight_kg, estimated_volume_cbm, shipping_mode,
                    tracking_id, quoted_total, quoted_currency, pricing_status,
                    final_total, final_currency, payment_status, client_full_name,
                    supplier_payment_amount, supplier_payment_currency, workspace_id, route_id,
                    shipping_service_id, origin_warehouse_id, destination_office_id, pricing_snapshot_id,
                    idempotency_key, created_by, updated_by
                )
                values (
                    :org_id, :client_id, :dossier_reference, :case_type, :status_global, :intake_status,
                    :validation_status, :primary_channel, :origin_country, :origin_city,
                    :destination_country, :destination_city, :goods_type,
                    :estimated_weight_kg, :estimated_volume_cbm, :shipping_mode,
                    :tracking_id, :quoted_total, :quoted_currency, :pricing_status,
                    :final_total, :final_currency, :payment_status, :client_full_name,
                    :supplier_payment_amount, :supplier_payment_currency, :workspace_id, :route_id,
                    :shipping_service_id, :origin_warehouse_id, :destination_office_id, :pricing_snapshot_id,
                    :idempotency_key, :user_id, :user_id
                )
                on conflict (org_id, idempotency_key)
                  where idempotency_key is not null
                do nothing
                returning id::text
            """),
            {
                "org_id": org_id,
                "client_id": client_id,
                "dossier_reference": f"DOS-{datetime.now().year}-{uuid4().hex[:10].upper()}",
                "case_type": payload.get("case_type") or "UNKNOWN",
                "status_global": payload.get("status_global") or "LEAD",
                "intake_status": payload.get("intake_status") or "PARTIAL",
                "validation_status": payload.get("validation_status") or "PENDING",
                "primary_channel": payload.get("primary_channel") or "manual",
                "origin_country": payload.get("origin_country"),
                "origin_city": payload.get("origin_city"),
                "destination_country": payload.get("destination_country"),
                "destination_city": payload.get("destination_city"),
                "goods_type": payload.get("goods_type"),
                "estimated_weight_kg": payload.get("estimated_weight_kg"),
                "estimated_volume_cbm": payload.get("estimated_volume_cbm"),
                "shipping_mode": payload.get("shipping_mode"),
                "tracking_id": payload.get("tracking_id"),
                "quoted_total": payload.get("quoted_total"),
                "quoted_currency": payload.get("quoted_currency"),
                "pricing_status": payload.get("pricing_status"),
                "final_total": payload.get("final_total"),
                "final_currency": payload.get("final_currency"),
                "payment_status": payload.get("payment_status") or "PENDING",
                "client_full_name": payload.get("client_full_name"),
                "supplier_payment_amount": payload.get("supplier_payment_amount"),
                "supplier_payment_currency": payload.get("supplier_payment_currency"),
                "workspace_id": payload.get("workspace_id"),
                "route_id": payload.get("route_id"),
                "shipping_service_id": payload.get("shipping_service_id"),
                "origin_warehouse_id": payload.get("origin_warehouse_id"),
                "destination_office_id": payload.get("destination_office_id"),
                "pricing_snapshot_id": payload.get("pricing_snapshot_id"),
                "idempotency_key": payload.get("idempotency_key"),
                "user_id": user_id,
            },
        ).fetchone()
        if not row:
            replayed = conn.execute(text("""
                select id::text from dossiers
                where org_id = :org_id and idempotency_key = :idempotency_key
                limit 1
            """), {"org_id": org_id, "idempotency_key": payload.get("idempotency_key")}).fetchone()
            if not replayed:
                raise ValueError("dossier_creation_conflict")
            dossier_id = str(replayed[0])
            return get_dossier(org_id, dossier_id, include_archived=True) or {}
        dossier_id = str(row[0])
        conn.execute(
            text("""
                insert into dossier_events (org_id, dossier_id, event_type, payload)
                values (:org_id, :dossier_id, 'DOSSIER_CREATED', cast(:payload as jsonb))
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
                "payload": _json_payload({"user_id": user_id, "source": "dashboard"}),
            },
        )

    created = get_dossier(org_id, dossier_id)
    return created or {}


def update_dossier(org_id: str, dossier_id: str, user_id: str, payload: dict) -> dict | None:
    existing = get_dossier(org_id, dossier_id)
    if not existing:
        return None

    allowed = {
        "client_id", "case_type", "status_global", "intake_status", "validation_status",
        "primary_channel", "origin_country", "origin_city", "destination_country",
        "destination_city", "goods_type", "estimated_weight_kg", "estimated_volume_cbm",
        "shipping_mode", "tracking_id", "quoted_total", "quoted_currency", "pricing_status",
        "final_total", "final_currency", "payment_status", "client_full_name",
        "supplier_payment_amount", "supplier_payment_currency",
        "workspace_id", "route_id", "shipping_service_id", "origin_warehouse_id",
        "destination_office_id", "pricing_snapshot_id",
    }
    data = {key: payload.get(key, existing.get(key)) for key in allowed}
    expected_version = int(payload["row_version"])
    validate_dossier_transition(existing, data)
    validate_dossier_financials(data)

    with engine.begin() as conn:
        if data.get("client_id") and not _client_exists(conn, org_id, data["client_id"]):
            raise ValueError("client_not_found")
        data = _hydrate_references(conn, org_id, data)
        result = conn.execute(
            text("""
                update dossiers set
                    client_id = :client_id,
                    case_type = :case_type,
                    status_global = :status_global,
                    intake_status = :intake_status,
                    validation_status = :validation_status,
                    primary_channel = :primary_channel,
                    origin_country = :origin_country,
                    origin_city = :origin_city,
                    destination_country = :destination_country,
                    destination_city = :destination_city,
                    goods_type = :goods_type,
                    estimated_weight_kg = :estimated_weight_kg,
                    estimated_volume_cbm = :estimated_volume_cbm,
                    shipping_mode = :shipping_mode,
                    tracking_id = :tracking_id,
                    quoted_total = :quoted_total,
                    quoted_currency = :quoted_currency,
                    pricing_status = :pricing_status,
                    final_total = :final_total,
                    final_currency = :final_currency,
                    payment_status = :payment_status,
                    client_full_name = :client_full_name,
                    supplier_payment_amount = :supplier_payment_amount,
                    supplier_payment_currency = :supplier_payment_currency,
                    workspace_id = :workspace_id,
                    route_id = :route_id,
                    shipping_service_id = :shipping_service_id,
                    origin_warehouse_id = :origin_warehouse_id,
                    destination_office_id = :destination_office_id,
                    pricing_snapshot_id = :pricing_snapshot_id,
                    updated_by = :user_id,
                    updated_at = now(),
                    row_version = row_version + 1
                where org_id = :org_id
                  and id = :dossier_id
                  and row_version = :expected_version
            """),
            dict(
                data,
                org_id=org_id,
                dossier_id=dossier_id,
                expected_version=expected_version,
                user_id=user_id,
            ),
        )
        if result.rowcount == 0:
            raise ValueError("stale_dossier_version")
        conn.execute(
            text("""
                insert into dossier_events (org_id, dossier_id, event_type, payload)
                values (:org_id, :dossier_id, 'DOSSIER_UPDATED', cast(:payload as jsonb))
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
                "payload": _json_payload({"user_id": user_id, "changes": payload}),
            },
        )
    return get_dossier(org_id, dossier_id)


def _audit_dossier(conn, org_id: str, dossier_id: str, user_id: str, action: str) -> None:
    payload = _json_payload({"user_id": user_id, "action": action})
    conn.execute(text("""
        insert into dossier_events (org_id, dossier_id, event_type, payload)
        values (:org_id, :dossier_id, :event_type, cast(:payload as jsonb))
    """), {"org_id": org_id, "dossier_id": dossier_id,
             "event_type": action.upper().replace(".", "_"), "payload": payload})
    conn.execute(text("""
        insert into audit_logs (org_id, actor_id, entity_type, entity_id, action, metadata, severity)
        values (:org_id, :user_id, 'dossier', :dossier_id, :action,
                cast(:payload as jsonb), 'INFO')
    """), {"org_id": org_id, "user_id": user_id, "dossier_id": dossier_id,
             "action": action, "payload": payload})


def archive_dossier(org_id: str, dossier_id: str, user_id: str, *, expected_version: int) -> bool:
    with engine.begin() as conn:
        result = conn.execute(text("""
            update dossiers
            set archived_at = now(), archived_by = :user_id, updated_at = now(),
                row_version = row_version + 1
            where org_id = :org_id and id = :dossier_id
              and archived_at is null and row_version = :expected_version
        """), {"org_id": org_id, "dossier_id": dossier_id, "user_id": user_id,
                 "expected_version": expected_version})
        if result.rowcount:
            _audit_dossier(conn, org_id, dossier_id, user_id, "dossier.archived")
    if result.rowcount == 0 and get_dossier(org_id, dossier_id):
        raise ValueError("stale_dossier_version")
    return result.rowcount > 0


def restore_dossier(org_id: str, dossier_id: str, user_id: str, *, expected_version: int) -> dict | None:
    with engine.begin() as conn:
        result = conn.execute(text("""
            update dossiers
            set archived_at = null, archived_by = null, updated_at = now(),
                row_version = row_version + 1
            where org_id = :org_id and id = :dossier_id
              and archived_at is not null and row_version = :expected_version
        """), {"org_id": org_id, "dossier_id": dossier_id, "user_id": user_id,
                 "expected_version": expected_version})
        if result.rowcount:
            _audit_dossier(conn, org_id, dossier_id, user_id, "dossier.restored")
    if result.rowcount == 0:
        if get_dossier(org_id, dossier_id, include_archived=True):
            raise ValueError("stale_dossier_version")
        return None
    return get_dossier(org_id, dossier_id)


def _json_payload(payload: dict) -> str:
    import json

    return json.dumps(payload, default=str, ensure_ascii=False)


def export_dossiers(
    org_id: str,
    *,
    q: str | None = None,
    status_global: str | None = None,
    case_type: str | None = None,
    intake_status: str | None = None,
    validation_status: str | None = None,
    payment_status: str | None = None,
    sort: str = "updated_desc",
) -> list[dict]:
    return list_dossiers(
        org_id,
        q=q,
        status_global=status_global,
        case_type=case_type,
        intake_status=intake_status,
        validation_status=validation_status,
        payment_status=payment_status,
        page=1,
        page_size=5000,
        sort=sort,
    )["items"]


def dossier_timeline(org_id: str, dossier_id: str, *, limit: int = 80) -> list[dict]:
    dossier = get_dossier(org_id, dossier_id)
    if not dossier:
        return []

    events: list[dict] = [
        {
            "id": f"dossier-created-{dossier_id}",
            "type": "dossier",
            "title": "Dossier créé",
            "description": dossier.get("dossier_reference") or "Dossier créé",
            "occurred_at": dossier.get("created_at"),
            "metadata": {"status": dossier.get("status_global")},
        }
    ]

    for item in dossier.get("events", []):
        events.append({
            "id": f"event-{item.get('id')}",
            "type": "event",
            "title": item.get("event_type") or "Événement dossier",
            "description": "Événement opérationnel enregistré sur ce dossier.",
            "occurred_at": item.get("created_at"),
            "metadata": item.get("payload") or {},
        })
    for item in dossier.get("messages", []):
        events.append({
            "id": f"message-{item.get('id')}",
            "type": "message",
            "title": "Message client",
            "description": item.get("message_text") or "Message reçu",
            "occurred_at": item.get("created_at"),
            "metadata": {"sender_phone": item.get("sender_phone")},
        })
    for item in dossier.get("shipments", []):
        route = " → ".join(filter(None, [item.get("origin_city") or item.get("origin_country"), item.get("destination_city") or item.get("destination_country")]))
        events.append({
            "id": f"shipment-{item.get('id')}",
            "type": "shipment",
            "title": "Expédition liée",
            "description": f"{item.get('tracking_id') or 'Expédition'}{f' · {route}' if route else ''}",
            "occurred_at": item.get("created_at"),
            "metadata": {"status": item.get("status")},
        })
    for item in dossier.get("notifications", []):
        events.append({
            "id": f"notification-{item.get('id')}",
            "type": "notification",
            "title": "Notification client",
            "description": item.get("message") or item.get("notification_type") or "Notification",
            "occurred_at": item.get("created_at"),
            "metadata": {"status": item.get("status"), "channel": item.get("channel")},
        })

    return sorted(
        [event for event in events if event.get("occurred_at")],
        key=lambda event: str(event.get("occurred_at")),
        reverse=True,
    )[:limit]


def get_dossier_detail(org_id: str, dossier_id: str):
    with engine.connect() as conn:
        dossier = conn.execute(
            text("""
                select *
                from dossiers
                where org_id = :org_id
                  and id = :dossier_id
                limit 1
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
            },
        ).fetchone()

        if not dossier:
            return None

        dossier_dict = dict(dossier._mapping)

        client = conn.execute(
            text("""
                select *
                from clients
                where org_id = :org_id
                  and id = :client_id
                limit 1
            """),
            {
                "org_id": org_id,
                "client_id": dossier_dict["client_id"],
            },
        ).fetchone()

        messages = conn.execute(
            text("""
                select
                    id,
                    sender_phone,
                    message_text,
                    raw_payload,
                    created_at
                from messages_raw
                where org_id = :org_id
                  and dossier_id = :dossier_id
                order by created_at asc
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
            },
        ).fetchall()

        events = conn.execute(
            text("""
                select
                    id,
                    event_type,
                    payload,
                    created_at
                from dossier_events
                where org_id = :org_id
                  and dossier_id = :dossier_id
                order by created_at asc
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
            },
        ).fetchall()

        notifications = conn.execute(
            text("""
                select
                    id,
                    channel,
                    recipient_phone,
                    notification_type,
                    message,
                    status,
                    provider,
                    provider_message_id,
                    created_at,
                    sent_at,
                    failed_at,
                    error_message
                from notification_outbox
                where org_id = :org_id
                  and dossier_id = :dossier_id
                order by created_at asc
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
            },
        ).fetchall()

        return {
            "dossier": dossier_dict,
            "client": dict(client._mapping) if client else None,
            "messages": [dict(row._mapping) for row in messages],
            "events": [dict(row._mapping) for row in events],
            "notifications": [dict(row._mapping) for row in notifications],
        }


def list_active_dossiers(
    org_id: str,
    status_global: str | None = None,
    case_type: str | None = None,
    intake_status: str | None = None,
    validation_status: str | None = None,
    limit: int = 50,
):
    filters = [
        "d.org_id = :org_id",
        "d.status_global not in ('COMPLETED', 'CLOSED', 'CANCELLED')",
    ]

    params = {
        "org_id": org_id,
        "limit": limit,
    }

    if status_global:
        filters.append("d.status_global = :status_global")
        params["status_global"] = status_global

    if case_type:
        filters.append("d.case_type = :case_type")
        params["case_type"] = case_type

    if intake_status:
        filters.append("d.intake_status = :intake_status")
        params["intake_status"] = intake_status

    if validation_status:
        filters.append("d.validation_status = :validation_status")
        params["validation_status"] = validation_status

    where_clause = " and ".join(filters)

    query = text(f"""
        select
            d.id,
            d.org_id,
            d.client_id,
            c.phone as client_phone,
            c.name as client_name,

            d.case_type,
            d.status_global,
            d.intake_status,
            d.validation_status,
            d.primary_channel,

            d.origin_country,
            d.origin_city,
            d.destination_country,
            d.destination_city,
            d.goods_type,
            d.estimated_weight_kg,
            d.estimated_volume_cbm,
            d.shipping_mode,
            (
                select count(*)
                from messages_raw mr
                where mr.org_id = d.org_id
                  and mr.dossier_id = d.id
            ) as message_count,

            d.created_at,
            d.updated_at
        from dossiers d
        join clients c
          on c.id = d.client_id
         and c.org_id = d.org_id
        where {where_clause}
        order by d.updated_at desc
        limit :limit
    """)

    with engine.connect() as conn:
        result = conn.execute(query, params)
        return [dict(row._mapping) for row in result.fetchall()]
