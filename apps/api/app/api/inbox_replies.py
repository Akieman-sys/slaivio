from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.tenant_context import get_current_tenant
from app.core.permissions import require_permission
from app.db.pilot_inbox_repository import update_state
from app.db.conversation_timeline_repository import create_timeline_event
from app.core.websocket_manager import manager
from app.db.outbound_message_repository import (
    create_outbound_message,
    mark_outbound_message_failed,
    mark_outbound_message_sent,
)
from app.ai.repositories.draft_response_repository import mark_ai_draft_used
from app.services.whatsapp_provider_factory import get_whatsapp_provider
from app.services.whatsapp_outbound_resolver import (
    resolve_outbound_whatsapp_sender,
)


router = APIRouter()


class SendReplyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    preferred_role: str | None = "SUPPORT"
    manager_id: str | None = None
    manager_name: str | None = None
    draft_id: str | None = None
    idempotency_key: str | None = Field(default=None, max_length=180)


@router.post("/inbox/conversations/{phone}/reply", dependencies=[Depends(require_permission("inbox.reply"))])
async def send_reply(
    phone: str,
    body: SendReplyRequest,
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]
    message_text = body.message.strip()

    if not message_text:
        raise HTTPException(
            status_code=400,
            detail="Message is required",
        )

    route = resolve_outbound_whatsapp_sender(
        org_id=org_id,
        preferred_role=body.preferred_role,
    )

    if not route["resolved"]:
        raise HTTPException(
            status_code=400,
            detail="No WhatsApp number available",
        )

    number = route["number"]
    whatsapp_number_id = number.get("id")
    provider_name = str(number.get("provider") or "meta").upper()

    outbound_message = create_outbound_message(
        org_id=org_id,
        to_phone=phone,
        from_phone=number.get("display_phone_number"),
        text_body=message_text,
        provider=provider_name,
        provider_phone_number_id=number.get("phone_number_id"),
        whatsapp_number_id=(
            str(whatsapp_number_id)
            if whatsapp_number_id is not None
            else None
        ),
        waba_id=number.get("waba_id"),
        number_role=number.get("number_role"),
        send_status="PENDING",
        dedupe_key=(f"pilot-inbox:{org_id}:{body.idempotency_key}" if body.idempotency_key else None),
    )

    if outbound_message and outbound_message.get("idempotent_replay"):
        return {
            "status": "ok" if outbound_message.get("send_status") == "SENT" else "failed",
            "message": outbound_message,
            "idempotent_replay": True,
        }

    try:
        provider = get_whatsapp_provider(
            org_id=org_id,
            preferred_role=body.preferred_role,
        )
        result = provider.send_message(
            to=phone,
            message=message_text,
        )

        if result.get("success"):
            sent_message = mark_outbound_message_sent(
                message_id=str(outbound_message["id"]),
                provider_message_id=result.get("provider_message_id"),
            )

            create_timeline_event(
                org_id=org_id,
                client_phone=phone,
                event_type="MESSAGE_SENT",
                event_title="Réponse envoyée",
                event_payload={
                    "message_id": str(outbound_message["id"]),
                    "provider_message_id": result.get(
                        "provider_message_id"
                    ),
                    "number_role": number.get("number_role"),
                },
                created_by_id=tenant.get("user_id"),
                created_by_name=tenant.get("actor_name"),
            )

            await manager.broadcast_to_org(
                org_id,
                {
                    "event": "NEW_MESSAGE",
                    "org_id": org_id,
                    "phone": phone,
                    "message": message_text,
                    "direction": "outbound",
                }
            )

            if body.draft_id:
                mark_ai_draft_used(body.draft_id, org_id)

            update_state(
                org_id, phone, "OPEN", False,
                str(tenant.get("user_id") or "system"),
            )

            return {
                "status": "ok",
                "message": sent_message,
                "provider_response": result,
            }

        failed_message = mark_outbound_message_failed(
            message_id=str(outbound_message["id"]),
            error_message=str(result),
        )

        return {
            "status": "failed",
            "message": failed_message,
            "error": "provider_rejected_message",
        }

    except Exception as exc:
        failed_message = mark_outbound_message_failed(
            message_id=str(outbound_message["id"]),
            error_message=str(exc),
        )

        return {
            "status": "failed",
            "message": failed_message,
            "error": "message_delivery_failed",
        }
