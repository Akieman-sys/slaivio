from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
import json
from math import ceil
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db.database import engine


CLIENT_STATUSES = {"lead", "active", "pending", "inactive", "blocked"}
CLIENT_TYPES = {"individual", "business", "agent", "partner"}
CLIENT_SOURCES = {"manual", "whatsapp", "website", "referral", "import", "api"}
CLIENT_EXPORT_COLUMNS = [
    "display_name",
    "name",
    "company_name",
    "phone",
    "whatsapp_phone",
    "email",
    "country",
    "city",
    "customer_type",
    "lifecycle_status",
    "source",
    "preferred_language",
    "preferred_currency",
    "credit_enabled",
    "credit_limit",
    "current_balance",
    "total_spent",
    "notes",
]


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


def _audit_client(conn, *, org_id: str, user_id: str, client_id: str, action: str,
                  changed_fields: list[str] | None = None) -> None:
    conn.execute(
        text("""
            insert into audit_logs (
                org_id, actor_id, entity_type, entity_id, action, metadata, severity
            ) values (
                :org_id, :user_id, 'client', :client_id, :action,
                cast(:metadata as jsonb), 'INFO'
            )
        """),
        {
            "org_id": org_id,
            "user_id": user_id,
            "client_id": client_id,
            "action": action,
            "metadata": json.dumps({"changed_fields": sorted(changed_fields or [])}),
        },
    )


def normalize_phone(value: str | None) -> str | None:
    if not value:
        return None
    raw = value.strip()
    prefix = "+" if raw.startswith("+") else ""
    digits = "".join(character for character in raw if character.isdigit())
    if digits.startswith("00"):
        prefix, digits = "+", digits[2:]
    if not digits:
        return None
    if len(digits) < 7 or len(digits) > 15:
        raise ValueError("invalid_phone")
    return f"{prefix}{digits}"


def normalize_email(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    if normalized and ("@" not in normalized or normalized.startswith("@") or normalized.endswith("@")):
        raise ValueError("invalid_email")
    return normalized or None


def _build_filters(
    org_id: str,
    q: str | None,
    status: str | None,
    customer_type: str | None,
    source: str | None,
    country: str | None,
    city: str | None,
    *,
    archived: bool = False,
) -> tuple[str, dict]:
    filters = ["org_id = :org_id", "deleted_at is not null" if archived else "deleted_at is null"]
    params: dict[str, Any] = {"org_id": org_id}

    if q:
        filters.append(
            """(
                coalesce(name, '') ilike :q
                or coalesce(display_name, '') ilike :q
                or coalesce(company_name, '') ilike :q
                or coalesce(phone, '') ilike :q
                or coalesce(whatsapp_phone, '') ilike :q
                or coalesce(email, '') ilike :q
            )"""
        )
        params["q"] = f"%{q.strip()}%"
    if status:
        filters.append("lifecycle_status = :status")
        params["status"] = status
    if customer_type:
        filters.append("customer_type = :customer_type")
        params["customer_type"] = customer_type
    if source:
        filters.append("source = :source")
        params["source"] = source
    if country:
        filters.append("country ilike :country")
        params["country"] = country.strip()
    if city:
        filters.append("city ilike :city")
        params["city"] = city.strip()

    return " and ".join(filters), params


def list_clients(
    org_id: str,
    *,
    q: str | None = None,
    status: str | None = None,
    customer_type: str | None = None,
    source: str | None = None,
    country: str | None = None,
    city: str | None = None,
    page: int = 1,
    page_size: int = 20,
    sort: str = "created_desc",
    archived: bool = False,
) -> dict:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size
    where_clause, params = _build_filters(
        org_id, q, status, customer_type, source, country, city, archived=archived
    )
    order_by = {
        "created_asc": "created_at asc",
        "name_asc": "coalesce(display_name, name, phone, email) asc nulls last",
        "name_desc": "coalesce(display_name, name, phone, email) desc nulls last",
        "activity_desc": "last_activity_at desc nulls last, updated_at desc",
        "activity_asc": "last_activity_at asc nulls last, updated_at asc",
    }.get(sort, "created_at desc")

    with engine.connect() as conn:
        total = conn.execute(
            text(f"select count(*)::int total from clients where {where_clause}"),
            params,
        ).scalar() or 0
        rows = conn.execute(
            text(f"""
                select
                    c.id::text,
                    c.org_id,
                    coalesce(c.display_name, c.name, c.company_name, c.phone, c.email) display_name,
                    c.name,
                    c.company_name,
                    c.phone,
                    c.whatsapp_phone,
                    c.email,
                    c.country,
                    c.city,
                    c.customer_type,
                    c.lifecycle_status,
                    c.source,
                    c.preferred_language,
                    c.preferred_currency,
                    c.credit_enabled,
                    c.credit_limit,
                    c.current_balance,
                    c.total_spent,
                    c.last_activity_at,
                    c.created_at,
                    c.updated_at,
                    c.row_version,
                    c.deleted_at,
                    coalesce(d.dossiers_count, 0)::int dossiers_count,
                    coalesce(s.shipments_count, 0)::int shipments_count
                from clients c
                left join (
                    select client_id, count(*) dossiers_count
                    from dossiers
                    where org_id = :org_id
                    group by client_id
                ) d on d.client_id = c.id
                left join (
                    select client_id, count(*) shipments_count
                    from shipments
                    where org_id = :org_id
                    group by client_id
                ) s on s.client_id = c.id
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


def get_client(org_id: str, client_id: str) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select
                    c.id::text,
                    c.org_id,
                    coalesce(c.display_name, c.name, c.company_name, c.phone, c.email) display_name,
                    c.name,
                    c.company_name,
                    c.tax_id,
                    c.phone,
                    c.whatsapp_phone,
                    c.email,
                    c.country,
                    c.city,
                    c.address,
                    c.customer_type,
                    c.lifecycle_status,
                    c.source,
                    c.preferred_language,
                    c.preferred_currency,
                    c.notes,
                    c.tags,
                    c.credit_enabled,
                    c.credit_limit,
                    c.current_balance,
                    c.total_spent,
                    c.last_activity_at,
                    c.created_at,
                    c.updated_at,
                    c.row_version,
                    coalesce(d.dossiers_count, 0)::int dossiers_count,
                    coalesce(s.shipments_count, 0)::int shipments_count
                from clients c
                left join (
                    select client_id, count(*) dossiers_count
                    from dossiers
                    where org_id = :org_id
                    group by client_id
                ) d on d.client_id = c.id
                left join (
                    select client_id, count(*) shipments_count
                    from shipments
                    where org_id = :org_id
                    group by client_id
                ) s on s.client_id = c.id
                where c.org_id = :org_id
                  and c.id = :client_id
                  and c.deleted_at is null
                limit 1
            """),
            {"org_id": org_id, "client_id": client_id},
        ).fetchone()
    return _one(row)


def _find_duplicate(org_id: str, phone: str | None, email: str | None, exclude_id: str | None = None) -> dict | None:
    clauses = ["org_id = :org_id", "deleted_at is null"]
    params: dict[str, Any] = {"org_id": org_id}
    identity_filters = []
    if phone:
        identity_filters.append("phone = :phone or whatsapp_phone = :phone")
        params["phone"] = phone
    if email:
        identity_filters.append("email = :email")
        params["email"] = email
    if not identity_filters:
        return None
    clauses.append("(" + " or ".join(f"({item})" for item in identity_filters) + ")")
    if exclude_id:
        clauses.append("id <> :exclude_id")
        params["exclude_id"] = exclude_id

    with engine.connect() as conn:
        row = conn.execute(
            text(f"""
                select id::text, coalesce(display_name, name, phone, email) display_name, phone, email
                from clients
                where {" and ".join(clauses)}
                order by created_at desc
                limit 1
            """),
            params,
        ).fetchone()
    return _one(row)


def create_client(org_id: str, user_id: str, payload: dict) -> dict:
    phone = normalize_phone(payload.get("phone"))
    whatsapp_phone = normalize_phone(payload.get("whatsapp_phone")) or phone
    email = normalize_email(payload.get("email"))
    name = (payload.get("name") or "").strip() or None
    company_name = (payload.get("company_name") or "").strip() or None
    display_name = (payload.get("display_name") or name or company_name or phone or email or "").strip()

    duplicate = _find_duplicate(org_id, phone or whatsapp_phone, email)
    if duplicate:
        raise ValueError("duplicate_client")

    try:
        with engine.begin() as conn:
            row = conn.execute(
            text("""
                insert into clients (
                    org_id, name, display_name, company_name, tax_id, phone, whatsapp_phone,
                    email, normalized_phone, normalized_email, country, city, address, customer_type, lifecycle_status,
                    source, preferred_language, preferred_currency, notes, credit_enabled,
                    credit_limit, current_balance, total_spent, last_activity_at,
                    created_by, updated_by
                )
                values (
                    :org_id, :name, :display_name, :company_name, :tax_id, :phone, :whatsapp_phone,
                    :email, :normalized_phone, :normalized_email, :country, :city, :address, :customer_type, :lifecycle_status,
                    :source, :preferred_language, :preferred_currency, :notes, :credit_enabled,
                    :credit_limit, :current_balance, :total_spent, now(),
                    :user_id, :user_id
                )
                returning id::text
            """),
            {
                "org_id": org_id,
                "user_id": user_id,
                "name": name,
                "display_name": display_name,
                "company_name": company_name,
                "tax_id": payload.get("tax_id"),
                "phone": phone,
                "whatsapp_phone": whatsapp_phone,
                "email": email,
                "normalized_phone": phone or whatsapp_phone,
                "normalized_email": email,
                "country": payload.get("country"),
                "city": payload.get("city"),
                "address": payload.get("address"),
                "customer_type": payload.get("customer_type") or "individual",
                "lifecycle_status": payload.get("lifecycle_status") or "lead",
                "source": payload.get("source") or "manual",
                "preferred_language": payload.get("preferred_language") or "FR",
                "preferred_currency": payload.get("preferred_currency"),
                "notes": payload.get("notes"),
                "credit_enabled": bool(payload.get("credit_enabled") or False),
                "credit_limit": payload.get("credit_limit") or 0,
                "current_balance": payload.get("current_balance") or 0,
                "total_spent": payload.get("total_spent") or 0,
                },
            ).fetchone()
            if row is not None:
                _audit_client(
                    conn, org_id=org_id, user_id=user_id, client_id=str(row[0]),
                    action="client.created", changed_fields=list(payload.keys()),
                )
    except IntegrityError as exc:
        raise ValueError("duplicate_client") from exc

    if row is None:
        raise RuntimeError("client_insert_failed")
    created = get_client(org_id, row[0])
    return created or {}


def update_client(org_id: str, client_id: str, user_id: str, payload: dict) -> dict | None:
    existing = get_client(org_id, client_id)
    if not existing:
        return None

    phone = normalize_phone(payload.get("phone")) if "phone" in payload else existing.get("phone")
    whatsapp_phone = normalize_phone(payload.get("whatsapp_phone")) if "whatsapp_phone" in payload else existing.get("whatsapp_phone")
    email = normalize_email(payload.get("email")) if "email" in payload else existing.get("email")
    duplicate = _find_duplicate(org_id, phone or whatsapp_phone, email, exclude_id=client_id)
    if duplicate:
        raise ValueError("duplicate_client")

    data = {
        "name": payload.get("name", existing.get("name")),
        "display_name": payload.get("display_name", existing.get("display_name")),
        "company_name": payload.get("company_name", existing.get("company_name")),
        "tax_id": payload.get("tax_id", existing.get("tax_id")),
        "phone": phone,
        "whatsapp_phone": whatsapp_phone,
        "email": email,
        "country": payload.get("country", existing.get("country")),
        "city": payload.get("city", existing.get("city")),
        "address": payload.get("address", existing.get("address")),
        "customer_type": payload.get("customer_type", existing.get("customer_type")),
        "lifecycle_status": payload.get("lifecycle_status", existing.get("lifecycle_status")),
        "source": payload.get("source", existing.get("source")),
        "preferred_language": payload.get("preferred_language", existing.get("preferred_language")),
        "preferred_currency": payload.get("preferred_currency", existing.get("preferred_currency")),
        "notes": payload.get("notes", existing.get("notes")),
        "credit_enabled": payload.get("credit_enabled", existing.get("credit_enabled")),
        "credit_limit": payload.get("credit_limit", existing.get("credit_limit")),
        "current_balance": payload.get("current_balance", existing.get("current_balance")),
        "total_spent": payload.get("total_spent", existing.get("total_spent")),
    }
    expected_version = int(payload["row_version"])
    if not data["display_name"]:
        data["display_name"] = data["name"] or data["company_name"] or data["phone"] or data["email"]

    try:
        with engine.begin() as conn:
            result = conn.execute(
            text("""
                update clients set
                    name = :name,
                    display_name = :display_name,
                    company_name = :company_name,
                    tax_id = :tax_id,
                    phone = :phone,
                    whatsapp_phone = :whatsapp_phone,
                    email = :email,
                    normalized_phone = :normalized_phone,
                    normalized_email = :normalized_email,
                    country = :country,
                    city = :city,
                    address = :address,
                    customer_type = :customer_type,
                    lifecycle_status = :lifecycle_status,
                    source = :source,
                    preferred_language = :preferred_language,
                    preferred_currency = :preferred_currency,
                    notes = :notes,
                    credit_enabled = :credit_enabled,
                    credit_limit = :credit_limit,
                    current_balance = :current_balance,
                    total_spent = :total_spent,
                    updated_by = :user_id,
                    updated_at = now(),
                    row_version = row_version + 1
                where org_id = :org_id
                  and id = :client_id
                  and deleted_at is null
                  and row_version = :expected_version
            """),
            dict(data, org_id=org_id, client_id=client_id, user_id=user_id,
                 normalized_phone=phone or whatsapp_phone, normalized_email=email,
                 expected_version=expected_version),
            )
            if result.rowcount > 0:
                _audit_client(
                    conn, org_id=org_id, user_id=user_id, client_id=client_id,
                    action="client.updated",
                    changed_fields=[key for key in payload if key != "row_version"],
                )
    except IntegrityError as exc:
        raise ValueError("duplicate_client") from exc
    if result.rowcount == 0:
        if get_client(org_id, client_id):
            raise ValueError("stale_client_version")
        return None
    return get_client(org_id, client_id)


def soft_delete_client(org_id: str, client_id: str, user_id: str) -> bool:
    with engine.begin() as conn:
        result = conn.execute(
            text("""
                update clients
                set deleted_at = now(), archived_by = :user_id, updated_by = :user_id,
                    updated_at = now(), row_version = row_version + 1
                where org_id = :org_id
                  and id = :client_id
                  and deleted_at is null
            """),
            {"org_id": org_id, "client_id": client_id, "user_id": user_id},
        )
        if result.rowcount > 0:
            _audit_client(
                conn, org_id=org_id, user_id=user_id, client_id=client_id,
                action="client.archived",
            )
    return result.rowcount > 0


def restore_client(org_id: str, client_id: str, user_id: str) -> dict | None:
    try:
        with engine.begin() as conn:
            archived = conn.execute(
                text("""
                    select phone, whatsapp_phone, email
                    from clients
                    where org_id = :org_id and id = :client_id and deleted_at is not null
                """),
                {"org_id": org_id, "client_id": client_id},
            ).fetchone()
            if archived is None:
                return None
            result = conn.execute(
                text("""
                    update clients
                    set deleted_at = null,
                        archived_by = null,
                        normalized_phone = :normalized_phone,
                        normalized_email = :normalized_email,
                        updated_by = :user_id,
                        updated_at = now(),
                        row_version = row_version + 1
                    where org_id = :org_id
                      and id = :client_id
                      and deleted_at is not null
                """),
                {
                    "org_id": org_id,
                    "client_id": client_id,
                    "user_id": user_id,
                    "normalized_phone": normalize_phone(archived[0] or archived[1]),
                    "normalized_email": normalize_email(archived[2]),
                },
            )
            if result.rowcount == 0:
                return None
            _audit_client(
                conn, org_id=org_id, user_id=user_id, client_id=client_id,
                action="client.restored",
            )
    except IntegrityError as exc:
        raise ValueError("restore_identity_conflict") from exc
    return get_client(org_id, client_id)


def client_stats(org_id: str) -> dict:
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select
                    count(*)::int total,
                    count(*) filter (where lifecycle_status = 'lead')::int leads,
                    count(*) filter (where lifecycle_status = 'active')::int active,
                    count(*) filter (where lifecycle_status = 'pending')::int pending,
                    count(*) filter (where lifecycle_status = 'inactive')::int inactive,
                    count(*) filter (where lifecycle_status = 'blocked')::int blocked,
                    count(*) filter (where created_at >= date_trunc('month', now()))::int new_this_month
                from clients
                where org_id = :org_id
                  and deleted_at is null
            """),
            {"org_id": org_id},
        ).fetchone()
    return _one(row) or {"total": 0, "leads": 0, "active": 0, "pending": 0, "inactive": 0, "blocked": 0, "new_this_month": 0}


def find_client_duplicates(
    org_id: str,
    *,
    client_id: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    name: str | None = None,
    limit: int = 12,
) -> list[dict]:
    normalized_phone = normalize_phone(phone)
    normalized_email = normalize_email(email)
    normalized_name = (name or "").strip()

    if client_id and (not normalized_phone and not normalized_email and not normalized_name):
        client = get_client(org_id, client_id)
        if not client:
            return []
        normalized_phone = normalize_phone(client.get("phone") or client.get("whatsapp_phone"))
        normalized_email = normalize_email(client.get("email"))
        normalized_name = (client.get("display_name") or client.get("name") or client.get("company_name") or "").strip()

    clauses = ["org_id = :org_id", "deleted_at is null"]
    params: dict[str, Any] = {"org_id": org_id, "limit": min(max(limit, 1), 30)}
    signals: list[str] = []

    if client_id:
        clauses.append("id <> :client_id")
        params["client_id"] = client_id
    if normalized_phone:
        signals.append("(phone = :phone or whatsapp_phone = :phone)")
        params["phone"] = normalized_phone
    if normalized_email:
        signals.append("email = :email")
        params["email"] = normalized_email
    if normalized_name:
        signals.append("(coalesce(display_name, '') ilike :name or coalesce(name, '') ilike :name or coalesce(company_name, '') ilike :name)")
        params["name"] = f"%{normalized_name}%"

    if not signals:
        return []
    clauses.append("(" + " or ".join(signals) + ")")

    with engine.connect() as conn:
        rows = conn.execute(
            text(f"""
                select
                    id::text,
                    coalesce(display_name, name, company_name, phone, email) display_name,
                    name,
                    company_name,
                    phone,
                    whatsapp_phone,
                    email,
                    country,
                    city,
                    customer_type,
                    lifecycle_status,
                    case
                        when :phone is not null and (phone = :phone or whatsapp_phone = :phone) then 'phone'
                        when :email is not null and email = :email then 'email'
                        else 'name'
                    end match_reason,
                    created_at
                from clients
                where {" and ".join(clauses)}
                order by
                    case
                        when :phone is not null and (phone = :phone or whatsapp_phone = :phone) then 1
                        when :email is not null and email = :email then 2
                        else 3
                    end,
                    updated_at desc
                limit :limit
            """),
            params,
        ).fetchall()
    return [_safe(dict(row._mapping)) for row in rows]


def client_timeline(org_id: str, client_id: str, *, limit: int = 50) -> list[dict]:
    client = get_client(org_id, client_id)
    if not client:
        return []

    events: list[dict] = [
        {
            "id": f"client-created-{client_id}",
            "type": "client",
            "title": "Client créé",
            "description": client.get("display_name") or client.get("name") or "Fiche client créée",
            "occurred_at": client.get("created_at"),
            "metadata": {"status": client.get("lifecycle_status"), "source": client.get("source")},
        }
    ]
    if client.get("updated_at") and client.get("updated_at") != client.get("created_at"):
        events.append(
            {
                "id": f"client-updated-{client_id}",
                "type": "client",
                "title": "Client mis à jour",
                "description": "Les informations de la fiche client ont été modifiées.",
                "occurred_at": client.get("updated_at"),
                "metadata": {},
            }
        )

    with engine.connect() as conn:
        if _table_exists(conn, "audit_logs"):
            audit_rows = conn.execute(
                text("""
                    select id::text, action, metadata, created_at
                    from audit_logs
                    where org_id = :org_id
                      and entity_type = 'client'
                      and entity_id = :client_id
                    order by created_at desc
                    limit 30
                """),
                {"org_id": org_id, "client_id": client_id},
            ).fetchall()
            if audit_rows:
                action_titles = {
                    "client.created": "Client créé",
                    "client.updated": "Client mis à jour",
                    "client.archived": "Client archivé",
                    "client.restored": "Client restauré",
                }
                events = [
                    {
                        "id": f"audit-{item.id}",
                        "type": "audit",
                        "title": action_titles.get(item.action, item.action),
                        "description": "Action enregistrée dans le journal d’audit.",
                        "occurred_at": item.created_at,
                        "metadata": item.metadata or {},
                    }
                    for item in audit_rows
                ]

        if _table_exists(conn, "dossiers"):
            rows = conn.execute(
                text("""
                    select
                        id::text,
                        coalesce(tracking_id, id::text) reference,
                        coalesce(status_global, validation_status, intake_status, 'UNKNOWN') status,
                        created_at
                    from dossiers
                    where org_id = :org_id and client_id = :client_id
                    order by created_at desc
                    limit 20
                """),
                {"org_id": org_id, "client_id": client_id},
            ).fetchall()
            for row in rows:
                item = dict(row._mapping)
                events.append(
                    {
                        "id": f"dossier-{item['id']}",
                        "type": "dossier",
                        "title": "Dossier créé",
                        "description": f"{item.get('reference') or 'Dossier'} · {item.get('status') or 'Statut inconnu'}",
                        "occurred_at": item.get("created_at"),
                        "metadata": {"dossier_id": item.get("id"), "status": item.get("status")},
                    }
                )

        if _table_exists(conn, "shipments"):
            rows = conn.execute(
                text("""
                    select id::text, tracking_id, status, origin_city, origin_country, destination_city, destination_country, created_at
                    from shipments
                    where org_id = :org_id and client_id = :client_id
                    order by created_at desc
                    limit 20
                """),
                {"org_id": org_id, "client_id": client_id},
            ).fetchall()
            for row in rows:
                item = dict(row._mapping)
                route = " → ".join(filter(None, [item.get("origin_city") or item.get("origin_country"), item.get("destination_city") or item.get("destination_country")]))
                events.append(
                    {
                        "id": f"shipment-{item['id']}",
                        "type": "shipment",
                        "title": "Expédition liée",
                        "description": f"{item.get('tracking_id') or 'Expédition'}{f' · {route}' if route else ''}",
                        "occurred_at": item.get("created_at"),
                        "metadata": {"shipment_id": item.get("id"), "status": item.get("status")},
                    }
                )

        if _table_exists(conn, "messages_raw"):
            rows = conn.execute(
                text("""
                    select id::text, sender_phone, left(coalesce(message_text, ''), 140) message_text, created_at
                    from messages_raw
                    where org_id = :org_id and client_id = :client_id
                    order by created_at desc
                    limit 20
                """),
                {"org_id": org_id, "client_id": client_id},
            ).fetchall()
            for row in rows:
                item = dict(row._mapping)
                events.append(
                    {
                        "id": f"message-{item['id']}",
                        "type": "message",
                        "title": "Message reçu",
                        "description": item.get("message_text") or item.get("sender_phone") or "Message client",
                        "occurred_at": item.get("created_at"),
                        "metadata": {"sender_phone": item.get("sender_phone")},
                    }
                )

        if _table_exists(conn, "followup_tasks"):
            rows = conn.execute(
                text("""
                    select id::text, followup_type, status, due_at, created_at
                    from followup_tasks
                    where org_id = :org_id and client_id = :client_id
                    order by created_at desc
                    limit 20
                """),
                {"org_id": org_id, "client_id": client_id},
            ).fetchall()
            for row in rows:
                item = dict(row._mapping)
                events.append(
                    {
                        "id": f"followup-{item['id']}",
                        "type": "followup",
                        "title": "Relance planifiée",
                        "description": f"{item.get('followup_type') or 'Relance'} · {item.get('status') or 'Statut inconnu'}",
                        "occurred_at": item.get("created_at"),
                        "metadata": {"due_at": _safe(item.get("due_at")), "status": item.get("status")},
                    }
                )

    events = [_safe(event) for event in events if event.get("occurred_at")]
    events.sort(key=lambda event: event.get("occurred_at") or "", reverse=True)
    return events[: min(max(limit, 1), 100)]


def export_clients(org_id: str, *, limit: int = 50_001, **filters) -> list[dict]:
    where_clause, params = _build_filters(
        org_id,
        filters.get("q"),
        filters.get("status"),
        filters.get("customer_type"),
        filters.get("source"),
        filters.get("country"),
        filters.get("city"),
    )
    sort = filters.get("sort") or "created_desc"
    order_by = {
        "created_asc": "created_at asc",
        "name_asc": "coalesce(display_name, name, phone, email) asc nulls last",
        "name_desc": "coalesce(display_name, name, phone, email) desc nulls last",
        "activity_desc": "last_activity_at desc nulls last, updated_at desc",
        "activity_asc": "last_activity_at asc nulls last, updated_at asc",
    }.get(sort, "created_at desc")
    columns = ", ".join(CLIENT_EXPORT_COLUMNS)
    with engine.connect() as conn:
        rows = conn.execute(
            text(f"""
                select {columns}
                from clients
                where {where_clause}
                order by {order_by}
                limit :limit
            """),
            dict(params, limit=min(max(limit, 1), 50_001)),
        ).fetchall()
    return [_safe(dict(row._mapping)) for row in rows]


def import_clients(org_id: str, user_id: str, rows: list[dict]) -> dict:
    created = 0
    skipped = 0
    errors: list[dict] = []
    created_clients: list[dict] = []

    for index, row in enumerate(rows, start=1):
        payload = {
            "display_name": row.get("display_name") or row.get("nom_affiche"),
            "name": row.get("name") or row.get("nom") or row.get("client"),
            "company_name": row.get("company_name") or row.get("entreprise"),
            "tax_id": row.get("tax_id") or row.get("id_fiscal"),
            "phone": row.get("phone") or row.get("telephone") or row.get("téléphone"),
            "whatsapp_phone": row.get("whatsapp_phone") or row.get("whatsapp"),
            "email": row.get("email"),
            "country": row.get("country") or row.get("pays"),
            "city": row.get("city") or row.get("ville"),
            "address": row.get("address") or row.get("adresse"),
            "customer_type": row.get("customer_type") or row.get("type") or "individual",
            "lifecycle_status": row.get("lifecycle_status") or row.get("status") or row.get("statut") or "lead",
            "source": "import",
            "preferred_language": row.get("preferred_language") or row.get("langue") or "FR",
            "preferred_currency": row.get("preferred_currency") or row.get("devise"),
            "notes": row.get("notes"),
            "credit_enabled": str(row.get("credit_enabled") or "").lower() in {"true", "1", "yes", "oui"},
            "credit_limit": row.get("credit_limit") or 0,
        }
        if payload["customer_type"] not in CLIENT_TYPES:
            payload["customer_type"] = "individual"
        if payload["lifecycle_status"] not in CLIENT_STATUSES:
            payload["lifecycle_status"] = "lead"

        try:
            client = create_client(org_id, user_id, payload)
            created += 1
            created_clients.append(client)
        except ValueError as exc:
            if str(exc) == "duplicate_client":
                skipped += 1
                continue
            errors.append({"row": index, "error": str(exc)})
        except Exception as exc:  # pragma: no cover - defensive import reporting
            errors.append({"row": index, "error": str(exc)})

    return {"created": created, "skipped": skipped, "errors": errors, "clients": created_clients[:20]}
