from app.core.config import settings
from app.services.whatsapp_provider import WhatsAppProvider
from app.db.organization_whatsapp_repository import get_active_whatsapp_settings
from app.services.meta_http_client import meta_post
from app.services.whatsapp_routing_service import resolve_outbound_number


class MetaWhatsAppProvider(WhatsAppProvider):
    def __init__(
        self,
        org_id: str | None = None,
        preferred_role: str | None = None,
        number: dict | None = None,
    ):
        self.api_version = settings.meta_wa_api_version
        route = resolve_outbound_number(
            org_id=org_id,
            preferred_role=preferred_role,
        ) if org_id and number is None else {
            "resolved": False,
        }

        if route["resolved"] or number is not None:
            number = number or route["number"]
            if str(number.get("provider", "meta")).lower() != "meta":
                raise ValueError("Configured WhatsApp number is not a Meta number")
            self.phone_number_id = number["phone_number_id"]
            self.access_token = number.get("access_token") or settings.meta_wa_access_token

            if not self.access_token:
                raise ValueError("Meta access token missing for WhatsApp number")

            return

        org_settings = None

        if org_id:
            org_settings = get_active_whatsapp_settings(
                org_id=org_id,
                provider="meta",
            )

        if not org_settings:
            raise ValueError("No Meta WhatsApp settings configured for organization")

        phone_number_id = org_settings.get("meta_phone_number_id")

        if not phone_number_id:
            raise ValueError("meta_phone_number_id missing for organization")

        self.phone_number_id = phone_number_id
        self.access_token = settings.meta_wa_access_token

        if not self.access_token:
            raise ValueError("META_WA_ACCESS_TOKEN is missing")

    def build_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def build_messages_url(self) -> str:
        return (
            f"https://graph.facebook.com/"
            f"{self.api_version}/"
            f"{self.phone_number_id}/messages"
        )

    def send_message(self, to: str, message: str) -> dict:
        payload = {
            "messaging_product": "whatsapp",
            "to": self.normalize_to(to),
            "type": "text",
            "text": {
                "body": message,
            },
        }

        return self._post_message(payload)

    def send_media_message(
        self,
        to: str,
        message: str,
        media_url: str,
        media_type: str = "image",
    ) -> dict:
        media_type = media_type.lower()

        if media_type in {"photo", "image"}:
            wa_type = "image"
            content = {
                "link": media_url,
                "caption": message,
            }

        elif media_type == "document":
            wa_type = "document"
            content = {
                "link": media_url,
                "caption": message,
                "filename": "slaivo-document",
            }

        elif media_type == "video":
            wa_type = "video"
            content = {
                "link": media_url,
                "caption": message,
            }

        elif media_type == "audio":
            wa_type = "audio"
            content = {
                "link": media_url,
            }

        else:
            wa_type = "image"
            content = {
                "link": media_url,
                "caption": message,
            }

        payload = {
            "messaging_product": "whatsapp",
            "to": self.normalize_to(to),
            "type": wa_type,
            wa_type: content,
        }

        return self._post_message(payload)

    def send_template_message(
        self,
        to: str,
        content_sid: str,
        content_variables: dict,
    ) -> dict:
        language = content_variables.get("_language", "fr")

        components = []

        placeholders = [
            str(value)
            for key, value in content_variables.items()
            if not str(key).startswith("_")
        ]

        if placeholders:
            components.append({
                "type": "body",
                "parameters": [
                    {
                        "type": "text",
                        "text": value,
                    }
                    for value in placeholders
                ],
            })

        payload = {
            "messaging_product": "whatsapp",
            "to": self.normalize_to(to),
            "type": "template",
            "template": {
                "name": content_sid,
                "language": {
                    "code": language,
                },
                "components": components,
            },
        }

        return self._post_message(payload)

    def send_media_template_message(
        self,
        to: str,
        template_name: str,
        language: str,
        media_url: str,
        body_variables: list[str] | None = None,
        media_type: str = "image",
    ) -> dict:
        media_type = media_type.lower()

        header_type = "image"

        if media_type == "document":
            header_type = "document"

        if media_type == "video":
            header_type = "video"

        components = [
            {
                "type": "header",
                "parameters": [
                    {
                        "type": header_type,
                        header_type: {
                            "link": media_url,
                        },
                    }
                ],
            }
        ]

        if body_variables:
            components.append({
                "type": "body",
                "parameters": [
                    {
                        "type": "text",
                        "text": str(value),
                    }
                    for value in body_variables
                ],
            })

        payload = {
            "messaging_product": "whatsapp",
            "to": self.normalize_to(to),
            "type": "template",
            "template": {
                "name": template_name,
                "language": {
                    "code": language,
                },
                "components": components,
            },
        }

        return self._post_message(payload)

    def _post_message(self, payload: dict) -> dict:
        response = meta_post(
            self.build_messages_url(),
            headers=self.build_headers(),
            json=payload,
        )

        data = response["data"]
        success = response["ok"]

        provider_message_id = None

        messages = data.get("messages") or []

        if messages:
            provider_message_id = messages[0].get("id")

        return {
            "success": success,
            "provider": "meta",
            "provider_message_id": provider_message_id,
            "status": "accepted" if success else "failed",
            "response": data,
        }

    def normalize_to(self, value: str) -> str:
        return (
            value
            .replace("whatsapp:", "")
            .replace("+", "")
            .replace(" ", "")
        )
