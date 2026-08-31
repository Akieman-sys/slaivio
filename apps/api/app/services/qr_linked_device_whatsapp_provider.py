import re

from app.services.whatsapp_provider import WhatsAppProvider
from app.services.whatsapp_qr_gateway_client import qr_gateway_request
from app.services.whatsapp_routing_service import resolve_outbound_number


class QRLinkedDeviceWhatsAppProvider(WhatsAppProvider):
    def __init__(self, org_id: str | None = None, preferred_role: str | None = None, number: dict | None = None):
        if number is None and org_id:
            route = resolve_outbound_number(org_id, preferred_role)
            number = route.get("number") if route.get("resolved") else None
        if not number or str(number.get("provider") or "").upper() != "QR_LINKED_DEVICE":
            raise ValueError("No active linked-device WhatsApp number configured")
        metadata = number.get("provider_metadata") or {}
        self.connection_id = metadata.get("connection_id")
        if not self.connection_id:
            raise ValueError("Linked-device connection id is missing")

    def send_message(self, to: str, message: str) -> dict:
        body = message.strip()
        if not body:
            raise ValueError("WhatsApp message cannot be empty")
        if len(body) > 4096:
            raise ValueError("WhatsApp message exceeds 4096 characters")
        result = qr_gateway_request("POST", f"/connections/{self.connection_id}/messages", {
            "to": self.normalize_to(to), "message": body,
        })
        return {
            "success": result.get("success") is True,
            "provider": "qr_linked_device",
            "provider_message_id": result.get("provider_message_id"),
            "status": "accepted" if result.get("success") else "failed",
            "response": result,
        }

    def send_media_message(self, to: str, message: str, media_url: str) -> dict:
        raise NotImplementedError("Linked-device media sending is not enabled for the Pilot")

    def send_template_message(self, to: str, content_sid: str, content_variables: dict) -> dict:
        rendered = content_variables.get("_rendered_message")
        if not rendered:
            raise NotImplementedError("Linked-device templates require a pre-rendered message")
        return self.send_message(to, str(rendered))

    @staticmethod
    def normalize_to(value: str) -> str:
        digits = re.sub(r"\D", "", value.replace("whatsapp:", ""))
        if not 8 <= len(digits) <= 15:
            raise ValueError("Invalid WhatsApp phone number")
        return f"+{digits}"
