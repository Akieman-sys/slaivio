from fastapi import APIRouter, Request, HTTPException
from app.services.twilio_webhook_security import validate_twilio_request
from app.services.twilio_status_parser import parse_twilio_status_callback
from app.db.notification_repository import (
    get_notification_by_provider_message_id,
    create_notification_delivery_event,
    update_notification_provider_status,
)
from app.platform.quarantine_service import quarantine_inbound_event
from app.services.notification_retry_service import is_retryable_failure
from app.db.notification_repository import (
    mark_notification_retryable,
    create_notification_retry_event,
)



router = APIRouter()


@router.post("/webhook/twilio/status")
async def receive_twilio_status_callback(request: Request):
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

    parsed = parse_twilio_status_callback(form_data)

    provider_message_id = parsed["provider_message_id"]
    provider_status = parsed["provider_status"]

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
            provider_status=provider_status,
            error_code=parsed.get("error_code"),
            error_message=parsed.get("error_message"),
        )

        if provider_status.lower() in {"failed", "undelivered"}:
            retryable = is_retryable_failure(
                provider_status=provider_status,
                error_code=parsed.get("error_code"),
            )

            if retryable:
                updated_retry = mark_notification_retryable(
                    notification_id=str(notification["id"]),
                    reason=f"twilio_status:{provider_status}",
                    error_code=parsed.get("error_code"),
                    error_message=parsed.get("error_message"),
                )

                create_notification_retry_event(
                    org_id=notification["org_id"],
                    notification_id=str(notification["id"]),
                    provider_message_id=provider_message_id,
                    retry_number=updated_retry.get("retry_count") if updated_retry else 0,
                    status="MARKED_RETRYABLE",
                    reason=f"twilio_status:{provider_status}",
                    error_code=parsed.get("error_code"),
                    error_message=parsed.get("error_message"),
                    provider="twilio",
                )

            else:
                create_notification_retry_event(
                    org_id=notification["org_id"],
                    notification_id=str(notification["id"]),
                    provider_message_id=provider_message_id,
                    retry_number=notification.get("retry_count") or 0,
                    status="NON_RETRYABLE_FAILURE",
                    reason=f"twilio_status:{provider_status}",
                    error_code=parsed.get("error_code"),
                    error_message=parsed.get("error_message"),
                    provider="twilio",
                )


    if not notification:
        envelope = quarantine_inbound_event(
            provider="twilio",
            event_type="delivery_status",
            payload=parsed["raw"],
            failure_reason="notification_not_routed",
            signature_verified=True,
            provider_event_id=provider_message_id,
        )
        return {"status": "quarantined", "event_id": str(envelope["id"])}

    event = create_notification_delivery_event(
        org_id=notification["org_id"],
        notification_id=notification_id,
        provider_message_id=provider_message_id,
        status=provider_status,
        error_code=parsed.get("error_code"),
        error_message=parsed.get("error_message"),
        raw_payload=parsed["raw"],
        provider="twilio",
    )

    return {
        "status": "ok",
        "provider_message_id": provider_message_id,
        "provider_status": provider_status,
        "notification_found": notification is not None,
        "delivery_event_id": str(event["id"]) if event else None,
    }
