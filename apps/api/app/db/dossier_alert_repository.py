from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.db.database import engine
from app.db.dossier_repository import _safe


RULES = {
    "OVERDUE": ("CRITICAL", "Échéance dépassée", "Le dossier a dépassé son échéance."),
    "URGENT": ("CRITICAL", "Dossier urgent", "Ce dossier est marqué comme urgent."),
    "CHECKLIST_INCOMPLETE": ("HIGH", "Checklist incomplète", "Des contrôles requis restent incomplets près de l’échéance."),
    "STALE": ("HIGH", "Dossier sans activité", "Aucune activité n’a été enregistrée depuis plus de 72 heures."),
}


def _candidates(conn, org_id: str) -> dict[tuple[str, str], dict]:
    rows = conn.execute(text("""
        select d.id::text dossier_id, d.dossier_reference, d.priority, d.due_at,
               coalesce(d.updated_at, d.created_at) activity_at,
               coalesce(ch.required_pending, 0)::int required_pending
        from dossiers d
        left join (
          select dossier_id, count(*) filter (where required and status = 'PENDING') required_pending
          from dossier_checklist_items where org_id = :org_id group by dossier_id
        ) ch on ch.dossier_id = d.id
        where d.org_id = :org_id and d.archived_at is null
          and d.status_global not in ('COMPLETED','CLOSED','CANCELLED')
    """), {"org_id": org_id}).fetchall()
    candidates: dict[tuple[str, str], dict] = {}
    now = datetime.now(timezone.utc)
    for raw in rows:
        row = dict(raw._mapping)
        alert_types = []
        due_at = row.get("due_at")
        if due_at and due_at < now:
            alert_types.append("OVERDUE")
        if row.get("priority") == "URGENT":
            alert_types.append("URGENT")
        if due_at and row.get("required_pending", 0) > 0 and due_at <= now + timedelta(hours=24):
            alert_types.append("CHECKLIST_INCOMPLETE")
        if row["activity_at"] < now - timedelta(hours=72):
            alert_types.append("STALE")
        for alert_type in alert_types:
            candidates[(row["dossier_id"], alert_type)] = row
    return candidates


def refresh_dossier_alerts(org_id: str, *, force: bool = False) -> dict:
    created = resolved = 0
    with engine.begin() as conn:
        locked = conn.execute(
            text("select pg_try_advisory_xact_lock(hashtext(:lock_key))"),
            {"lock_key": f"dossier-alerts:{org_id}"},
        ).scalar()
        if not locked:
            return {"created": 0, "resolved": 0, "active": 0, "skipped": True}
        if not force:
            recent = conn.execute(text("""
                select last_active_count from dossier_alert_refresh_state
                where org_id = :org_id and last_refreshed_at > now() - interval '5 minutes'
            """), {"org_id": org_id}).scalar()
            if recent is not None:
                return {"created": 0, "resolved": 0, "active": int(recent), "skipped": True}
        candidates = _candidates(conn, org_id)
        existing_rows = conn.execute(text("""
            select id::text, dossier_id::text, alert_type, status
            from dossier_operational_alerts where org_id = :org_id
        """), {"org_id": org_id}).fetchall()
        existing = {(str(row.dossier_id), row.alert_type): dict(row._mapping) for row in existing_rows}
        for key, dossier in candidates.items():
            dossier_id, alert_type = key
            severity, title, message = RULES[alert_type]
            fingerprint = hashlib.sha256(f"{org_id}:{dossier_id}:{alert_type}".encode()).hexdigest()
            previous = existing.get(key)
            conn.execute(text("""
                insert into dossier_operational_alerts
                    (org_id, dossier_id, alert_type, severity, title, message, fingerprint)
                values (:org_id, :dossier_id, :alert_type, :severity, :title, :message, :fingerprint)
                on conflict (org_id, dossier_id, alert_type) do update set
                    status = case when dossier_operational_alerts.status = 'RESOLVED' then 'OPEN' else dossier_operational_alerts.status end,
                    severity = excluded.severity, title = excluded.title, message = excluded.message,
                    detected_at = case when dossier_operational_alerts.status = 'RESOLVED' then now() else dossier_operational_alerts.detected_at end,
                    acknowledged_at = case when dossier_operational_alerts.status = 'RESOLVED' then null else dossier_operational_alerts.acknowledged_at end,
                    acknowledged_by = case when dossier_operational_alerts.status = 'RESOLVED' then null else dossier_operational_alerts.acknowledged_by end,
                    resolved_at = null, last_evaluated_at = now(), updated_at = now()
            """), {"org_id": org_id, "dossier_id": dossier_id, "alert_type": alert_type,
                     "severity": severity, "title": title, "message": message, "fingerprint": fingerprint})
            if not previous or previous["status"] == "RESOLVED":
                created += 1
                conn.execute(text("""
                    insert into manager_events (org_id, event_type, event_scope, dossier_id, title, message, priority, payload)
                    values (:org_id, :event_type, 'DOSSIER', :dossier_id, :title, :message, :priority, cast(:payload as jsonb))
                """), {"org_id": org_id, "event_type": f"DOSSIER_{alert_type}", "dossier_id": dossier_id,
                         "title": title, "message": f"{dossier['dossier_reference']} · {message}",
                         "priority": severity, "payload": json.dumps({"alert_type": alert_type})})
        active_keys = set(candidates)
        for key, alert in existing.items():
            if key not in active_keys and alert["status"] != "RESOLVED":
                conn.execute(text("""
                    update dossier_operational_alerts set status = 'RESOLVED', resolved_at = now(),
                        last_evaluated_at = now(), updated_at = now()
                    where id = :id
                """), {"id": alert["id"]})
                resolved += 1
        conn.execute(text("""
            insert into dossier_alert_refresh_state(org_id, last_refreshed_at, last_active_count)
            values (:org_id, now(), :active)
            on conflict (org_id) do update set last_refreshed_at = now(),
                last_active_count = excluded.last_active_count, updated_at = now()
        """), {"org_id": org_id, "active": len(candidates)})
    return {"created": created, "resolved": resolved, "active": len(candidates), "skipped": False}


def refresh_all_dossier_alerts() -> dict:
    with engine.connect() as conn:
        org_ids = [str(row[0]) for row in conn.execute(text("""
            select distinct org_id from dossiers where archived_at is null
        """)).fetchall()]
    summary = {"organizations": len(org_ids), "created": 0, "resolved": 0, "active": 0}
    for org_id in org_ids:
        result = refresh_dossier_alerts(org_id, force=True)
        for key in ("created", "resolved", "active"):
            summary[key] += result[key]
    return summary


def list_dossier_alerts(org_id: str, *, dossier_id: str | None = None, include_resolved: bool = False) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            select a.id::text, a.dossier_id::text, d.dossier_reference, a.alert_type,
                   a.status, a.severity, a.title, a.message, a.detected_at,
                   a.acknowledged_at, a.acknowledged_by, a.resolved_at, a.updated_at
            from dossier_operational_alerts a
            join dossiers d on d.id = a.dossier_id and d.org_id = a.org_id
            where a.org_id = :org_id
              and (:dossier_id is null or a.dossier_id = cast(:dossier_id as uuid))
              and (:include_resolved or a.status <> 'RESOLVED')
            order by case a.severity when 'CRITICAL' then 1 when 'HIGH' then 2 else 3 end,
                     a.detected_at desc
        """), {"org_id": org_id, "dossier_id": dossier_id,
                 "include_resolved": include_resolved}).fetchall()
    return [_safe(dict(row._mapping)) for row in rows]


def acknowledge_dossier_alert(org_id: str, alert_id: str, user_id: str) -> dict | None:
    with engine.begin() as conn:
        row = conn.execute(text("""
            update dossier_operational_alerts set status = 'ACKNOWLEDGED',
                acknowledged_at = now(), acknowledged_by = :user_id, updated_at = now()
            where id = :alert_id and org_id = :org_id and status = 'OPEN'
            returning id::text, dossier_id::text, alert_type, status, severity, title,
                      message, detected_at, acknowledged_at, acknowledged_by, resolved_at, updated_at
        """), {"org_id": org_id, "alert_id": alert_id, "user_id": user_id}).fetchone()
    return _safe(dict(row._mapping)) if row else None
