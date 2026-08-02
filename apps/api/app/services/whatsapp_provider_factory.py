from app.services.meta_whatsapp_provider import MetaWhatsAppProvider


def get_whatsapp_provider(
    org_id: str | None = None,
    preferred_role: str | None = None,
):
    return MetaWhatsAppProvider(
        org_id=org_id,
        preferred_role=preferred_role,
    )
