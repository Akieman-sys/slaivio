"""Compatibility boundary for inbound WhatsApp AI handling.

All Pilot channels use the controlled Inbox policy. Keeping this public
function avoids coupling Meta's webhook to the AI implementation.
"""

import hashlib

from app.ai.services.pilot_inbox_ai_service import process_pilot_inbound_ai


def maybe_auto_reply_to_inbound_message(
    org_id: str,
    client_phone: str,
    inbound_text: str | None,
    preferred_role: str | None = None,
    event_key: str | None = None,
):
    if not inbound_text:
        return {"status": "skipped", "reason": "empty_message"}
    return process_pilot_inbound_ai(
        org_id=org_id,
        client_phone=client_phone,
        event_key=event_key or f"inbound:{client_phone}:{hashlib.sha256(inbound_text.encode('utf-8')).hexdigest()}",
        preferred_role=preferred_role,
    )
