import asyncio
import hashlib
import hmac
import json

import httpx
import pytest
from fastapi import FastAPI

from app.api import wazzap_webhook
from app.api import webhook as shared_webhook
from app.jobs import wazzap_smoke_test
from app.services import whatsapp_provider_factory
from app.services import wazzap_webhook_processor
from app.services import wazzap_whatsapp_provider
from app.services.wazzap_activation_service import public_wazzap_configuration
from app.services.wazzap_payload import (
    build_wazzap_event_key,
    normalize_wazzap_payload,
    normalize_wazzap_phone,
)
from app.services.wazzap_webhook_security import validate_wazzap_signature
from app.services.wazzap_whatsapp_provider import WazzapWhatsAppProvider


SECRET = "pilot-webhook-secret"


def _signature(raw_body: bytes, secret: str = SECRET) -> str:
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _message_payload(**overrides):
    data = {
        "phoneNumber": "243840178047",
        "message": "Bonjour SLAIVIO",
        "messageType": "text",
        "messageId": "wamid.test-001",
        "timestamp": "2026-08-27T08:30:00Z",
        "fromMe": False,
    }
    data.update(overrides)
    return {
        "event": "message.received",
        "agentId": "agent-pilot-1",
        "organizationId": "wazzap-org-1",
        "data": data,
    }


def test_wazzap_signature_uses_exact_raw_body():
    raw = b'{"event":"webhook.test"}'
    assert validate_wazzap_signature(raw, _signature(raw), SECRET) is True
    assert validate_wazzap_signature(raw + b" ", _signature(raw), SECRET) is False
    assert validate_wazzap_signature(raw, "sha256=invalid", SECRET) is False
    assert validate_wazzap_signature(raw, _signature(raw), None) is False


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("+243 840 178 047", "+243840178047"),
        ("243840178047", "+243840178047"),
    ],
)
def test_wazzap_phone_normalization(raw, expected):
    assert normalize_wazzap_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "123", "+" + "1" * 16])
def test_wazzap_phone_rejects_invalid_lengths(raw):
    with pytest.raises(ValueError, match="wazzap_phone_number_invalid"):
        normalize_wazzap_phone(raw)


def test_wazzap_payload_normalizes_text_and_audio_transcription():
    text_message = normalize_wazzap_payload(_message_payload())
    assert text_message.from_phone == "+243840178047"
    assert text_message.text_body == "Bonjour SLAIVIO"
    assert text_message.provider_message_id == "wamid.test-001"
    assert text_message.dedupe_key == "wamid.test-001"

    audio_message = normalize_wazzap_payload(
        _message_payload(
            message="",
            messageType="audio",
            messageId="wamid.audio-001",
            transcription="Je souhaite ouvrir un dossier",
        )
    )
    assert audio_message.message_type == "audio"
    assert audio_message.text_body == "Je souhaite ouvrir un dossier"


def test_wazzap_payload_ignores_own_and_unsupported_events():
    with pytest.raises(ValueError, match="wazzap_from_me_message_ignored"):
        normalize_wazzap_payload(_message_payload(fromMe=True))
    with pytest.raises(ValueError, match="wazzap_event_not_inbound_message"):
        normalize_wazzap_payload({"event": "message.sent", "data": {}})


def test_wazzap_event_key_is_stable_and_uses_message_id():
    payload = _message_payload()
    assert build_wazzap_event_key(payload) == (
        "wazzap:message.received:wamid.test-001"
    )
    payload["data"].pop("messageId")
    assert build_wazzap_event_key(payload) == build_wazzap_event_key(payload)


def test_wazzap_provider_sends_documented_body_and_disables_provider_ai(monkeypatch):
    captured = {}

    def fake_post(url, headers, json):
        captured.update(url=url, headers=headers, json=json)
        return {
            "ok": True,
            "status_code": 200,
            "data": {
                "data": {
                    "messageId": "wamid.outbound-001",
                    "aiResponseDisabled": True,
                }
            },
        }

    monkeypatch.setattr(wazzap_whatsapp_provider, "wazzap_post", fake_post)
    provider = WazzapWhatsAppProvider(
        number={
            "provider": "WAZZAP",
            "access_token": "secret-api-key",
            "phone_number_id": "agent-pilot-1",
        }
    )
    result = provider.send_message("whatsapp:+243 840 178 047", " Bonjour ")

    assert captured["url"].endswith("/send-message")
    assert captured["headers"]["Authorization"] == "Bearer secret-api-key"
    assert captured["json"] == {
        "phoneNumber": "+243840178047",
        "message": "Bonjour",
        "disableAiResponse": True,
    }
    assert result["success"] is True
    assert result["provider_message_id"] == "wamid.outbound-001"


def test_wazzap_provider_rejects_invalid_messages():
    provider = WazzapWhatsAppProvider(
        number={
            "provider": "WAZZAP",
            "access_token": "secret-api-key",
            "phone_number_id": "agent-pilot-1",
        }
    )
    with pytest.raises(ValueError, match="cannot be empty"):
        provider.send_message("+243840178047", " ")
    with pytest.raises(ValueError, match="4096"):
        provider.send_message("+243840178047", "a" * 4097)


def test_provider_factory_fails_closed_without_agency_number(monkeypatch):
    monkeypatch.setattr(whatsapp_provider_factory.settings, "whatsapp_provider", "wazzap")
    monkeypatch.setattr(
        whatsapp_provider_factory,
        "resolve_outbound_number",
        lambda org_id, preferred_role=None: {"resolved": False},
    )
    with pytest.raises(ValueError, match="No active Wazzap number"):
        whatsapp_provider_factory.get_whatsapp_provider("org-without-number")


def test_public_configuration_exposes_real_webhook_route(monkeypatch):
    monkeypatch.setattr(whatsapp_provider_factory.settings, "whatsapp_provider", "wazzap")
    monkeypatch.setattr(whatsapp_provider_factory.settings, "public_base_url", "https://api.slaivio.com/")
    monkeypatch.setattr(whatsapp_provider_factory.settings, "wazzap_api_key", "key")
    monkeypatch.setattr(whatsapp_provider_factory.settings, "wazzap_agent_id", "agent")
    monkeypatch.setattr(whatsapp_provider_factory.settings, "wazzap_webhook_secret", "secret")
    config = public_wazzap_configuration()
    assert config["activation_available"] is True
    assert config["webhook_url"] == (
        "https://api.slaivio.com/webhook/wazzap/whatsapp"
    )


def test_signed_webhook_is_durable_and_idempotent(monkeypatch):
    accepted = []
    processed = []

    monkeypatch.setattr(
        wazzap_webhook,
        "resolve_inbound_route",
        lambda agent_id: {
            "resolved": True,
            "org_id": "org-pilot",
            "number": {
                "id": "number-1",
                "provider": "WAZZAP",
                "webhook_secret": SECRET,
            },
        },
    )

    def fake_enqueue(**kwargs):
        accepted.append(kwargs)
        return ({"event_key": kwargs["event_key"]}, len(accepted) == 1)

    monkeypatch.setattr(wazzap_webhook, "enqueue_wazzap_event", fake_enqueue)
    async def fake_process(event_key):
        processed.append(event_key)

    monkeypatch.setattr(wazzap_webhook, "process_wazzap_event", fake_process)

    app = FastAPI()
    app.include_router(wazzap_webhook.router)
    raw = json.dumps(_message_payload(), separators=(",", ":")).encode()
    headers = {
        "Content-Type": "application/json",
        "X-Wazzap-Signature": _signature(raw),
    }

    async def request_webhook():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            first = await client.post(
                "/webhook/wazzap/whatsapp",
                content=raw,
                headers=headers,
            )
            duplicate = await client.post(
                "/webhook/wazzap/whatsapp",
                content=raw,
                headers=headers,
            )
        return first, duplicate

    first, duplicate = asyncio.run(request_webhook())

    assert first.status_code == 200
    assert first.json()["status"] == "accepted"
    assert duplicate.json()["status"] == "duplicate"
    assert accepted[0]["org_id"] == "org-pilot"
    assert accepted[0]["event_key"] == "wazzap:message.received:wamid.test-001"
    assert processed == [accepted[0]["event_key"]]


def test_signed_webhook_validation_ping_returns_success(monkeypatch):
    monkeypatch.setattr(
        wazzap_webhook,
        "resolve_inbound_route",
        lambda agent_id: {
            "resolved": True,
            "org_id": "org-pilot",
            "number": {
                "id": "number-1",
                "provider": "WAZZAP",
                "webhook_secret": SECRET,
            },
        },
    )

    def unexpected_enqueue(**kwargs):
        raise AssertionError("A validation ping must not be persisted")

    monkeypatch.setattr(wazzap_webhook, "enqueue_wazzap_event", unexpected_enqueue)
    app = FastAPI()
    app.include_router(wazzap_webhook.router)
    raw = json.dumps(
        {
            "event": "webhook.test",
            "apiKeyId": "key-pilot-1",
            "agentId": "agent-pilot-1",
            "data": {"message": "Webhook validation"},
        },
        separators=(",", ":"),
    ).encode()

    async def request_webhook():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.post(
                "/webhook/wazzap/whatsapp",
                content=raw,
                headers={"X-Wazzap-Signature": _signature(raw)},
            )

    response = asyncio.run(request_webhook())
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "type": "webhook.test"}


def test_webhook_rejects_tampered_body(monkeypatch):
    monkeypatch.setattr(wazzap_webhook.settings, "wazzap_agent_id", "agent-pilot-1")
    monkeypatch.setattr(wazzap_webhook.settings, "wazzap_webhook_secret", SECRET)
    monkeypatch.setattr(
        wazzap_webhook,
        "resolve_inbound_route",
        lambda agent_id: {"resolved": False},
    )
    app = FastAPI()
    app.include_router(wazzap_webhook.router)
    raw = json.dumps(_message_payload(), separators=(",", ":")).encode()

    async def request_webhook():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.post(
                "/webhook/wazzap/whatsapp",
                content=raw + b" ",
                headers={"X-Wazzap-Signature": _signature(raw)},
            )

    response = asyncio.run(request_webhook())
    assert response.status_code == 403
    assert response.json()["detail"] == "invalid_wazzap_signature"


def test_shared_inbound_pipeline_uses_database_idempotency(monkeypatch):
    normalized = normalize_wazzap_payload(_message_payload())
    monkeypatch.setattr(shared_webhook, "find_client_by_phone", lambda **kwargs: "client-1")
    monkeypatch.setattr(
        shared_webhook,
        "find_active_dossier",
        lambda **kwargs: "dossier-1",
    )
    monkeypatch.setattr(shared_webhook, "create_message", lambda **kwargs: None)

    def unexpected_side_effect(*args, **kwargs):
        raise AssertionError("duplicate messages must not trigger downstream side effects")

    monkeypatch.setattr(shared_webhook, "insert_raw_message", unexpected_side_effect)
    monkeypatch.setattr(shared_webhook, "register_inbound", unexpected_side_effect)
    monkeypatch.setattr(shared_webhook, "link_whatsapp_response", unexpected_side_effect)

    result = asyncio.run(
        shared_webhook.process_normalized_whatsapp_message(
            normalized_message=normalized,
            payload=_message_payload(),
            org_id="org-pilot",
            provider="WAZZAP",
        )
    )

    assert result == {
        "status": "duplicate",
        "message": "Message already processed",
        "dedupe_key": "wamid.test-001",
    }


def test_shared_inbound_pipeline_keeps_unknown_contact_unattached(monkeypatch):
    normalized = normalize_wazzap_payload(_message_payload())
    captured = {}
    monkeypatch.setattr(shared_webhook, "find_client_by_phone", lambda **kwargs: None)
    monkeypatch.setattr(shared_webhook, "find_active_dossier", lambda **kwargs: None)

    def create_message(**kwargs):
        captured["message"] = kwargs
        return {"id": "message-1"}

    monkeypatch.setattr(shared_webhook, "create_message", create_message)
    monkeypatch.setattr(shared_webhook, "insert_raw_message", lambda **kwargs: captured.setdefault("raw", kwargs))
    monkeypatch.setattr(shared_webhook, "register_inbound", lambda **kwargs: captured.setdefault("conversation", kwargs))

    def unexpected_side_effect(*args, **kwargs):
        raise AssertionError("an unattached contact must not mutate CRM follow-ups or broadcasts")

    monkeypatch.setattr(shared_webhook, "link_whatsapp_response", unexpected_side_effect)
    monkeypatch.setattr(shared_webhook, "link_broadcast_reply", unexpected_side_effect)
    monkeypatch.setattr(shared_webhook, "cancel_pending_followups_for_dossier", unexpected_side_effect)

    result = asyncio.run(
        shared_webhook.process_normalized_whatsapp_message(
            normalized_message=normalized,
            payload=_message_payload(),
            org_id="org-pilot",
            provider="WAZZAP",
        )
    )

    assert captured["message"]["client_id"] is None
    assert captured["message"]["dossier_id"] is None
    assert captured["conversation"]["client_id"] is None
    assert captured["conversation"]["dossier_id"] is None
    assert result["client_id"] is None
    assert result["dossier_id"] is None


def test_wazzap_retry_does_not_broadcast_or_run_ai_twice(monkeypatch):
    event_key = "wazzap:message.received:wamid.test-001"
    marked = []
    monkeypatch.setattr(
        wazzap_webhook_processor,
        "claim_wazzap_event",
        lambda **kwargs: {
            "event_key": event_key,
            "event_type": "message.received",
            "payload": _message_payload(),
            "agent_id": "agent-pilot-1",
        },
    )
    monkeypatch.setattr(
        wazzap_webhook_processor,
        "resolve_inbound_route",
        lambda agent_id: {
            "resolved": True,
            "org_id": "org-pilot",
            "number_role": "PRIMARY",
            "number": {"id": "number-1", "provider": "WAZZAP"},
        },
    )

    async def duplicate_message(**kwargs):
        return {"status": "duplicate"}

    async def unexpected_async_side_effect(*args, **kwargs):
        raise AssertionError("a durable message duplicate must not notify or run AI")

    monkeypatch.setattr(
        wazzap_webhook_processor,
        "process_normalized_whatsapp_message",
        duplicate_message,
    )
    monkeypatch.setattr(
        wazzap_webhook_processor.manager,
        "broadcast_to_org",
        unexpected_async_side_effect,
    )
    monkeypatch.setattr(
        wazzap_webhook_processor,
        "run_pilot_inbox_ai",
        unexpected_async_side_effect,
    )
    monkeypatch.setattr(
        wazzap_webhook_processor,
        "mark_wazzap_event_processed",
        lambda **kwargs: marked.append(kwargs["event_key"]),
    )

    outcome = asyncio.run(wazzap_webhook_processor.process_wazzap_event(event_key))

    assert outcome == "processed"
    assert marked == [event_key]


def test_wazzap_smoke_test_requires_explicit_confirmation(monkeypatch, capsys):
    monkeypatch.delenv("WAZZAP_SMOKE_CONFIRM", raising=False)
    monkeypatch.setenv("WAZZAP_SMOKE_RECIPIENT", "+243840178047")

    class UnexpectedProvider:
        def __init__(self):
            raise AssertionError("the provider must not be initialized without confirmation")

    monkeypatch.setattr(wazzap_smoke_test, "WazzapWhatsAppProvider", UnexpectedProvider)

    assert wazzap_smoke_test.main() == 2
    output = json.loads(capsys.readouterr().out)
    assert output["error"] == "confirmation_required"
    assert output["success"] is False


def test_wazzap_smoke_test_logs_only_sanitized_failure(monkeypatch, capsys):
    monkeypatch.setenv("WAZZAP_SMOKE_CONFIRM", "SEND")
    monkeypatch.setenv("WAZZAP_SMOKE_RECIPIENT", "+243840178047")
    monkeypatch.setenv("WAZZAP_API_KEY", "super-secret-token")

    class FailingProvider:
        def send_message(self, recipient, message):
            raise RuntimeError("provider body containing super-secret-token")

    monkeypatch.setattr(wazzap_smoke_test, "WazzapWhatsAppProvider", FailingProvider)

    assert wazzap_smoke_test.main() == 1
    raw_output = capsys.readouterr().out
    output = json.loads(raw_output)
    assert output == {
        "error": "send_failed",
        "error_type": "RuntimeError",
        "success": False,
    }
    assert "super-secret-token" not in raw_output
