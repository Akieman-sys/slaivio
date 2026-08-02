from fastapi import APIRouter, Depends, HTTPException
from app.core.tenant_context import get_current_tenant
from app.db.notification_repository import (
    list_pending_notifications,
    mark_notification_sent,
)
from app.db.message_repository import create_dossier_event
from app.services.notification_sender import send_notification


router = APIRouter()


@router.get("/notifications/pending")
def get_pending_notifications(tenant=Depends(get_current_tenant)):
    org_id = tenant["org_id"]

    notifications = list_pending_notifications(
        org_id=org_id,
    )

    return {
        "status": "ok",
        "count": len(notifications),
        "notifications": notifications,
    }


@router.post("/notifications/{notification_id}/mark-sent")
def mark_notification_sent_endpoint(
    notification_id: str,
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]

    notification = mark_notification_sent(
        org_id=org_id,
        notification_id=notification_id,
    )

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    if notification.get("dossier_id"):
        create_dossier_event(
            org_id=org_id,
            dossier_id=str(notification["dossier_id"]),
            event_type="NOTIFICATION_MARKED_SENT",
            payload={
                "notification_id": notification_id,
                "status": "SENT",
            },
        )

    return {
        "status": "ok",
        "notification": notification,
    }


@router.post("/notifications/{notification_id}/send")
def send_notification_endpoint(
    notification_id: str,
    tenant=Depends(get_current_tenant),
):
    result = send_notification(
        org_id=tenant["org_id"],
        notification_id=notification_id,
    )

    if not result:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    return result
