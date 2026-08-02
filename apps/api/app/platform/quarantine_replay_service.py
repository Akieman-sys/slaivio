import hashlib
import json

from cryptography.fernet import Fernet, InvalidToken

from app.api.webhook import process_normalized_whatsapp_message
from app.core.config import settings
from app.db.notification_repository import (
    create_notification_delivery_event,
    get_notification_by_provider_message_id,
    update_notification_provider_status,
)
from app.platform.quarantine_repository import (
    claim_replay_envelope,
    complete_replay,
    fail_replay,
)
from app.services.meta_payload import normalize_meta_payload


class PermanentReplayError(RuntimeError):
    pass


def _decrypt_payload(envelope: dict) -> dict:
    key = settings.platform_quarantine_encryption_key
    if not key:
        raise RuntimeError("platform_quarantine_encryption_key_missing")
    try:
        raw = Fernet(key.encode("ascii")).decrypt(
            envelope["payload_encrypted"].encode("ascii")
        )
    except InvalidToken as exc:
        raise PermanentReplayError("quarantine_payload_decryption_failed") from exc

    if hashlib.sha256(raw).hexdigest() != envelope["payload_hash"]:
        raise PermanentReplayError("quarantine_payload_integrity_failed")
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise PermanentReplayError("quarantine_payload_must_be_an_object")
    return payload


async def _dispatch(envelope: dict, payload: dict) -> dict:
    if not envelope.get("signature_verified"):
        raise PermanentReplayError("unverified_events_cannot_be_replayed")
    org_id = envelope.get("resolved_org_id")
    if not org_id:
        raise PermanentReplayError("resolved_org_id_missing")
    provider = str(envelope.get("provider") or "").lower()
    event_type = envelope.get("event_type")
    if event_type in {"delivery_status", "notification_status"}:
        return _dispatch_status(envelope, payload, provider, org_id)
    if event_type != "inbound_message":
        raise PermanentReplayError(f"unsupported_replay_event_type:{event_type}")
    if provider == "meta":
        normalized = normalize_meta_payload(payload)
        return await process_normalized_whatsapp_message(
            normalized_message=normalized,
            payload=payload,
            org_id=org_id,
            provider="META",
            provider_phone_number_id=envelope.get("provider_phone_number_id"),
        )
    raise PermanentReplayError(f"unsupported_replay_provider:{provider}")


def _dispatch_status(
    envelope: dict, payload: dict, provider: str, org_id: str
) -> dict:
    if provider == "meta":
        provider_message_id = payload.get("id") or payload.get("provider_message_id")
        status = payload.get("status") or "unknown"
        raw_payload = payload
        errors = payload.get("errors") or []
        first_error = errors[0] if errors else {}
        error_code = first_error.get("code")
        error_message = first_error.get("message")
    else:
        raise PermanentReplayError(f"unsupported_replay_provider:{provider}")

    if not provider_message_id:
        raise PermanentReplayError("provider_message_id_missing")
    notification = get_notification_by_provider_message_id(provider_message_id)
    if not notification:
        raise RuntimeError("notification_not_available_yet")
    if str(notification.get("org_id")) != str(org_id):
        raise PermanentReplayError("resolved_org_notification_mismatch")

    update_notification_provider_status(
        provider_message_id=provider_message_id,
        provider_status=str(status).upper(),
        error_code=str(error_code) if error_code is not None else None,
        error_message=error_message,
    )
    event = create_notification_delivery_event(
        org_id=org_id,
        notification_id=str(notification["id"]),
        provider_message_id=provider_message_id,
        status=str(status).upper(),
        error_code=str(error_code) if error_code is not None else None,
        error_message=error_message,
        raw_payload=raw_payload,
        provider=provider,
    )
    return {"notification_id": str(notification["id"]), "event": event}


async def replay_one(envelope_id: str | None = None) -> dict:
    envelope = claim_replay_envelope(
        envelope_id=envelope_id,
        lease_seconds=settings.quarantine_replay_lease_seconds,
    )
    if not envelope:
        return {"status": "not_due_or_already_claimed"}

    envelope_id = str(envelope["id"])
    lease_id = str(envelope["processing_lease_id"])
    try:
        payload = _decrypt_payload(envelope)
        result = await _dispatch(envelope, payload)
        completed = complete_replay(envelope_id, lease_id)
        if not completed:
            raise RuntimeError("replay_lease_lost_before_completion")
        return {"status": "processed", "envelope": completed, "result": result}
    except Exception as exc:
        max_attempts = (
            1 if isinstance(exc, PermanentReplayError)
            else settings.quarantine_replay_max_attempts
        )
        failed = fail_replay(
            envelope_id=envelope_id,
            lease_id=lease_id,
            error=f"{type(exc).__name__}:{exc}",
            max_attempts=max_attempts,
        )
        return {
            "status": failed["routing_status"] if failed else "lease_lost",
            "envelope": failed,
        }


async def replay_due(limit: int = 25) -> dict:
    results = []
    for _ in range(limit):
        result = await replay_one()
        if result["status"] == "not_due_or_already_claimed":
            break
        results.append(result)
    return {"claimed": len(results), "results": results}
