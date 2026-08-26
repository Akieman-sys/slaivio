from datetime import datetime, timezone
from fastapi import APIRouter, Request
from fastapi import HTTPException
from app.models.message import NormalizedMessage
from app.services.deduplication import is_duplicate, mark_as_seen
from app.services.understanding_orchestrator import understand_message
from app.services.reply_generator import generate_reply
from app.services.business_action_engine import decide_business_action
from app.services.notification_engine import (
    should_queue_notification,
    build_notification_type,
)
from app.db.message_repository import create_message
from app.db.pilot_inbox_repository import register_inbound
from app.services.followup_engine import build_followup_for_business_action
from app.services.pricing_orchestrator import handle_pricing_request
from app.services.intake_parser import parse_intake_message
from app.services.intake_service import (
    is_intake_in_progress,
    get_missing_intake_fields,
)
from app.db.message_repository import (
    insert_raw_message,
    get_or_create_client,
    get_or_create_active_dossier,
    create_dossier_event,
    update_dossier_from_intent,
    get_organization,
    update_dossier_from_ai_fields,
    get_dossier_full,
    update_dossier_from_action,
    update_dossier_pricing,
    mark_dossier_confirmed,
    update_dossier_intake_fields,
    mark_dossier_intake_complete,
    mark_dossier_waiting_for_package,
)

from app.db.notification_repository import create_notification_outbox
from app.db.followup_repository import (
    create_followup_task,
    cancel_pending_followups_for_dossier,
    link_whatsapp_response,
)
from app.db.broadcast_repository import link_reply as link_broadcast_reply
from app.services.escalation_service import (
    should_create_escalation,
    create_escalation_from_context,
)
from app.services.manager_event_service import (
    emit_client_message_event,
    emit_escalation_event,
)


router = APIRouter()


@router.get("/webhook/whatsapp")
def verify_webhook():
    return {"status": "webhook verification endpoint ready"}


def normalize_whatsapp_payload(payload: dict) -> NormalizedMessage:
    from_phone = payload.get("from", "unknown")
    to_phone = payload.get("to")
    text_body = payload.get("text")
    provider_message_id = payload.get("id")

    dedupe_key = provider_message_id or f"whatsapp:{from_phone}:{text_body}"

    return NormalizedMessage(
        provider_message_id=provider_message_id,
        from_phone=from_phone,
        to_phone=to_phone,
        text_body=text_body,
        received_at=datetime.now(timezone.utc),
        dedupe_key=dedupe_key,
    )

async def process_normalized_whatsapp_message(
    normalized_message: NormalizedMessage,
    payload: dict,
    org_id: str = "",
    provider: str | None = None,
    provider_phone_number_id: str | None = None,
    whatsapp_number_id: str | None = None,
    waba_id: str | None = None,
    number_role: str | None = None,
):
    if not org_id:
        raise ValueError("A verified organization is required before processing a message")

    if is_duplicate(normalized_message.dedupe_key):
        return {
            "status": "duplicate",
            "message": "Message already processed",
            "dedupe_key": normalized_message.dedupe_key,
        }

    mark_as_seen(normalized_message.dedupe_key)

    client_id = get_or_create_client(
        org_id=org_id,
        phone=normalized_message.from_phone,
    )

    dossier_id = get_or_create_active_dossier(
        org_id=org_id,
        client_id=client_id,
    )

    create_message(
        org_id=org_id,
        dossier_id=str(dossier_id),
        client_id=str(client_id),
        provider_message_id=normalized_message.provider_message_id,
        from_phone=normalized_message.from_phone,
        to_phone=normalized_message.to_phone,
        text_body=normalized_message.text_body,
        message_type=normalized_message.message_type,
        source_channel=normalized_message.source_channel,
        direction="inbound",
        dedupe_key=normalized_message.dedupe_key,
        received_at=normalized_message.received_at,
        provider=provider,
        provider_phone_number_id=provider_phone_number_id,
        whatsapp_number_id=whatsapp_number_id,
        waba_id=waba_id,
        number_role=number_role,
    )


    insert_raw_message(
        org_id=org_id,
        phone=normalized_message.from_phone,
        text_msg=normalized_message.text_body or "",
        payload=payload,
        client_id=client_id,
        dossier_id=dossier_id,
    )

    register_inbound(
        org_id=org_id,
        phone=normalized_message.from_phone,
        client_id=str(client_id) if client_id else None,
        dossier_id=str(dossier_id) if dossier_id else None,
    )

    linked_followup = link_whatsapp_response(
        org_id=org_id,
        client_id=client_id,
        dossier_id=dossier_id,
        message_id=normalized_message.provider_message_id,
        body=normalized_message.text_body or "",
    )
    linked_broadcast = link_broadcast_reply(org_id,client_id,normalized_message.text_body or "")

    cancelled_followups = cancel_pending_followups_for_dossier(
        org_id=org_id,
        dossier_id=dossier_id,
        reason="linked_followup_response" if linked_followup else "client_replied",
    )

    if cancelled_followups:
        create_dossier_event(
            org_id=org_id,
            dossier_id=dossier_id,
            event_type="FOLLOWUPS_CANCELLED_ON_REPLY",
            payload={
                "count": len(cancelled_followups),
                "followups": cancelled_followups,
            },
        )

    understanding = understand_message(normalized_message.text_body)
    intent = understanding["intent"]

    print("=== UNDERSTANDING ===")
    print(understanding)

    org = get_organization(org_id)
    org_name = org["name"] if org else "Notre agence"

    create_dossier_event(
        org_id=org_id,
        dossier_id=dossier_id,
        event_type="INTENT_DETECTED",
        payload={
            "intent": intent,
            "text": normalized_message.text_body,
            "source": understanding["source"],
            "confidence": understanding["confidence"],
            "ai_result": understanding["ai_result"],
        },
    )

    emit_client_message_event(
        org_id=org_id,
        client_id=str(client_id),
        dossier_id=str(dossier_id),
        phone=normalized_message.from_phone,
        text=normalized_message.text_body,
        intent=intent,
    )


    create_dossier_event(
        org_id=org_id,
        dossier_id=dossier_id,
        event_type="UNDERSTANDING_COMPLETED",
        payload=understanding,
    )

    updated_dossier = update_dossier_from_intent(
        org_id=org_id,
        dossier_id=dossier_id,
        intent=intent,
    )

    if updated_dossier:
        create_dossier_event(
            org_id=org_id,
            dossier_id=dossier_id,
            event_type="DOSSIER_UPDATED_FROM_INTENT",
            payload={
                "intent": intent,
                "case_type": updated_dossier["case_type"],
                "status_global": updated_dossier["status_global"],
            },
        )

    ai_fields = None
    updated_from_ai = None

    if understanding.get("ai_result"):
        ai_fields = understanding["ai_result"].get("extracted_fields")

    if ai_fields:
        updated_from_ai = update_dossier_from_ai_fields(
            org_id=org_id,
            dossier_id=dossier_id,
            fields=ai_fields,
        )

        if updated_from_ai:
            create_dossier_event(
                org_id=org_id,
                dossier_id=dossier_id,
                event_type="DOSSIER_UPDATED_FROM_AI",
                payload={
                    "fields": ai_fields,
                },
            )

    dossier_full = get_dossier_full(
        org_id=org_id,
        dossier_id=dossier_id,
    )

    pricing_result = None
    updated_pricing_dossier = None

    if intent == "PRICING_REQUEST":
        pricing_result = handle_pricing_request(
            org_id=org_id,
            text=normalized_message.text_body or "",
            dossier=dossier_full,
        )

        parsed = pricing_result.get("parsed") or {}
        result = pricing_result.get("result")

        updated_pricing_dossier = update_dossier_pricing(
            org_id=org_id,
            dossier_id=dossier_id,
            origin_country=parsed.get("origin_country"),
            destination_country=parsed.get("destination_country"),
            weight_kg=parsed.get("weight_kg"),
            quoted_total=result.get("total") if result else None,
            quoted_currency=result.get("currency") if result else None,
            pricing_status=pricing_result["pricing_status"],
        )

        create_dossier_event(
            org_id=org_id,
            dossier_id=dossier_id,
            event_type="PRICING_CALCULATED",
            payload={
                "pricing_status": pricing_result["pricing_status"],
                "parsed": parsed,
                "result": result,
            },
        )

        dossier_full = get_dossier_full(
            org_id=org_id,
            dossier_id=dossier_id,
        )

    confirmed_dossier = None

    if intent == "CONFIRMATION":
        confirmed_dossier = mark_dossier_confirmed(
            org_id=org_id,
            dossier_id=dossier_id,
        )

        create_dossier_event(
            org_id=org_id,
            dossier_id=dossier_id,
            event_type="CLIENT_CONFIRMED",
            payload={
                "validation_status": "CONFIRMED_BY_CLIENT",
                "intake_status": "PARTIAL",
            },
        )

        dossier_full = get_dossier_full(
            org_id=org_id,
            dossier_id=dossier_id,
        )

    updated_intake_dossier = None
    intake_fields = None

    if is_intake_in_progress(dossier_full) and intent != "CONFIRMATION":
        intake_fields = parse_intake_message(normalized_message.text_body or "")

        clean_fields = {
            key: value
            for key, value in intake_fields.items()
            if value is not None
        }

        if clean_fields:
            updated_intake_dossier = update_dossier_intake_fields(
                org_id=org_id,
                dossier_id=dossier_id,
                fields=clean_fields,
            )

            create_dossier_event(
                org_id=org_id,
                dossier_id=dossier_id,
                event_type="INTAKE_FIELDS_UPDATED",
                payload={
                    "fields": clean_fields,
                },
            )

            dossier_full = get_dossier_full(
                org_id=org_id,
                dossier_id=dossier_id,
            )

    completed_intake_dossier = None
    waiting_dossier = None

    if is_intake_in_progress(dossier_full):
        missing = get_missing_intake_fields(dossier_full)

        if not missing:
            completed_intake_dossier = mark_dossier_intake_complete(
                org_id=org_id,
                dossier_id=dossier_id,
            )

            create_dossier_event(
                org_id=org_id,
                dossier_id=dossier_id,
                event_type="INTAKE_COMPLETED",
                payload={
                    "status": "COMPLETE",
                },
            )

            dossier_full = get_dossier_full(
                org_id=org_id,
                dossier_id=dossier_id,
            )

            waiting_dossier = mark_dossier_waiting_for_package(
                org_id=org_id,
                dossier_id=dossier_id,
            )

            create_dossier_event(
                org_id=org_id,
                dossier_id=dossier_id,
                event_type="DOSSIER_WAITING_FOR_PACKAGE",
                payload={
                    "status_global": "WAITING_PACKAGES",
                    "reason": "intake_completed_package_not_received_yet",
                },
            )

            create_dossier_event(
                org_id=org_id,
                dossier_id=dossier_id,
                event_type="INTERNAL_ACTION_REQUIRED",
                payload={
                    "action": "WAIT_FOR_PACKAGE",
                    "note": "Attente dépôt client ou dépôt fournisseur à l’entrepôt.",
                },
            )

            dossier_full = get_dossier_full(
                org_id=org_id,
                dossier_id=dossier_id,
            )

    business_action = decide_business_action(
        intent=intent,
        dossier=dossier_full,
    )

    create_dossier_event(
        org_id=org_id,
        dossier_id=dossier_id,
        event_type="BUSINESS_ACTION_DECIDED",
        payload=business_action,
    )

    updated_status = update_dossier_from_action(
        org_id=org_id,
        dossier_id=dossier_id,
        action=business_action,
    )

    if updated_status:
        create_dossier_event(
            org_id=org_id,
            dossier_id=dossier_id,
            event_type="DOSSIER_STATUS_UPDATED",
            payload={
                "action_type": business_action["action_type"],
                "intake_status": updated_status.get("intake_status"),
                "validation_status": updated_status.get("validation_status"),
            },
        )

        dossier_full = get_dossier_full(
            org_id=org_id,
            dossier_id=dossier_id,
        )

    followup = build_followup_for_business_action(
        org_name=org_name,
        business_action=business_action,
        dossier=dossier_full,
    )

    created_followup = None

    if followup:
        created_followup = create_followup_task(
            org_id=org_id,
            client_id=client_id,
            dossier_id=dossier_id,
            followup_type=followup["followup_type"],
            message=followup["message"],
            due_minutes=followup["due_minutes"],
        )

        create_dossier_event(
            org_id=org_id,
            dossier_id=dossier_id,
            event_type="FOLLOWUP_CREATED",
            payload={
                "followup_id": str(created_followup["id"]),
                "followup_type": created_followup["followup_type"],
                "due_at": str(created_followup["due_at"]),
                "already_exists": created_followup.get("already_exists", False),
            },
        )

    reply = generate_reply(
        intent=intent,
        org_name=org_name,
        org_id=org_id,
        understanding=understanding,
        dossier=dossier_full,
        text=normalized_message.text_body,
    )

    queued_notification = None
    created_escalation = None

    if should_create_escalation(
        reply=reply,
        business_action=business_action,
        understanding=understanding,
    ):
        shipment_id = None

        if dossier_full and dossier_full.get("shipment"):
            shipment_id = str(dossier_full["shipment"]["id"])

        created_escalation = create_escalation_from_context(
            org_id=org_id,
            client_id=str(client_id) if client_id else None,
            dossier_id=str(dossier_id) if dossier_id else None,
            shipment_id=shipment_id,
            text=normalized_message.text_body,
            reply=reply,
            business_action=business_action,
            understanding=understanding,
        )

        if created_escalation:
            create_dossier_event(
                org_id=org_id,
                dossier_id=dossier_id,
                event_type="ESCALATION_CASE_CREATED",
                payload={
                    "escalation_id": str(created_escalation["id"]),
                    "reason": created_escalation["reason"],
                    "priority": created_escalation["priority"],
                },
            )

    if should_queue_notification(business_action, reply):
        queued_notification = create_notification_outbox(
            org_id=org_id,
            client_id=client_id,
            dossier_id=dossier_id,
            recipient_phone=normalized_message.from_phone,
            notification_type=build_notification_type(intent, business_action),
            message=reply["message"],
        )

        create_dossier_event(
            org_id=org_id,
            dossier_id=dossier_id,
            event_type="NOTIFICATION_QUEUED",
            payload={
                "notification_id": str(queued_notification["id"]),
                "notification_status": queued_notification["status"],
                "notification_type": build_notification_type(intent, business_action),
            },
        )

    create_dossier_event(
        org_id=org_id,
        dossier_id=dossier_id,
        event_type="REPLY_GENERATED",
        payload={
            "intent": intent,
            "reply_type": reply["reply_type"],
            "should_escalate": reply["should_escalate"],
            "message": reply["message"],
        },
    )

    create_dossier_event(
        org_id=org_id,
        dossier_id=dossier_id,
        event_type="CLIENT_IDENTIFIED",
        payload={
            "client_id": str(client_id),
            "phone": normalized_message.from_phone,
        },
    )

    create_dossier_event(
        org_id=org_id,
        dossier_id=dossier_id,
        event_type="MESSAGE_RECEIVED",
        payload={
            "intent": intent,
            "text": normalized_message.text_body,
            "phone": normalized_message.from_phone,
            "source": understanding["source"],
        },
    )

    return {
        "status": "stored",
        "org_id": org_id,
        "client_id": str(client_id),
        "dossier_id": str(dossier_id),
        "intent": intent,
        "understanding": understanding,
        "updated_dossier": updated_dossier,
        "updated_from_ai": updated_from_ai,
        "business_action": business_action,
        "queued_notification": queued_notification,
        "cancelled_followups": cancelled_followups,
        "created_followup": created_followup,
        "pricing_result": pricing_result,
        "confirmed_dossier": confirmed_dossier,
        "completed_intake_dossier": completed_intake_dossier,
        "intake_fields": intake_fields,
        "updated_intake_dossier": updated_intake_dossier,
        "waiting_dossier": waiting_dossier,
        "updated_pricing_dossier": updated_pricing_dossier,
        "reply": reply,
        "shipment_id": str(dossier_full["shipment"]["id"]) if dossier_full and dossier_full.get("shipment") else None,
        "normalized_message": normalized_message.model_dump(mode="json"),
    }

@router.post("/webhook/whatsapp")
async def receive_whatsapp_message(request: Request):
    raise HTTPException(
        status_code=410,
        detail="Legacy webhook disabled; use a signed provider-specific endpoint",
    )
