from app.db.whatsapp_template_repository import (
    get_template_by_key,
    create_template_send_record,
    mark_template_send_sent,
    mark_template_send_failed,
)

from app.db.notification_repository import (
    create_notification_outbox,
    mark_notification_sent,
    mark_notification_failed,
)

from app.services.whatsapp_provider_factory import get_whatsapp_provider


def sanitize_template_variables(variables: dict) -> dict:
    sanitized = {}

    for key, value in (variables or {}).items():
        safe_value = "" if value is None else str(value)
        safe_value = safe_value.replace("\n", " ").replace("\r", " ")
        sanitized[str(key)] = safe_value.strip()

    return sanitized


def send_whatsapp_template(
    org_id: str,
    template_key: str,
    recipient_phone: str,
    variables: dict | None = None,
):
    template = get_template_by_key(
        org_id=org_id,
        template_key=template_key,
    )

    if not template:
        return {
            "status": "error",
            "message": "template_not_found",
        }

    if template.get("status") != "APPROVED":
        return {
            "status": "error",
            "message": "template_not_approved",
        }

    content_variables = sanitize_template_variables(
        variables or {},
    )

    notification = create_notification_outbox(
        org_id=org_id,
        client_id=None,
        dossier_id=None,
        recipient_phone=recipient_phone,
        notification_type=f"TEMPLATE:{template['template_key']}",
        message=f"Template send: {template['template_name']}",
    )

    send_record = create_template_send_record(
        org_id=org_id,
        template_id=str(template["id"]),
        recipient_phone=recipient_phone,
        content_sid=template["content_sid"],
        content_variables=content_variables,
        notification_id=str(notification["id"]),
    )

    try:
        provider = get_whatsapp_provider(org_id=org_id)

        result = provider.send_template_message(
            to=recipient_phone,
            content_sid=template["content_sid"],
            content_variables=content_variables,
        )

        if result.get("success"):
            mark_notification_sent(
                notification_id=str(notification["id"]),
                provider_message_id=result.get("provider_message_id"),
                provider=result.get("provider") or "meta",
                provider_status=result.get("status"),
            )

            mark_template_send_sent(
                send_id=str(send_record["id"]),
                provider_message_id=result.get("provider_message_id"),
            )

            return {
                "status": "sent",
                "template": template,
                "send_record": send_record,
                "provider_result": result,
                "notification": notification,
            }

        mark_notification_failed(
            notification_id=str(notification["id"]),
            error="template_provider_error",
        )

        mark_template_send_failed(
            send_id=str(send_record["id"]),
            error_message="template_provider_error",
        )

        return {
            "status": "failed",
            "message": "template_provider_error",
        }

    except Exception as error:
        mark_notification_failed(
            notification_id=str(notification["id"]),
            error=str(error),
        )

        mark_template_send_failed(
            send_id=str(send_record["id"]),
            error_message=str(error),
        )

        return {
            "status": "failed",
            "error": str(error),
        }
