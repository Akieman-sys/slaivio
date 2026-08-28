from app.core.config import settings
from app.services.meta_whatsapp_provider import MetaWhatsAppProvider
from app.services.whatsapp_routing_service import resolve_outbound_number
from app.services.wazzap_whatsapp_provider import WazzapWhatsAppProvider


def get_whatsapp_provider(
    org_id: str | None = None,
    preferred_role: str | None = None,
):
    number = None
    provider = settings.whatsapp_provider
    if org_id:
        route = resolve_outbound_number(org_id, preferred_role)
        if route.get("resolved"):
            number = route["number"]
            provider = str(number.get("provider") or provider).lower()
        elif provider == "wazzap":
            # Never let one agency fall back to the server-wide Pilot channel.
            raise ValueError("No active Wazzap number configured for organization")

    if provider == "wazzap":
        return WazzapWhatsAppProvider(
            org_id=org_id,
            preferred_role=preferred_role,
            number=number,
        )
    if provider == "meta":
        return MetaWhatsAppProvider(
            org_id=org_id,
            preferred_role=preferred_role,
            number=number,
        )
    raise ValueError(f"Unsupported WhatsApp provider: {provider}")
