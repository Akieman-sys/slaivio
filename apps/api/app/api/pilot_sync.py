from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.db import pilot_sync_repository as repository
from app.permissions.services.permission_service import assert_permission


router = APIRouter(prefix="/pilot/sync", tags=["pilot-sync"])


class SyncOperation(BaseModel):
    operation_key: str = Field(min_length=12, max_length=180)
    operation_type: Literal["DOSSIER_CREATE", "DOSSIER_UPDATE", "FOLLOWUP_DRAFT_SAVE"]
    entity_type: Literal["DOSSIER", "FOLLOWUP_DRAFT"]
    local_entity_id: str | None = Field(default=None, max_length=180)
    entity_id: str | None = None
    expected_version: int | None = Field(default=None, ge=1)
    payload: dict[str, Any]


class SyncRequest(BaseModel):
    device_key: str = Field(min_length=12, max_length=180)
    device_label: str | None = Field(default=None, max_length=120)
    operations: list[SyncOperation] = Field(min_length=1, max_length=50)


PERMISSION_BY_OPERATION = {
    "DOSSIER_CREATE": "dossiers.create",
    "DOSSIER_UPDATE": "dossiers.update",
    "FOLLOWUP_DRAFT_SAVE": "pilot.followups.manage",
}


@router.post("", dependencies=[Depends(require_permission("pilot.offline.use"))])
def synchronize(body: SyncRequest, tenant=Depends(get_current_tenant)):
    org_id = tenant["org_id"]
    user_id = str(tenant.get("user_id") or "")
    device_id = repository.register_device(org_id, user_id, body.device_key, body.device_label)
    items = []
    for item in body.operations:
        operation = item.model_dump()
        assert_permission(
            user_id=user_id,
            org_id=org_id,
            permission_code=PERMISSION_BY_OPERATION[item.operation_type],
        )
        items.append(repository.process_operation(org_id, user_id, device_id, operation))
    return {
        "status": "ok",
        "items": items,
        "applied": sum(item["status"] == "APPLIED" for item in items),
        "conflicts": sum(item["status"] == "CONFLICT" for item in items),
        "rejected": sum(item["status"] == "REJECTED" for item in items),
    }


@router.get("/receipts", dependencies=[Depends(require_permission("pilot.offline.use"))])
def receipts(device_key: str, tenant=Depends(get_current_tenant)):
    return {
        "status": "ok",
        "items": repository.recent_receipts(tenant["org_id"], device_key),
    }
