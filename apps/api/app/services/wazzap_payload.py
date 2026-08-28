import hashlib
import json
import re
from datetime import datetime, timezone

from app.models.message import NormalizedMessage


def extract_wazzap_event_type(payload: dict) -> str:
    return str(payload.get("event") or payload.get("type") or "").strip()


def extract_wazzap_data(payload: dict) -> dict:
    data = payload.get("data")
    return data if isinstance(data, dict) else {}


def extract_wazzap_agent_id(payload: dict) -> str | None:
    data = extract_wazzap_data(payload)
    value = data.get("agentId") or payload.get("agentId")
    return str(value).strip() if value else None


def extract_wazzap_organization_id(payload: dict) -> str | None:
    data = extract_wazzap_data(payload)
    value = data.get("organizationId") or payload.get("organizationId")
    return str(value).strip() if value else None


def extract_wazzap_message_id(payload: dict) -> str | None:
    data = extract_wazzap_data(payload)
    value = data.get("messageId") or payload.get("messageId")
    return str(value).strip() if value else None


def build_wazzap_event_key(payload: dict) -> str:
    event_type = extract_wazzap_event_type(payload) or "unknown"
    message_id = extract_wazzap_message_id(payload)
    if message_id:
        return f"wazzap:{event_type}:{message_id}"

    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")
    return f"wazzap:{event_type}:{hashlib.sha256(canonical).hexdigest()}"


def normalize_wazzap_phone(value: object) -> str:
    raw = str(value or "").strip()
    digits = re.sub(r"\D", "", raw)
    if not 8 <= len(digits) <= 15:
        raise ValueError("wazzap_phone_number_invalid")
    return f"+{digits}"


def _parse_timestamp(value: object) -> datetime:
    if isinstance(value, (int, float)):
        seconds = float(value)
        if seconds > 10_000_000_000:
            seconds /= 1000
        return datetime.fromtimestamp(seconds, timezone.utc)

    raw = str(value or "").strip()
    if raw:
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            try:
                return _parse_timestamp(float(raw))
            except ValueError:
                pass
    return datetime.now(timezone.utc)


def _message_text(data: dict, message_type: str) -> str:
    for key in ("message", "transcription", "description"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    labels = {
        "image": "[Image reçue]",
        "audio": "[Message audio reçu]",
        "video": "[Vidéo reçue]",
        "document": "[Document reçu]",
    }
    return labels.get(message_type.lower(), "")


def normalize_wazzap_payload(payload: dict) -> NormalizedMessage:
    if extract_wazzap_event_type(payload) != "message.received":
        raise ValueError("wazzap_event_not_inbound_message")

    data = extract_wazzap_data(payload)
    if data.get("fromMe") is True:
        raise ValueError("wazzap_from_me_message_ignored")

    message_type = str(data.get("messageType") or "text").lower()
    provider_message_id = extract_wazzap_message_id(payload)
    phone = normalize_wazzap_phone(data.get("phoneNumber"))

    return NormalizedMessage(
        provider_message_id=provider_message_id,
        from_phone=phone,
        to_phone=None,
        text_body=_message_text(data, message_type),
        message_type=message_type,
        received_at=_parse_timestamp(data.get("timestamp")),
        source_channel="whatsapp",
        dedupe_key=provider_message_id or build_wazzap_event_key(payload),
    )
