from fastapi import Depends, HTTPException

from app.core.auth import get_current_manager


def get_current_organization(
    manager=Depends(get_current_manager),
):
    tenant_org_id = manager.get("tenant_org_id") or manager.get("org_id")

    if not tenant_org_id:
        raise HTTPException(
            status_code=400,
            detail="organization_missing",
        )

    return {
        "org_id": tenant_org_id,
        "legacy_org_id": manager.get("org_code") or tenant_org_id,
    }
