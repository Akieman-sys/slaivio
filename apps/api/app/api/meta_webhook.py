import json

from fastapi import APIRouter, Request, Response, HTTPException
from app.core.config import settings
from app.api.webhook import process_normalized_whatsapp_message
from app.services.meta_payload import (
    normalize_meta_payload,
    extract_meta_statuses,
    extract_meta_phone_number_id,
)
from app.db.organization_whatsapp_repository import find_org_by_meta_phone_number_id
from app.db.notification_repository import (
    get_notification_by_provider_message_id,
    update_notification_provider_status,
    create_notification_delivery_event,
)
from app.services.meta_media_parser import extract_meta_media_items
from app.services.inbound_media_service import store_inbound_meta_media
from app.services.whatsapp_routing_service import (
    resolve_inbound_route,
)
from app.services.meta_delivery_parser import (
    extract_meta_delivery_statuses,
)
from app.db.whatsapp_delivery_repository import (
    create_delivery_event,
    update_notification_delivery_status,
)
from app.core.websocket_manager import manager
from app.core.logger import logger
from app.ai.services.auto_reply_service import (
    maybe_auto_reply_to_inbound_message,
)

from app.db.webhook_idempotency_repository import (
    claim_event,
)
from app.db.broadcast_repository import sync_delivery as sync_broadcast_delivery
from app.platform.quarantine_service import quarantine_inbound_event
from app.services.meta_webhook_security import validate_meta_signature






router = APIRouter()


@router.get("/webhook/meta/whatsapp")
async def verify_meta_webhook(request: Request):
    params = request.query_params

    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == settings.meta_wa_verify_token:
        return Response(
            content=challenge or "",
            media_type="text/plain",
        )

    raise HTTPException(
        status_code=403,
        detail="Invalid verify token",
    )


@router.post("/webhook/meta/whatsapp")
async def meta_whatsapp_webhook(request: Request):
    raw_body = await request.body()
    if not validate_meta_signature(
        raw_body,
        request.headers.get("X-Hub-Signature-256"),
    ):
        raise HTTPException(status_code=403, detail="invalid_meta_signature")
    payload = json.loads(raw_body)

    delivery_statuses = extract_meta_delivery_statuses(payload)

    if delivery_statuses:
        for item in delivery_statuses:
            event_key = (
                f"delivery:{item['provider_message_id']}:{item['status']}"
            )

            if not claim_event(
                event_key=event_key,
                event_type="delivery_status",
                raw_payload=item.get("raw"),
            ):
                logger.info(
                    f"webhook_duplicate:{event_key}"
                )
                continue

            provider_phone_number_id = item.get("phone_number_id")

            route = resolve_inbound_route(
                provider_phone_number_id
            ) if provider_phone_number_id else {
                "resolved": False
            }

            if not route.get("resolved"):
                quarantine_inbound_event(
                    provider="meta",
                    event_type="delivery_status",
                    payload=item.get("raw") or item,
                    failure_reason=route.get("reason") or "route_not_resolved",
                    signature_verified=True,
                    provider_event_id=event_key,
                    provider_phone_number_id=provider_phone_number_id,
                )
                continue

            org_id = route["org_id"]
            whatsapp_number_id = str(route["number"]["id"])

            create_delivery_event(
                org_id=org_id,
                provider_message_id=item["provider_message_id"],
                status=item["status"],
                waba_id=item.get("waba_id"),
                phone_number_id=item.get("phone_number_id"),
                whatsapp_number_id=whatsapp_number_id,
                recipient_phone=item.get("recipient_phone"),
                timestamp_at=item.get("timestamp"),
                error_code=item.get("error_code"),
                error_title=item.get("error_title"),
                error_message=item.get("error_message"),
                error_details=item.get("error_details"),
                raw_payload=item.get("raw"),
            )

            update_notification_delivery_status(
                provider_message_id=item["provider_message_id"],
                status=item["status"],
                error_code=item.get("error_code"),
                error_title=item.get("error_title"),
                error_message=item.get("error_message"),
                error_details=item.get("error_details"),
            )

        return {
            "status": "ok",
            "type": "delivery_status",
            "count": len(delivery_statuses),
        }


    phone_number_id = extract_meta_phone_number_id(payload)

    statuses = extract_meta_statuses(payload)

    if statuses:
        org_settings = None

        if phone_number_id:
            org_settings = find_org_by_meta_phone_number_id(phone_number_id)

        handled = []

        for status_item in statuses:
            provider_message_id = status_item.get("provider_message_id")
            status = (status_item.get("status") or "unknown").upper()

            notification = None
            notification_id = None

            if provider_message_id:
                notification = get_notification_by_provider_message_id(
                    provider_message_id=provider_message_id,
                )

            if notification:
                notification_id = str(notification["id"])

                update_notification_provider_status(
                    provider_message_id=provider_message_id,
                    provider_status=status,
                )
                sync_broadcast_delivery(provider_message_id,status)

            org_id = notification.get("org_id") if notification else (
                org_settings.get("org_id") if org_settings else None
            )
            if not org_id:
                quarantine_inbound_event(
                    provider="meta",
                    event_type="notification_status",
                    payload=status_item.get("raw") or status_item,
                    failure_reason="notification_and_route_not_found",
                    signature_verified=True,
                    provider_event_id=f"status:{provider_message_id}:{status}",
                    provider_phone_number_id=phone_number_id,
                )
                handled.append({
                    "provider_message_id": provider_message_id,
                    "status": "quarantined",
                    "notification_found": False,
                    "event_id": None,
                })
                continue

            event = create_notification_delivery_event(
                org_id=org_id,
                notification_id=notification_id,
                provider_message_id=provider_message_id,
                status=status,
                raw_payload=status_item.get("raw"),
                provider="meta",
            )

            handled.append({
                "provider_message_id": provider_message_id,
                "status": status,
                "notification_found": notification is not None,
                "event_id": str(event["id"]) if event else None,
            })

        return {
            "status": "ok",
            "type": "statuses",
            "handled": handled,
        }

    route = resolve_inbound_route(
        phone_number_id
    ) if phone_number_id else {
        "resolved": False,
        "reason": "phone_number_id_missing",
    }

    if not route["resolved"]:
        logger.error(
            f"routing_failed:{phone_number_id}"
        )

        envelope = quarantine_inbound_event(
            provider="meta",
            event_type="inbound_message",
            payload=payload,
            failure_reason=route.get("reason") or "route_not_resolved",
            signature_verified=True,
            provider_event_id=None,
            provider_phone_number_id=phone_number_id,
        )
        return {"status": "quarantined", "event_id": str(envelope["id"])}

    resolved_number = route["number"]
    org_id = route["org_id"]

    logger.info(
        f"route_resolved:{org_id}:{route['number_role']}"
    )

    normalized_message = normalize_meta_payload(payload)
    event_key = f"message:{normalized_message.dedupe_key}"

    if not claim_event(
        event_key=event_key,
        event_type="message",
        raw_payload=payload,
    ):
        logger.info(
            f"webhook_duplicate:{event_key}"
        )

        return {
            "status": "duplicate",
            "event_key": event_key,
        }

    result = await process_normalized_whatsapp_message(
        normalized_message=normalized_message,
        payload=payload,
        org_id=org_id,
        provider="META",
        provider_phone_number_id=phone_number_id,
        whatsapp_number_id=str(resolved_number["id"]),
        waba_id=route["waba_id"],
        number_role=route["number_role"],
    )

    await manager.broadcast_to_org(
        org_id,
        {
            "event": "NEW_MESSAGE",
            "org_id": org_id,
            "phone": normalized_message.from_phone,
            "message": normalized_message.text_body,
            "direction": "inbound",
        }
    )

    media_items = extract_meta_media_items(payload)

    if media_items:
        store_inbound_meta_media(
            org_id=org_id,
            client_id=result["client_id"],
            dossier_id=result["dossier_id"],
            shipment_id=result.get("shipment_id"),
            media_items=media_items,
            raw_payload=payload,
            phone_number_id=phone_number_id,
        )

    auto_reply_result = maybe_auto_reply_to_inbound_message(
        org_id=org_id,
        client_phone=normalized_message.from_phone,
        inbound_text=normalized_message.text_body,
        preferred_role=route["number_role"],
    )

    if auto_reply_result.get("status") == "sent":
        await manager.broadcast_to_org(
            org_id,
            {
                "event": "NEW_MESSAGE",
                "org_id": org_id,
                "phone": normalized_message.from_phone,
                "message": auto_reply_result["message"].get("text_body"),
                "direction": "outbound",
            }
        )

    result["auto_reply"] = {
        "status": auto_reply_result.get("status"),
        "reason": auto_reply_result.get("reason"),
        "decision": auto_reply_result.get("decision"),
    }

    return result
