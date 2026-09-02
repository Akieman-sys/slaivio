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
    _provider_response,
    prepare_pilot_suggestion,
    render_user_prompt,
    summarize_pilot_conversation,
)
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant


router = APIRouter()


class GenerateDraftRequest(BaseModel):
    pass


class UpdatePilotAIMode(BaseModel):
    mode: Literal["SUGGESTION_ONLY", "CONTROLLED_AUTO", "PAUSED"]


class UpdatePilotPrompt(BaseModel):
    system_prompt: str
    user_prompt_template: str = ""
    communication_style: Literal["PROFESSIONAL", "CONCISE", "FORMAL", "WARM"]
    expected_version: int


class TestPilotPrompt(BaseModel):
    message: str


@router.get("/inbox/ai/settings", dependencies=[Depends(require_permission("inbox.read"))])
def read_pilot_ai_settings(tenant=Depends(get_current_tenant)):
    return {"status": "ok", "settings": get_pilot_ai_settings(tenant["org_id"])}


@router.patch("/inbox/ai/settings", dependencies=[Depends(require_permission("inbox.ai.manage"))])
def change_pilot_ai_settings(body: UpdatePilotAIMode, tenant=Depends(get_current_tenant)):
    settings = update_pilot_ai_settings(
        tenant["org_id"], body.mode, str(tenant.get("user_id") or "system"),
    )
    return {"status": "ok", "settings": settings}


def _prompt_score(system_prompt: str, user_prompt: str) -> int:
    content = f"{system_prompt}\n{user_prompt}".lower()
    checks = (
        len(system_prompt.strip()) >= 40,
        any(word in content for word in ("jamais", "interdit", "ne pas")),
        any(word in content for word in ("source", "connaissance", "information publiée")),
        any(word in content for word in ("escalade", "responsable", "humain")),
        any(word in content for word in ("client", "message", "réponse")),
    )
    return sum(checks) * 20


@router.patch("/inbox/ai/prompt", dependencies=[Depends(require_permission("inbox.ai.manage"))])
def change_pilot_prompt(body: UpdatePilotPrompt, tenant=Depends(get_current_tenant)):
    if len(body.system_prompt.strip()) > 8000 or len(body.user_prompt_template.strip()) > 4000:
        raise HTTPException(422, "pilot_ai_prompt_too_long")
    from sqlalchemy import text
    from app.db.database import engine
    with engine.begin() as conn:
        row = conn.execute(text("""
          update ai_settings set system_prompt=:system_prompt,
            user_prompt_template=:user_prompt_template,communication_style=:style,
            prompt_row_version=prompt_row_version+1,updated_at=now()
          where org_id=:org_id and prompt_row_version=:expected_version
          returning *
        """), {"org_id":tenant["org_id"],"system_prompt":body.system_prompt.strip(),
                "user_prompt_template":body.user_prompt_template.strip(),"style":body.communication_style,
                "expected_version":body.expected_version}).mappings().first()
    if not row: raise HTTPException(409,"pilot_ai_prompt_modified")
    settings=dict(row);settings["prompt_score"]=_prompt_score(settings["system_prompt"],settings["user_prompt_template"])
    return {"status":"ok","settings":settings}


@router.post("/inbox/ai/prompt/test", dependencies=[Depends(require_permission("inbox.ai.use"))])
def test_pilot_prompt(body: TestPilotPrompt, tenant=Depends(get_current_tenant)):
    settings=get_pilot_ai_settings(tenant["org_id"])
    if not body.message.strip(): raise HTTPException(422,"pilot_ai_test_message_required")
    system=settings.get("system_prompt") or "Réponds comme le service client de l’entreprise. N’invente aucune information."
    style=settings.get("communication_style") or "PROFESSIONAL"
    try:
        result=_provider_response(settings,f"{system}\nStyle de communication: {style}.",render_user_prompt(settings.get("user_prompt_template"),body.message.strip()))
    except Exception as exc: raise HTTPException(503,"ai_provider_unavailable") from exc
    if not result.get("success") or not result.get("content"): raise HTTPException(503,"ai_provider_unavailable")
    return {"status":"ok","answer":result["content"],"prompt_score":_prompt_score(system,settings.get("user_prompt_template") or "")}


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
