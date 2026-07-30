from __future__ import annotations

import csv
import io
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
PACKAGE_TYPES = {"carton", "sac", "caisse", "palette", "document", "lot", "other"}
PACKAGE_SOURCES = {"manual", "whatsapp", "import", "warehouse", "api", "legacy"}
VALIDATION_STATUSES = {"PENDING", "VALIDATED", "NEEDS_REVIEW", "BLOCKED", "REJECTED"}
PAYMENT_STATUSES = {"UNKNOWN", "PENDING", "PARTIAL", "PAID", "OVERDUE", "BLOCKED", "CLEARED"}
PAYMENT_CLEARANCE_STATUSES = PAYMENT_STATUSES
ANOMALY_STATUSES = {"OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"}
ANOMALY_SEVERITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
NOTIFICATION_CHANNELS = {"whatsapp", "email", "sms", "internal"}

_SCHEMA_READY = False


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


def _ensure_schema() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    statements = [
        """
        create table if not exists cargo_packages (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          client_id uuid references clients(id) on delete set null,
          dossier_id uuid references dossiers(id) on delete set null,
          shipment_id uuid references shipments(id) on delete set null,
          package_reference text not null,
          tracking_id text,
          source text not null default 'manual',
          package_type text not null default 'carton',
          description text,
          category text,
          status text not null default 'CREATED',
          validation_status text not null default 'PENDING',
          payment_status text not null default 'UNKNOWN',
          package_condition text not null default 'UNKNOWN',
          inventory_status text not null default 'NOT_STORED',
          warehouse_id uuid,
          warehouse_name text,
          warehouse_zone text,
          warehouse_rack text,
          warehouse_location text,
          origin_country text,
          origin_city text,
          destination_country text,
          destination_city text,
          service_type text,
          shipment_reference text,
          shipment_batch_id uuid,
          manifest_id uuid,
          public_tracking_enabled boolean not null default true,
          eta_at timestamptz,
          received_at timestamptz,
          dispatched_at timestamptz,
          delivered_at timestamptz,
          weight_kg numeric(12, 3),
          volumetric_weight_kg numeric(12, 3),
          length_cm numeric(12, 2),
          width_cm numeric(12, 2),
          height_cm numeric(12, 2),
          volume_cbm numeric(12, 4),
          pieces_count integer not null default 1,
          declared_value numeric(14, 2),
          declared_currency text,
          is_fragile boolean not null default false,
          notes text,
          fees_total numeric(14, 2),
          fees_paid numeric(14, 2) not null default 0,
          currency text,
          barcode text,
          qr_code_value text,
          last_scan_location text,
          last_scan_at timestamptz,
          created_by text,
          updated_by text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          deleted_at timestamptz
        )
        """,
        "create unique index if not exists idx_cargo_packages_org_reference on cargo_packages(org_id, package_reference)",
        """
        create table if not exists package_events (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          package_id uuid not null references cargo_packages(id) on delete cascade,
          event_type text not null,
          title text not null,
          description text,
          previous_status text,
          new_status text,
          metadata jsonb not null default '{}'::jsonb,
          actor_id text,
          actor_name text,
          created_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists package_media (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          package_id uuid not null references cargo_packages(id) on delete cascade,
          media_url text not null,
          media_type text not null default 'IMAGE',
          caption text,
          uploaded_by_id text,
          uploaded_by_name text,
          created_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists package_anomalies (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          package_id uuid not null references cargo_packages(id) on delete cascade,
          anomaly_type text not null,
          severity text not null default 'MEDIUM',
          status text not null default 'OPEN',
          title text not null,
          description text,
          resolution_notes text,
          detected_at timestamptz not null default now(),
          resolved_at timestamptz,
          resolved_by text,
          created_by text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists package_notifications (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          package_id uuid not null references cargo_packages(id) on delete cascade,
          channel text not null,
          notification_type text not null,
          recipient text,
          message text not null,
          status text not null default 'PENDING',
          provider text,
          provider_message_id text,
          sent_at timestamptz,
          failed_at timestamptz,
          error_message text,
          created_at timestamptz not null default now()
        )
        """,
        "create index if not exists idx_cargo_packages_org_status on cargo_packages(org_id, status)",
        "create index if not exists idx_cargo_packages_org_client on cargo_packages(org_id, client_id)",
        "create index if not exists idx_cargo_packages_org_dossier on cargo_packages(org_id, dossier_id)",
        "create index if not exists idx_cargo_packages_org_updated on cargo_packages(org_id, updated_at desc)",
        "create index if not exists idx_package_events_package on package_events(org_id, package_id, created_at desc)",
        "create index if not exists idx_package_media_package on package_media(org_id, package_id, created_at desc)",
        "create index if not exists idx_package_anomalies_package on package_anomalies(org_id, package_id, status)",
        "create index if not exists idx_package_notifications_package on package_notifications(org_id, package_id, created_at desc)",
        """
        insert into cargo_packages (
          org_id, client_id, dossier_id, shipment_id, package_reference, tracking_id, source,
          package_type, description, category, status, validation_status, payment_status,
          package_condition, inventory_status, origin_country, origin_city, destination_country,
          destination_city, service_type, public_tracking_enabled, eta_at, received_at,
          dispatched_at, delivered_at, weight_kg, volume_cbm, fees_total, fees_paid,
          currency, barcode, qr_code_value, last_scan_location, last_scan_at, created_at, updated_at
        )
        select
          s.org_id, s.client_id, s.dossier_id, s.id,
          coalesce(s.tracking_id, 'COL-' || upper(left(s.id::text, 8))),
          s.tracking_id, 'legacy', 'carton', s.goods_type, s.goods_type,
          coalesce(s.current_status, s.status, 'CREATED'), 'PENDING',
          case coalesce(s.payment_clearance_status, 'UNKNOWN') when 'CLEARED' then 'PAID' else coalesce(s.payment_clearance_status, 'UNKNOWN') end,
          coalesce(s.package_condition, 'UNKNOWN'), coalesce(s.inventory_status, 'NOT_STORED'),
          s.origin_country, s.origin_city, s.destination_country, s.destination_city, s.shipping_mode,
          coalesce(s.public_tracking_enabled, true), s.eta_at, s.received_at_origin_at, s.dispatched_at, s.delivered_at,
          coalesce(s.actual_weight_kg, s.weight_kg), coalesce(s.actual_volume_cbm, s.volume_cbm),
          s.fees_total, coalesce(s.fees_paid, 0), s.currency, s.barcode, s.qr_code_value,
          s.last_scan_location, s.last_scan_at, s.created_at, s.updated_at
        from shipments s
        where not exists (
          select 1 from cargo_packages p where p.org_id = s.org_id and p.shipment_id = s.id
        )
        """,
    ]
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))
    _SCHEMA_READY = True


def generate_package_reference() -> str:
    return f"COL-{datetime.utcnow().year}-{str(uuid4()).split('-')[0].upper()}"


def _client_display_sql() -> str:
    return "coalesce(to_jsonb(c)->>'display_name', c.name, to_jsonb(c)->>'company_name', c.phone, c.email, 'Client sans nom')"


def _dossier_reference_sql() -> str:
    return "coalesce(d.tracking_id, 'DOS-' || upper(left(d.id::text, 8)))"


def _calculate_volume_cbm(payload: dict) -> float | None:
    explicit = payload.get("volume_cbm")
    if explicit not in (None, ""):
        return explicit
    length = payload.get("length_cm")
    width = payload.get("width_cm")
    height = payload.get("height_cm")
    if not all(value not in (None, "") for value in (length, width, height)):
        return None
    return round(float(length) * float(width) * float(height) / 1_000_000, 4)


def _calculate_volumetric_weight(payload: dict) -> float | None:
    explicit = payload.get("volumetric_weight_kg")
    if explicit not in (None, ""):
        return explicit
    length = payload.get("length_cm")
    width = payload.get("width_cm")
    height = payload.get("height_cm")
    if not all(value not in (None, "") for value in (length, width, height)):
        return None
    return round(float(length) * float(width) * float(height) / 6000, 3)


def _build_filters(
    org_id: str,
    *,
    q: str | None,
    status: str | None,
    condition: str | None,
    inventory_status: str | None,
    payment_status: str | None,
    validation_status: str | None,
    package_type: str | None,
    source: str | None,
    dossier_id: str | None,
    client_id: str | None,
) -> tuple[str, dict]:
    filters = ["p.org_id = :org_id", "p.deleted_at is null"]
    params: dict[str, Any] = {"org_id": org_id}
    if q:
        filters.append(
            f"""(
                coalesce(p.package_reference, '') ilike :q
                or coalesce(p.tracking_id, '') ilike :q
                or coalesce(p.description, '') ilike :q
                or coalesce(p.category, '') ilike :q
                or coalesce(p.warehouse_name, '') ilike :q
                or coalesce(p.warehouse_location, '') ilike :q
                or {_client_display_sql()} ilike :q
                or {_dossier_reference_sql()} ilike :q
            )"""
        )
        params["q"] = f"%{q.strip()}%"
    for key, value, column in [
        ("status", status, "p.status"),
        ("condition", condition, "p.package_condition"),
        ("inventory_status", inventory_status, "p.inventory_status"),
        ("payment_status", payment_status, "p.payment_status"),
        ("validation_status", validation_status, "p.validation_status"),
        ("package_type", package_type, "p.package_type"),
        ("source", source, "p.source"),
        ("dossier_id", dossier_id, "p.dossier_id"),
        ("client_id", client_id, "p.client_id"),
    ]:
        if value:
            filters.append(f"{column} = :{key}")
            params[key] = value
    return " and ".join(filters), params


def _select_package_sql() -> str:
    return f"""
        select
            p.id::text,
            p.org_id,
            p.client_id::text,
            p.dossier_id::text,
            p.shipment_id::text,
            p.package_reference,
            p.tracking_id,
            p.source,
            p.package_type,
            p.description,
            p.category,
            p.status,
            p.validation_status,
            p.payment_status,
            p.payment_status as payment_clearance_status,
            p.package_condition,
            p.inventory_status,
            p.warehouse_id::text,
            p.warehouse_name,
            p.warehouse_zone,
            p.warehouse_rack,
            p.warehouse_location,
            p.origin_country,
            p.origin_city,
            p.destination_country,
            p.destination_city,
            p.service_type,
            p.service_type as shipping_mode,
            p.shipment_reference,
            p.shipment_batch_id::text,
            p.manifest_id::text,
            p.public_tracking_enabled,
            p.eta_at,
            p.received_at,
            p.received_at as received_at_origin_at,
            p.dispatched_at,
            p.delivered_at,
            p.weight_kg,
            p.volumetric_weight_kg,
            p.length_cm,
            p.width_cm,
            p.height_cm,
            p.volume_cbm,
            p.pieces_count,
            p.declared_value,
            p.declared_currency,
            p.is_fragile,
            p.notes,
            p.fees_total,
            p.fees_paid,
            p.currency,
            p.barcode,
            p.qr_code_value,
            p.last_scan_location,
            p.last_scan_at,
            {_client_display_sql()} client_name,
            c.phone client_phone,
            c.email client_email,
            {_dossier_reference_sql()} dossier_reference,
            d.case_type dossier_case_type,
            d.status_global dossier_status,
            coalesce(m.media_count, 0)::int media_count,
            coalesce(e.event_count, 0)::int event_count,
            coalesce(a.open_anomaly_count, 0)::int open_anomaly_count,
            coalesce(a.anomaly_count, 0)::int anomaly_count,
            coalesce(n.notification_count, 0)::int notification_count,
            p.created_at,
            p.updated_at
        from cargo_packages p
        left join clients c on c.id = p.client_id and c.org_id = p.org_id
        left join dossiers d on d.id = p.dossier_id and d.org_id = p.org_id
        left join (
            select package_id, count(*) media_count
            from package_media
            where org_id = :org_id
            group by package_id
        ) m on m.package_id = p.id
        left join (
            select package_id, count(*) event_count
            from package_events
            where org_id = :org_id
            group by package_id
        ) e on e.package_id = p.id
        left join (
            select package_id,
                   count(*) anomaly_count,
                   count(*) filter (where status in ('OPEN', 'IN_REVIEW')) open_anomaly_count
            from package_anomalies
            where org_id = :org_id
            group by package_id
        ) a on a.package_id = p.id
        left join (
            select package_id, count(*) notification_count
            from package_notifications
            where org_id = :org_id
            group by package_id
        ) n on n.package_id = p.id
    """


def list_packages(
    org_id: str,
    *,
    q: str | None = None,
    status: str | None = None,
    condition: str | None = None,
    inventory_status: str | None = None,
    payment_clearance_status: str | None = None,
    payment_status: str | None = None,
    validation_status: str | None = None,
    package_type: str | None = None,
    source: str | None = None,
    dossier_id: str | None = None,
    client_id: str | None = None,
    page: int = 1,
    page_size: int = 30,
    sort: str = "updated_desc",
) -> dict:
    _ensure_schema()
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size
    where_clause, params = _build_filters(
        org_id,
        q=q,
        status=status,
        condition=condition,
        inventory_status=inventory_status,
        payment_status=payment_status or payment_clearance_status,
        validation_status=validation_status,
        package_type=package_type,
        source=source,
        dossier_id=dossier_id,
        client_id=client_id,
    )
    order_by = {
        "created_asc": "p.created_at asc",
        "created_desc": "p.created_at desc",
        "reference_asc": "p.package_reference asc",
        "reference_desc": "p.package_reference desc",
        "client_asc": "client_name asc nulls last",
        "weight_desc": "p.weight_kg desc nulls last",
    }.get(sort, "p.updated_at desc nulls last, p.created_at desc")

    with engine.connect() as conn:
        total = conn.execute(
            text(f"""
                select count(*)::int
                from cargo_packages p
                left join clients c on c.id = p.client_id and c.org_id = p.org_id
                left join dossiers d on d.id = p.dossier_id and d.org_id = p.org_id
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
    _ensure_schema()
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select
                    count(*)::int total,
                    count(*) filter (where status = 'RECEIVED_AT_ORIGIN')::int received,
                    count(*) filter (where inventory_status = 'IN_STOCK')::int in_stock,
                    count(*) filter (where status = 'IN_TRANSIT')::int in_transit,
                    count(*) filter (where status in ('BLOCKED', 'ISSUE') or validation_status in ('BLOCKED', 'REJECTED'))::int issues,
                    count(*) filter (where status = 'DELIVERED')::int delivered,
                    coalesce(sum(coalesce(weight_kg, 0)), 0) total_weight_kg,
                    coalesce(sum(coalesce(volume_cbm, 0)), 0) total_volume_cbm,
                    coalesce(sum(coalesce(pieces_count, 0)), 0)::int total_pieces
                from cargo_packages
                where org_id = :org_id and deleted_at is null
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
        "total_pieces": 0,
    }


def get_package(org_id: str, package_id: str) -> dict | None:
    _ensure_schema()
    with engine.connect() as conn:
        row = conn.execute(
            text(f"""
                {_select_package_sql()}
                where p.org_id = :org_id and p.id = :package_id and p.deleted_at is null
                limit 1
            """),
            {"org_id": org_id, "package_id": package_id},
        ).fetchone()
        package = _one(row)
        if not package:
            return None
        package["media"] = [_safe(dict(row._mapping)) for row in conn.execute(
            text("""
                select id::text, media_url, media_type, caption, uploaded_by_name, created_at
                from package_media
                where org_id = :org_id and package_id = :package_id
                order by created_at desc
                limit 50
            """),
            {"org_id": org_id, "package_id": package_id},
        ).fetchall()]
        package["anomalies"] = [_safe(dict(row._mapping)) for row in conn.execute(
            text("""
                select id::text, anomaly_type, severity, status, title, description,
                       resolution_notes, detected_at, resolved_at, resolved_by, created_by, created_at, updated_at
                from package_anomalies
                where org_id = :org_id and package_id = :package_id
                order by case when status in ('OPEN', 'IN_REVIEW') then 0 else 1 end, detected_at desc
                limit 80
            """),
            {"org_id": org_id, "package_id": package_id},
        ).fetchall()]
        package["notifications"] = [_safe(dict(row._mapping)) for row in conn.execute(
            text("""
                select id::text, channel, notification_type, recipient, message, status,
                       provider, provider_message_id, sent_at, failed_at, error_message, created_at
                from package_notifications
                where org_id = :org_id and package_id = :package_id
                order by created_at desc
                limit 80
            """),
            {"org_id": org_id, "package_id": package_id},
        ).fetchall()]
        package["events"] = [_safe(dict(row._mapping)) for row in conn.execute(
            text("""
                select id::text, event_type, title, description, previous_status, new_status,
                       metadata, actor_id, actor_name, created_at
                from package_events
                where org_id = :org_id and package_id = :package_id
                order by created_at desc
                limit 100
            """),
            {"org_id": org_id, "package_id": package_id},
        ).fetchall()]
    package["receipt_count"] = 0
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


def _dossier_for_reference(conn, org_id: str, dossier_reference: str) -> dict | None:
    row = conn.execute(
        text("""
            select d.*, c.id client_id
            from dossiers d
            join clients c on c.id = d.client_id and c.org_id = d.org_id
            where d.org_id = :org_id
              and (d.tracking_id = :reference or 'DOS-' || upper(left(d.id::text, 8)) = :reference)
            limit 1
        """),
        {"org_id": org_id, "reference": dossier_reference},
    ).fetchone()
    return _one(row)


def _insert_package_event(
    conn,
    *,
    org_id: str,
    package_id: str,
    event_type: str,
    title: str,
    description: str | None = None,
    previous_status: str | None = None,
    new_status: str | None = None,
    actor_id: str | None = None,
    metadata: dict | None = None,
):
    conn.execute(
        text("""
            insert into package_events (
                org_id, package_id, event_type, title, description, previous_status,
                new_status, metadata, actor_id
            )
            values (
                :org_id, :package_id, :event_type, :title, :description, :previous_status,
                :new_status, cast(:metadata as jsonb), :actor_id
            )
        """),
        {
            "org_id": org_id,
            "package_id": package_id,
            "event_type": event_type,
            "title": title,
            "description": description,
            "previous_status": previous_status,
            "new_status": new_status,
            "metadata": "{}" if not metadata else __import__("json").dumps(metadata),
            "actor_id": actor_id,
        },
    )


def _create_shadow_shipment(conn, org_id: str, dossier: dict, payload: dict, reference: str) -> str | None:
    try:
        row = conn.execute(
            text("""
                insert into shipments (
                    org_id, dossier_id, client_id, tracking_id, status, current_status,
                    origin_country, origin_city, destination_country, destination_city,
                    goods_type, weight_kg, volume_cbm, shipping_mode, fees_total,
                    fees_paid, currency, package_condition, inventory_status,
                    payment_clearance_status, barcode, qr_code_value, public_tracking_enabled,
                    eta_at, status_updated_at
                )
                values (
                    :org_id, :dossier_id, :client_id, :tracking_id, :status, :status,
                    :origin_country, :origin_city, :destination_country, :destination_city,
                    :goods_type, :weight_kg, :volume_cbm, :service_type, :fees_total,
                    :fees_paid, :currency, :package_condition, :inventory_status,
                    :payment_status, :barcode, :qr_code_value, :public_tracking_enabled,
                    :eta_at, now()
                )
                on conflict (tracking_id) do nothing
                returning id::text
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier["id"],
                "client_id": dossier["client_id"],
                "tracking_id": reference,
                "status": payload.get("status") or "CREATED",
                "origin_country": payload.get("origin_country") or dossier.get("origin_country"),
                "origin_city": payload.get("origin_city") or dossier.get("origin_city"),
                "destination_country": payload.get("destination_country") or dossier.get("destination_country"),
                "destination_city": payload.get("destination_city") or dossier.get("destination_city"),
                "goods_type": payload.get("description") or payload.get("category") or dossier.get("goods_type"),
                "weight_kg": payload.get("weight_kg") or dossier.get("estimated_weight_kg"),
                "volume_cbm": _calculate_volume_cbm(payload) or dossier.get("estimated_volume_cbm"),
                "service_type": payload.get("service_type") or dossier.get("shipping_mode"),
                "fees_total": payload.get("fees_total") or dossier.get("final_total") or dossier.get("quoted_total"),
                "fees_paid": payload.get("fees_paid") or 0,
                "currency": payload.get("currency") or dossier.get("final_currency") or dossier.get("quoted_currency"),
                "package_condition": payload.get("package_condition") or "UNKNOWN",
                "inventory_status": payload.get("inventory_status") or "NOT_STORED",
                "payment_status": payload.get("payment_status") or payload.get("payment_clearance_status") or "UNKNOWN",
                "barcode": payload.get("barcode"),
                "qr_code_value": payload.get("qr_code_value") or reference,
                "public_tracking_enabled": payload.get("public_tracking_enabled", True),
                "eta_at": payload.get("eta_at"),
            },
        ).fetchone()
        return row[0] if row else None
    except Exception:
        return None


def create_package(org_id: str, user_id: str, payload: dict) -> dict:
    _ensure_schema()
    dossier_id = payload.get("dossier_id")
    if not dossier_id:
        raise ValueError("dossier_required")
    with engine.begin() as conn:
        dossier = _dossier_for_create(conn, org_id, dossier_id)
        if not dossier:
            raise ValueError("dossier_not_found")
        reference = payload.get("package_reference") or payload.get("tracking_id") or generate_package_reference()
        volume_cbm = _calculate_volume_cbm(payload) or dossier.get("estimated_volume_cbm")
        volumetric_weight = _calculate_volumetric_weight(payload)
        shipment_id = payload.get("shipment_id") or _create_shadow_shipment(conn, org_id, dossier, payload, reference)
        row = conn.execute(
            text("""
                insert into cargo_packages (
                    org_id, client_id, dossier_id, shipment_id, package_reference, tracking_id, source,
                    package_type, description, category, status, validation_status, payment_status,
                    package_condition, inventory_status, warehouse_name, warehouse_zone, warehouse_rack,
                    warehouse_location, origin_country, origin_city, destination_country, destination_city,
                    service_type, shipment_reference, public_tracking_enabled, eta_at, received_at,
                    dispatched_at, delivered_at, weight_kg, volumetric_weight_kg, length_cm, width_cm,
                    height_cm, volume_cbm, pieces_count, declared_value, declared_currency, is_fragile,
                    notes, fees_total, fees_paid, currency, barcode, qr_code_value, last_scan_location,
                    last_scan_at, created_by, updated_by
                )
                values (
                    :org_id, :client_id, :dossier_id, :shipment_id, :package_reference, :tracking_id, :source,
                    :package_type, :description, :category, :status, :validation_status, :payment_status,
                    :package_condition, :inventory_status, :warehouse_name, :warehouse_zone, :warehouse_rack,
                    :warehouse_location, :origin_country, :origin_city, :destination_country, :destination_city,
                    :service_type, :shipment_reference, :public_tracking_enabled, :eta_at, :received_at,
                    :dispatched_at, :delivered_at, :weight_kg, :volumetric_weight_kg, :length_cm, :width_cm,
                    :height_cm, :volume_cbm, :pieces_count, :declared_value, :declared_currency, :is_fragile,
                    :notes, :fees_total, :fees_paid, :currency, :barcode, :qr_code_value, :last_scan_location,
                    case when :last_scan_location is not null then now() else null end, :created_by, :updated_by
                )
                returning id::text
            """),
            {
                "org_id": org_id,
                "client_id": dossier["client_id"],
                "dossier_id": dossier_id,
                "shipment_id": shipment_id,
                "package_reference": reference,
                "tracking_id": payload.get("tracking_id") or reference,
                "source": payload.get("source") or "manual",
                "package_type": payload.get("package_type") or "carton",
                "description": payload.get("description") or payload.get("goods_type") or dossier.get("goods_type"),
                "category": payload.get("category"),
                "status": payload.get("status") or "CREATED",
                "validation_status": payload.get("validation_status") or "PENDING",
                "payment_status": payload.get("payment_status") or payload.get("payment_clearance_status") or "UNKNOWN",
                "package_condition": payload.get("package_condition") or "UNKNOWN",
                "inventory_status": payload.get("inventory_status") or "NOT_STORED",
                "warehouse_name": payload.get("warehouse_name"),
                "warehouse_zone": payload.get("warehouse_zone"),
                "warehouse_rack": payload.get("warehouse_rack"),
                "warehouse_location": payload.get("warehouse_location"),
                "origin_country": payload.get("origin_country") or dossier.get("origin_country"),
                "origin_city": payload.get("origin_city") or dossier.get("origin_city"),
                "destination_country": payload.get("destination_country") or dossier.get("destination_country"),
                "destination_city": payload.get("destination_city") or dossier.get("destination_city"),
                "service_type": payload.get("service_type") or payload.get("shipping_mode") or dossier.get("shipping_mode"),
                "shipment_reference": payload.get("shipment_reference"),
                "public_tracking_enabled": payload.get("public_tracking_enabled", True),
                "eta_at": payload.get("eta_at"),
                "received_at": payload.get("received_at"),
                "dispatched_at": payload.get("dispatched_at"),
                "delivered_at": payload.get("delivered_at"),
                "weight_kg": payload.get("weight_kg") or dossier.get("estimated_weight_kg"),
                "volumetric_weight_kg": volumetric_weight,
                "length_cm": payload.get("length_cm"),
                "width_cm": payload.get("width_cm"),
                "height_cm": payload.get("height_cm"),
                "volume_cbm": volume_cbm,
                "pieces_count": payload.get("pieces_count") or 1,
                "declared_value": payload.get("declared_value"),
                "declared_currency": payload.get("declared_currency") or payload.get("currency"),
                "is_fragile": payload.get("is_fragile", False),
                "notes": payload.get("notes"),
                "fees_total": payload.get("fees_total") or dossier.get("final_total") or dossier.get("quoted_total"),
                "fees_paid": payload.get("fees_paid") or 0,
                "currency": payload.get("currency") or dossier.get("final_currency") or dossier.get("quoted_currency"),
                "barcode": payload.get("barcode"),
                "qr_code_value": payload.get("qr_code_value") or reference,
                "last_scan_location": payload.get("last_scan_location"),
                "created_by": user_id,
                "updated_by": user_id,
            },
        ).fetchone()
        package_id = row[0]
        _insert_package_event(
            conn,
            org_id=org_id,
            package_id=package_id,
            event_type="PACKAGE_CREATED",
            title="Colis créé",
            description="Colis enregistré dans SLAIVIO.",
            new_status=payload.get("status") or "CREATED",
            actor_id=user_id,
        )
    return get_package(org_id, package_id) or {}


def update_package(org_id: str, package_id: str, user_id: str, payload: dict) -> dict | None:
    _ensure_schema()
    existing = get_package(org_id, package_id)
    if not existing:
        return None
    allowed = {
        "tracking_id", "source", "package_type", "description", "category", "status",
        "validation_status", "payment_status", "payment_clearance_status", "package_condition",
        "inventory_status", "warehouse_name", "warehouse_zone", "warehouse_rack", "warehouse_location",
        "origin_country", "origin_city", "destination_country", "destination_city", "service_type",
        "shipping_mode", "shipment_reference", "public_tracking_enabled", "eta_at", "received_at",
        "dispatched_at", "delivered_at", "weight_kg", "volumetric_weight_kg", "length_cm", "width_cm",
        "height_cm", "volume_cbm", "pieces_count", "declared_value", "declared_currency", "is_fragile",
        "notes", "fees_total", "fees_paid", "currency", "barcode", "qr_code_value", "last_scan_location",
    }
    data = {key: payload.get(key, existing.get(key)) for key in allowed}
    data["payment_status"] = payload.get("payment_status") or payload.get("payment_clearance_status") or existing.get("payment_status")
    data["service_type"] = payload.get("service_type") or payload.get("shipping_mode") or existing.get("service_type")
    data["volume_cbm"] = _calculate_volume_cbm(data)
    data["volumetric_weight_kg"] = _calculate_volumetric_weight(data)
    previous_status = existing.get("status")
    next_status = data.get("status") or previous_status

    with engine.begin() as conn:
        conn.execute(
            text("""
                update cargo_packages set
                    tracking_id = :tracking_id,
                    source = :source,
                    package_type = :package_type,
                    description = :description,
                    category = :category,
                    status = :status,
                    validation_status = :validation_status,
                    payment_status = :payment_status,
                    package_condition = :package_condition,
                    inventory_status = :inventory_status,
                    warehouse_name = :warehouse_name,
                    warehouse_zone = :warehouse_zone,
                    warehouse_rack = :warehouse_rack,
                    warehouse_location = :warehouse_location,
                    origin_country = :origin_country,
                    origin_city = :origin_city,
                    destination_country = :destination_country,
                    destination_city = :destination_city,
                    service_type = :service_type,
                    shipment_reference = :shipment_reference,
                    public_tracking_enabled = :public_tracking_enabled,
                    eta_at = :eta_at,
                    received_at = :received_at,
                    dispatched_at = :dispatched_at,
                    delivered_at = :delivered_at,
                    weight_kg = :weight_kg,
                    volumetric_weight_kg = :volumetric_weight_kg,
                    length_cm = :length_cm,
                    width_cm = :width_cm,
                    height_cm = :height_cm,
                    volume_cbm = :volume_cbm,
                    pieces_count = :pieces_count,
                    declared_value = :declared_value,
                    declared_currency = :declared_currency,
                    is_fragile = :is_fragile,
                    notes = :notes,
                    fees_total = :fees_total,
                    fees_paid = :fees_paid,
                    currency = :currency,
                    barcode = :barcode,
                    qr_code_value = :qr_code_value,
                    last_scan_location = :last_scan_location,
                    last_scan_at = case when :last_scan_location is not null then now() else last_scan_at end,
                    updated_by = :updated_by,
                    updated_at = now()
                where org_id = :org_id and id = :package_id
            """),
            dict(data, updated_by=user_id, org_id=org_id, package_id=package_id),
        )
        if existing.get("shipment_id"):
            conn.execute(
                text("""
                    update shipments set
                      status = :status,
                      current_status = :status,
                      goods_type = :description,
                      weight_kg = :weight_kg,
                      volume_cbm = :volume_cbm,
                      shipping_mode = :service_type,
                      fees_total = :fees_total,
                      fees_paid = :fees_paid,
                      currency = :currency,
                      package_condition = :package_condition,
                      inventory_status = :inventory_status,
                      payment_clearance_status = :payment_status,
                      eta_at = :eta_at,
                      last_scan_location = :last_scan_location,
                      last_scan_at = case when :last_scan_location is not null then now() else last_scan_at end,
                      updated_at = now()
                    where org_id = :org_id and id = :shipment_id
                """),
                dict(data, org_id=org_id, shipment_id=existing["shipment_id"]),
            )
        if next_status != previous_status:
            _insert_package_event(
                conn,
                org_id=org_id,
                package_id=package_id,
                event_type="PACKAGE_STATUS_CHANGED",
                title="Statut modifié",
                description="Statut colis modifié depuis le dashboard.",
                previous_status=previous_status,
                new_status=next_status,
                actor_id=user_id,
            )
    return get_package(org_id, package_id)


def export_packages(org_id: str, **kwargs) -> list[dict]:
    return list_packages(org_id, page=1, page_size=5000, **kwargs)["items"]


def import_packages(org_id: str, user_id: str, csv_content: str) -> dict:
    _ensure_schema()
    reader = csv.DictReader(io.StringIO(csv_content))
    created = 0
    skipped = 0
    errors: list[dict] = []
    for index, raw in enumerate(reader, start=2):
        row = {str(k or "").strip(): (v.strip() if isinstance(v, str) else v) for k, v in raw.items()}
        if not any(row.values()):
            continue
        with engine.begin() as conn:
            dossier = None
            if row.get("dossier_id"):
                dossier = _dossier_for_create(conn, org_id, row["dossier_id"])
            elif row.get("dossier_reference"):
                dossier = _dossier_for_reference(conn, org_id, row["dossier_reference"])
        if not dossier:
            skipped += 1
            errors.append({"line": index, "error": "dossier_not_found"})
            continue
        payload = {
            "dossier_id": dossier["id"],
            "package_reference": row.get("package_reference") or row.get("reference") or None,
            "tracking_id": row.get("tracking_id") or row.get("package_reference") or None,
            "source": "import",
            "package_type": row.get("package_type") or "carton",
            "description": row.get("description") or row.get("goods_type"),
            "category": row.get("category"),
            "status": row.get("status") or "CREATED",
            "validation_status": row.get("validation_status") or "PENDING",
            "payment_status": row.get("payment_status") or "UNKNOWN",
            "warehouse_name": row.get("warehouse_name"),
            "warehouse_location": row.get("warehouse_location"),
            "origin_country": row.get("origin_country"),
            "origin_city": row.get("origin_city"),
            "destination_country": row.get("destination_country"),
            "destination_city": row.get("destination_city"),
            "service_type": row.get("service_type"),
            "weight_kg": _number(row.get("weight_kg")),
            "length_cm": _number(row.get("length_cm")),
            "width_cm": _number(row.get("width_cm")),
            "height_cm": _number(row.get("height_cm")),
            "volume_cbm": _number(row.get("volume_cbm")),
            "pieces_count": int(_number(row.get("pieces_count")) or 1),
            "declared_value": _number(row.get("declared_value")),
            "declared_currency": row.get("declared_currency"),
            "notes": row.get("notes"),
        }
        try:
            create_package(org_id, user_id, payload)
            created += 1
        except Exception as exc:
            skipped += 1
            errors.append({"line": index, "error": str(exc)})
    return {"created": created, "skipped": skipped, "errors": errors[:50]}


def _number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(",", "."))
    except ValueError:
        return None


def add_package_media(org_id: str, package_id: str, user_id: str, payload: dict) -> dict | None:
    _ensure_schema()
    if not get_package(org_id, package_id):
        return None
    with engine.begin() as conn:
        conn.execute(
            text("""
                insert into package_media (org_id, package_id, media_url, media_type, caption, uploaded_by_id)
                values (:org_id, :package_id, :media_url, :media_type, :caption, :uploaded_by_id)
            """),
            {
                "org_id": org_id,
                "package_id": package_id,
                "media_url": payload["media_url"],
                "media_type": payload.get("media_type") or "IMAGE",
                "caption": payload.get("caption"),
                "uploaded_by_id": user_id,
            },
        )
        _insert_package_event(
            conn,
            org_id=org_id,
            package_id=package_id,
            event_type="PACKAGE_MEDIA_ADDED",
            title="Média ajouté",
            description=payload.get("caption") or "Un média a été ajouté au colis.",
            actor_id=user_id,
        )
    return get_package(org_id, package_id)


def create_package_anomaly(org_id: str, package_id: str, user_id: str, payload: dict) -> dict | None:
    _ensure_schema()
    if not get_package(org_id, package_id):
        return None
    with engine.begin() as conn:
        conn.execute(
            text("""
                insert into package_anomalies (
                    org_id, package_id, anomaly_type, severity, status, title, description, created_by
                )
                values (
                    :org_id, :package_id, :anomaly_type, :severity, 'OPEN', :title, :description, :created_by
                )
            """),
            {
                "org_id": org_id,
                "package_id": package_id,
                "anomaly_type": payload.get("anomaly_type") or "OTHER",
                "severity": payload.get("severity") or "MEDIUM",
                "title": payload["title"],
                "description": payload.get("description"),
                "created_by": user_id,
            },
        )
        conn.execute(
            text("""
                update cargo_packages
                set status = case when status = 'DELIVERED' then status else 'ISSUE' end,
                    validation_status = 'NEEDS_REVIEW',
                    updated_by = :user_id,
                    updated_at = now()
                where org_id = :org_id and id = :package_id
            """),
            {"org_id": org_id, "package_id": package_id, "user_id": user_id},
        )
        _insert_package_event(
            conn,
            org_id=org_id,
            package_id=package_id,
            event_type="PACKAGE_ANOMALY_CREATED",
            title="Anomalie signalée",
            description=payload["title"],
            actor_id=user_id,
        )
    return get_package(org_id, package_id)


def resolve_package_anomaly(org_id: str, package_id: str, anomaly_id: str, user_id: str, notes: str | None) -> dict | None:
    _ensure_schema()
    if not get_package(org_id, package_id):
        return None
    with engine.begin() as conn:
        updated = conn.execute(
            text("""
                update package_anomalies
                set status = 'RESOLVED',
                    resolution_notes = :notes,
                    resolved_at = now(),
                    resolved_by = :user_id,
                    updated_at = now()
                where org_id = :org_id and package_id = :package_id and id = :anomaly_id
            """),
            {"org_id": org_id, "package_id": package_id, "anomaly_id": anomaly_id, "user_id": user_id, "notes": notes},
        ).rowcount
        if not updated:
            return None
        open_count = conn.execute(
            text("""
                select count(*)::int
                from package_anomalies
                where org_id = :org_id and package_id = :package_id and status in ('OPEN', 'IN_REVIEW')
            """),
            {"org_id": org_id, "package_id": package_id},
        ).scalar() or 0
        if open_count == 0:
            conn.execute(
                text("""
                    update cargo_packages
                    set validation_status = 'VALIDATED',
                        status = case when status = 'ISSUE' then 'WAREHOUSE_PROCESSING' else status end,
                        updated_by = :user_id,
                        updated_at = now()
                    where org_id = :org_id and id = :package_id
                """),
                {"org_id": org_id, "package_id": package_id, "user_id": user_id},
            )
        _insert_package_event(
            conn,
            org_id=org_id,
            package_id=package_id,
            event_type="PACKAGE_ANOMALY_RESOLVED",
            title="Anomalie résolue",
            description=notes or "Anomalie marquée comme résolue.",
            actor_id=user_id,
        )
    return get_package(org_id, package_id)


def create_package_notification(org_id: str, package_id: str, user_id: str, payload: dict) -> dict | None:
    _ensure_schema()
    if not get_package(org_id, package_id):
        return None
    with engine.begin() as conn:
        conn.execute(
            text("""
                insert into package_notifications (
                    org_id, package_id, channel, notification_type, recipient, message, status
                )
                values (
                    :org_id, :package_id, :channel, :notification_type, :recipient, :message, 'PENDING'
                )
            """),
            {
                "org_id": org_id,
                "package_id": package_id,
                "channel": payload.get("channel") or "whatsapp",
                "notification_type": payload.get("notification_type") or "PACKAGE_UPDATE",
                "recipient": payload.get("recipient"),
                "message": payload["message"],
            },
        )
        _insert_package_event(
            conn,
            org_id=org_id,
            package_id=package_id,
            event_type="PACKAGE_NOTIFICATION_QUEUED",
            title="Notification préparée",
            description=payload["message"],
            actor_id=user_id,
        )
    return get_package(org_id, package_id)


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
            "title": item.get("title") or item.get("event_type") or "Événement colis",
            "description": item.get("description") or item.get("new_status") or "Mise à jour du colis",
            "occurred_at": item.get("created_at"),
            "metadata": item.get("metadata") or {},
        })
    for item in package.get("anomalies", []):
        events.append({
            "id": f"anomaly-{item.get('id')}",
            "type": "anomaly",
            "title": item.get("title") or "Anomalie",
            "description": item.get("description") or item.get("status") or "Anomalie colis",
            "occurred_at": item.get("detected_at") or item.get("created_at"),
            "metadata": {"severity": item.get("severity"), "status": item.get("status")},
        })
    for item in package.get("media", []):
        events.append({
            "id": f"media-{item.get('id')}",
            "type": "media",
            "title": "Média ajouté",
            "description": item.get("caption") or item.get("media_type") or "Média colis",
            "occurred_at": item.get("created_at"),
            "metadata": {"url": item.get("media_url")},
        })
    for item in package.get("notifications", []):
        events.append({
            "id": f"notification-{item.get('id')}",
            "type": "notification",
            "title": "Notification",
            "description": item.get("message") or item.get("notification_type") or "Notification colis",
            "occurred_at": item.get("created_at"),
            "metadata": {"channel": item.get("channel"), "status": item.get("status")},
        })
    return sorted(
        [event for event in events if event.get("occurred_at")],
        key=lambda event: str(event.get("occurred_at")),
        reverse=True,
    )[:limit]
