from app.api.webhook import process_normalized_whatsapp_message
from app.core.config import settings
from app.core.logger import logger
from app.core.websocket_manager import manager
from app.db.wazzap_webhook_repository import (
    claim_wazzap_event,
    list_claimable_wazzap_event_keys,
    mark_wazzap_event_failed,
    mark_wazzap_event_ignored,
    mark_wazzap_event_processed,
)
from app.platform.quarantine_service import quarantine_inbound_event
from app.services.pilot_inbound_ai_dispatch import run_pilot_inbox_ai
from app.services.wazzap_payload import normalize_wazzap_payload
from app.services.whatsapp_routing_service import resolve_inbound_route


async def process_wazzap_event(event_key: str) -> str:
    event = claim_wazzap_event(
        event_key=event_key,
        max_attempts=settings.quarantine_replay_max_attempts,
        lease_seconds=settings.quarantine_replay_lease_seconds,
    )
    if not event:
        return "skipped"

    payload = event["payload"]
    agent_id = event["agent_id"]
    try:
        route = resolve_inbound_route(agent_id)
        if not route.get("resolved"):
            reason = route.get("reason") or "route_not_resolved"
            quarantine_inbound_event(
                provider="wazzap",
                event_type=event["event_type"],
                payload=payload,
                failure_reason=reason,
                signature_verified=True,
                provider_event_id=event.get("provider_event_id") or event_key,
                provider_account_id=event.get("provider_organization_id"),
                provider_phone_number_id=agent_id,
            )
            mark_wazzap_event_ignored(event_key=event_key, reason=reason)
            return "ignored"

        number = route["number"]
        if str(number.get("provider") or "").lower() != "wazzap":
            mark_wazzap_event_ignored(
                event_key=event_key,
                reason="route_provider_mismatch",
            )
            return "ignored"

        normalized = normalize_wazzap_payload(payload)
        org_id = route["org_id"]
        result = await process_normalized_whatsapp_message(
            normalized_message=normalized,
            payload=payload,
            org_id=org_id,
            provider="WAZZAP",
            provider_phone_number_id=agent_id,
            whatsapp_number_id=str(number["id"]),
            waba_id=number.get("provider_organization_id") or route.get("waba_id"),
            number_role=route["number_role"],
        )
        if result.get("status") == "duplicate":
            mark_wazzap_event_processed(event_key=event_key)
            logger.info("wazzap_webhook_duplicate_message:%s", event_key)
            return "processed"

        await manager.broadcast_to_org(
            org_id,
            {
                "event": "NEW_MESSAGE",
                "org_id": org_id,
                "phone": normalized.from_phone,
                "message": normalized.text_body,
                "direction": "inbound",
            },
        )
        await run_pilot_inbox_ai(
            org_id,
            normalized.from_phone,
            normalized.text_body or "",
            route["number_role"],
            f"whatsapp:{normalized.dedupe_key}",
        )
        mark_wazzap_event_processed(event_key=event_key)
        logger.info(
            "wazzap_webhook_processed:%s:%s:%s",
            event_key,
            org_id,
            result.get("message_id"),
        )
        return "processed"
    except ValueError as exc:
        mark_wazzap_event_ignored(event_key=event_key, reason=str(exc))
        logger.info("wazzap_webhook_ignored:%s:%s", event_key, exc)
        return "ignored"
    except Exception as exc:
        mark_wazzap_event_failed(event_key=event_key, error=str(exc)[:1000])
        logger.exception("wazzap_webhook_processing_failed:%s", event_key)
        return "failed"


async def recover_wazzap_events(limit: int = 100) -> dict[str, int]:
    event_keys = list_claimable_wazzap_event_keys(
        limit=limit,
        max_attempts=settings.quarantine_replay_max_attempts,
        lease_seconds=settings.quarantine_replay_lease_seconds,
    )
    totals = {"selected": len(event_keys), "processed": 0, "ignored": 0, "failed": 0, "skipped": 0}
    for event_key in event_keys:
        outcome = await process_wazzap_event(event_key)
        totals[outcome] += 1
    return totals
