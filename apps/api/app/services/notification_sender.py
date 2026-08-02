from app.services.whatsapp_provider_factory import get_whatsapp_provider

from app.db.notification_repository import (
    get_notification_by_id,
    mark_notification_sent,
    mark_notification_failed,
)

from app.services.manager_event_service import emit_notification_event


def send_notification(org_id: str, notification_id: str):
    notification = get_notification_by_id(
        org_id,
        notification_id,
    )

    if not notification:
        return {
            "status": "error",
            "message": "not found",
        }

    if notification["status"] != "PENDING":
        return {
            "status": "error",
            "message": "already processed",
        }

    try:
        provider = get_whatsapp_provider(
            org_id=notification["org_id"],
        )

        recipient_phone = (
            notification.get("recipient_phone")
            or notification.get("destination")
        )

        message = (
            notification.get("message")
            or notification.get("message_body")
        )

        result = provider.send_message(
            to=recipient_phone,
            message=message,
        )

        if result.get("success"):
            mark_notification_sent(
                notification_id=notification_id,
                provider_message_id=result.get("provider_message_id"),
                provider=result.get("provider") or "meta",
                provider_status=result.get("status"),
            )

            emit_notification_event(
                org_id=notification["org_id"],
                notification_id=notification_id,
                dossier_id=str(notification["dossier_id"]) if notification.get("dossier_id") else None,
                title="Notification envoyée",
                message=f"Notification envoyée à {recipient_phone}",
                status="SENT",
            )

            return {
                "status": "sent",
                "provider": result.get("provider"),
                "provider_message_id": result.get("provider_message_id"),
                "provider_status": result.get("status"),
            }

        mark_notification_failed(
            org_id=notification["org_id"],
            notification_id=notification_id,
            error=str(result.get("response") or "provider_error"),
        )

        emit_notification_event(
            org_id=notification["org_id"],
            notification_id=notification_id,
            dossier_id=str(notification["dossier_id"]) if notification.get("dossier_id") else None,
            title="Échec notification",
            message=f"Échec envoi à {recipient_phone}",
            status="FAILED",
        )

        return {
            "status": "failed",
            "message": "provider_error",
            "provider_response": result.get("response"),
        }

    except Exception as e:
        mark_notification_failed(
            org_id=notification["org_id"],
            notification_id=notification_id,
            error=str(e),
        )

        emit_notification_event(
            org_id=notification["org_id"],
            notification_id=notification_id,
            dossier_id=str(notification["dossier_id"]) if notification.get("dossier_id") else None,
            title="Échec notification",
            message=str(e),
            status="FAILED",
        )

        return {
            "status": "failed",
            "error": str(e),
        }
