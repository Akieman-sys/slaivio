from fastapi import APIRouter, Depends, HTTPException

from app.core.tenant_context import get_current_tenant
from app.db.notification_repository import list_retryable_notifications
from app.services.notification_retry_service import (
    retry_notification,
    retry_due_notifications,
)


router = APIRouter()


@router.get("/notifications/retryable")
def get_retryable_notifications(
    limit: int = 50,
    tenant: dict = Depends(get_current_tenant),
):
    notifications = list_retryable_notifications(
        org_id=tenant["org_id"],
        limit=limit,
    )

    return {
        "status": "ok",
        "count": len(notifications),
        "notifications": notifications,
    }


@router.post("/notifications/{notification_id}/retry")
def retry_one_notification(
    notification_id: str,
    tenant: dict = Depends(get_current_tenant),
):
    result = retry_notification(tenant["org_id"], notification_id)

    if result.get("status") == "error":
        raise HTTPException(
            status_code=404,
            detail=result.get("message"),
        )

    return result


@router.post("/notifications/retry-due")
def retry_due(tenant: dict = Depends(get_current_tenant)):
    return retry_due_notifications(
        org_id=tenant["org_id"],
        limit=50,
    )
