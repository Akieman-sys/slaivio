from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.ai.repositories.draft_response_repository import list_ai_drafts, mark_ai_draft_used
from app.ai.repositories.pilot_inbox_ai_repository import (
    get_pilot_ai_settings,
    list_conversation_ai_runs,
    update_pilot_ai_settings,
)
from app.ai.services.pilot_inbox_ai_service import (
    prepare_pilot_suggestion,
    summarize_pilot_conversation,
)
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant


router = APIRouter()


class GenerateDraftRequest(BaseModel):
    pass


class UpdatePilotAIMode(BaseModel):
    mode: Literal["SUGGESTION_ONLY", "CONTROLLED_AUTO", "PAUSED"]


@router.get("/inbox/ai/settings", dependencies=[Depends(require_permission("inbox.read"))])
def read_pilot_ai_settings(tenant=Depends(get_current_tenant)):
    return {"status": "ok", "settings": get_pilot_ai_settings(tenant["org_id"])}


@router.patch("/inbox/ai/settings", dependencies=[Depends(require_permission("inbox.ai.manage"))])
def change_pilot_ai_settings(body: UpdatePilotAIMode, tenant=Depends(get_current_tenant)):
    settings = update_pilot_ai_settings(
        tenant["org_id"], body.mode, str(tenant.get("user_id") or "system"),
    )
    return {"status": "ok", "settings": settings}


@router.post("/inbox/conversations/{phone}/ai-draft", dependencies=[Depends(require_permission("inbox.ai.use"))])
def create_draft(phone: str, body: GenerateDraftRequest, tenant=Depends(get_current_tenant)):
    try:
        result = prepare_pilot_suggestion(org_id=tenant["org_id"], client_phone=phone)
    except Exception as exc:
        raise HTTPException(503, "ai_provider_unavailable") from exc
    if result.get("status") == "skipped":
        code = 409 if result.get("reason") == "ai_paused" else 404
        raise HTTPException(code, result.get("reason"))
    return result


@router.post("/inbox/conversations/{phone}/ai-summary", dependencies=[Depends(require_permission("inbox.ai.use"))])
def summarize_conversation(phone: str, tenant=Depends(get_current_tenant)):
    try:
        result = summarize_pilot_conversation(tenant["org_id"], phone)
    except Exception as exc:
        raise HTTPException(503, "ai_provider_unavailable") from exc
    if result.get("status") != "ok":
        raise HTTPException(409 if result.get("reason") == "ai_paused" else 503, result.get("reason"))
    return result


@router.get("/inbox/conversations/{phone}/ai-drafts", dependencies=[Depends(require_permission("inbox.ai.use"))])
def get_drafts(phone: str, tenant=Depends(get_current_tenant)):
    return {
        "status": "ok",
        "drafts": list_ai_drafts(org_id=tenant["org_id"], client_phone=phone),
        "decisions": list_conversation_ai_runs(tenant["org_id"], phone),
    }


@router.patch("/ai-drafts/{draft_id}/used", dependencies=[Depends(require_permission("inbox.ai.use"))])
def mark_used(draft_id: str, tenant=Depends(get_current_tenant)):
    draft = mark_ai_draft_used(draft_id, tenant["org_id"])
    if not draft:
        raise HTTPException(404, "ai_draft_not_found")
    return {"status": "ok", "draft": draft}
