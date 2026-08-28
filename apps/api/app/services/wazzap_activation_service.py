from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import text

from app.core.config import settings
from app.db.database import engine
from app.db.whatsapp_number_repository import upsert_whatsapp_number
from app.organization_admin import repository as administration
from app.services.wazzap_payload import normalize_wazzap_phone


def public_wazzap_configuration() -> dict:
    enabled = settings.whatsapp_provider == "wazzap"
    return {
        "provider": settings.whatsapp_provider.upper(),
        "activation_available": bool(
            enabled
            and settings.wazzap_api_key
            and settings.wazzap_agent_id
            and settings.wazzap_webhook_secret
        ),
        "suggested_phone_number": settings.wazzap_phone_number if enabled else None,
        "suggested_verified_name": settings.wazzap_verified_name if enabled else None,
        "webhook_url": (
            f"{settings.public_base_url.rstrip('/')}/webhook/wazzap/whatsapp"
            if enabled and settings.public_base_url
            else None
        ),
    }


def activate_wazzap_number(
    org_id: str,
    actor_id: str,
    phone_number: str,
    verified_name: str | None,
    default_language: str,
    default_timezone: str,
) -> dict:
    if settings.whatsapp_provider != "wazzap":
        raise HTTPException(409, "pilot_wazzap_provider_not_enabled")
    if not all((settings.wazzap_api_key, settings.wazzap_agent_id, settings.wazzap_webhook_secret)):
        raise HTTPException(503, "pilot_wazzap_server_configuration_incomplete")

    try:
        normalized_phone = normalize_wazzap_phone(phone_number)
    except ValueError as exc:
        raise HTTPException(422, "pilot_wazzap_phone_invalid") from exc

    with engine.connect() as conn:
        owner = conn.execute(text("""
          select org_id from organization_whatsapp_numbers
          where phone_number_id=:agent_id and is_active=true and upper(provider)='WAZZAP'
          limit 1
        """), {"agent_id": settings.wazzap_agent_id}).scalar()
    if owner and owner != org_id:
        raise HTTPException(409, "pilot_wazzap_agent_already_assigned")

    row = upsert_whatsapp_number(
        org_id=org_id,
        provider="WAZZAP",
        phone_number_id=settings.wazzap_agent_id,
        display_phone_number=normalized_phone,
        verified_name=(verified_name or settings.wazzap_verified_name or "WhatsApp SLAIVIO").strip(),
        number_role="SUPPORT",
        default_language=default_language,
        default_timezone=default_timezone,
        connection_status="CONNECTED",
        is_default=True,
        access_token=settings.wazzap_api_key,
        provider_organization_id=settings.wazzap_organization_id,
        webhook_secret=settings.wazzap_webhook_secret,
        provider_metadata={"disable_ai_response": True, "transport": "wazzap"},
    )
    if not row:
        raise HTTPException(500, "pilot_wazzap_activation_failed")

    public_row = {
        key: row.get(key)
        for key in (
            "id", "provider", "display_phone_number", "verified_name",
            "connection_status", "is_default", "last_sync_at",
        )
    }
    with engine.begin() as conn:
        administration._audit(
            conn, org_id, actor_id, "PILOT_WAZZAP_ACTIVATED",
            "whatsapp_number", str(row.get("id")), None, public_row,
        )
    return public_row
