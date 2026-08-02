from fastapi import APIRouter, HTTPException, Request
from app.core.config import settings
from app.services.infobip_media_parser import extract_infobip_media_items
from app.services.inbound_media_service import store_inbound_infobip_media
from app.services.infobip_payload import (
    normalize_infobip_payload,
)
from app.api.webhook import (
    process_normalized_whatsapp_message,
)
from app.db.organization_whatsapp_repository import (
    find_org_by_infobip_number,
)
from app.platform.quarantine_service import quarantine_inbound_event


router = APIRouter()


@router.post("/webhook/infobip/whatsapp")
async def infobip_whatsapp_webhook(
    request: Request,
):
    if settings.is_deployed:
        raise HTTPException(
            status_code=503,
            detail="Infobip webhooks are disabled until signature verification is configured",
        )
    payload = await request.json()

    normalized_message = normalize_infobip_payload(
        payload,
    )

    org_settings = find_org_by_infobip_number(
        normalized_message.to_phone,
    )


    if not org_settings:
        envelope = quarantine_inbound_event(
            provider="infobip",
            event_type="inbound_message",
            payload=payload,
            failure_reason="infobip_number_not_routed",
            signature_verified=False,
            provider_event_id=normalized_message.provider_message_id,
            provider_phone_number_id=normalized_message.to_phone,
        )
        return {"status": "quarantined", "event_id": str(envelope["id"])}

    org_id = org_settings["org_id"]

    result = await process_normalized_whatsapp_message(
        normalized_message=normalized_message,
        payload=payload,
        org_id=org_id,
    )

    media_items = extract_infobip_media_items(payload)

    if media_items:
        store_inbound_infobip_media(
            org_id=org_id,
            client_id=result["client_id"],
            dossier_id=result["dossier_id"],
            shipment_id=result.get("shipment_id"),
            media_items=media_items,
            raw_payload=payload,
        )

    return result
