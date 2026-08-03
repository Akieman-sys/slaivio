from fastapi import APIRouter, Depends

from app.core.tenant_context import get_current_tenant
from app.onboarding_experience.schemas.onboarding_experience_schemas import (
    CompleteExperienceStepIn,
    TrackOnboardingEventIn,
)
from app.onboarding_experience.services.onboarding_experience_service import (
    complete_step,
    get_experience_state,
    track_event,
)


router = APIRouter(
    prefix="/api",
    tags=["onboarding-experience"],
)


@router.get("/onboarding-experience/state")
def onboarding_experience_state(tenant=Depends(get_current_tenant)):
    return {
        "status": "ok",
        "data": get_experience_state(
            org_id=tenant["org_id"],
            user_id=tenant["user_id"],
        ),
    }


@router.post("/onboarding-experience/complete-step")
def complete_onboarding_step(
    body: CompleteExperienceStepIn,
    tenant=Depends(get_current_tenant),
):
    return {
        "status": "ok",
        "data": complete_step(
            org_id=tenant["org_id"],
            user_id=tenant["user_id"],
            step_key=body.step_key,
        ),
    }


@router.post("/onboarding-experience/events")
def track_onboarding_event(
    body: TrackOnboardingEventIn,
    tenant=Depends(get_current_tenant),
):
    return {
        "status": "ok",
        "event": track_event(
            org_id=tenant["org_id"],
            user_id=tenant["user_id"],
            step_key=body.step_key,
            event_name=body.event_name,
            payload=body.payload,
        ),
    }
