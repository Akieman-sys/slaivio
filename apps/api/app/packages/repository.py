from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from math import ceil
from typing import Any
from uuid import uuid4

from sqlalchemy import text

from app.db.database import engine


PACKAGE_STATUSES = {
    "CREATED",
    "RECEIVED_AT_ORIGIN",
    "WAREHOUSE_PROCESSING",
    "READY_FOR_DISPATCH",
    "IN_TRANSIT",
    "CUSTOMS",
    "ARRIVED_DESTINATION",
    "READY_FOR_PICKUP",
    "DELIVERED",
    "BLOCKED",
    "ISSUE",
    "CANCELLED",
}
PACKAGE_CONDITIONS = {"UNKNOWN", "GOOD", "DAMAGED", "FRAGILE", "MISSING_INFO", "REPACK_REQUIRED"}
INVENTORY_STATUSES = {"NOT_STORED", "IN_STOCK", "RESERVED", "GROUPED", "DISPATCHED", "RELEASED"}
PAYMENT_CLEARANCE_STATUSES = {"UNKNOWN", "PENDING", "PARTIAL", "CLEARED", "BLOCKED"}


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


def generate_package_reference() -> str:
    return "COL-" + str(uuid4()).split("-")[0].upper()


def _client_display_sql() -> str:
    return "coalesce(to_jsonb(c)->>'display_name', c.name, to_jsonb(c)->>'company_name', c.phone, c.email, 'Client sans nom')"


def _dossier_reference_sql() -> str:
    return "coalesce(d.tracking_id, 'DOS-' || upper(left(d.id::text, 8)))"


def _build_filters(
    org_id: str,
    *,
    q: str | None,
    status: str | None,
    condition: str | None,
    inventory_status: str | None,
    payment_clearance_status: str | None,
    dossier_id: str | None,
    client_id: str | None,
) -> tuple[str, dict]:
    filters = ["s.org_id = :org_id"]
    params: dict[str, Any] = {"org_id": org_id}

    if q:
        filters.append(
            f"""(
                coalesce(s.tracking_id, '') ilike :q
                or coalesce(s.goods_type, '') ilike :q
                or coalesce(s.origin_city, '') ilike :q
                or coalesce(s.origin_country, '') ilike :q
                or coalesce(s.destination_city, '') ilike :q
                or coalesce(s.destination_country, '') ilike :q
                or {_client_display_sql()} ilike :q
                or {_dossier_reference_sql()} ilike :q
            )"""
        )
        params["q"] = f"%{q.strip()}%"
    if status:
        filters.append("coalesce(s.current_status, s.status) = :status")
        params["status"] = status
    if condition:
        filters.append("coalesce(s.package_condition, 'UNKNOWN') = :condition")
        params["condition"] = condition
    if inventory_status:
        filters.append("coalesce(s.inventory_status, 'NOT_STORED') = :inventory_status")
        params["inventory_status"] = inventory_status
    if payment_clearance_status:
        filters.append("coalesce(s.payment_clearance_status, 'UNKNOWN') = :payment_clearance_status")
        params["payment_clearance_status"] = payment_clearance_status
    if dossier_id:
        filters.append("s.dossier_id = :dossier_id")
        params["dossier_id"] = dossier_id
    if client_id:
        filters.append("s.client_id = :client_id")
        params["client_id"] = client_id

    return " and ".join(filters), params


def _select_package_sql() -> str:
    return f"""
        select
            s.id::text,
            s.org_id,
            s.client_id::text,
            s.dossier_id::text,
            s.tracking_id package_reference,
            s.tracking_id,
            coalesce(s.current_status, s.status, 'CREATED') status,
            coalesce(s.package_condition, 'UNKNOWN') package_condition,
            coalesce(s.inventory_status, 'NOT_STORED') inventory_status,
            coalesce(s.payment_clearance_status, 'UNKNOWN') payment_clearance_status,
            s.current_warehouse_id::text,
            s.storage_location_id::text,
            s.last_scan_location,
            s.last_scan_at,
            s.barcode,
            s.qr_code_value,
            s.public_tracking_enabled,
            s.eta_at,
            s.received_at_origin_at,
            s.dispatched_at,
            s.delivered_at,
            s.origin_country,
            s.origin_city,
            s.destination_country,
            s.destination_city,
            s.goods_type,
            coalesce(s.actual_weight_kg, s.weight_kg) weight_kg,
            coalesce(s.actual_volume_cbm, s.volume_cbm) volume_cbm,
            s.shipping_mode,
            s.fees_total,
            s.fees_paid,
            s.currency,
            {_client_display_sql()} client_name,
            c.phone client_phone,
            c.email client_email,
            {_dossier_reference_sql()} dossier_reference,
            d.case_type dossier_case_type,
            d.status_global dossier_status,
            coalesce(r.receipt_count, 0)::int receipt_count,
            coalesce(m.media_count, 0)::int media_count,
            coalesce(e.event_count, 0)::int event_count,
            s.created_at,
            s.updated_at
        from shipments s
        left join clients c on c.id = s.client_id and c.org_id = s.org_id
        left join dossiers d on d.id = s.dossier_id and d.org_id = s.org_id
        left join (
            select shipment_id, count(*) receipt_count
            from warehouse_receipts
            where org_id = :org_id and shipment_id is not null
            group by shipment_id
        ) r on r.shipment_id = s.id
        left join (
            select shipment_id, count(*) media_count
            from warehouse_receipt_media
            where org_id = :org_id and shipment_id is not null
            group by shipment_id
        ) m on m.shipment_id = s.id
        left join (
            select shipment_id, count(*) event_count
            from shipment_lifecycle_events
            where org_id = :org_id and shipment_id is not null
            group by shipment_id
        ) e on e.shipment_id = s.id
    """


def list_packages(
    org_id: str,
    *,
    q: str | None = None,
    status: str | None = None,
    condition: str | None = None,
    inventory_status: str | None = None,
    payment_clearance_status: str | None = None,
    dossier_id: str | None = None,
    client_id: str | None = None,
    page: int = 1,
    page_size: int = 30,
    sort: str = "updated_desc",
) -> dict:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size
    where_clause, params = _build_filters(
        org_id,
        q=q,
        status=status,
        condition=condition,
        inventory_status=inventory_status,
        payment_clearance_status=payment_clearance_status,
        dossier_id=dossier_id,
        client_id=client_id,
    )
    order_by = {
        "created_asc": "created_at asc",
        "created_desc": "created_at desc",
        "reference_asc": "package_reference asc",
        "reference_desc": "package_reference desc",
        "client_asc": "client_name asc nulls last",
        "weight_desc": "weight_kg desc nulls last",
    }.get(sort, "updated_at desc nulls last, created_at desc")

    with engine.connect() as conn:
        total = conn.execute(
            text(f"""
                select count(*)::int
                from shipments s
                left join clients c on c.id = s.client_id and c.org_id = s.org_id
                left join dossiers d on d.id = s.dossier_id and d.org_id = s.org_id
                where {where_clause}
            """),
            params,
        ).scalar() or 0
        rows = conn.execute(
            text(f"""
                {_select_package_sql()}
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


def package_stats(org_id: str) -> dict:
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select
                    count(*)::int total,
                    count(*) filter (where coalesce(current_status, status) = 'RECEIVED_AT_ORIGIN')::int received,
                    count(*) filter (where coalesce(inventory_status, 'NOT_STORED') = 'IN_STOCK')::int in_stock,
                    count(*) filter (where coalesce(current_status, status) = 'IN_TRANSIT')::int in_transit,
                    count(*) filter (where coalesce(current_status, status) in ('BLOCKED', 'ISSUE'))::int issues,
                    count(*) filter (where coalesce(current_status, status) = 'DELIVERED')::int delivered,
                    coalesce(sum(coalesce(actual_weight_kg, weight_kg, 0)), 0) total_weight_kg,
                    coalesce(sum(coalesce(actual_volume_cbm, volume_cbm, 0)), 0) total_volume_cbm
                from shipments
                where org_id = :org_id
            """),
            {"org_id": org_id},
        ).fetchone()
    return _one(row) or {
        "total": 0,
        "received": 0,
        "in_stock": 0,
        "in_transit": 0,
        "issues": 0,
        "delivered": 0,
        "total_weight_kg": 0,
        "total_volume_cbm": 0,
    }


def get_package(org_id: str, package_id: str) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(
            text(f"""
                {_select_package_sql()}
                where s.org_id = :org_id and s.id = :package_id
                limit 1
            """),
            {"org_id": org_id, "package_id": package_id},
        ).fetchone()
        package = _one(row)
        if not package:
            return None

        receipts = conn.execute(
            text("""
                select id::text, receipt_code, warehouse_id::text, received_by_name, supplier_name, supplier_phone,
                       package_label, package_condition, measured_weight_kg, measured_volume_cbm, notes,
                       received_at, created_at
                from warehouse_receipts
                where org_id = :org_id and shipment_id = :package_id
                order by received_at desc
                limit 30
            """),
            {"org_id": org_id, "package_id": package_id},
        ).fetchall()
        media = conn.execute(
            text("""
                select id::text, media_url, media_type, caption, uploaded_by_name, created_at
                from warehouse_receipt_media
                where org_id = :org_id and shipment_id = :package_id
                order by created_at desc
                limit 30
            """),
            {"org_id": org_id, "package_id": package_id},
        ).fetchall()
        events = conn.execute(
            text("""
                select id::text, previous_status, new_status, event_type, event_source, event_message, metadata, actor_name, created_at
                from shipment_lifecycle_events
                where org_id = :org_id and shipment_id = :package_id
                order by created_at desc
                limit 50
            """),
            {"org_id": org_id, "package_id": package_id},
        ).fetchall()

    package["receipts"] = [_safe(dict(row._mapping)) for row in receipts]
    package["media"] = [_safe(dict(row._mapping)) for row in media]
    package["events"] = [_safe(dict(row._mapping)) for row in events]
    return package


def _dossier_for_create(conn, org_id: str, dossier_id: str) -> dict | None:
    row = conn.execute(
        text("""
            select d.*, c.id client_id
            from dossiers d
            join clients c on c.id = d.client_id and c.org_id = d.org_id
            where d.org_id = :org_id and d.id = :dossier_id
            limit 1
        """),
        {"org_id": org_id, "dossier_id": dossier_id},
    ).fetchone()
    return _one(row)


def create_package(org_id: str, user_id: str, payload: dict) -> dict:
    dossier_id = payload.get("dossier_id")
    if not dossier_id:
        raise ValueError("dossier_required")

    with engine.begin() as conn:
        dossier = _dossier_for_create(conn, org_id, dossier_id)
        if not dossier:
            raise ValueError("dossier_not_found")
        tracking_id = payload.get("tracking_id") or generate_package_reference()
        row = conn.execute(
            text("""
                insert into shipments (
                    org_id, dossier_id, client_id, tracking_id, status, current_status,
                    origin_country, origin_city, destination_country, destination_city,
                    goods_type, weight_kg, volume_cbm, actual_weight_kg, actual_volume_cbm,
                    shipping_mode, fees_total, fees_paid, currency, package_condition,
                    inventory_status, payment_clearance_status, barcode, qr_code_value,
                    public_tracking_enabled, eta_at, status_updated_at
                )
                values (
                    :org_id, :dossier_id, :client_id, :tracking_id, :status, :status,
                    :origin_country, :origin_city, :destination_country, :destination_city,
                    :goods_type, :weight_kg, :volume_cbm, :actual_weight_kg, :actual_volume_cbm,
                    :shipping_mode, :fees_total, :fees_paid, :currency, :package_condition,
                    :inventory_status, :payment_clearance_status, :barcode, :qr_code_value,
                    :public_tracking_enabled, :eta_at, now()
                )
                returning id::text
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
                "client_id": dossier["client_id"],
                "tracking_id": tracking_id,
                "status": payload.get("status") or "CREATED",
                "origin_country": payload.get("origin_country") or dossier.get("origin_country"),
                "origin_city": payload.get("origin_city") or dossier.get("origin_city"),
                "destination_country": payload.get("destination_country") or dossier.get("destination_country"),
                "destination_city": payload.get("destination_city") or dossier.get("destination_city"),
                "goods_type": payload.get("goods_type") or dossier.get("goods_type"),
                "weight_kg": payload.get("weight_kg") or dossier.get("estimated_weight_kg"),
                "volume_cbm": payload.get("volume_cbm") or dossier.get("estimated_volume_cbm"),
                "actual_weight_kg": payload.get("actual_weight_kg"),
                "actual_volume_cbm": payload.get("actual_volume_cbm"),
                "shipping_mode": payload.get("shipping_mode") or dossier.get("shipping_mode"),
                "fees_total": payload.get("fees_total") or dossier.get("final_total") or dossier.get("quoted_total"),
                "fees_paid": payload.get("fees_paid") or 0,
                "currency": payload.get("currency") or dossier.get("final_currency") or dossier.get("quoted_currency"),
                "package_condition": payload.get("package_condition") or "UNKNOWN",
                "inventory_status": payload.get("inventory_status") or "NOT_STORED",
                "payment_clearance_status": payload.get("payment_clearance_status") or "UNKNOWN",
                "barcode": payload.get("barcode"),
                "qr_code_value": payload.get("qr_code_value") or tracking_id,
                "public_tracking_enabled": payload.get("public_tracking_enabled", True),
                "eta_at": payload.get("eta_at"),
            },
        ).fetchone()
        package_id = row[0]
        _insert_lifecycle_event(
            conn,
            org_id=org_id,
            shipment_id=package_id,
            dossier_id=dossier_id,
            previous_status=None,
            new_status=payload.get("status") or "CREATED",
            event_type="PACKAGE_CREATED",
            event_message="Colis créé depuis le dashboard",
            actor_id=user_id,
        )

    created = get_package(org_id, package_id)
    return created or {}


def update_package(org_id: str, package_id: str, user_id: str, payload: dict) -> dict | None:
    existing = get_package(org_id, package_id)
    if not existing:
        return None

    allowed = {
        "status", "package_condition", "inventory_status", "payment_clearance_status",
        "origin_country", "origin_city", "destination_country", "destination_city",
        "goods_type", "weight_kg", "volume_cbm", "actual_weight_kg", "actual_volume_cbm",
        "shipping_mode", "fees_total", "fees_paid", "currency", "barcode", "qr_code_value",
        "public_tracking_enabled", "eta_at", "last_scan_location",
    }
    data = {key: payload.get(key, existing.get(key)) for key in allowed}
    previous_status = existing.get("status")
    next_status = data.get("status") or previous_status

    with engine.begin() as conn:
        conn.execute(
            text("""
                update shipments set
                    status = :status,
                    current_status = :status,
                    package_condition = :package_condition,
                    inventory_status = :inventory_status,
                    payment_clearance_status = :payment_clearance_status,
                    origin_country = :origin_country,
                    origin_city = :origin_city,
                    destination_country = :destination_country,
                    destination_city = :destination_city,
                    goods_type = :goods_type,
                    weight_kg = :weight_kg,
                    volume_cbm = :volume_cbm,
                    actual_weight_kg = :actual_weight_kg,
                    actual_volume_cbm = :actual_volume_cbm,
                    shipping_mode = :shipping_mode,
                    fees_total = :fees_total,
                    fees_paid = :fees_paid,
                    currency = :currency,
                    barcode = :barcode,
                    qr_code_value = :qr_code_value,
                    public_tracking_enabled = :public_tracking_enabled,
                    eta_at = :eta_at,
                    last_scan_location = :last_scan_location,
                    last_scan_at = case when :last_scan_location is not null then now() else last_scan_at end,
                    status_updated_at = case when :status <> coalesce(current_status, status) then now() else status_updated_at end,
                    updated_at = now()
                where org_id = :org_id and id = :package_id
            """),
            dict(data, org_id=org_id, package_id=package_id),
        )
        if next_status != previous_status:
            _insert_lifecycle_event(
                conn,
                org_id=org_id,
                shipment_id=package_id,
                dossier_id=existing.get("dossier_id"),
                previous_status=previous_status,
                new_status=next_status,
                event_type="PACKAGE_STATUS_CHANGED",
                event_message="Statut colis modifié depuis le dashboard",
                actor_id=user_id,
            )

    return get_package(org_id, package_id)


def _insert_lifecycle_event(
    conn,
    *,
    org_id: str,
    shipment_id: str,
    dossier_id: str | None,
    previous_status: str | None,
    new_status: str,
    event_type: str,
    event_message: str,
    actor_id: str,
):
    conn.execute(
        text("""
            insert into shipment_lifecycle_events (
                org_id, shipment_id, dossier_id, previous_status, new_status,
                event_type, event_source, event_message, metadata, actor_id
            )
            values (
                :org_id, :shipment_id, :dossier_id, :previous_status, :new_status,
                :event_type, 'DASHBOARD', :event_message, '{}'::jsonb, :actor_id
            )
        """),
        {
            "org_id": org_id,
            "shipment_id": shipment_id,
            "dossier_id": dossier_id,
            "previous_status": previous_status,
            "new_status": new_status,
            "event_type": event_type,
            "event_message": event_message,
            "actor_id": actor_id,
        },
    )


def export_packages(
    org_id: str,
    *,
    q: str | None = None,
    status: str | None = None,
    condition: str | None = None,
    inventory_status: str | None = None,
    payment_clearance_status: str | None = None,
    sort: str = "updated_desc",
) -> list[dict]:
    return list_packages(
        org_id,
        q=q,
        status=status,
        condition=condition,
        inventory_status=inventory_status,
        payment_clearance_status=payment_clearance_status,
        page=1,
        page_size=5000,
        sort=sort,
    )["items"]


def package_timeline(org_id: str, package_id: str, *, limit: int = 80) -> list[dict]:
    package = get_package(org_id, package_id)
    if not package:
        return []

    events = [
        {
            "id": f"package-created-{package_id}",
            "type": "package",
            "title": "Colis créé",
            "description": package.get("package_reference") or "Colis créé",
            "occurred_at": package.get("created_at"),
            "metadata": {"status": package.get("status")},
        }
    ]
    for item in package.get("events", []):
        events.append({
            "id": f"event-{item.get('id')}",
            "type": "event",
            "title": item.get("event_type") or "Événement colis",
            "description": item.get("event_message") or item.get("new_status") or "Mise à jour du colis",
            "occurred_at": item.get("created_at"),
            "metadata": item.get("metadata") or {},
        })
    for item in package.get("receipts", []):
        events.append({
            "id": f"receipt-{item.get('id')}",
            "type": "receipt",
            "title": "Réception entrepôt",
            "description": item.get("receipt_code") or item.get("package_label") or "Colis reçu",
            "occurred_at": item.get("received_at") or item.get("created_at"),
            "metadata": {"condition": item.get("package_condition")},
        })
    return sorted(
        [event for event in events if event.get("occurred_at")],
        key=lambda event: str(event.get("occurred_at")),
        reverse=True,
    )[:limit]
