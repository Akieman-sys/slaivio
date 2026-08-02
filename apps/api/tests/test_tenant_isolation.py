import hashlib
import hmac
import json

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException

from app.core import tenant_context
from app.platform import quarantine_service
from app.services.meta_webhook_security import validate_meta_signature


def test_tenant_context_fails_closed_without_verified_membership(monkeypatch):
    monkeypatch.setattr(
        tenant_context,
        "get_tenant_context",
        lambda _user_id: {"active_tenant": None},
    )

    with pytest.raises(HTTPException) as error:
        tenant_context.get_current_tenant(
            {"user_id": "user_123", "org_id": "unverified_claim"}
        )

    assert error.value.status_code == 403


def test_meta_signature_is_verified(monkeypatch):
    raw_body = b'{"object":"whatsapp_business_account"}'
    secret = "test-meta-secret"
    signature = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    monkeypatch.setattr(quarantine_service.settings, "meta_app_secret", secret)

    assert validate_meta_signature(raw_body, f"sha256={signature}") is True
    assert validate_meta_signature(raw_body + b" ", f"sha256={signature}") is False
    assert validate_meta_signature(raw_body, None) is False


def test_quarantine_encrypts_payload_and_uses_stable_dedupe_key(monkeypatch):
    captured = {}

    def persist(data):
        captured.update(data)
        return {"id": "event-1", **data}

    monkeypatch.setattr(quarantine_service, "create_quarantine_envelope", persist)
    payload = {"message": "sensitive", "nested": {"value": 42}}

    result = quarantine_service.quarantine_inbound_event(
        provider="meta",
        event_type="inbound_message",
        payload=payload,
        failure_reason="number_not_routed",
        signature_verified=True,
    )

    canonical = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), default=str
    ).encode()
    encryption_key = quarantine_service.settings.platform_quarantine_encryption_key
    assert encryption_key is not None
    decrypted = Fernet(encryption_key.encode()).decrypt(
        captured["payload_encrypted"].encode()
    )

    assert decrypted == canonical
    assert captured["provider_event_id"] == hashlib.sha256(canonical).hexdigest()
    assert captured["payload_encrypted"] != canonical.decode()
    assert result["id"] == "event-1"
