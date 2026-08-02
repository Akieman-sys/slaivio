from fastapi import APIRouter, Depends
from typing import Literal

from pydantic import BaseModel
from app.core.tenant_context import get_current_tenant
from app.db.organization_whatsapp_repository import (
    upsert_whatsapp_settings,
    get_active_whatsapp_settings,
    list_whatsapp_settings,
)


router = APIRouter()


class UpsertWhatsappSettingsRequest(BaseModel):
    provider: Literal["meta"] = "meta"
    environment: Literal["production"] = "production"
    inbound_webhook_url: str | None = None
    status_callback_url: str | None = None
    sender_status: str = "PENDING"
    sender_country: str | None = None
    default_language: str = "fr"
    default_timezone: str = "Africa/Kinshasa"
    meta_phone_number_id: str | None = None
    meta_waba_id: str | None = None
    meta_whatsapp_display_phone: str | None = None
    meta_app_id: str | None = None



@router.post("/organization/whatsapp-settings")
def save_whatsapp_settings(
    body: UpsertWhatsappSettingsRequest,
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]

    settings = upsert_whatsapp_settings(
        org_id=org_id,
        provider=body.provider,
        environment=body.environment,
        inbound_webhook_url=body.inbound_webhook_url,
        status_callback_url=body.status_callback_url,
        sender_status=body.sender_status,
        sender_country=body.sender_country,
        default_language=body.default_language,
        default_timezone=body.default_timezone,
        meta_phone_number_id=body.meta_phone_number_id,
        meta_waba_id=body.meta_waba_id,
        meta_whatsapp_display_phone=body.meta_whatsapp_display_phone,
        meta_app_id=body.meta_app_id,

    )

    return {
        "status": "ok",
        "settings": settings,
    }


@router.get("/organization/whatsapp-settings")
def get_whatsapp_settings(tenant=Depends(get_current_tenant)):
    org_id = tenant["org_id"]

    settings = list_whatsapp_settings(
        org_id=org_id,
    )

    return {
        "status": "ok",
        "count": len(settings),
        "settings": settings,
    }


@router.get("/organization/whatsapp-settings/active")
def get_active_settings(tenant=Depends(get_current_tenant)):
    org_id = tenant["org_id"]

    settings = get_active_whatsapp_settings(
        org_id=org_id,
    )

    return {
        "status": "ok",
        "settings": settings,
    }
