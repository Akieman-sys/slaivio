from fastapi import Depends, HTTPException

from app.core.auth import get_current_manager
from app.platform.quarantine_repository import user_has_platform_permission


def require_platform_permission(permission_code: str):
    def dependency(manager=Depends(get_current_manager)):
        user_id = manager.get("user_id") or manager.get("id")
        if not user_id or not user_has_platform_permission(user_id, permission_code):
            raise HTTPException(status_code=403, detail="platform_permission_required")
        return manager

    return dependency
