import json

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from app.core.config import settings
from app.db.wazzap_webhook_repository import (
    enqueue_wazzap_event,
)
from app.services.wazzap_payload import (
    build_wazzap_event_key,
    extract_wazzap_agent_id,
    extract_wazzap_event_type,
    extract_wazzap_message_id,
    extract_wazzap_organization_id,
)
from app.services.wazzap_webhook_processor import process_wazzap_event
from app.services.wazzap_webhook_security import validate_wazzap_signature
from app.services.whatsapp_routing_service import resolve_inbound_route


router = APIRouter()


def _resolve_signature_secret(route: dict, agent_id: str | None) -> str | None:
    if route.get("resolved"):
        number = route["number"]
        if str(number.get("provider") or "").lower() != "wazzap":
            return None
        return number.get("webhook_secret") or settings.wazzap_webhook_secret

    if not settings.wazzap_agent_id or agent_id == settings.wazzap_agent_id:
        return settings.wazzap_webhook_secret
    return None


@router.post("/webhook/wazzap/whatsapp")
async def wazzap_whatsapp_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="invalid_wazzap_payload")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid_wazzap_payload")

    event_type = extract_wazzap_event_type(payload)
    agent_id = extract_wazzap_agent_id(payload)
    route = resolve_inbound_route(agent_id) if agent_id else {"resolved": False}
    secret = _resolve_signature_secret(route, agent_id)

    if not validate_wazzap_signature(
        raw_body,
        request.headers.get("X-Wazzap-Signature"),
        secret,
    ):
        raise HTTPException(status_code=403, detail="invalid_wazzap_signature")

    if event_type == "webhook.test":
        return {"status": "ok", "type": event_type}

    if event_type != "message.received":
        return {"status": "ignored", "reason": "unsupported_event"}

    if not agent_id:
        return {"status": "ignored", "reason": "agent_id_missing"}

    event_key = build_wazzap_event_key(payload)
    number = route.get("number") if route.get("resolved") else None
    _, created = enqueue_wazzap_event(
        event_key=event_key,
        provider_event_id=extract_wazzap_message_id(payload),
        agent_id=agent_id,
        provider_organization_id=extract_wazzap_organization_id(payload),
        org_id=route.get("org_id"),
        whatsapp_number_id=str(number["id"]) if number else None,
        event_type=event_type,
        payload=payload,
    )

    if created:
        background_tasks.add_task(process_wazzap_event, event_key)
    return {
        "status": "accepted" if created else "duplicate",
        "event_key": event_key,
    }
