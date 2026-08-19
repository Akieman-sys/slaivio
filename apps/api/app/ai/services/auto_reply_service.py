from app.ai.repositories.ai_settings_repository import get_ai_settings
from app.ai.services.conversation_orchestrator import handle_conversation
from app.db.outbound_message_repository import (
    create_outbound_message,
    mark_outbound_message_failed,
    mark_outbound_message_sent,
)
from app.services.whatsapp_outbound_resolver import (
    resolve_outbound_whatsapp_sender,
)
from app.services.whatsapp_provider_factory import get_whatsapp_provider


AUTO_SEND_DECISIONS = {
    "AUTO_REPLY",
    "ASK_MORE_INFO",
    "ASK_CLARIFICATION",
}


def maybe_auto_reply_to_inbound_message(
    org_id: str,
    client_phone: str,
    inbound_text: str | None,
    preferred_role: str | None = None,
):
    if not inbound_text:
        return {
            "status": "skipped",
            "reason": "empty_message",
        }

    ai_settings = get_ai_settings(org_id)

    if not ai_settings.get("auto_reply_enabled", False):
        return {
            "status": "skipped",
            "reason": "auto_reply_disabled",
        }

    orchestration = handle_conversation(
        org_id=org_id,
        client_phone=client_phone,
        message=inbound_text,
        channel="WHATSAPP",
    )
    decision = orchestration.get("decision")
    intent = orchestration.get("intent", {})
    confidence = float(intent.get("confidence") or 0)
    min_confidence = float(
        ai_settings.get("auto_reply_min_confidence") or 0.75
    )

    if decision not in AUTO_SEND_DECISIONS:
        return {
            "status": "skipped",
            "reason": f"decision_not_auto_send:{decision}",
            "orchestration": orchestration,
        }

    if decision == "AUTO_REPLY" and confidence < min_confidence:
        return {
            "status": "skipped",
            "reason": "confidence_below_auto_reply_threshold",
            "orchestration": orchestration,
        }

    response_text = orchestration.get("response_text")

    if not response_text:
        return {
            "status": "skipped",
            "reason": "empty_ai_response",
            "orchestration": orchestration,
        }

    route = resolve_outbound_whatsapp_sender(
        org_id=org_id,
        preferred_role=preferred_role,
    )

    if not route["resolved"]:
        return {
            "status": "failed",
            "reason": "no_whatsapp_sender_available",
            "orchestration": orchestration,
        }

    number = route["number"]
    outbound_message = create_outbound_message(
        org_id=org_id,
        to_phone=client_phone,
        from_phone=number.get("display_phone_number"),
        text_body=response_text,
        provider="META",
        provider_phone_number_id=number.get("phone_number_id"),
        whatsapp_number_id=(
            str(number["id"])
            if number.get("id") is not None
            else None
        ),
        waba_id=number.get("waba_id"),
        number_role=number.get("number_role"),
        send_status="PENDING",
    )

    try:
        provider = get_whatsapp_provider(
            org_id=org_id,
            preferred_role=preferred_role,
        )
        result = provider.send_message(
            to=client_phone,
            message=response_text,
        )

        if result.get("success"):
            sent_message = mark_outbound_message_sent(
                message_id=str(outbound_message["id"]),
                provider_message_id=result.get("provider_message_id"),
            )

            return {
                "status": "sent",
                "decision": decision,
                "message": sent_message,
                "provider_response": result,
                "orchestration": orchestration,
            }

        failed_message = mark_outbound_message_failed(
            message_id=str(outbound_message["id"]),
            error_message=str(result),
        )

        return {
            "status": "failed",
            "decision": decision,
            "message": failed_message,
            "provider_response": result,
            "orchestration": orchestration,
        }

    except Exception as exc:
        failed_message = mark_outbound_message_failed(
            message_id=str(outbound_message["id"]),
            error_message=str(exc),
        )

        return {
            "status": "failed",
            "decision": decision,
            "message": failed_message,
            "error": str(exc),
            "orchestration": orchestration,
        }
