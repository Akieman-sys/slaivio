import hashlib
import json

from cryptography.fernet import Fernet

from app.core.config import settings
from app.platform.quarantine_repository import create_quarantine_envelope


def quarantine_inbound_event(
    *,
    provider: str,
    event_type: str,
    payload: dict,
    failure_reason: str,
    signature_verified: bool,
    provider_event_id: str | None = None,
    provider_account_id: str | None = None,
    provider_phone_number_id: str | None = None,
) -> dict:
    canonical_payload = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")
    payload_hash = hashlib.sha256(canonical_payload).hexdigest()
    stable_event_id = provider_event_id or payload_hash

    if not settings.platform_quarantine_encryption_key:
        raise RuntimeError("platform_quarantine_encryption_key_missing")

    encrypted_payload = Fernet(
        settings.platform_quarantine_encryption_key.encode("ascii")
    ).encrypt(canonical_payload).decode("ascii")

    envelope = create_quarantine_envelope({
        "provider": provider.lower(),
        "provider_event_id": stable_event_id,
        "provider_account_id": provider_account_id,
        "provider_phone_number_id": provider_phone_number_id,
        "event_type": event_type,
        "failure_reason": failure_reason,
        "payload_encrypted": encrypted_payload,
        "payload_hash": payload_hash,
        "signature_verified": signature_verified,
    })
    if not envelope:
        raise RuntimeError("quarantine_persistence_failed")
    return envelope
