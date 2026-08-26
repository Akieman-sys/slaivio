from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import text

from app.core.logger import logger
from app.db.database import engine


RESOURCE_CATALOG = (
    {"key": "clients", "name": "Clients", "description": "Répertoire clients", "href": "/app/clients", "tone": "emerald", "table": "clients"},
    {"key": "dossiers", "name": "Dossiers", "description": "Opérations cargo", "href": "/app/dossiers", "tone": "blue", "table": "dossiers"},
    {"key": "packages", "name": "Colis", "description": "Colis enregistrés", "href": "/app/packages", "tone": "amber", "table": "shipments"},
    {"key": "shipments", "name": "Expéditions", "description": "Suivi des expéditions", "href": "/app/shipments", "tone": "violet", "table": "shipments"},
    {"key": "tracking", "name": "Tracking", "description": "Suivi en temps réel", "href": "/app/tracking", "tone": "blue", "table": "shipments"},
    {"key": "inbox", "name": "WhatsApp Inbox", "description": "Conversations clients", "href": "/app/inbox", "tone": "green", "table": "messages_raw"},
    {"key": "broadcasts", "name": "Broadcasts", "description": "Campagnes multicanales", "href": "/app/broadcasts", "tone": "emerald", "table": "broadcasts"},
    {"key": "followups", "name": "Relances", "description": "Relances clients", "href": "/app/followups", "tone": "amber", "table": "followup_tasks"},
    {"key": "payments", "name": "Paiements", "description": "Encaissements", "href": "/app/payments", "tone": "emerald", "table": "payment_requests"},
    {"key": "invoices", "name": "Factures", "description": "Facturation clients", "href": "/app/invoices", "tone": "blue", "table": "billing_invoices"},
    {"key": "expenses", "name": "Dépenses", "description": "Dépenses opérationnelles", "href": "/app/expenses", "tone": "rose", "table": "accounting_entries"},
    {"key": "workspaces", "name": "Workspaces", "description": "Réseau d’agences", "href": "/app/workspaces", "tone": "emerald", "table": "user_organizations"},
    {"key": "warehouses", "name": "Entrepôts", "description": "Sites de stockage", "href": "/app/warehouses", "tone": "blue", "table": "warehouses"},
    {"key": "routes", "name": "Routes", "description": "Liaisons cargo", "href": "/app/routes", "tone": "emerald", "table": "shipping_routes"},
    {"key": "team", "name": "Équipe", "description": "Membres et accès", "href": "/app/team", "tone": "violet", "table": "user_organizations"},
    {"key": "reports", "name": "Rapports", "description": "Pilotage de l’activité", "href": "/app/reports", "tone": "slate", "table": "shipments"},
)

TRANSIT_STATUSES = ("DEPARTED", "IN_TRANSIT", "ARRIVED_HUB", "IN_LOCAL_TRANSIT")
ACTIVE_DOSSIER_STATUSES = ("LEAD", "ACTIVE", "IN_PROGRESS", "EN_COURS", "IN_TRANSIT", "PENDING")


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


def _rows(conn, statement: str, params: dict | None = None) -> list[dict]:
    result = conn.execute(text(statement), params or {}).fetchall()
    return [_safe(dict(row._mapping)) for row in result]


def _row(conn, statement: str, params: dict | None = None) -> dict:
    result = conn.execute(text(statement), params or {}).fetchone()
    return _safe(dict(result._mapping)) if result else {}


def _optional_row(conn, module: str, statement: str, params: dict | None = None) -> dict:
    try:
        with conn.begin_nested():
            return _row(conn, statement, params)
    except Exception as exc:
        logger.warning("dashboard_home_module_unavailable:%s:%s", module, type(exc).__name__)
        return {}


def _optional_rows(conn, module: str, statement: str, params: dict | None = None) -> list[dict]:
    try:
        with conn.begin_nested():
            return _rows(conn, statement, params)
    except Exception as exc:
        logger.warning("dashboard_home_module_unavailable:%s:%s", module, type(exc).__name__)
        return []


def _available_tables(conn) -> set[str]:
    rows = conn.execute(
        text("select tablename from pg_catalog.pg_tables where schemaname = 'public'")
    ).fetchall()
    return {str(row[0]) for row in rows}


def _module_counts(conn, org_id: str, tables: set[str]) -> dict[str, dict]:
    counts: dict[str, dict] = {}

    if "clients" in tables:
        data = _optional_row(conn, "clients", "select count(*)::int total from clients where org_id = :org_id", {"org_id": org_id})
        if data:
            counts["clients"] = {"count": data.get("total", 0), "label": "client(s) enregistré(s)"}

    if "dossiers" in tables:
        data = _optional_row(conn, "dossiers", """
            select count(*)::int total,
                   count(*) filter (where upper(coalesce(status_global, '')) = any(:active))::int active
            from dossiers where org_id = :org_id
        """, {"org_id": org_id, "active": list(ACTIVE_DOSSIER_STATUSES)})
        if data:
            counts["dossiers"] = {"count": data.get("total", 0), "label": f"{data.get('active', 0)} en cours"}

    if "shipments" in tables:
        data = _optional_row(conn, "shipments", """
            select count(*)::int total,
                   count(*) filter (where upper(coalesce(to_jsonb(s)->>'current_status', status, '')) = any(:transit))::int transit,
                   count(*) filter (where upper(coalesce(to_jsonb(s)->>'current_status', status, '')) in ('BLOCKED', 'ISSUE'))::int exceptions
            from shipments s where org_id = :org_id
        """, {"org_id": org_id, "transit": list(TRANSIT_STATUSES)})
        if data:
            total, transit = data.get("total", 0), data.get("transit", 0)
            counts["packages"] = {"count": total, "label": f"{transit} en transit"}
            counts["shipments"] = {"count": total, "label": f"{transit} en transit"}
            counts["tracking"] = {"count": total, "label": "colis traçable(s)"}
            counts["reports"] = {"count": total, "label": "opérations analysables"}

    if "messages_raw" in tables:
        data = _optional_row(conn, "inbox", "select count(*)::int total from messages_raw where org_id = :org_id", {"org_id": org_id})
        if data:
            counts["inbox"] = {"count": data.get("total", 0), "label": "message(s) reçu(s)"}

    simple_counts = {
        "broadcasts": ("broadcasts", "broadcast(s)"),
        "followups": ("followup_tasks", "relance(s)"),
        "payments": ("payment_requests", "paiement(s)"),
        "invoices": ("billing_invoices", "facture(s)"),
        "warehouses": ("warehouses", "entrepôt(s)"),
        "routes": ("shipping_routes", "route(s)"),
    }
    for key, (table_name, label) in simple_counts.items():
        if table_name in tables:
            data = _optional_row(conn, key, f"select count(*)::int total from {table_name} where org_id = :org_id", {"org_id": org_id})
            if data:
                counts[key] = {"count": data.get("total", 0), "label": label}

    if "accounting_entries" in tables:
        data = _optional_row(conn, "expenses", """
            select count(*) filter (where upper(coalesce(entry_type, '')) = 'EXPENSE')::int total
            from accounting_entries where org_id = :org_id
        """, {"org_id": org_id})
        if data:
            counts["expenses"] = {"count": data.get("total", 0), "label": "dépense(s)"}

    if "user_organizations" in tables:
        counts["workspaces"] = {"count": 1, "label": "workspace actif"}
        data = _optional_row(conn, "team", """
            select count(*)::int total from user_organizations
            where org_id = :org_id and coalesce(membership_status, 'ACTIVE') = 'ACTIVE'
        """, {"org_id": org_id})
        if data:
            counts["team"] = {"count": data.get("total", 0), "label": "membre(s)"}

    return counts


def _pilot_home(conn, org_id: str, tables: set[str]) -> dict:
    summary = {
        "stats": {
            "active_dossiers": 0,
            "active_clients": 0,
            "attention_dossiers": 0,
            "attention_clients": 0,
            "waiting_conversations": 0,
            "pending_followups": 0,
        },
        "attention_dossiers": [],
        "recent_dossiers": [],
        "recent_clients": [],
        "recent_activity": [],
    }
    active_sql = "d.archived_at is null and upper(coalesce(d.status_global, 'ACTIVE')) not in ('COMPLETED','CLOSED','CANCELLED')"

    if {"dossiers", "dossier_clients", "clients"}.issubset(tables):
        stats = _optional_row(conn, "pilot_stats", f"""
            select
              count(distinct d.id)::int active_dossiers,
              count(distinct client.id)::int active_clients,
              count(distinct d.id) filter (where relation.attention_required and client.id is not null)::int attention_dossiers,
              count(distinct client.id) filter (where relation.attention_required and client.id is not null)::int attention_clients
            from dossiers d
            left join dossier_clients relation
              on relation.org_id = d.org_id and relation.dossier_id = d.id
             and relation.archived_at is null
            left join clients client
              on client.org_id = relation.org_id and client.id = relation.client_id
             and client.deleted_at is null
            where d.org_id = :org_id and {active_sql}
        """, {"org_id": org_id})
        summary["stats"].update(stats)

        summary["attention_dossiers"] = _optional_rows(conn, "pilot_attention_dossiers", f"""
            select d.id::text,
                   coalesce(d.title, d.dossier_reference, 'Dossier') title,
                   coalesce(d.dossier_reference, 'DOS-' || upper(left(replace(d.id::text, '-', ''), 12))) reference,
                   count(relation.id) filter (where relation.attention_required)::int attention_clients,
                   max(relation.attention_reason) filter (where relation.attention_required) reason,
                   coalesce(d.updated_at, d.created_at) updated_at,
                   '/app/dossiers/' || d.id::text href
            from dossiers d
            join dossier_clients relation
              on relation.org_id = d.org_id and relation.dossier_id = d.id
             and relation.archived_at is null
            join clients client
              on client.org_id = relation.org_id and client.id = relation.client_id
             and client.deleted_at is null
            where d.org_id = :org_id and {active_sql}
            group by d.id, d.title, d.dossier_reference, d.updated_at, d.created_at
            having count(client.id) filter (where relation.attention_required) > 0
            order by count(client.id) filter (where relation.attention_required) desc,
                     coalesce(d.updated_at, d.created_at) asc
            limit 6
        """, {"org_id": org_id})

        summary["recent_dossiers"] = _optional_rows(conn, "pilot_recent_dossiers", f"""
            select d.id::text,
                   coalesce(d.title, d.dossier_reference, 'Dossier') title,
                   coalesce(d.dossier_reference, 'DOS-' || upper(left(replace(d.id::text, '-', ''), 12))) reference,
                   count(client.id)::int client_count,
                   coalesce(d.updated_at, d.created_at) updated_at,
                   '/app/dossiers/' || d.id::text href
            from dossiers d
            left join dossier_clients relation
              on relation.org_id = d.org_id and relation.dossier_id = d.id
             and relation.archived_at is null
            left join clients client
              on client.org_id = relation.org_id and client.id = relation.client_id
             and client.deleted_at is null
            where d.org_id = :org_id and {active_sql}
            group by d.id, d.title, d.dossier_reference, d.updated_at, d.created_at
            order by coalesce(d.updated_at, d.created_at) desc
            limit 6
        """, {"org_id": org_id})

        summary["recent_clients"] = _optional_rows(conn, "pilot_recent_clients", f"""
            select client.id::text,
                   client.client_reference,
                   coalesce(client.display_name, client.name, client.phone, 'Client') name,
                   coalesce(d.title, d.dossier_reference, 'Dossier') dossier_title,
                   d.dossier_reference,
                   relation.created_at,
                   '/app/dossiers/' || d.id::text href
            from dossier_clients relation
            join dossiers d on d.org_id = relation.org_id and d.id = relation.dossier_id
            join clients client on client.org_id = relation.org_id and client.id = relation.client_id
            where relation.org_id = :org_id and relation.archived_at is null
              and client.deleted_at is null and {active_sql}
            order by relation.created_at desc
            limit 6
        """, {"org_id": org_id})

    if "conversation_assignments" in tables:
        conversation = _optional_row(conn, "pilot_waiting_conversations", """
            select count(*)::int waiting_conversations
            from conversation_assignments
            where org_id = :org_id
              and upper(coalesce(status, 'OPEN')) not in ('CLOSED','RESOLVED')
              and (coalesce(unread_count, 0) > 0 or coalesce(requires_attention, false) or waiting_since is not null)
        """, {"org_id": org_id})
        summary["stats"].update(conversation)

    if "followup_tasks" in tables:
        followups = _optional_row(conn, "pilot_pending_followups", """
            select count(*)::int pending_followups
            from followup_tasks
            where org_id = :org_id and archived_at is null
              and status in ('SCHEDULED','DUE','FAILED','ESCALATED')
        """, {"org_id": org_id})
        summary["stats"].update(followups)

    activities: list[dict] = []
    if "dossiers" in tables:
        activities.extend(_optional_rows(conn, "pilot_activity_dossiers", """
            select ('dossier-' || d.id::text) id, 'DOSSIER_CREATED' kind,
                   'Dossier créé' label,
                   coalesce(d.title, d.dossier_reference, 'Dossier') detail,
                   d.created_at occurred_at, '/app/dossiers/' || d.id::text href
            from dossiers d where d.org_id = :org_id
            order by d.created_at desc limit 8
        """, {"org_id": org_id}))
    if {"dossier_client_events", "clients", "dossiers"}.issubset(tables):
        activities.extend(_optional_rows(conn, "pilot_activity_clients", """
            select ('client-event-' || event.id::text) id, event.event_type kind,
                   case event.event_type
                     when 'CLIENT_ATTACHED' then 'Client ajouté'
                     when 'CLIENT_REMOVED' then 'Client retiré'
                     when 'CLIENT_RESTORED' then 'Client restauré'
                     else 'Client mis à jour'
                   end label,
                   coalesce(client.display_name, client.name, client.phone, 'Client') || ' · ' ||
                   coalesce(d.title, d.dossier_reference, 'Dossier') detail,
                   event.created_at occurred_at, '/app/dossiers/' || d.id::text href
            from dossier_client_events event
            join clients client on client.org_id = event.org_id and client.id = event.client_id
            join dossiers d on d.org_id = event.org_id and d.id = event.dossier_id
            where event.org_id = :org_id
            order by event.created_at desc limit 12
        """, {"org_id": org_id}))
    if "followup_tasks" in tables:
        activities.extend(_optional_rows(conn, "pilot_activity_followups", """
            select ('followup-' || task.id::text) id, 'FOLLOWUP_UPDATED' kind,
                   case when task.status = 'SENT' then 'Relance envoyée'
                        when task.status = 'RESPONDED' then 'Réponse reçue'
                        else 'Relance mise à jour' end label,
                   coalesce(task.subject_reference, task.reference, 'Relance') detail,
                   coalesce(task.updated_at, task.created_at) occurred_at,
                   case when task.dossier_id is not null then '/app/dossiers/' || task.dossier_id::text else '/app/followups' end href
            from followup_tasks task where task.org_id = :org_id
            order by coalesce(task.updated_at, task.created_at) desc limit 8
        """, {"org_id": org_id}))
    summary["recent_activity"] = sorted(
        activities,
        key=lambda item: str(item.get("occurred_at") or ""),
        reverse=True,
    )[:10]
    return summary


def _attention_items(conn, org_id: str, tables: set[str]) -> list[dict]:
    items: list[dict] = []
    if "dossier_operational_alerts" in tables:
        rows = _optional_rows(conn, "attention_dossier_alerts", """
            select a.id::text, d.dossier_reference title, a.status,
                   a.detected_at created_at, a.message, a.severity priority
            from dossier_operational_alerts a
            join dossiers d on d.id = a.dossier_id and d.org_id = a.org_id
            where a.org_id = :org_id and a.status in ('OPEN', 'ACKNOWLEDGED')
            order by case a.severity when 'CRITICAL' then 1 when 'HIGH' then 2 else 3 end,
                     a.detected_at asc limit 5
        """, {"org_id": org_id})
        items.extend(dict(item, kind="dossier", href="/app/dossiers") for item in rows)
    if "shipments" in tables:
        rows = _optional_rows(conn, "attention_shipments", """
            select id::text, coalesce(tracking_id, id::text) title,
                   coalesce(to_jsonb(s)->>'current_status', status, 'ISSUE') status,
                   coalesce(updated_at, created_at) created_at
            from shipments s where org_id = :org_id
              and upper(coalesce(to_jsonb(s)->>'current_status', status, '')) in ('BLOCKED', 'ISSUE')
            order by coalesce(updated_at, created_at) desc limit 3
        """, {"org_id": org_id})
        items.extend(dict(item, kind="shipment", message="Colis nécessitant une intervention", href="/app/shipments", priority="HIGH") for item in rows)
    if "followup_tasks" in tables:
        rows = _optional_rows(conn, "attention_followups", """
            select id::text, coalesce(followup_type, 'Relance') title, status,
                   due_at created_at from followup_tasks
            where org_id = :org_id and status in ('DUE','FAILED','ESCALATED') and due_at <= now()
            order by due_at asc limit 3
        """, {"org_id": org_id})
        items.extend(dict(item, kind="followup", message="Relance arrivée à échéance", href="/app/followups", priority="NORMAL") for item in rows)
    if "payment_requests" in tables:
        rows = _optional_rows(conn, "attention_payments", """
            select id::text, coalesce(external_reference, 'Paiement en attente') title, status,
                   created_at from payment_requests
            where org_id = :org_id and status = 'PENDING'
              and created_at < now() - interval '48 hours'
            order by created_at asc limit 3
        """, {"org_id": org_id})
        items.extend(dict(item, kind="payment", message="Paiement en attente depuis plus de 48 h", href="/app/payments", priority="HIGH") for item in rows)
    return sorted(items, key=lambda item: (item.get("priority") != "HIGH", item.get("created_at") or ""))[:5]


def get_home(org_id: str | None, user_id: str, organization_name: str | None, manager: dict) -> dict:
    manager_name = manager.get("full_name") or manager.get("name") or manager.get("email") or "Manager Slaivio"
    base = {
        "status": "ok",
        "workspace": {"org_id": org_id, "name": organization_name or "Mon espace Slaivio", "country": None, "city": None},
        "manager": {"name": manager_name, "email": manager.get("email") or "", "initials": _initials(manager_name)},
        "resources": [], "attention_items": [], "notifications": [], "unread_count": 0,
        "whatsapp": {"configured": False, "status": "NOT_CONFIGURED"},
        "pilot": {
            "stats": {}, "attention_dossiers": [], "recent_dossiers": [],
            "recent_clients": [], "recent_activity": [],
        },
    }
    if not org_id:
        return dict(base, status="no_workspace")

    with engine.connect() as conn:
        tables = _available_tables(conn)
        workspace = _row(conn, """
            select id, coalesce(name, id) name, country, city
            from organizations where id = :org_id
        """, {"org_id": org_id}) if "organizations" in tables else {}
        preferences = _optional_rows(conn, "preferences", """
            select resource_key, is_starred, last_opened_at
            from dashboard_home_preferences where org_id = :org_id and user_id = :user_id
        """, {"org_id": org_id, "user_id": user_id}) if "dashboard_home_preferences" in tables else []
        by_key = {item["resource_key"]: item for item in preferences}
        counts = _module_counts(conn, org_id, tables)
        resources = []
        for catalog_item in RESOURCE_CATALOG:
            item = {key: value for key, value in catalog_item.items() if key != "table"}
            metric = counts.get(item["key"])
            item.update(by_key.get(item["key"], {}))
            item.update({"is_starred": bool(item.get("is_starred")), "last_opened_at": item.get("last_opened_at")})
            item.update(metric or {"count": None, "label": "Module non configuré"})
            item["state"] = "unavailable" if metric is None else ("empty" if metric["count"] == 0 else "ready")
            resources.append(item)

        notifications = _optional_rows(conn, "notifications", """
            select id::text, title, message, event_type, priority, is_read, created_at,
                   coalesce(shipment_id::text, dossier_id::text, client_id::text) resource_id
            from manager_events where org_id = :org_id order by created_at desc limit 40
        """, {"org_id": org_id}) if "manager_events" in tables else []
        whatsapp = _optional_row(conn, "whatsapp", """
            select true configured, connection_status status, display_phone_number phone
            from organization_whatsapp_numbers where org_id = :org_id and is_active = true
            order by is_default desc, updated_at desc limit 1
        """, {"org_id": org_id}) if "organization_whatsapp_numbers" in tables else {}
        attention_items = _attention_items(conn, org_id, tables)
        pilot_home = _pilot_home(conn, org_id, tables)

    base.update({
        "workspace": {"org_id": org_id, "name": workspace.get("name") or organization_name or "Mon espace Slaivio", "country": workspace.get("country"), "city": workspace.get("city")},
        "resources": resources,
        "attention_items": attention_items,
        "notifications": notifications,
        "unread_count": sum(1 for item in notifications if not item.get("is_read")),
        "whatsapp": whatsapp or {"configured": False, "status": "NOT_CONFIGURED"},
        "pilot": pilot_home,
    })
    return base


def update_resource_preference(org_id: str, user_id: str, resource_key: str, *, is_starred: bool | None, opened: bool) -> dict | None:
    if resource_key not in {item["key"] for item in RESOURCE_CATALOG}:
        return None
    with engine.begin() as conn:
        row = conn.execute(text("""
            insert into dashboard_home_preferences (org_id, user_id, resource_key, is_starred, last_opened_at)
            values (:org_id, :user_id, :resource_key, coalesce(:is_starred, false), case when :opened then now() end)
            on conflict (org_id, user_id, resource_key) do update set
                is_starred = coalesce(:is_starred, dashboard_home_preferences.is_starred),
                last_opened_at = case when :opened then now() else dashboard_home_preferences.last_opened_at end,
                updated_at = now()
            returning resource_key, is_starred, last_opened_at
        """), {"org_id": org_id, "user_id": user_id, "resource_key": resource_key, "is_starred": is_starred, "opened": opened}).fetchone()
    return _safe(dict(row._mapping)) if row else None


def search_home(org_id: str, query: str, limit: int = 12) -> list[dict]:
    query = query.strip()
    if len(query) < 2:
        return []
    with engine.connect() as conn:
        return _rows(conn, """
            select * from (
                select 'client' kind, c.id::text id, coalesce(c.name, c.phone, 'Client') title,
                       coalesce(c.phone, '') subtitle, '/app/clients' href, c.created_at
                from clients c where c.org_id = :org_id and
                  (coalesce(c.name, '') ilike :query or coalesce(c.phone, '') ilike :query or coalesce(c.email, '') ilike :query)
                union all
                select 'shipment', s.id::text, coalesce(s.tracking_id, 'Expédition'),
                       concat_ws(' → ', s.origin_city, s.destination_city), '/app/shipments', s.created_at
                from shipments s where s.org_id = :org_id and coalesce(s.tracking_id, '') ilike :query
                union all
                select 'dossier', d.id::text, coalesce(d.tracking_id, d.id::text),
                       coalesce(d.status_global, ''), '/app/dossiers', d.created_at
                from dossiers d where d.org_id = :org_id and
                  (coalesce(d.tracking_id, '') ilike :query or d.id::text ilike :query)
            ) results order by created_at desc limit :limit
        """, {"org_id": org_id, "query": f"%{query}%", "limit": limit})


def mark_all_notifications_read(org_id: str) -> int:
    with engine.begin() as conn:
        result = conn.execute(text("update manager_events set is_read = true where org_id = :org_id and is_read = false"), {"org_id": org_id})
        return int(result.rowcount or 0)


def _initials(name: str) -> str:
    parts = [part for part in name.replace("@", " ").split() if part]
    return "".join(part[0].upper() for part in parts[:2]) or "SL"
