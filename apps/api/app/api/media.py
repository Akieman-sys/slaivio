from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.tenant_context import get_current_tenant
from app.db.media_repository import (
    list_shipment_media,
    list_dossier_media,
    get_media_item,
    deactivate_media_item,
)
from app.services.whatsapp_provider_factory import get_whatsapp_provider
from app.db.notification_repository import create_notification_outbox, mark_notification_sent

router = APIRouter()

class SendMediaMessageRequest(BaseModel):
    recipient_phone: str
    message: str
    media_url: str
    notification_type: str = "MEDIA_MESSAGE"


@router.post("/media/send-whatsapp")
def send_media_whatsapp(
    body: SendMediaMessageRequest,
    tenant: dict = Depends(get_current_tenant),
):
    notification = create_notification_outbox(
        org_id=tenant["org_id"],
        client_id=None,
        dossier_id=None,
        recipient_phone=body.recipient_phone,
        notification_type=body.notification_type,
        message=body.message,
    )

    provider = get_whatsapp_provider(org_id=tenant["org_id"])

    result = provider.send_media_message(
        to=body.recipient_phone,
        message=body.message,
        media_url=body.media_url,
    )

    if result.get("success"):
        mark_notification_sent(
            notification_id=str(notification["id"]),
            provider_message_id=result.get("provider_message_id"),
            provider=result.get("provider") or "meta",
            provider_status=result.get("status"),
        )

    return {
        "status": "ok" if result.get("success") else "failed",
        "notification": notification,
        "provider_result": result,
    }

@router.get("/shipments/{shipment_id}/media")
def get_shipment_media(
    shipment_id: str,
    tenant: dict = Depends(get_current_tenant),
):
    media = list_shipment_media(
        org_id=tenant["org_id"],
        shipment_id=shipment_id,
    )

    return {
        "status": "ok",
        "count": len(media),
        "media": media,
    }


@router.get("/dossiers/{dossier_id}/media")
def get_dossier_media(
    dossier_id: str,
    tenant: dict = Depends(get_current_tenant),
):
    media = list_dossier_media(
        org_id=tenant["org_id"],
        dossier_id=dossier_id,
    )

    return {
        "status": "ok",
        "count": len(media),
        "media": media,
    }


@router.get("/media/{media_id}")
def get_media(
    media_id: str,
    tenant: dict = Depends(get_current_tenant),
):
    media = get_media_item(
        org_id=tenant["org_id"],
        media_id=media_id,
    )

    if not media:
        raise HTTPException(
            status_code=404,
            detail="Media not found",
        )

    return {
        "status": "ok",
        "media": media,
    }


@router.delete("/media/{media_id}")
def delete_media(
    media_id: str,
    tenant: dict = Depends(get_current_tenant),
):
    media = deactivate_media_item(
        org_id=tenant["org_id"],
        media_id=media_id,
    )

    if not media:
        raise HTTPException(
            status_code=404,
            detail="Media not found",
        )

    return {
        "status": "ok",
        "media": media,
    }
