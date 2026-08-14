from __future__ import annotations

import csv
import io
import json
from datetime import date, datetime
from decimal import Decimal
from math import ceil
from typing import Any
from uuid import uuid4

from sqlalchemy import text

from app.db.database import engine
from app.packages.repository import _ensure_schema as ensure_packages_schema


EXPEDITION_STATUSES = {
    "DRAFT",
    "PREPARING",
    "LOADING",
    "READY_FOR_DEPARTURE",
    "DISPATCHED",
    "IN_TRANSIT",
    "ARRIVED_DESTINATION",
    "CUSTOMS_CLEARANCE",
    "AVAILABLE_FOR_PICKUP",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "BLOCKED",
    "CANCELLED",
    "ARCHIVED",
}
EXPEDITION_MODES = {"AIR", "SEA", "ROAD", "EXPRESS", "GROUPAGE", "OTHER"}
EXPEDITION_TRANSITIONS={
 "DRAFT":{"PREPARING","CANCELLED"},"PREPARING":{"LOADING","BLOCKED","CANCELLED"},"LOADING":{"READY_FOR_DEPARTURE","BLOCKED","PREPARING"},
 "READY_FOR_DEPARTURE":{"DISPATCHED","BLOCKED","LOADING"},"DISPATCHED":{"IN_TRANSIT","BLOCKED"},"IN_TRANSIT":{"ARRIVED_DESTINATION","CUSTOMS_CLEARANCE","BLOCKED"},
 "ARRIVED_DESTINATION":{"CUSTOMS_CLEARANCE","AVAILABLE_FOR_PICKUP","OUT_FOR_DELIVERY","BLOCKED"},"CUSTOMS_CLEARANCE":{"AVAILABLE_FOR_PICKUP","OUT_FOR_DELIVERY","BLOCKED"},
 "AVAILABLE_FOR_PICKUP":{"OUT_FOR_DELIVERY","DELIVERED","BLOCKED"},"OUT_FOR_DELIVERY":{"DELIVERED","BLOCKED"},"BLOCKED":{"PREPARING","LOADING","READY_FOR_DEPARTURE","IN_TRANSIT","CUSTOMS_CLEARANCE","AVAILABLE_FOR_PICKUP","OUT_FOR_DELIVERY","CANCELLED"},
 "DELIVERED":{"ARCHIVED"},"CANCELLED":{"ARCHIVED"},"ARCHIVED":set(),
}
RISK_LEVELS = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
FINANCIAL_STATUSES = {"NOT_CALCULATED", "PENDING", "PARTIAL", "PAID", "OVERDUE", "BLOCKED"}
ANOMALY_STATUSES = {"OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"}
ANOMALY_SEVERITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
CHECKPOINT_STATUSES = {"PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED", "SKIPPED"}
CHECKPOINTS = [
    ("PREPARATION", "Préparation"),
    ("LOADING", "Chargement"),
    ("DEPARTURE", "Départ"),
    ("TRANSIT", "Transit"),
    ("ARRIVAL", "Arrivée"),
    ("CUSTOMS", "Douane"),
    ("AVAILABLE", "Disponible"),
    ("DELIVERED", "Livré"),
]

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
    ensure_packages_schema()
    statements = [
        """
        create table if not exists cargo_expeditions (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          expedition_reference text not null,
          title text,
          status text not null default 'PREPARING',
          mode text not null default 'AIR',
          service_type text,
          risk_level text not null default 'LOW',
          financial_status text not null default 'NOT_CALCULATED',
          origin_country text,
          origin_city text,
          origin_warehouse text,
          destination_country text,
          destination_city text,
          destination_warehouse text,
          route_label text,
          carrier_name text,
          flight_number text,
          vessel_name text,
          container_number text,
          awb_number text,
          bl_number text,
          batch_reference text,
          manifest_reference text,
          owner_id text,
          owner_name text,
          planned_departure_at timestamptz,
          departed_at timestamptz,
          eta_at timestamptz,
          arrived_at timestamptz,
          delivered_at timestamptz,
          is_delayed boolean not null default false,
          delay_reason text,
          packages_count integer not null default 0,
          clients_count integer not null default 0,
          total_weight_kg numeric(14,3) not null default 0,
          total_volume_cbm numeric(14,4) not null default 0,
          declared_value_total numeric(14,2) not null default 0,
          cost_total numeric(14,2) not null default 0,
          billed_total numeric(14,2) not null default 0,
          profit_total numeric(14,2) not null default 0,
          currency text not null default 'USD',
          notes text,
          created_by text,
          updated_by text,
          archived_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
        """,
        "create unique index if not exists idx_cargo_expeditions_org_reference on cargo_expeditions(org_id, expedition_reference)",
        """
        create table if not exists expedition_packages (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
          package_id uuid not null references cargo_packages(id) on delete cascade,
          added_by text,
          added_at timestamptz not null default now(),
          removed_at timestamptz,
          removal_reason text
        )
        """,
        "create unique index if not exists idx_expedition_packages_active_unique on expedition_packages(org_id, expedition_id, package_id) where removed_at is null",
        """
        create table if not exists expedition_checkpoints (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
          checkpoint_key text not null,
          title text not null,
          status text not null default 'PENDING',
          position integer not null,
          planned_at timestamptz,
          completed_at timestamptz,
          location text,
          notes text,
          updated_by text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
        """,
        "create unique index if not exists idx_expedition_checkpoints_unique on expedition_checkpoints(org_id, expedition_id, checkpoint_key)",
        """
        create table if not exists expedition_events (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
          event_type text not null,
          title text not null,
          description text,
          previous_status text,
          new_status text,
          metadata jsonb not null default '{}'::jsonb,
          actor_id text,
          actor_name text,
          occurred_at timestamptz not null default now(),
          created_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists expedition_documents (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
          document_type text not null,
          file_url text not null,
          file_name text,
          mime_type text,
          visibility text not null default 'INTERNAL',
          notes text,
          uploaded_by text,
          created_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists expedition_financial_lines (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
          line_type text not null,
          category text,
          description text,
          amount numeric(14,2) not null default 0,
          currency text not null default 'USD',
          direction text not null default 'COST',
          status text not null default 'PENDING',
          client_id uuid,
          dossier_id uuid,
          package_id uuid,
          due_at timestamptz,
          paid_at timestamptz,
          created_by text,
          created_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists expedition_anomalies (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
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
        create table if not exists expedition_notifications (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
          channel text not null default 'whatsapp',
          audience text not null default 'ALL_CLIENTS',
          recipient text,
          notification_type text not null default 'EXPEDITION_UPDATE',
          message text not null,
          status text not null default 'PENDING',
          provider_message_id text,
          sent_at timestamptz,
          failed_at timestamptz,
          error_message text,
          created_by text,
          created_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists expedition_notes (
          id uuid primary key default gen_random_uuid(),
          org_id text not null references organizations(id) on delete cascade,
          expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
          note text not null,
          priority text not null default 'NORMAL',
          visibility text not null default 'PRIVATE',
          created_by text,
          created_at timestamptz not null default now()
        )
        """,
        "alter table cargo_expeditions add column if not exists route_label text",
        "alter table cargo_expeditions add column if not exists destination_warehouse text",
        "alter table cargo_expeditions add column if not exists owner_id text",
        "alter table cargo_expeditions add column if not exists owner_name text",
        "alter table cargo_expeditions add column if not exists planned_departure_at timestamptz",
        "alter table cargo_expeditions add column if not exists departed_at timestamptz",
        "alter table cargo_expeditions add column if not exists financial_status text not null default 'NOT_CALCULATED'",
        "alter table cargo_expeditions add column if not exists currency text not null default 'USD'",
        "alter table cargo_expeditions add column if not exists risk_level text not null default 'LOW'",
        "alter table cargo_expeditions add column if not exists is_delayed boolean not null default false",
        "alter table cargo_expeditions add column if not exists delay_reason text",
        "alter table cargo_expeditions add column if not exists profit_total numeric(14,2) not null default 0",
        "alter table expedition_packages add column if not exists removal_reason text",
        "alter table expedition_checkpoints add column if not exists label text",
        "alter table expedition_checkpoints add column if not exists sort_order integer",
        "alter table expedition_checkpoints add column if not exists title text",
        "alter table expedition_checkpoints add column if not exists position integer",
        "alter table expedition_checkpoints add column if not exists updated_by text",
        "update expedition_checkpoints set title = coalesce(title, label, checkpoint_key) where title is null",
        "update expedition_checkpoints set position = coalesce(position, sort_order, 0) where position is null",
        "alter table expedition_checkpoints alter column title set not null",
        "alter table expedition_checkpoints alter column position set not null",
        "alter table expedition_events add column if not exists occurred_at timestamptz not null default now()",
        "alter table expedition_financial_lines add column if not exists due_at timestamptz",
        "alter table expedition_financial_lines add column if not exists paid_at timestamptz",
        "alter table expedition_financial_lines add column if not exists created_by text",
        "alter table expedition_financial_lines alter column currency set default 'USD'",
        "update expedition_financial_lines set currency = 'USD' where currency is null",
        "alter table expedition_financial_lines alter column currency set not null",
        "alter table expedition_notifications add column if not exists created_by text",
        "alter table expedition_notifications alter column channel set default 'whatsapp'",
        "alter table expedition_notifications alter column notification_type set default 'EXPEDITION_UPDATE'",
        "create index if not exists idx_cargo_expeditions_org_status on cargo_expeditions(org_id, status)",
        "create index if not exists idx_cargo_expeditions_org_updated on cargo_expeditions(org_id, updated_at desc)",
        "create index if not exists idx_expedition_events_exp on expedition_events(org_id, expedition_id, occurred_at desc)",
        "create index if not exists idx_expedition_documents_exp on expedition_documents(org_id, expedition_id, created_at desc)",
        "create index if not exists idx_expedition_financial_exp on expedition_financial_lines(org_id, expedition_id, created_at desc)",
        "create index if not exists idx_expedition_anomalies_exp on expedition_anomalies(org_id, expedition_id, status)",
    ]
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))
    _SCHEMA_READY = True


def generate_expedition_reference() -> str:
    return f"EXP-{datetime.utcnow().year}-{str(uuid4()).split('-')[0].upper()}"


def _json(payload: dict | None) -> str:
    return json.dumps(payload or {})


def _client_display_sql() -> str:
    return "coalesce(to_jsonb(c)->>'display_name', c.name, to_jsonb(c)->>'company_name', c.phone, c.email, 'Client sans nom')"


def _dossier_reference_sql() -> str:
    return "coalesce(d.tracking_id, 'DOS-' || upper(left(d.id::text, 8)))"


def _select_expedition_sql() -> str:
    return """
        select
            e.id::text,
            e.org_id,
            e.expedition_reference,
            e.title,
            e.status,
            e.mode,
            e.service_type,
            e.risk_level,
            e.financial_status,
            e.origin_country,
            e.origin_city,
            e.origin_warehouse,
            e.destination_country,
            e.destination_city,
            e.destination_warehouse,
            e.route_label,
            e.carrier_name,
            e.flight_number,
            e.vessel_name,
            e.container_number,
            e.awb_number,
            e.bl_number,
            e.batch_reference,
            e.manifest_reference,
            e.owner_id,
            e.owner_name,
            e.planned_departure_at,
            e.departed_at,
            e.eta_at,
            e.arrived_at,
            e.delivered_at,
            e.is_delayed,
            e.delay_reason,
            e.last_location,
            e.last_signal_at,
            e.last_signal_source,
            e.progress_percent,
            e.public_tracking_enabled,
            e.public_tracking_expires_at,
            e.tracking_row_version,
            e.shipment_row_version,
            e.packages_count,
            e.clients_count,
            e.total_weight_kg,
            e.total_volume_cbm,
            e.declared_value_total,
            e.cost_total,
            e.billed_total,
            e.profit_total,
            e.currency,
            e.notes,
            coalesce(a.open_anomalies, 0)::int open_anomalies,
            coalesce(docs.documents_count, 0)::int documents_count,
            e.created_by,
            e.updated_by,
            e.archived_at,
            e.created_at,
            e.updated_at
        from cargo_expeditions e
        left join (
            select expedition_id, count(*) filter (where status in ('OPEN', 'IN_REVIEW')) open_anomalies
            from expedition_anomalies
            where org_id = :org_id
            group by expedition_id
        ) a on a.expedition_id = e.id
        left join (
            select expedition_id, count(*) documents_count
            from expedition_documents
            where org_id = :org_id
            group by expedition_id
        ) docs on docs.expedition_id = e.id
    """


def _insert_event(
    conn,
    *,
    org_id: str,
    expedition_id: str,
    event_type: str,
    title: str,
    description: str | None = None,
    previous_status: str | None = None,
    new_status: str | None = None,
    actor_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    conn.execute(
        text("""
            insert into expedition_events (
                org_id, expedition_id, event_type, title, description, previous_status,
                new_status, actor_id, metadata
            )
            values (
                :org_id, :expedition_id, :event_type, :title, :description, :previous_status,
                :new_status, :actor_id, cast(:metadata as jsonb)
            )
        """),
        {
            "org_id": org_id,
            "expedition_id": expedition_id,
            "event_type": event_type,
            "title": title,
            "description": description,
            "previous_status": previous_status,
            "new_status": new_status,
            "actor_id": actor_id,
            "metadata": _json(metadata),
        },
    )


def _seed_checkpoints(conn, org_id: str, expedition_id: str) -> None:
    for position, (key, title) in enumerate(CHECKPOINTS, start=1):
        conn.execute(
            text("""
                insert into expedition_checkpoints (org_id, expedition_id, checkpoint_key, title, position)
                values (:org_id, :expedition_id, :checkpoint_key, :title, :position)
                on conflict (org_id, expedition_id, checkpoint_key) do nothing
            """),
            {
                "org_id": org_id,
                "expedition_id": expedition_id,
                "checkpoint_key": key,
                "title": title,
                "position": position,
            },
        )


def _recompute_finance(conn, org_id: str, expedition_id: str) -> None:
    row = conn.execute(
        text("""
            select
              coalesce(sum(amount) filter (where direction = 'COST'), 0) cost_total,
              coalesce(sum(amount) filter (where direction = 'REVENUE'), 0) billed_total,
              count(*) filter (where status in ('PENDING', 'OVERDUE')) pending_count,
              count(*) total_count
            from expedition_financial_lines
            where org_id = :org_id and expedition_id = :expedition_id
        """),
        {"org_id": org_id, "expedition_id": expedition_id},
    ).fetchone()
    cost = row.cost_total if row else 0
    billed = row.billed_total if row else 0
    if not row or row.total_count == 0:
        status = "NOT_CALCULATED"
    elif row.pending_count == 0:
        status = "PAID"
    else:
        status = "PENDING"
    conn.execute(
        text("""
            update cargo_expeditions
            set cost_total = :cost_total,
                billed_total = :billed_total,
                profit_total = :profit_total,
                financial_status = :financial_status,
                updated_at = now()
            where org_id = :org_id and id = :expedition_id
        """),
        {
            "org_id": org_id,
            "expedition_id": expedition_id,
            "cost_total": cost,
            "billed_total": billed,
            "profit_total": (billed or 0) - (cost or 0),
            "financial_status": status,
        },
    )


def _recompute_expedition_totals(conn, org_id: str, expedition_id: str) -> None:
    row = conn.execute(
        text("""
            select
                count(p.id)::int packages_count,
                count(distinct p.client_id)::int clients_count,
                coalesce(sum(coalesce(p.weight_kg, 0)), 0) total_weight_kg,
                coalesce(sum(coalesce(p.volume_cbm, 0)), 0) total_volume_cbm,
                coalesce(sum(coalesce(p.declared_value, 0)), 0) declared_value_total
            from expedition_packages ep
            join cargo_packages p on p.id = ep.package_id and p.org_id = ep.org_id
            where ep.org_id = :org_id
              and ep.expedition_id = :expedition_id
              and ep.removed_at is null
              and p.deleted_at is null
        """),
        {"org_id": org_id, "expedition_id": expedition_id},
    ).fetchone()
    conn.execute(
        text("""
            update cargo_expeditions
            set packages_count = :packages_count,
                clients_count = :clients_count,
                total_weight_kg = :total_weight_kg,
                total_volume_cbm = :total_volume_cbm,
                declared_value_total = :declared_value_total,
                updated_at = now()
            where org_id = :org_id and id = :expedition_id
        """),
        {
            "org_id": org_id,
            "expedition_id": expedition_id,
            "packages_count": row.packages_count if row else 0,
            "clients_count": row.clients_count if row else 0,
            "total_weight_kg": row.total_weight_kg if row else 0,
            "total_volume_cbm": row.total_volume_cbm if row else 0,
            "declared_value_total": row.declared_value_total if row else 0,
        },
    )


def _build_filters(org_id: str, *, q: str | None, status: str | None, mode: str | None, risk_level: str | None, origin_country: str | None, destination_country: str | None) -> tuple[str, dict]:
    filters = ["e.org_id = :org_id", "e.archived_at is null"]
    params: dict[str, Any] = {"org_id": org_id}
    if q:
        filters.append("""(
            coalesce(e.expedition_reference, '') ilike :q
            or coalesce(e.title, '') ilike :q
            or coalesce(e.route_label, '') ilike :q
            or coalesce(e.carrier_name, '') ilike :q
            or coalesce(e.container_number, '') ilike :q
            or coalesce(e.awb_number, '') ilike :q
            or coalesce(e.bl_number, '') ilike :q
        )""")
        params["q"] = f"%{q.strip()}%"
    for key, value, column in [
        ("status", status, "e.status"),
        ("mode", mode, "e.mode"),
        ("risk_level", risk_level, "e.risk_level"),
        ("origin_country", origin_country, "e.origin_country"),
        ("destination_country", destination_country, "e.destination_country"),
    ]:
        if value:
            filters.append(f"{column} = :{key}")
            params[key] = value
    return " and ".join(filters), params


def list_expeditions(org_id: str, *, q: str | None = None, status: str | None = None, mode: str | None = None, risk_level: str | None = None, origin_country: str | None = None, destination_country: str | None = None, page: int = 1, page_size: int = 30, sort: str = "updated_desc") -> dict:
    _ensure_schema()
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size
    where_clause, params = _build_filters(
        org_id,
        q=q,
        status=status,
        mode=mode,
        risk_level=risk_level,
        origin_country=origin_country,
        destination_country=destination_country,
    )
    order_by = {
        "created_asc": "e.created_at asc",
        "created_desc": "e.created_at desc",
        "eta_asc": "e.eta_at asc nulls last",
        "eta_desc": "e.eta_at desc nulls last",
        "reference_asc": "e.expedition_reference asc",
        "reference_desc": "e.expedition_reference desc",
    }.get(sort, "e.updated_at desc nulls last, e.created_at desc")
    with engine.connect() as conn:
        total = conn.execute(
            text(f"select count(*)::int from cargo_expeditions e where {where_clause}"),
            params,
        ).scalar() or 0
        rows = conn.execute(
            text(f"""
                {_select_expedition_sql()}
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


def expedition_stats(org_id: str) -> dict:
    _ensure_schema()
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select
                    count(*) filter (where status not in ('DELIVERED','CANCELLED','ARCHIVED'))::int active,
                    count(*) filter (where created_at::date = current_date)::int today,
                    count(*) filter (where status = 'IN_TRANSIT')::int in_transit,
                    count(*) filter (where arrived_at::date = current_date or eta_at::date = current_date)::int arrivals_today,
                    count(*) filter (where is_delayed = true or status = 'BLOCKED')::int delayed,
                    coalesce(round(100.0 * count(*) filter (where status = 'DELIVERED') / nullif(count(*), 0), 1), 0) delivery_rate,
                    coalesce(sum(total_weight_kg), 0) total_weight_kg,
                    coalesce(sum(total_volume_cbm), 0) total_volume_cbm
                from cargo_expeditions
                where org_id = :org_id and archived_at is null
            """),
            {"org_id": org_id},
        ).fetchone()
    return _one(row) or {
        "active": 0,
        "today": 0,
        "in_transit": 0,
        "arrivals_today": 0,
        "delayed": 0,
        "delivery_rate": 0,
        "total_weight_kg": 0,
        "total_volume_cbm": 0,
    }


def expedition_analytics(org_id:str)->dict:
    _ensure_schema()
    with engine.connect() as conn:
        def rows(sql:str):return [_safe(dict(row._mapping)) for row in conn.execute(text(sql),{"org_id":org_id}).fetchall()]
        summary=conn.execute(text("""select count(*)::int total,count(*) filter(where delivered_at is not null)::int delivered,
          count(*) filter(where delivered_at is not null and eta_at is not null and delivered_at<=eta_at)::int on_time,
          round(avg(extract(epoch from(delivered_at-coalesce(departed_at,planned_departure_at)))/3600) filter(where delivered_at is not null and coalesce(departed_at,planned_departure_at) is not null)::numeric,1) average_transit_hours,
          coalesce(sum(total_weight_kg),0) total_weight_kg,coalesce(sum(total_volume_cbm),0) total_volume_cbm,
          coalesce(sum(profit_total),0) profit_total from cargo_expeditions where org_id=:org_id and archived_at is null"""),{"org_id":org_id}).fetchone()
        return {"summary":_safe(dict(summary._mapping)),
          "by_status":rows("select status label,count(*)::int count from cargo_expeditions where org_id=:org_id and archived_at is null group by 1 order by 2 desc"),
          "by_mode":rows("select mode label,count(*)::int count from cargo_expeditions where org_id=:org_id and archived_at is null group by 1 order by 2 desc"),
          "by_route":rows("select coalesce(route_label,'Route non renseignée') label,count(*)::int count from cargo_expeditions where org_id=:org_id and archived_at is null group by 1 order by 2 desc limit 12"),
          "delays_by_route":rows("select coalesce(route_label,'Route non renseignée') label,count(*)::int count from cargo_expeditions where org_id=:org_id and archived_at is null and (is_delayed or status='BLOCKED') group by 1 order by 2 desc limit 12"),
          "monthly_deliveries":rows("select to_char(delivered_at,'YYYY-MM') label,count(*)::int count from cargo_expeditions where org_id=:org_id and delivered_at>=date_trunc('month',current_date)-interval '11 months' group by 1 order by 1")}


def get_expedition(org_id: str, expedition_id: str) -> dict | None:
    _ensure_schema()
    with engine.connect() as conn:
        row = conn.execute(
            text(f"""
                {_select_expedition_sql()}
                where e.org_id = :org_id and e.id = :expedition_id and e.archived_at is null
                limit 1
            """),
            {"org_id": org_id, "expedition_id": expedition_id},
        ).fetchone()
        expedition = _one(row)
        if not expedition:
            return None
        expedition["packages"] = [_safe(dict(row._mapping)) for row in conn.execute(
            text(f"""
                select
                    p.id::text,
                    p.package_reference,
                    p.tracking_id,
                    p.description,
                    p.status,
                    p.payment_status,
                    p.weight_kg,
                    p.volume_cbm,
                    p.declared_value,
                    p.declared_currency,
                    p.warehouse_name,
                    p.origin_city,
                    p.origin_country,
                    p.destination_city,
                    p.destination_country,
                    {_client_display_sql()} client_name,
                    c.phone client_phone,
                    {_dossier_reference_sql()} dossier_reference,
                    ep.added_at
                from expedition_packages ep
                join cargo_packages p on p.id = ep.package_id and p.org_id = ep.org_id
                left join clients c on c.id = p.client_id and c.org_id = p.org_id
                left join dossiers d on d.id = p.dossier_id and d.org_id = p.org_id
                where ep.org_id = :org_id and ep.expedition_id = :expedition_id and ep.removed_at is null
                order by ep.added_at desc
            """),
            {"org_id": org_id, "expedition_id": expedition_id},
        ).fetchall()]
        expedition["clients"] = [_safe(dict(row._mapping)) for row in conn.execute(
            text(f"""
                select
                    c.id::text,
                    {_client_display_sql()} name,
                    c.phone,
                    c.email,
                    count(p.id)::int packages_count,
                    coalesce(sum(coalesce(p.weight_kg, 0)), 0) total_weight_kg,
                    coalesce(sum(coalesce(p.declared_value, 0)), 0) declared_value_total,
                    count(*) filter (where p.payment_status not in ('PAID', 'CLEARED'))::int unpaid_packages
                from expedition_packages ep
                join cargo_packages p on p.id = ep.package_id and p.org_id = ep.org_id
                left join clients c on c.id = p.client_id and c.org_id = p.org_id
                where ep.org_id = :org_id and ep.expedition_id = :expedition_id and ep.removed_at is null
                group by c.id, c.name, c.phone, c.email, to_jsonb(c)
                order by packages_count desc
            """),
            {"org_id": org_id, "expedition_id": expedition_id},
        ).fetchall()]
        expedition["checkpoints"] = [_safe(dict(row._mapping)) for row in conn.execute(
            text("""
                select id::text, checkpoint_key, title, status, position, planned_at, completed_at, location, notes, updated_by, updated_at
                from expedition_checkpoints
                where org_id = :org_id and expedition_id = :expedition_id
                order by position asc
            """),
            {"org_id": org_id, "expedition_id": expedition_id},
        ).fetchall()]
        for key, table in [
            ("documents", "expedition_documents"),
            ("financial_lines", "expedition_financial_lines"),
            ("anomalies", "expedition_anomalies"),
            ("notifications", "expedition_notifications"),
            ("notes_list", "expedition_notes"),
        ]:
            expedition[key] = [_safe(dict(row._mapping)) for row in conn.execute(
                text(f"""
                    select *, id::text
                    from {table}
                    where org_id = :org_id and expedition_id = :expedition_id
                    order by created_at desc
                    limit 100
                """),
                {"org_id": org_id, "expedition_id": expedition_id},
            ).fetchall()]
        expedition["events"] = [_safe(dict(row._mapping)) for row in conn.execute(
            text("""
                select id::text, event_type, title, description, previous_status, new_status, metadata, actor_id, actor_name, occurred_at, created_at
                from expedition_events
                where org_id = :org_id and expedition_id = :expedition_id
                order by occurred_at desc
                limit 150
            """),
            {"org_id": org_id, "expedition_id": expedition_id},
        ).fetchall()]
    return expedition


def _hydrate_expedition_references(conn, org_id: str, payload: dict) -> dict:
    data = dict(payload)
    service_id = data.get("shipping_service_id")
    route_id = data.get("route_id")
    if service_id:
        service = conn.execute(text("""select route_id::text,shipping_mode,service_name
            from shipping_services where org_id=:org_id and id=:id"""),
            {"org_id": org_id, "id": service_id}).mappings().first()
        if not service:
            raise ValueError("shipping_service_not_found")
        if route_id and route_id != service.get("route_id"):
            offered = conn.execute(text("""select 1 from service_route_offerings
                where org_id=:org_id and service_id=:service_id and route_id=:route_id
                and availability in('AVAILABLE','LIMITED') and effective_from<=now()
                and (effective_until is null or effective_until>now())"""),
                {"org_id": org_id, "service_id": service_id, "route_id": route_id}).first()
            if not offered:
                raise ValueError("service_route_mismatch")
        route_id = route_id or service.get("route_id")
        data.update({"route_id": route_id, "mode": service.get("shipping_mode"), "service_type": service.get("service_name")})
    if route_id:
        route = conn.execute(text("""select route_name,origin_country,origin_city,destination_country,destination_city,transport_mode
            from shipping_routes where org_id=:org_id and id=:id"""),
            {"org_id": org_id, "id": route_id}).mappings().first()
        if not route:
            raise ValueError("route_not_found")
        data.update({"route_label": route["route_name"], "origin_country": route["origin_country"],
            "origin_city": route["origin_city"], "destination_country": route["destination_country"],
            "destination_city": route["destination_city"], "mode": data.get("mode") or route["transport_mode"]})
    return data


def create_expedition(org_id: str, user_id: str, payload: dict) -> dict:
    _ensure_schema()
    with engine.begin() as conn:
        payload = _hydrate_expedition_references(conn, org_id, payload)
        reference = payload.get("expedition_reference") or generate_expedition_reference()
        status = payload.get("status") or "PREPARING"
        mode = payload.get("mode") or "AIR"
        if status not in EXPEDITION_STATUSES:
            raise ValueError("invalid_status")
        if mode not in EXPEDITION_MODES:
            raise ValueError("invalid_mode")
        row = conn.execute(
            text("""
                insert into cargo_expeditions (
                    org_id, expedition_reference, title, status, mode, service_type, risk_level,
                    financial_status, origin_country, origin_city, origin_warehouse,
                    destination_country, destination_city, destination_warehouse, route_label,
                    carrier_name, flight_number, vessel_name, container_number, awb_number,
                    bl_number, batch_reference, manifest_reference, owner_id, owner_name,
                    planned_departure_at, departed_at, eta_at, arrived_at, delivered_at,
                    is_delayed, delay_reason, currency, notes, created_by, updated_by,
                    route_id, shipping_service_id, origin_warehouse_id, destination_office_id, departure_id
                )
                values (
                    :org_id, :reference, :title, :status, :mode, :service_type, :risk_level,
                    :financial_status, :origin_country, :origin_city, :origin_warehouse,
                    :destination_country, :destination_city, :destination_warehouse, :route_label,
                    :carrier_name, :flight_number, :vessel_name, :container_number, :awb_number,
                    :bl_number, :batch_reference, :manifest_reference, :owner_id, :owner_name,
                    :planned_departure_at, :departed_at, :eta_at, :arrived_at, :delivered_at,
                    :is_delayed, :delay_reason, :currency, :notes, :user_id, :user_id,
                    :route_id, :shipping_service_id, :origin_warehouse_id, :destination_office_id, :departure_id
                )
                returning id::text
            """),
            {
                "org_id": org_id,
                "reference": reference,
                "title": payload.get("title"),
                "status": status,
                "mode": mode,
                "service_type": payload.get("service_type"),
                "risk_level": payload.get("risk_level") or "LOW",
                "financial_status": payload.get("financial_status") or "NOT_CALCULATED",
                "origin_country": payload.get("origin_country"),
                "origin_city": payload.get("origin_city"),
                "origin_warehouse": payload.get("origin_warehouse"),
                "destination_country": payload.get("destination_country"),
                "destination_city": payload.get("destination_city"),
                "destination_warehouse": payload.get("destination_warehouse"),
                "route_label": payload.get("route_label"),
                "carrier_name": payload.get("carrier_name"),
                "flight_number": payload.get("flight_number"),
                "vessel_name": payload.get("vessel_name"),
                "container_number": payload.get("container_number"),
                "awb_number": payload.get("awb_number"),
                "bl_number": payload.get("bl_number"),
                "batch_reference": payload.get("batch_reference"),
                "manifest_reference": payload.get("manifest_reference"),
                "owner_id": payload.get("owner_id"),
                "owner_name": payload.get("owner_name"),
                "planned_departure_at": payload.get("planned_departure_at"),
                "departed_at": payload.get("departed_at"),
                "eta_at": payload.get("eta_at"),
                "arrived_at": payload.get("arrived_at"),
                "delivered_at": payload.get("delivered_at"),
                "is_delayed": payload.get("is_delayed", False),
                "delay_reason": payload.get("delay_reason"),
                "currency": payload.get("currency") or "USD",
                "notes": payload.get("notes"),
                "user_id": user_id,
            },
        ).fetchone()
        expedition_id = row[0]
        _seed_checkpoints(conn, org_id, expedition_id)
        _insert_event(
            conn,
            org_id=org_id,
            expedition_id=expedition_id,
            event_type="EXPEDITION_CREATED",
            title="Expédition créée",
            new_status=status,
            actor_id=user_id,
            metadata={"reference": reference, "mode": mode},
        )
    expedition = get_expedition(org_id, expedition_id)
    if not expedition:
        raise ValueError("creation_failed")
    return expedition


def update_expedition(org_id: str, expedition_id: str, user_id: str, payload: dict, expected_version: int | None = None) -> dict | None:
    _ensure_schema()
    allowed = [
        "title", "status", "mode", "service_type", "risk_level", "financial_status",
        "origin_country", "origin_city", "origin_warehouse", "destination_country",
        "destination_city", "destination_warehouse", "route_label", "carrier_name",
        "flight_number", "vessel_name", "container_number", "awb_number", "bl_number",
        "batch_reference", "manifest_reference", "owner_id", "owner_name",
        "planned_departure_at", "departed_at", "eta_at", "arrived_at", "delivered_at",
        "is_delayed", "delay_reason", "currency", "notes",
    ]
    updates = {key: value for key, value in payload.items() if key in allowed}
    if not updates:
        return get_expedition(org_id, expedition_id)
    if updates.get("status") and updates["status"] not in EXPEDITION_STATUSES:
        raise ValueError("invalid_status")
    if updates.get("mode") and updates["mode"] not in EXPEDITION_MODES:
        raise ValueError("invalid_mode")
    if updates.get("risk_level") and updates["risk_level"] not in RISK_LEVELS:
        raise ValueError("invalid_risk_level")
    with engine.begin() as conn:
        current = conn.execute(
            text("select status from cargo_expeditions where org_id = :org_id and id = :id and archived_at is null"),
            {"org_id": org_id, "id": expedition_id},
        ).fetchone()
        if not current:
            return None
        if updates.get("status") and updates["status"]!=current.status and updates["status"] not in EXPEDITION_TRANSITIONS.get(current.status,set()):
            raise ValueError(f"invalid_status_transition:{current.status}:{updates['status']}")
        set_clause = ", ".join(f"{key} = :{key}" for key in updates)
        updated = conn.execute(
            text(f"""
                update cargo_expeditions
                set {set_clause}, shipment_row_version = shipment_row_version + 1, updated_by = :user_id, updated_at = now()
                where org_id = :org_id and id = :id
                  and (:expected_version is null or shipment_row_version = :expected_version)
                returning id
            """),
            dict(updates, user_id=user_id, org_id=org_id, id=expedition_id, expected_version=expected_version),
        ).fetchone()
        if not updated:
            raise ValueError("stale_shipment_version")
        conn.execute(text("insert into shipment_audit_log(org_id,expedition_id,action,actor_id,payload) values(:org_id,:id,'SHIPMENT_UPDATED',:user_id,cast(:payload as jsonb))"),{"org_id":org_id,"id":expedition_id,"user_id":user_id,"payload":json.dumps(updates,default=str)})
        if "status" in updates and updates["status"] != current.status:
            _insert_event(
                conn,
                org_id=org_id,
                expedition_id=expedition_id,
                event_type="STATUS_CHANGED",
                title="Statut modifié",
                previous_status=current.status,
                new_status=updates["status"],
                actor_id=user_id,
            )
    return get_expedition(org_id, expedition_id)


def archive_expedition(org_id: str, expedition_id: str, user_id: str, expected_version: int | None = None) -> bool:
    _ensure_schema()
    with engine.begin() as conn:
        row = conn.execute(text("""update cargo_expeditions set archived_at=now(),status='ARCHIVED',shipment_row_version=shipment_row_version+1,updated_by=:user_id,updated_at=now()
          where org_id=:org_id and id=:id and archived_at is null and (:expected_version is null or shipment_row_version=:expected_version) returning id"""),{"org_id":org_id,"id":expedition_id,"user_id":user_id,"expected_version":expected_version}).fetchone()
        if not row:
            exists=conn.execute(text("select 1 from cargo_expeditions where org_id=:org_id and id=:id and archived_at is null"),{"org_id":org_id,"id":expedition_id}).fetchone()
            if exists:raise ValueError("stale_shipment_version")
            return False
        conn.execute(text("insert into shipment_audit_log(org_id,expedition_id,action,actor_id) values(:org_id,:id,'SHIPMENT_ARCHIVED',:user_id)"),{"org_id":org_id,"id":expedition_id,"user_id":user_id})
    return True


def add_package_to_expedition(org_id: str, expedition_id: str, package_id: str, user_id: str) -> dict | None:
    _ensure_schema()
    with engine.begin() as conn:
        expedition = conn.execute(
            text("select id, expedition_reference from cargo_expeditions where org_id = :org_id and id = :id and archived_at is null"),
            {"org_id": org_id, "id": expedition_id},
        ).fetchone()
        package = conn.execute(
            text("select id, status from cargo_packages where org_id = :org_id and id = :id and deleted_at is null"),
            {"org_id": org_id, "id": package_id},
        ).fetchone()
        if not expedition or not package:
            return None
        conn.execute(
            text("""
                insert into expedition_packages (org_id, expedition_id, package_id, added_by)
                values (:org_id, :expedition_id, :package_id, :user_id)
                on conflict (org_id, expedition_id, package_id) where removed_at is null do nothing
            """),
            {"org_id": org_id, "expedition_id": expedition_id, "package_id": package_id, "user_id": user_id},
        )
        new_package_status = package.status
        if package.status in ("CREATED", "RECEIVED_AT_ORIGIN", "WAREHOUSE_PROCESSING"):
            new_package_status = "READY_FOR_DISPATCH"
        conn.execute(
            text("""
                update cargo_packages
                set shipment_reference = :reference,
                    status = :status,
                    inventory_status = case when inventory_status in ('NOT_STORED','IN_STOCK','RESERVED') then 'GROUPED' else inventory_status end,
                    updated_by = :user_id,
                    updated_at = now()
                where org_id = :org_id and id = :package_id
            """),
            {
                "org_id": org_id,
                "package_id": package_id,
                "reference": expedition.expedition_reference,
                "status": new_package_status,
                "user_id": user_id,
            },
        )
        conn.execute(
            text("""
                insert into package_events (org_id, package_id, event_type, title, description, previous_status, new_status, metadata, actor_id)
                values (:org_id, :package_id, 'EXPEDITION_ASSIGNED', 'Colis affecté à une expédition', :description, :previous_status, :new_status, cast(:metadata as jsonb), :actor_id)
            """),
            {
                "org_id": org_id,
                "package_id": package_id,
                "description": expedition.expedition_reference,
                "previous_status": package.status,
                "new_status": new_package_status,
                "metadata": _json({"expedition_id": expedition_id, "expedition_reference": expedition.expedition_reference}),
                "actor_id": user_id,
            },
        )
        _insert_event(
            conn,
            org_id=org_id,
            expedition_id=expedition_id,
            event_type="PACKAGE_ADDED",
            title="Colis ajouté",
            actor_id=user_id,
            metadata={"package_id": package_id},
        )
        _recompute_expedition_totals(conn, org_id, expedition_id)
    return get_expedition(org_id, expedition_id)


def remove_package_from_expedition(org_id: str, expedition_id: str, package_id: str, user_id: str, reason: str | None = None) -> dict | None:
    _ensure_schema()
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                update expedition_packages
                set removed_at = now(), removal_reason = :reason
                where org_id = :org_id and expedition_id = :expedition_id and package_id = :package_id and removed_at is null
                returning id
            """),
            {"org_id": org_id, "expedition_id": expedition_id, "package_id": package_id, "reason": reason},
        ).fetchone()
        if not row:
            return None
        conn.execute(
            text("""
                update cargo_packages
                set shipment_reference = null,
                    inventory_status = case when inventory_status = 'GROUPED' then 'IN_STOCK' else inventory_status end,
                    updated_by = :user_id,
                    updated_at = now()
                where org_id = :org_id and id = :package_id
            """),
            {"org_id": org_id, "package_id": package_id, "user_id": user_id},
        )
        _insert_event(
            conn,
            org_id=org_id,
            expedition_id=expedition_id,
            event_type="PACKAGE_REMOVED",
            title="Colis retiré",
            description=reason,
            actor_id=user_id,
            metadata={"package_id": package_id},
        )
        _recompute_expedition_totals(conn, org_id, expedition_id)
    return get_expedition(org_id, expedition_id)


def update_checkpoint(org_id: str, expedition_id: str, checkpoint_key: str, user_id: str, payload: dict) -> dict | None:
    _ensure_schema()
    updates = {key: payload.get(key) for key in ("status", "planned_at", "completed_at", "location", "notes") if key in payload}
    if updates.get("status") and updates["status"] not in CHECKPOINT_STATUSES:
        raise ValueError("invalid_checkpoint_status")
    if updates.get("status") == "COMPLETED" and not updates.get("completed_at"):
        updates["completed_at"] = datetime.utcnow().isoformat()
    if not updates:
        return get_expedition(org_id, expedition_id)
    with engine.begin() as conn:
        checkpoint = conn.execute(
            text("""
                select title, status from expedition_checkpoints
                where org_id = :org_id and expedition_id = :expedition_id and checkpoint_key = :checkpoint_key
            """),
            {"org_id": org_id, "expedition_id": expedition_id, "checkpoint_key": checkpoint_key},
        ).fetchone()
        if not checkpoint:
            return None
        set_clause = ", ".join(f"{key} = :{key}" for key in updates)
        conn.execute(
            text(f"""
                update expedition_checkpoints
                set {set_clause}, updated_by = :user_id, updated_at = now()
                where org_id = :org_id and expedition_id = :expedition_id and checkpoint_key = :checkpoint_key
            """),
            dict(updates, user_id=user_id, org_id=org_id, expedition_id=expedition_id, checkpoint_key=checkpoint_key),
        )
        _insert_event(
            conn,
            org_id=org_id,
            expedition_id=expedition_id,
            event_type="CHECKPOINT_UPDATED",
            title=f"Étape mise à jour: {checkpoint.title}",
            previous_status=checkpoint.status,
            new_status=updates.get("status"),
            actor_id=user_id,
            metadata={"checkpoint_key": checkpoint_key, "location": updates.get("location")},
        )
    return get_expedition(org_id, expedition_id)


def add_document(org_id: str, expedition_id: str, user_id: str, payload: dict) -> dict | None:
    _ensure_schema()
    with engine.begin() as conn:
        exists = conn.execute(text("select 1 from cargo_expeditions where org_id = :org_id and id = :id"), {"org_id": org_id, "id": expedition_id}).fetchone()
        if not exists:
            return None
        conn.execute(
            text("""
                insert into expedition_documents (org_id, expedition_id, document_type, file_url, file_name, mime_type, visibility, notes, uploaded_by,size_bytes,checksum_sha256,object_path)
                values (:org_id, :expedition_id, :document_type, :file_url, :file_name, :mime_type, :visibility, :notes, :user_id,:size_bytes,:checksum_sha256,:object_path)
            """),
            {
                "org_id": org_id,
                "expedition_id": expedition_id,
                "document_type": payload.get("document_type") or "DOCUMENT",
                "file_url": payload.get("file_url"),
                "file_name": payload.get("file_name"),
                "mime_type": payload.get("mime_type"),
                "visibility": payload.get("visibility") or "INTERNAL",
                "notes": payload.get("notes"),
                "user_id": user_id,
                "route_id": payload.get("route_id"),
                "shipping_service_id": payload.get("shipping_service_id"),
                "origin_warehouse_id": payload.get("origin_warehouse_id"),
                "destination_office_id": payload.get("destination_office_id"),
                "departure_id": payload.get("departure_id"),
                "size_bytes":payload.get("size_bytes"),
                "checksum_sha256":payload.get("checksum_sha256"),
                "object_path":payload.get("object_path"),
            },
        )
        _insert_event(conn, org_id=org_id, expedition_id=expedition_id, event_type="DOCUMENT_ADDED", title="Document ajouté", actor_id=user_id, metadata={"type": payload.get("document_type")})
    return get_expedition(org_id, expedition_id)


def add_financial_line(org_id: str, expedition_id: str, user_id: str, payload: dict) -> dict | None:
    _ensure_schema()
    with engine.begin() as conn:
        exists = conn.execute(text("select 1 from cargo_expeditions where org_id = :org_id and id = :id"), {"org_id": org_id, "id": expedition_id}).fetchone()
        if not exists:
            return None
        conn.execute(
            text("""
                insert into expedition_financial_lines (
                    org_id, expedition_id, line_type, category, description, amount, currency,
                    direction, status, client_id, dossier_id, package_id, due_at, paid_at, created_by
                )
                values (
                    :org_id, :expedition_id, :line_type, :category, :description, :amount, :currency,
                    :direction, :status, :client_id, :dossier_id, :package_id, :due_at, :paid_at, :user_id
                )
            """),
            {
                "org_id": org_id,
                "expedition_id": expedition_id,
                "line_type": payload.get("line_type") or "OTHER",
                "category": payload.get("category"),
                "description": payload.get("description"),
                "amount": payload.get("amount") or 0,
                "currency": payload.get("currency") or "USD",
                "direction": payload.get("direction") or "COST",
                "status": payload.get("status") or "PENDING",
                "client_id": payload.get("client_id"),
                "dossier_id": payload.get("dossier_id"),
                "package_id": payload.get("package_id"),
                "due_at": payload.get("due_at"),
                "paid_at": payload.get("paid_at"),
                "user_id": user_id,
            },
        )
        _recompute_finance(conn, org_id, expedition_id)
        _insert_event(conn, org_id=org_id, expedition_id=expedition_id, event_type="FINANCE_LINE_ADDED", title="Ligne financière ajoutée", actor_id=user_id, metadata={"amount": payload.get("amount"), "direction": payload.get("direction")})
    return get_expedition(org_id, expedition_id)


def create_anomaly(org_id: str, expedition_id: str, user_id: str, payload: dict) -> dict | None:
    _ensure_schema()
    severity = payload.get("severity") or "MEDIUM"
    if severity not in ANOMALY_SEVERITIES:
        raise ValueError("invalid_severity")
    with engine.begin() as conn:
        exists = conn.execute(text("select 1 from cargo_expeditions where org_id = :org_id and id = :id"), {"org_id": org_id, "id": expedition_id}).fetchone()
        if not exists:
            return None
        conn.execute(
            text("""
                insert into expedition_anomalies (org_id, expedition_id, anomaly_type, severity, title, description, created_by)
                values (:org_id, :expedition_id, :anomaly_type, :severity, :title, :description, :user_id)
            """),
            {
                "org_id": org_id,
                "expedition_id": expedition_id,
                "anomaly_type": payload.get("anomaly_type") or "OPERATIONAL",
                "severity": severity,
                "title": payload.get("title"),
                "description": payload.get("description"),
                "user_id": user_id,
            },
        )
        _insert_event(conn, org_id=org_id, expedition_id=expedition_id, event_type="ANOMALY_CREATED", title="Anomalie signalée", description=payload.get("title"), actor_id=user_id, metadata={"severity": severity})
    return get_expedition(org_id, expedition_id)


def resolve_anomaly(org_id: str, expedition_id: str, anomaly_id: str, user_id: str, notes: str | None = None) -> dict | None:
    _ensure_schema()
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                update expedition_anomalies
                set status = 'RESOLVED', resolution_notes = :notes, resolved_at = now(), resolved_by = :user_id, updated_at = now()
                where org_id = :org_id and expedition_id = :expedition_id and id = :anomaly_id
                returning title
            """),
            {"org_id": org_id, "expedition_id": expedition_id, "anomaly_id": anomaly_id, "notes": notes, "user_id": user_id},
        ).fetchone()
        if not row:
            return None
        _insert_event(conn, org_id=org_id, expedition_id=expedition_id, event_type="ANOMALY_RESOLVED", title="Anomalie résolue", description=row.title, actor_id=user_id)
    return get_expedition(org_id, expedition_id)


def create_notification(org_id: str, expedition_id: str, user_id: str, payload: dict) -> dict | None:
    _ensure_schema()
    with engine.begin() as conn:
        exists = conn.execute(text("select 1 from cargo_expeditions where org_id = :org_id and id = :id"), {"org_id": org_id, "id": expedition_id}).fetchone()
        if not exists:
            return None
        conn.execute(
            text("""
                insert into expedition_notifications (org_id, expedition_id, channel, audience, recipient, notification_type, message, created_by)
                values (:org_id, :expedition_id, :channel, :audience, :recipient, :notification_type, :message, :user_id)
            """),
            {
                "org_id": org_id,
                "expedition_id": expedition_id,
                "channel": payload.get("channel") or "whatsapp",
                "audience": payload.get("audience") or "ALL_CLIENTS",
                "recipient": payload.get("recipient"),
                "notification_type": payload.get("notification_type") or "EXPEDITION_UPDATE",
                "message": payload.get("message"),
                "user_id": user_id,
            },
        )
        _insert_event(conn, org_id=org_id, expedition_id=expedition_id, event_type="NOTIFICATION_QUEUED", title="Notification préparée", actor_id=user_id, metadata={"channel": payload.get("channel"), "audience": payload.get("audience")})
    return get_expedition(org_id, expedition_id)


def add_note(org_id: str, expedition_id: str, user_id: str, payload: dict) -> dict | None:
    _ensure_schema()
    with engine.begin() as conn:
        exists = conn.execute(text("select 1 from cargo_expeditions where org_id = :org_id and id = :id"), {"org_id": org_id, "id": expedition_id}).fetchone()
        if not exists:
            return None
        conn.execute(
            text("""
                insert into expedition_notes (org_id, expedition_id, note, priority, visibility, created_by)
                values (:org_id, :expedition_id, :note, :priority, :visibility, :user_id)
            """),
            {
                "org_id": org_id,
                "expedition_id": expedition_id,
                "note": payload.get("note"),
                "priority": payload.get("priority") or "NORMAL",
                "visibility": payload.get("visibility") or "PRIVATE",
                "user_id": user_id,
            },
        )
        _insert_event(conn, org_id=org_id, expedition_id=expedition_id, event_type="NOTE_ADDED", title="Note ajoutée", actor_id=user_id)
    return get_expedition(org_id, expedition_id)


def expedition_timeline(org_id: str, expedition_id: str) -> list[dict]:
    expedition = get_expedition(org_id, expedition_id)
    if not expedition:
        return []
    timeline = []
    for event in expedition.get("events", []):
        timeline.append({
            "id": event["id"],
            "type": event["event_type"],
            "title": event["title"],
            "description": event.get("description"),
            "occurred_at": event["occurred_at"],
            "metadata": event.get("metadata") or {},
        })
    return timeline


def export_expeditions(org_id: str, **filters) -> str:
    first = list_expeditions(org_id, page=1, page_size=100, **filters)
    items=list(first["items"])
    for page in range(2,first["pagination"]["total_pages"]+1):
        items.extend(list_expeditions(org_id,page=page,page_size=100,**filters)["items"])
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "reference", "titre", "statut", "mode", "route", "depart", "destination",
        "colis", "clients", "poids_kg", "volume_cbm", "eta", "risque", "retard",
    ])
    for item in items:
        writer.writerow([
            item.get("expedition_reference"),
            item.get("title"),
            item.get("status"),
            item.get("mode"),
            item.get("route_label"),
            f"{item.get('origin_city') or ''} {item.get('origin_country') or ''}".strip(),
            f"{item.get('destination_city') or ''} {item.get('destination_country') or ''}".strip(),
            item.get("packages_count"),
            item.get("clients_count"),
            item.get("total_weight_kg"),
            item.get("total_volume_cbm"),
            item.get("eta_at"),
            item.get("risk_level"),
            item.get("is_delayed"),
        ])
    return output.getvalue()


def export_manifest(org_id:str,expedition_id:str)->str|None:
    expedition=get_expedition(org_id,expedition_id)
    if not expedition:return None
    output=io.StringIO();writer=csv.writer(output);writer.writerow(["manifest_reference","shipment","package_reference","tracking_id","client","description","weight_kg","volume_cbm","origin","destination"])
    for package in expedition["packages"]:writer.writerow([expedition.get("manifest_reference"),expedition["expedition_reference"],package.get("package_reference"),package.get("tracking_id"),package.get("client_name"),package.get("description"),package.get("weight_kg"),package.get("volume_cbm"),f"{package.get('origin_city') or ''} {package.get('origin_country') or ''}".strip(),f"{package.get('destination_city') or ''} {package.get('destination_country') or ''}".strip()])
    return output.getvalue()
