from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.db.pilot_inbox_repository import (
    conversation_detail,
    list_conversations as list_pilot_conversations,
    mark_read,
    set_context,
    update_state,
    update_ai_mode,
)


router = APIRouter()


class ConversationContextRequest(BaseModel):
    client_id: str
    dossier_id: str | None = None
    expected_version: int | None = Field(default=None, ge=1)


class ConversationStateRequest(BaseModel):
    status: str = "OPEN"
    requires_attention: bool = False


class ConversationAIModeRequest(BaseModel):
    mode: str = "INHERIT"


def _actor(tenant: dict) -> str:
    return str(tenant.get("user_id") or "system")


def _translate_error(exc: ValueError):
    code = str(exc)
    status = 409 if code == "stale_conversation_version" else 404 if code in {"conversation_not_found", "client_not_found"} else 400
    raise HTTPException(status_code=status, detail=code) from exc


@router.get("/inbox/conversations", dependencies=[Depends(require_permission("inbox.read"))])
def list_conversations(
    view: str = Query(default="all", pattern="^(all|unread|attention|ai|groups|private|waiting|open|closed)$"),
    q: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=40, ge=1, le=100),
    number_role: str | None = None,
    status: str | None = None,
    queue_name: str | None = None,
    priority: str | None = None,
    requires_attention: bool | None = None,
    tenant=Depends(get_current_tenant),
):
    result = list_pilot_conversations(
        tenant["org_id"], view, q, page, page_size,
        number_role, status, queue_name, priority, requires_attention,
    )
    return {
        "status": "ok",
        "conversations": result["items"],
        "pagination": {key: result[key] for key in ("page", "page_size", "total")},
    }


@router.get("/inbox/conversations/{phone}/messages", dependencies=[Depends(require_permission("inbox.read"))])
def get_conversation(
    phone: str,
    before: datetime | None = None,
    limit: int = Query(default=100, ge=20, le=100),
    tenant=Depends(get_current_tenant),
):
    detail = conversation_detail(tenant["org_id"], phone, before, limit)
    if not detail["messages"]:
        raise HTTPException(status_code=404, detail="conversation_not_found")
    return {"status": "ok", **detail}


@router.patch("/inbox/conversations/{phone}/context", dependencies=[Depends(require_permission("inbox.manage"))])
def update_conversation_context(phone: str, body: ConversationContextRequest, tenant=Depends(get_current_tenant)):
    try:
        assignment = set_context(
            tenant["org_id"], phone, body.client_id, body.dossier_id,
            body.expected_version, _actor(tenant),
        )
    except ValueError as exc:
        _translate_error(exc)
    return {"status": "ok", "assignment": assignment}


@router.post("/inbox/conversations/{phone}/read", dependencies=[Depends(require_permission("inbox.read"))])
def read_conversation(phone: str, tenant=Depends(get_current_tenant)):
    return {"status": "ok", "assignment": mark_read(tenant["org_id"], phone, _actor(tenant))}


@router.patch("/inbox/conversations/{phone}/state", dependencies=[Depends(require_permission("inbox.manage"))])
def change_conversation_state(phone: str, body: ConversationStateRequest, tenant=Depends(get_current_tenant)):
    status = body.status.upper()
    if status not in {"OPEN", "CLOSED"}:
        raise HTTPException(status_code=400, detail="invalid_conversation_status")
    assignment = update_state(
        tenant["org_id"], phone, status, body.requires_attention, _actor(tenant),
    )
    return {"status": "ok", "assignment": assignment}


@router.patch("/inbox/conversations/{phone}/ai-mode", dependencies=[Depends(require_permission("inbox.ai.manage"))])
def change_conversation_ai_mode(phone: str, body: ConversationAIModeRequest, tenant=Depends(get_current_tenant)):
    requested = body.mode.upper()
    modes = {"INHERIT": None, "CONTROLLED_AUTO": "CONTROLLED_AUTO", "PAUSED": "PAUSED"}
    if requested not in modes:
        raise HTTPException(status_code=400, detail="invalid_conversation_ai_mode")
    try:
        assignment = update_ai_mode(
            tenant["org_id"], phone, modes[requested], _actor(tenant),
        )
    except ValueError as exc:
        _translate_error(exc)
    return {"status": "ok", "assignment": assignment}


@router.patch("/inbox/conversations/{phone}/status", dependencies=[Depends(require_permission("inbox.manage"))])
def legacy_conversation_status(phone: str, status: str, tenant=Depends(get_current_tenant)):
    normalized = status.upper()
    if normalized not in {"OPEN", "CLOSED"}:
        raise HTTPException(status_code=400, detail="invalid_conversation_status")
    assignment = update_state(tenant["org_id"], phone, normalized, False, _actor(tenant))
    return {"status": "ok", "conversation_status": normalized, "assignment": assignment}
