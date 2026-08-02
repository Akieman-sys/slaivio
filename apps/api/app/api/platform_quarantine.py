from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.platform_permissions import require_platform_permission
from app.platform.quarantine_repository import (
    get_quarantine_metrics,
    list_quarantine_envelopes,
    requeue_quarantine_envelope,
    resolve_quarantine_envelope,
)
from app.platform.quarantine_replay_service import replay_due, replay_one


router = APIRouter(prefix="/platform/quarantine", tags=["platform-quarantine"])


class ResolveEnvelopeRequest(BaseModel):
    org_id: str = Field(min_length=1)
    reason: str = Field(min_length=10, max_length=500)


class RequeueEnvelopeRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


@router.get("")
def list_envelopes(
    limit: int = Query(default=100, ge=1, le=500),
    manager=Depends(require_platform_permission("quarantine.read")),
):
    return {"items": list_quarantine_envelopes(limit=limit)}


@router.get("/metrics")
def quarantine_metrics(
    manager=Depends(require_platform_permission("quarantine.read")),
):
    return get_quarantine_metrics()


@router.post("/{envelope_id}/resolve")
def resolve_envelope(
    envelope_id: str,
    body: ResolveEnvelopeRequest,
    manager=Depends(require_platform_permission("quarantine.resolve")),
):
    resolved = resolve_quarantine_envelope(
        envelope_id=envelope_id,
        org_id=body.org_id,
        actor_user_id=manager["user_id"],
        reason=body.reason,
    )
    if not resolved:
        raise HTTPException(status_code=409, detail="envelope_not_resolvable")
    return {"envelope": resolved}


@router.post("/{envelope_id}/replay")
async def replay_envelope(
    envelope_id: str,
    manager=Depends(require_platform_permission("quarantine.replay")),
):
    result = await replay_one(envelope_id)
    if result["status"] == "not_due_or_already_claimed":
        raise HTTPException(status_code=409, detail=result["status"])
    return result


@router.post("/{envelope_id}/requeue")
def requeue_envelope(
    envelope_id: str,
    body: RequeueEnvelopeRequest,
    manager=Depends(require_platform_permission("quarantine.replay")),
):
    requeued = requeue_quarantine_envelope(
        envelope_id=envelope_id,
        actor_user_id=manager["user_id"],
        reason=body.reason,
    )
    if not requeued:
        raise HTTPException(status_code=409, detail="envelope_not_requeueable")
    return {"envelope": requeued}


@router.post("/replay/due")
async def replay_due_envelopes(
    limit: int = Query(default=25, ge=1, le=100),
    manager=Depends(require_platform_permission("quarantine.replay")),
):
    return await replay_due(limit)
