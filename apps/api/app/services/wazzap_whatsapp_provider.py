import re

from app.core.config import settings
from app.services.whatsapp_provider import WhatsAppProvider
from app.services.whatsapp_routing_service import resolve_outbound_number
from app.services.wazzap_http_client import wazzap_post


class WazzapWhatsAppProvider(WhatsAppProvider):
    def __init__(
        self,
        org_id: str | None = None,
        preferred_role: str | None = None,
        number: dict | None = None,
    ):
        if number is None and org_id:
            route = resolve_outbound_number(org_id, preferred_role)
            number = route.get("number") if route.get("resolved") else None

        if number and str(number.get("provider", "")).lower() != "wazzap":
            raise ValueError("Configured WhatsApp number is not a Wazzap number")

        self.api_key = (number or {}).get("access_token") or settings.wazzap_api_key
        self.agent_id = (number or {}).get("phone_number_id") or settings.wazzap_agent_id
        self.api_base_url = settings.wazzap_api_base_url.rstrip("/")

        if not self.api_key:
            raise ValueError("Wazzap API key is missing")
        if not self.agent_id:
            raise ValueError("Wazzap agent id is missing")

    def send_message(self, to: str, message: str) -> dict:
        body = message.strip()
        if not body:
            raise ValueError("WhatsApp message cannot be empty")
        if len(body) > 4096:
            raise ValueError("WhatsApp message exceeds Wazzap's 4096 character limit")

        response = wazzap_post(
            f"{self.api_base_url}/send-message",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "phoneNumber": self.normalize_to(to),
                "message": body,
                # Slaivio is the only AI allowed to answer Pilot conversations.
                "disableAiResponse": True,
            },
        )
        data = response["data"]
        result = data.get("data") if isinstance(data, dict) else None
        result = result if isinstance(result, dict) else data
        ai_disabled = result.get("aiResponseDisabled") if isinstance(result, dict) else None
        success = response["ok"] and ai_disabled is not False

        return {
            "success": success,
            "provider": "wazzap",
            "provider_message_id": (
                result.get("messageId") if isinstance(result, dict) else None
            ),
            "status": "accepted" if success else "failed",
            "response": data,
        }

    def send_media_message(self, to: str, message: str, media_url: str) -> dict:
        raise NotImplementedError("Wazzap media sending is not available in the documented API")

    def send_template_message(
        self,
        to: str,
        content_sid: str,
        content_variables: dict,
    ) -> dict:
        rendered = content_variables.get("_rendered_message")
        if not rendered:
            raise NotImplementedError(
                "Wazzap templates require a pre-rendered message"
            )
        return self.send_message(to, str(rendered))

    @staticmethod
    def normalize_to(value: str) -> str:
        raw = value.replace("whatsapp:", "").strip()
        digits = re.sub(r"\D", "", raw)
        if not 8 <= len(digits) <= 15:
            raise ValueError("Invalid WhatsApp phone number")
        return f"+{digits}"
