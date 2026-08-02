from app.core.config import settings
from app.db.notification_repository import (
    get_notification_by_id,
    list_retryable_notifications,
    reset_notification_for_retry,
    mark_notification_retry_success,
    create_notification_retry_event,
)
from app.services.notification_sender import send_notification


NON_RETRYABLE_ERROR_CODES = {
    "30004",  # blocked
    "30005",  # unknown destination handset
    "30006",  # landline or unreachable carrier category
    "63016",  # WhatsApp/template/conversation-related common failure
}


def is_retryable_failure(
    provider_status: str | None,
    error_code: str | None = None,
) -> bool:
    status = (provider_status or "").lower()
    code = str(error_code) if error_code else None

    if code in NON_RETRYABLE_ERROR_CODES:
        return False

    if status in {"failed", "undelivered"}:
        return True

    return False


def retry_notification(org_id: str, notification_id: str) -> dict:
    notification = get_notification_by_id(org_id, notification_id)

    if not notification:
        return {
            "status": "error",
            "message": "notification_not_found",
        }

    reset = reset_notification_for_retry(notification_id)

    if not reset:
        return {
            "status": "error",
            "message": "could_not_reset_notification",
        }

    create_notification_retry_event(
        org_id=notification["org_id"],
        notification_id=notification_id,
        provider_message_id=notification.get("provider_message_id"),
        retry_number=notification.get("retry_count") or 0,
        status="RETRY_STARTED",
        reason="manual_or_due_retry",
        error_code=notification.get("error_code"),
        error_message=notification.get("error_message"),
        provider=notification.get("provider") or "meta",
    )

    result = send_notification(org_id, notification_id)

    if result.get("status") == "sent":
        mark_notification_retry_success(notification_id)

        create_notification_retry_event(
            org_id=notification["org_id"],
            notification_id=notification_id,
            provider_message_id=result.get("provider_message_id"),
            retry_number=notification.get("retry_count") or 0,
            status="RETRY_SENT",
            reason="retry_successfully_sent_to_provider",
            provider=result.get("provider") or "meta",
        )

    return result


def retry_due_notifications(
    org_id: str,
    limit: int = 50,
) -> dict:
    notifications = list_retryable_notifications(
        org_id=org_id,
        limit=limit,
    )

    results = []

    for notification in notifications:
        result = retry_notification(org_id, str(notification["id"]))

        results.append({
            "notification_id": str(notification["id"]),
            "result": result,
        })

    return {
        "status": "ok",
        "count": len(results),
        "results": results,
    }
