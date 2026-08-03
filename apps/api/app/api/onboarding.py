from fastapi import APIRouter, Depends

from app.core.tenant_context import get_current_tenant
from app.onboarding.schemas.onboarding_schemas import AgencyProfileIn
from app.onboarding.services.onboarding_service import (
    get_onboarding_status,
    refresh_onboarding,
    save_agency_profile,
)


router = APIRouter(
    prefix="/api",
    tags=["onboarding"],
)


@router.get("/onboarding/status")
def onboarding_status(tenant=Depends(get_current_tenant)):
    return {
        "status": "ok",
        "onboarding": get_onboarding_status(tenant["org_id"]),
    }


@router.post("/onboarding/agency-profile")
def save_profile(
    body: AgencyProfileIn,
    tenant=Depends(get_current_tenant),
):
    result = save_agency_profile(
        org_id=tenant["org_id"],
        user_id=tenant["user_id"],
        payload=body.model_dump(),
    )

    return {
        "status": "ok",
        "data": result,
    }


@router.post("/onboarding/refresh")
def refresh(tenant=Depends(get_current_tenant)):
    return {
        "status": "ok",
        "onboarding": refresh_onboarding(
            org_id=tenant["org_id"],
            user_id=tenant["user_id"],
        ),
    }
