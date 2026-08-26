from __future__ import annotations

import hashlib
import json
from typing import Any, Callable

from sqlalchemy import text

from app.db.database import engine
from app.db.dossier_repository import create_dossier, get_dossier, update_dossier
from app.db.pilot_followup_repository import save_draft


SyncExecutor = Callable[[str, str, dict[str, Any]], dict[str, Any]]


def _payload_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _receipt(row: Any) -> dict[str, Any]:
    return dict(row) if isinstance(row, dict) else dict(row._mapping)


def register_device(org_id: str, user_id: str, device_key: str, label: str | None) -> str:
    with engine.begin() as conn:
        row = conn.execute(text("""
            insert into pilot_sync_devices(org_id, device_key, label, last_user_id)
            values(:org_id, :device_key, :label, :user_id)
            on conflict(org_id, device_key) do update set
              label = coalesce(excluded.label, pilot_sync_devices.label),
              last_user_id = excluded.last_user_id,
              last_seen_at = now(),
              revoked_at = null
            returning id::text
        """), {
            "org_id": org_id, "device_key": device_key, "label": label, "user_id": user_id,
        }).one()
    return str(row[0])


def _reserve(
    org_id: str,
    user_id: str,
    device_id: str,
    operation: dict[str, Any],
) -> tuple[dict[str, Any], bool]:
    digest = _payload_hash(operation["payload"])
    with engine.begin() as conn:
        inserted = conn.execute(text("""
            insert into pilot_sync_operations(
              org_id, device_id, operation_key, operation_type, local_entity_id,
              entity_type, entity_id, expected_version, payload_hash, actor_id
            ) values(
              :org_id, :device_id, :operation_key, :operation_type, :local_entity_id,
              :entity_type, cast(:entity_id as uuid), :expected_version, :payload_hash, :actor_id
            )
            on conflict(org_id, operation_key) do nothing
            returning *
        """), {
            "org_id": org_id,
            "device_id": device_id,
            "actor_id": user_id,
            "payload_hash": digest,
            **operation,
        }).mappings().first()
        if inserted:
            return dict(inserted), True
        existing = conn.execute(text("""
            select * from pilot_sync_operations
            where org_id=:org_id and operation_key=:operation_key
        """), {"org_id": org_id, "operation_key": operation["operation_key"]}).mappings().one()
        result = dict(existing)
        if result["payload_hash"] != digest:
            result["status"] = "REJECTED"
            result["error_code"] = "operation_key_reused_with_different_data"
        elif result["status"] == "PROCESSING":
            reclaimed = conn.execute(text("""
                update pilot_sync_operations
                set processing_started_at=now(), actor_id=:actor_id, device_id=:device_id
                where org_id=:org_id and operation_key=:operation_key
                  and status='PROCESSING'
                  and processing_started_at < now() - interval '2 minutes'
                returning *
            """), {
                "org_id": org_id,
                "operation_key": operation["operation_key"],
                "actor_id": user_id,
                "device_id": device_id,
            }).mappings().first()
            if reclaimed:
                return dict(reclaimed), True
        return result, False


def _complete(
    org_id: str,
    operation_key: str,
    *,
    status: str,
    result: dict[str, Any] | None = None,
    conflict: dict[str, Any] | None = None,
    error_code: str | None = None,
    entity_id: str | None = None,
    server_version: int | None = None,
) -> dict[str, Any]:
    with engine.begin() as conn:
        row = conn.execute(text("""
            update pilot_sync_operations set
              status=:status,
              result=cast(:result as jsonb),
              conflict=cast(:conflict as jsonb),
              error_code=:error_code,
              entity_id=coalesce(cast(:entity_id as uuid), entity_id),
              server_version=:server_version,
              completed_at=now()
            where org_id=:org_id and operation_key=:operation_key
            returning *
        """), {
            "org_id": org_id,
            "operation_key": operation_key,
            "status": status,
            "result": json.dumps(result or {}, default=str),
            "conflict": json.dumps(conflict, default=str) if conflict is not None else None,
            "error_code": error_code,
            "entity_id": entity_id,
            "server_version": server_version,
        }).mappings().one()
    return dict(row)


def _create_dossier(org_id: str, user_id: str, operation: dict[str, Any]) -> dict[str, Any]:
    source = operation["payload"]
    allowed = {"title", "description", "client_ids", "primary_channel"}
    payload = {key: source.get(key) for key in allowed if key in source}
    payload.update({
        "idempotency_key": f"pilot-offline:{operation['operation_key']}",
        "primary_channel": payload.get("primary_channel") or "manual",
        "case_type": "UNKNOWN",
        "status_global": "LEAD",
        "intake_status": "PARTIAL",
        "validation_status": "PENDING",
        "payment_status": "PENDING",
    })
    dossier = create_dossier(org_id, user_id, payload)
    return {"entity_id": dossier["id"], "server_version": dossier.get("row_version"), "dossier": dossier}


def _update_dossier(org_id: str, user_id: str, operation: dict[str, Any]) -> dict[str, Any]:
    entity_id = operation.get("entity_id")
    if not entity_id:
        raise ValueError("dossier_id_required")
    payload = operation["payload"]
    update = {
        key: payload[key]
        for key in ("title", "description")
        if key in payload
    }
    update["row_version"] = operation.get("expected_version")
    dossier = update_dossier(org_id, entity_id, user_id, update)
    if not dossier:
        raise ValueError("dossier_not_found")
    return {"entity_id": dossier["id"], "server_version": dossier.get("row_version"), "dossier": dossier}


def _save_followup_draft(org_id: str, user_id: str, operation: dict[str, Any]) -> dict[str, Any]:
    source = operation["payload"]
    payload = {
        "title": str(source.get("title") or "").strip(),
        "message": str(source.get("message") or "").strip(),
        "client_ids": list(source.get("client_ids") or []),
        "dossier_ids": list(source.get("dossier_ids") or []),
        "excluded_client_ids": list(source.get("excluded_client_ids") or []),
        "idempotency_key": f"pilot-offline:{operation['operation_key']}",
    }
    if len(payload["title"]) < 2 or len(payload["message"]) < 2:
        raise ValueError("followup_title_and_message_required")
    batch, replayed = save_draft(org_id, user_id, payload)
    return {
        "entity_id": str(batch["id"]),
        "server_version": batch.get("row_version"),
        "batch": batch,
        "replayed": replayed,
    }


EXECUTORS: dict[str, SyncExecutor] = {
    "DOSSIER_CREATE": _create_dossier,
    "DOSSIER_UPDATE": _update_dossier,
    "FOLLOWUP_DRAFT_SAVE": _save_followup_draft,
}


def process_operation(
    org_id: str,
    user_id: str,
    device_id: str,
    operation: dict[str, Any],
) -> dict[str, Any]:
    reserved, created = _reserve(org_id, user_id, device_id, operation)
    if not created:
        return reserved

    try:
        outcome = EXECUTORS[operation["operation_type"]](org_id, user_id, operation)
        return _complete(
            org_id,
            operation["operation_key"],
            status="APPLIED",
            result=outcome,
            entity_id=outcome.get("entity_id"),
            server_version=outcome.get("server_version"),
        )
    except ValueError as exc:
        code = str(exc)
        if code == "stale_dossier_version":
            current = get_dossier(org_id, str(operation.get("entity_id")))
            return _complete(
                org_id,
                operation["operation_key"],
                status="CONFLICT",
                conflict={
                    "message": "Le dossier a été modifié pendant votre absence.",
                    "local": operation["payload"],
                    "server": current,
                },
                error_code=code,
                entity_id=operation.get("entity_id"),
                server_version=current.get("row_version") if current else None,
            )
        return _complete(
            org_id,
            operation["operation_key"],
            status="REJECTED",
            error_code=code,
            entity_id=operation.get("entity_id"),
        )


def recent_receipts(org_id: str, device_key: str, limit: int = 100) -> list[dict[str, Any]]:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            select operation.*
            from pilot_sync_operations operation
            join pilot_sync_devices device on device.id=operation.device_id
            where operation.org_id=:org_id and device.device_key=:device_key
            order by operation.created_at desc
            limit :limit
        """), {"org_id": org_id, "device_key": device_key, "limit": limit}).mappings().all()
    return [dict(row) for row in rows]
