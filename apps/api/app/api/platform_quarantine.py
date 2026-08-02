from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.platform_permissions import require_platform_permission
from app.platform.quarantine_repository import (
    list_quarantine_envelopes,
    resolve_quarantine_envelope,
)


router = APIRouter(prefix="/platform/quarantine", tags=["platform-quarantine"])


class ResolveEnvelopeRequest(BaseModel):
    org_id: str = Field(min_length=1)
    reason: str = Field(min_length=10, max_length=500)


@router.get("")
def list_envelopes(
    limit: int = Query(default=100, ge=1, le=500),
    manager=Depends(require_platform_permission("quarantine.read")),
):
    return {"items": list_quarantine_envelopes(limit=limit)}


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
