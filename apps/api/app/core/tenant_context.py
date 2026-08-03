from fastapi import Depends, HTTPException

from app.core.auth import get_current_manager
from app.tenant.services.tenant_service import ensure_personal_tenant, get_tenant_context


def get_current_tenant(
    manager=Depends(get_current_manager),
):
    user_id = (
        manager.get("user_id")
        or manager.get("id")
    )
    context = get_tenant_context(user_id)
    active = context.get("active_tenant")

    if not active:
        context = ensure_personal_tenant(manager)
        active = context.get("active_tenant")

    if not active:
        raise HTTPException(
            status_code=403,
            detail="No verified active organization membership",
        )

    return {
        "org_id": active["org_id"],
        "organization_name": active.get("organization_name"),
        "clerk_org_id": active.get("clerk_org_id"),
        "user_id": user_id,
        "actor_name": manager.get("full_name") or manager.get("name") or manager.get("email"),
        "actor_role": active.get("role_code") or manager.get("role"),
    }
