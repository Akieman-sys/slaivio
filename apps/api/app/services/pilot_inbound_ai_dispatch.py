import asyncio

from app.ai.services.auto_reply_service import maybe_auto_reply_to_inbound_message
from app.core.logger import logger
from app.core.websocket_manager import manager


async def run_pilot_inbox_ai(
    org_id: str,
    phone: str,
    text: str,
    role: str,
    event_key: str,
) -> None:
    try:
        result = await asyncio.to_thread(
            maybe_auto_reply_to_inbound_message,
            org_id,
            phone,
            text,
            role,
            event_key,
        )
    except Exception:
        logger.exception("pilot_inbox_ai_background_failure")
        return

    if result.get("status") == "sent":
        await manager.broadcast_to_org(
            org_id,
            {
                "event": "NEW_MESSAGE",
                "org_id": org_id,
                "phone": phone,
                "message": result["message"].get("text_body"),
                "direction": "outbound",
            },
        )
