from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_current_manager
from app.tenant.services.tenant_service import create_tenant, get_tenant_context, switch_tenant


router = APIRouter()


class SwitchTenantRequest(BaseModel):
    org_id: str


class CreateTenantRequest(BaseModel):
    organization_name: str


@router.get("/tenant/context")
def tenant_context(
    manager=Depends(get_current_manager),
):
    user_id = manager.get("user_id") or manager.get("id")

    return {
        "status": "ok",
        **get_tenant_context(user_id),
    }


@router.post("/tenant/switch")
def switch_current_tenant(
    body: SwitchTenantRequest,
    manager=Depends(get_current_manager),
):
    user_id = manager.get("user_id") or manager.get("id")

    try:
        active_tenant = switch_tenant(
            clerk_user_id=user_id,
            org_id=body.org_id,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc),
        ) from exc

    return {
        "status": "ok",
        "active_tenant": active_tenant,
    }


@router.post("/tenant/organizations", status_code=201)
def create_organization(
    body: CreateTenantRequest,
    manager=Depends(get_current_manager),
):
    try:
        created = create_tenant(manager, body.organization_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {"status": "ok", **created}

