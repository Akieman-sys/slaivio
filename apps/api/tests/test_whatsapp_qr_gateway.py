import time

from app.core.config import settings
from app.services.whatsapp_qr_gateway_client import sign_gateway_request, verify_gateway_signature
from app.services.qr_linked_device_whatsapp_provider import QRLinkedDeviceWhatsAppProvider


def test_qr_gateway_signature_rejects_tampering(monkeypatch):
    secret = "s" * 32
    monkeypatch.setattr(settings, "whatsapp_qr_gateway_shared_secret", secret)
    timestamp = str(int(time.time()))
    body = b'{"event_type":"CONNECTED"}'
    signature = sign_gateway_request("POST", "/internal/whatsapp-qr/events", body, timestamp, secret)
    assert verify_gateway_signature("POST", "/internal/whatsapp-qr/events", body, timestamp, signature)
    assert not verify_gateway_signature("POST", "/internal/whatsapp-qr/events", b"tampered", timestamp, signature)


def test_qr_gateway_signature_rejects_expired_request(monkeypatch):
    secret = "s" * 32
    monkeypatch.setattr(settings, "whatsapp_qr_gateway_shared_secret", secret)
    timestamp = str(int(time.time()) - 301)
    signature = sign_gateway_request("GET", "/connections/test", b"", timestamp, secret)
    assert not verify_gateway_signature("GET", "/connections/test", b"", timestamp, signature)


def test_linked_device_provider_sends_through_the_isolated_connection(monkeypatch):
    calls = []

    def fake_request(method, path, payload=None):
        calls.append((method, path, payload))
        return {"success": True, "provider_message_id": "wamid-test"}

    monkeypatch.setattr(
        "app.services.qr_linked_device_whatsapp_provider.qr_gateway_request",
        fake_request,
    )
    provider = QRLinkedDeviceWhatsAppProvider(number={
        "provider": "QR_LINKED_DEVICE",
        "provider_metadata": {"connection_id": "connection-1"},
    })
    result = provider.send_message("+243 900 000 001", "Bonjour")
    assert result["success"] is True
    assert result["provider"] == "qr_linked_device"
    assert calls == [("POST", "/connections/connection-1/messages", {
        "to": "+243900000001", "message": "Bonjour",
    })]
