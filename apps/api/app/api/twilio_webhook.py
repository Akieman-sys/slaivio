from fastapi import APIRouter, Request, HTTPException, Response
from app.services.twilio_inbound_parser import (
    normalize_twilio_whatsapp_form,
    twilio_form_to_payload,
)
from app.services.twilio_webhook_security import validate_twilio_request
from app.api.webhook import process_normalized_whatsapp_message
from app.services.twilio_media_parser import extract_twilio_media_items
from app.services.inbound_media_service import store_inbound_twilio_media
from app.db.organization_whatsapp_repository import find_org_by_twilio_number
from app.platform.quarantine_service import quarantine_inbound_event



router = APIRouter()


@router.post("/webhook/twilio/whatsapp")
async def receive_twilio_whatsapp(request: Request):
    form = await request.form()
    form_data = dict(form)

    is_valid = await validate_twilio_request(
        request=request,
        form_data=form_data,
    )

    if not is_valid:
        raise HTTPException(
            status_code=403,
            detail="Invalid Twilio signature",
        )

    normalized_message = normalize_twilio_whatsapp_form(form_data)
    payload = twilio_form_to_payload(form_data)

    org_settings = find_org_by_twilio_number(form_data.get("To"))
    if not org_settings:
        envelope = quarantine_inbound_event(
            provider="twilio",
            event_type="inbound_message",
            payload=payload,
            failure_reason="twilio_number_not_routed",
            signature_verified=True,
            provider_event_id=normalized_message.provider_message_id,
            provider_phone_number_id=form_data.get("To"),
        )
        return Response(
            content="<Response></Response>",
            media_type="application/xml",
            headers={"X-Slaivio-Event-Id": str(envelope["id"])},
        )

    org_id = org_settings["org_id"]

    result = await process_normalized_whatsapp_message(
        normalized_message=normalized_message,
        payload=payload,
        org_id=org_id,
        provider="TWILIO",
    )

    media_items = extract_twilio_media_items(form_data)

    if media_items:
        store_inbound_twilio_media(
            org_id=org_id,
            client_id=result["client_id"],
            dossier_id=result["dossier_id"],
            shipment_id=result.get("shipment_id"),
            provider_message_id=normalized_message.provider_message_id,
            media_items=media_items,
            raw_payload=form_data,
        )


    return Response(
        content="<Response></Response>",
        media_type="application/xml",
    )
