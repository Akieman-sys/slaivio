"""Single entry point for every SLAIVIO conversational channel.

The channel policy may differ, but intent handling and operational workflows
must not be reimplemented by the Assistant, WhatsApp or future inboxes.
"""

from app.ai.repositories.workflow_repository import get_active_operator_workflow
from app.ai.services.dialogue_validation import normalize_text
from app.ai.services.operator_copilot_service import prepare_operator_message
from app.ai.services.response_orchestrator import orchestrate_ai_response


OPERATION_MARKERS = (
    "cree un colis", "creer un colis", "crée un colis",
    "prepare un colis", "prépare un colis",
    "cree un dossier", "creer un dossier", "crée un dossier",
)


def _is_operational_request(message: str) -> bool:
    normalized = normalize_text(message)
    return any(normalize_text(marker) in normalized for marker in OPERATION_MARKERS)


def handle_conversation(
    *,
    org_id: str,
    message: str,
    channel: str,
    actor_id: str | None = None,
    actor_name: str | None = None,
    client_phone: str | None = None,
    workspace_id: str | None = None,
) -> dict:
    """Handle a message through the shared conversational boundary.

    Internal users always use the controlled operational engine. WhatsApp uses
    that same engine for an active/explicit operation and retains the
    read-only response pipeline for informational questions until each live
    cargo tool is connected to the operational engine.
    """
    normalized_channel = (channel or "INTERNAL").upper()
    if normalized_channel == "INTERNAL":
        if not actor_id:
            raise ValueError("actor_id_required")
        return prepare_operator_message(
            org_id=org_id, user_id=actor_id, actor_name=actor_name,
            message=message, client_phone=client_phone,
            workspace_id=workspace_id, channel="INTERNAL",
        )

    if normalized_channel == "WHATSAPP":
        if not client_phone:
            raise ValueError("client_phone_required")
        whatsapp_actor = actor_id or f"whatsapp:{client_phone}"
        active = get_active_operator_workflow(org_id, whatsapp_actor)
        if active or _is_operational_request(message):
            result = prepare_operator_message(
                org_id=org_id, user_id=whatsapp_actor,
                actor_name=actor_name or "Client WhatsApp", message=message,
                client_phone=client_phone, workspace_id=workspace_id,
                channel="WHATSAPP",
            )
            workflow = result.get("workflow") or {}
            return {
                **result,
                "status": "ok",
                "decision": "ESCALATE" if workflow.get("workflow_type") == "ESCALATION_REQUIRED" else "AUTO_REPLY",
                "reason": "shared_operational_conversation_engine",
                "response_text": (result.get("message") or {}).get("content"),
                "intent": {
                    "intent": workflow.get("intent") or "GENERAL_QUESTION",
                    "confidence": workflow.get("confidence") or 1.0,
                    "entities": workflow.get("entities") or {},
                },
            }
        return orchestrate_ai_response(
            org_id=org_id, client_phone=client_phone, user_message=message,
        )

    raise ValueError("unsupported_conversation_channel")
