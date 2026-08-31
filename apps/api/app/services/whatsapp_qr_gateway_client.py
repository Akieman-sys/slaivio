import hashlib
import hmac
import json
import time

import requests

from app.core.config import settings


def _configuration() -> tuple[str, str]:
    url = (settings.whatsapp_qr_gateway_url or "").rstrip("/")
    secret = settings.whatsapp_qr_gateway_shared_secret or ""
    if not url or len(secret) < 32:
        raise ValueError("pilot_whatsapp_qr_gateway_unavailable")
    return url, secret


def sign_gateway_request(method: str, path: str, body: bytes, timestamp: str, secret: str) -> str:
    digest = hashlib.sha256(body).hexdigest()
    canonical = f"{timestamp}\n{method.upper()}\n{path}\n{digest}".encode()
    return hmac.new(secret.encode(), canonical, hashlib.sha256).hexdigest()


def verify_gateway_signature(method: str, path: str, body: bytes, timestamp: str | None, signature: str | None) -> bool:
    secret = settings.whatsapp_qr_gateway_shared_secret or ""
    if not timestamp or not signature or len(secret) < 32:
        return False
    try:
        if abs(int(time.time()) - int(timestamp)) > 300:
            return False
    except ValueError:
        return False
    expected = sign_gateway_request(method, path, body, timestamp, secret)
    return hmac.compare_digest(expected, signature)


def qr_gateway_request(method: str, path: str, payload: dict | None = None) -> dict:
    base_url, secret = _configuration()
    body = b"" if method.upper() == "GET" else json.dumps(payload or {}, separators=(",", ":"), ensure_ascii=False).encode()
    timestamp = str(int(time.time()))
    signature = sign_gateway_request(method, path, body, timestamp, secret)
    response = requests.request(
        method,
        f"{base_url}{path}",
        data=body if method.upper() != "GET" else None,
        headers={
            "Content-Type": "application/json",
            "X-Slaivio-Timestamp": timestamp,
            "X-Slaivio-Signature": signature,
        },
        timeout=20,
    )
    try:
        data = response.json()
    except ValueError:
        data = {"error": "invalid_qr_gateway_response"}
    if not response.ok:
        raise ValueError(str(data.get("error") or "qr_gateway_request_failed"))
    return data
