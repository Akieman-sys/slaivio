from fastapi import APIRouter, HTTPException, Request
from app.core.config import settings

from app.services.infobip_delivery_parser import (
    parse_infobip_delivery_payload,
    normalize_infobip_status,
    is_infobip_failure,
)

from app.db.notification_repository import (
    get_notification_by_provider_message_id,
    update_notification_provider_status,
    create_notification_delivery_event,
)

from app.services.monitoring_service import emit_twilio_delivery_alert

try:
    from app.db.notification_repository import (
        mark_notification_retryable,
        create_notification_retry_event,
    )
except ImportError:
    mark_notification_retryable = None
    create_notification_retry_event = None


router = APIRouter()


@router.post("/webhook/infobip/delivery")
async def infobip_delivery_webhook(request: Request):
    if settings.is_deployed:
        raise HTTPException(
            status_code=503,
            detail="Infobip webhooks are disabled until signature verification is configured",
        )
    payload = await request.json()

    parsed_items = parse_infobip_delivery_payload(payload)

    results = []

    for item in parsed_items:
        provider_message_id = item.get("provider_message_id")

        normalized_status = normalize_infobip_status(
            group_name=item.get("provider_status_group_name"),
            status_name=item.get("provider_status_name"),
        )

        notification = None
        notification_id = None

        if provider_message_id:
            notification = get_notification_by_provider_message_id(
                provider_message_id=provider_message_id,
            )

        if notification:
            notification_id = str(notification["id"])
            org_id = notification["org_id"]

            update_notification_provider_status(
                provider_message_id=provider_message_id,
                provider_status=normalized_status,
                error_code=item.get("error_code"),
                error_message=item.get("error_message"),
            )

            if is_infobip_failure(normalized_status):
                emit_twilio_delivery_alert(
                    org_id=org_id,
                    notification_id=notification_id,
                    provider_status=normalized_status,
                )

                if mark_notification_retryable and create_notification_retry_event:
                    updated_retry = mark_notification_retryable(
                        notification_id=notification_id,
                        reason=f"infobip_status:{normalized_status}",
                        error_code=item.get("error_code"),
                        error_message=item.get("error_message"),
                    )

                    create_notification_retry_event(
                        org_id=org_id,
                        notification_id=notification_id,
                        provider_message_id=provider_message_id,
                        retry_number=updated_retry.get("retry_count") if updated_retry else 0,
                        status="MARKED_RETRYABLE",
                        reason=f"infobip_status:{normalized_status}",
                        error_code=item.get("error_code"),
                        error_message=item.get("error_message"),
                        provider="infobip",
                    )

        if not notification:
            results.append({
                "provider_message_id": provider_message_id,
                "normalized_status": normalized_status,
                "notification_found": False,
                "delivery_event_id": None,
            })
            continue

        event = create_notification_delivery_event(
            org_id=notification["org_id"],
            notification_id=notification_id,
            provider_message_id=provider_message_id,
            status=normalized_status,
            error_code=item.get("error_code"),
            error_message=item.get("error_message"),
            raw_payload=item.get("raw"),
            provider="infobip",
        )

        results.append({
            "provider_message_id": provider_message_id,
            "normalized_status": normalized_status,
            "notification_found": notification is not None,
            "delivery_event_id": str(event["id"]) if event else None,
        })

    return {
        "status": "ok",
        "count": len(results),
        "results": results,
    }
