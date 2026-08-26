import json
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import text

from app.core.config import settings
from app.core.tenant_context import get_current_tenant
from app.core.permissions import require_permission
from app.core.logger import logger
from app.db.meta_connection_repository import create_whatsapp_connection
from app.db.whatsapp_account_repository import upsert_whatsapp_account
from app.services.meta_webhook_subscription_service import (
    subscribe_app_to_waba_webhooks,
    get_waba_subscribed_apps,
)
from app.db.whatsapp_webhook_repository import (
    get_whatsapp_account_by_waba,
    update_waba_webhook_status,
)
from app.services.meta_http_client import meta_get
from app.db.database import engine


router = APIRouter()

META_OAUTH_SCOPES = (
    "business_management,"
    "whatsapp_business_management,"
    "whatsapp_business_messaging"
)


class ExchangeCodeRequest(BaseModel):
    code: str


class OnboardWhatsappRequest(BaseModel):
    code: str
    business_id: str | None = None
    waba_id: str | None = None
    phone_number_id: str | None = None


class SaveWhatsappConnectionRequest(BaseModel):
    business_id: str
    waba_id: str
    phone_number_id: str
    display_phone_number: str | None = None
    verified_name: str | None = None
    access_token: str
    account_name: str | None = None


class SubscribeWabaWebhookRequest(BaseModel):
    waba_id: str
    access_token: str


class CheckWabaWebhookRequest(BaseModel):
    waba_id: str
    access_token: str


def _sanitize_meta_error(data):
    if not isinstance(data, dict):
        return data

    sanitized = {}

    for key, value in data.items():
        if key in {"access_token", "token", "client_secret"}:
            sanitized[key] = "***"
        elif isinstance(value, dict):
            sanitized[key] = _sanitize_meta_error(value)
        elif isinstance(value, list):
            sanitized[key] = [
                _sanitize_meta_error(item)
                for item in value
            ]
        else:
            sanitized[key] = value

    return sanitized


def _public_connection(connection: dict) -> dict:
    public = {}
    for key, value in (connection or {}).items():
        if isinstance(value, dict):
            public[key] = {item_key:item_value for item_key,item_value in value.items()
                           if item_key not in {"access_token","access_token_encrypted","raw_payload","webhook_raw_response"}}
        elif key not in {"access_token","access_token_encrypted","raw_payload","webhook_raw_response"}:
            public[key] = value
    return public


def _raise_meta_error(stage: str, status_code: int, data):
    detail = {
        "stage": stage,
        "meta_response": _sanitize_meta_error(data),
    }
    logger.error(
        f"meta_onboard_failed:{stage}:{detail['meta_response']}"
    )
    raise HTTPException(
        status_code=status_code,
        detail=detail,
    )


def _exchange_oauth_code(code: str, *, embedded: bool = False) -> str:
    if not settings.meta_app_id or not settings.meta_app_secret or (not embedded and not settings.meta_redirect_uri):
        raise HTTPException(
            status_code=500,
            detail="Meta OAuth environment is incomplete",
        )

    params = {
        "client_id": settings.meta_app_id,
        "client_secret": settings.meta_app_secret,
        "code": code,
    }
    if not embedded:
        params["redirect_uri"] = settings.meta_redirect_uri
    result = meta_get(
        f"https://graph.facebook.com/{settings.meta_wa_api_version}/oauth/access_token",
        params=params,
    )

    data = result["data"]

    if not result["ok"] or "access_token" not in data:
        _raise_meta_error(
            stage="exchange_oauth_code",
            status_code=400,
            data=data,
        )

    return data["access_token"]


def _record_onboarding_failure(org_id: str, actor_id: str, body: OnboardWhatsappRequest, stage: str, detail) -> None:
    with engine.begin() as conn:
        conn.execute(text("""
          insert into pilot_meta_onboarding_events(
            org_id,status,waba_id,phone_number_id,actor_id,error_stage,metadata
          ) values(:org_id,'FAILED',:waba_id,:phone_number_id,:actor_id,:stage,
                   cast(:metadata as jsonb))
        """), {
            "org_id":org_id, "actor_id":actor_id, "waba_id":body.waba_id,
            "phone_number_id":body.phone_number_id, "stage":stage,
            "metadata":json.dumps(_sanitize_meta_error(detail)),
        })


def _get_meta_collection(
    stage: str,
    url: str,
    access_token: str,
) -> list[dict]:
    result = meta_get(
        url,
        params={
            "access_token": access_token,
        },
    )

    if not result["ok"]:
        _raise_meta_error(
            stage=stage,
            status_code=400,
            data=result["data"],
        )

    return result["data"].get("data") or []


@router.get("/meta/embedded-signup/config", dependencies=[Depends(require_permission("pilot.settings.manage"))])
def get_embedded_signup_config():
    enabled = bool(
        settings.meta_app_id
        and settings.meta_app_secret
        and settings.meta_embedded_signup_config_id
    )
    return {
        "status": "ok",
        "enabled": enabled,
        "app_id": settings.meta_app_id if enabled else None,
        "config_id": settings.meta_embedded_signup_config_id if enabled else None,
        "api_version": settings.meta_wa_api_version,
    }


@router.get("/meta/oauth/url", dependencies=[Depends(require_permission("pilot.settings.manage"))])
def get_oauth_url():
    if not settings.meta_app_id or not settings.meta_redirect_uri:
        raise HTTPException(
            status_code=500,
            detail="Meta OAuth environment is incomplete",
        )

    state = secrets.token_urlsafe(32)
    query = urlencode({
        "client_id": settings.meta_app_id,
        "redirect_uri": settings.meta_redirect_uri,
        "scope": META_OAUTH_SCOPES,
        "response_type": "code",
        "state": state,
    })

    return {
        "status": "ok",
        "state": state,
        "authorization_url": f"https://www.facebook.com/v22.0/dialog/oauth?{query}",
    }


@router.get("/meta/oauth/callback")
def oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    if not settings.meta_oauth_frontend_redirect_uri:
        raise HTTPException(
            status_code=500,
            detail="META_OAUTH_FRONTEND_REDIRECT_URI is missing",
        )

    query = urlencode({
        key: value
        for key, value in {
            "code": code,
            "state": state,
            "error": error,
        }.items()
        if value
    })

    separator = "&" if "?" in settings.meta_oauth_frontend_redirect_uri else "?"

    return RedirectResponse(
        url=f"{settings.meta_oauth_frontend_redirect_uri}{separator}{query}",
    )


@router.post("/meta/oauth/exchange", dependencies=[Depends(require_permission("pilot.settings.manage"))])
def exchange_code(body: ExchangeCodeRequest):
    return {
        "status": "ok",
        "access_token": _exchange_oauth_code(body.code),
    }

@router.get("/meta/businesses", dependencies=[Depends(require_permission("pilot.settings.manage"))])
def get_businesses(access_token: str):
    result = meta_get(
        "https://graph.facebook.com/v22.0/me/businesses",
        params={
            "access_token": access_token,
        },
    )

    return result["data"]


@router.get("/meta/wabas", dependencies=[Depends(require_permission("pilot.settings.manage"))])
def get_wabas(
    business_id: str,
    access_token: str,
):
    result = meta_get(
        f"https://graph.facebook.com/v22.0/{business_id}/owned_whatsapp_business_accounts",
        params={
            "access_token": access_token,
        },
    )

    return result["data"]

@router.get("/meta/phone-numbers", dependencies=[Depends(require_permission("pilot.settings.manage"))])
def get_phone_numbers(
    waba_id: str,
    access_token: str,
):
    result = meta_get(
        f"https://graph.facebook.com/v22.0/{waba_id}/phone_numbers",
        params={
            "access_token": access_token,
        },
    )

    return result["data"]


@router.post("/meta/oauth/onboard", dependencies=[Depends(require_permission("pilot.settings.manage"))])
def onboard_whatsapp(
    body: OnboardWhatsappRequest,
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]
    actor_id = str(tenant.get("user_id") or "")
    with engine.begin() as conn:
        conn.execute(text("""
          insert into pilot_meta_onboarding_events(org_id,status,waba_id,phone_number_id,actor_id)
          values(:org_id,'STARTED',:waba_id,:phone_number_id,:actor_id)
        """), {"org_id":org_id,"waba_id":body.waba_id,"phone_number_id":body.phone_number_id,"actor_id":actor_id})
    try:
        access_token = _exchange_oauth_code(body.code, embedded=True)
    except HTTPException as exc:
        _record_onboarding_failure(org_id, actor_id, body, "exchange_code", exc.detail)
        raise

    if body.waba_id and body.phone_number_id:
        phone_result = meta_get(
            f"https://graph.facebook.com/{settings.meta_wa_api_version}/{body.phone_number_id}",
            params={"fields":"display_phone_number,verified_name,quality_rating", "access_token":access_token},
        )
        if not phone_result["ok"]:
            _record_onboarding_failure(org_id, actor_id, body, "get_phone_number", phone_result["data"])
            _raise_meta_error("get_phone_number", 400, phone_result["data"])
        waba_result = meta_get(
            f"https://graph.facebook.com/{settings.meta_wa_api_version}/{body.waba_id}",
            params={"fields":"name", "access_token":access_token},
        )
        if not waba_result["ok"]:
            _record_onboarding_failure(org_id, actor_id, body, "get_waba", waba_result["data"])
            _raise_meta_error("get_waba", 400, waba_result["data"])
        phone = phone_result["data"]
        connection = create_whatsapp_connection(
            org_id=org_id,
            business_id=body.business_id or body.waba_id,
            waba_id=body.waba_id,
            phone_number_id=body.phone_number_id,
            display_phone_number=phone.get("display_phone_number"),
            verified_name=phone.get("verified_name"),
            access_token=access_token,
            account_name=waba_result["data"].get("name"),
        )
        subscription = subscribe_app_to_waba_webhooks(body.waba_id, access_token)
        webhook_status = "SUBSCRIBED" if subscription["ok"] else "FAILED"
        update_waba_webhook_status(
            org_id=org_id, waba_id=body.waba_id, status=webhook_status,
            raw_response=subscription["data"],
            error_message=None if subscription["ok"] else str(subscription["data"]),
        )
        if not subscription["ok"]:
            _record_onboarding_failure(org_id, actor_id, body, "subscribe_webhook", subscription["data"])
            _raise_meta_error("subscribe_webhook", 502, subscription["data"])
        with engine.begin() as conn:
            conn.execute(text("""
              insert into pilot_meta_onboarding_events(
                org_id,status,waba_id,phone_number_id,actor_id,metadata
              ) values(:org_id,'CONNECTED',:waba_id,:phone_number_id,:actor_id,
                       cast(:metadata as jsonb))
            """), {"org_id":org_id,"waba_id":body.waba_id,"phone_number_id":body.phone_number_id,
                    "actor_id":actor_id,"metadata":json.dumps({"webhook_status":webhook_status})})
        return {
            "status":"ok", "business_count":1, "connection_count":1,
            "connections":[_public_connection(connection)],
            "webhook_subscriptions":[{"waba_id":body.waba_id,"status":webhook_status}],
        }
    businesses = _get_meta_collection(
        "get_businesses",
        "https://graph.facebook.com/v22.0/me/businesses",
        access_token,
    )
    connections = []
    webhook_subscriptions = []

    for business in businesses:
        business_id = business["id"]
        wabas = _get_meta_collection(
            "get_wabas",
            f"https://graph.facebook.com/v22.0/{business_id}/owned_whatsapp_business_accounts",
            access_token,
        )

        for waba in wabas:
            waba_id = waba["id"]
            upsert_whatsapp_account(
                org_id=org_id,
                provider="META",
                business_id=business_id,
                waba_id=waba_id,
                account_name=waba.get("name"),
                access_token=access_token,
                connection_status="CONNECTED",
                is_default=not connections,
            )
            phone_numbers = _get_meta_collection(
                "get_phone_numbers",
                f"https://graph.facebook.com/v22.0/{waba_id}/phone_numbers",
                access_token,
            )

            for phone_number in phone_numbers:
                connection = create_whatsapp_connection(
                    org_id=org_id,
                    business_id=business_id,
                    waba_id=waba_id,
                    phone_number_id=phone_number["id"],
                    display_phone_number=phone_number.get("display_phone_number"),
                    verified_name=phone_number.get("verified_name"),
                    access_token=access_token,
                    account_name=waba.get("name"),
                )
                connections.append(_public_connection(connection))

            subscription = subscribe_app_to_waba_webhooks(
                waba_id=waba_id,
                access_token=access_token,
            )
            update_waba_webhook_status(
                org_id=org_id,
                waba_id=waba_id,
                status="SUBSCRIBED" if subscription["ok"] else "FAILED",
                raw_response=subscription["data"],
                error_message=None if subscription["ok"] else str(subscription["data"]),
            )
            webhook_subscriptions.append({
                "waba_id": waba_id,
                "status": "SUBSCRIBED" if subscription["ok"] else "FAILED",
            })

    return {
        "status": "ok",
        "business_count": len(businesses),
        "connection_count": len(connections),
        "connections": connections,
        "webhook_subscriptions": webhook_subscriptions,
    }


@router.post("/meta/connections", dependencies=[Depends(require_permission("pilot.settings.manage"))])
def save_whatsapp_connection(
    body: SaveWhatsappConnectionRequest,
    tenant=Depends(get_current_tenant),
):
    connection = create_whatsapp_connection(
        org_id=tenant["org_id"],
        business_id=body.business_id,
        waba_id=body.waba_id,
        phone_number_id=body.phone_number_id,
        display_phone_number=body.display_phone_number,
        verified_name=body.verified_name,
        access_token=body.access_token,
        account_name=body.account_name,
    )

    return {
        "status": "ok",
        "connection": _public_connection(connection),
    }


@router.post("/meta/waba/webhook/subscribe", dependencies=[Depends(require_permission("pilot.settings.manage"))])
def subscribe_waba_webhook(
    body: SubscribeWabaWebhookRequest,
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]
    account = get_whatsapp_account_by_waba(
        org_id=org_id,
        waba_id=body.waba_id,
    )

    if not account:
        raise HTTPException(
            status_code=404,
            detail="WhatsApp account not found",
        )

    result = subscribe_app_to_waba_webhooks(
        waba_id=body.waba_id,
        access_token=body.access_token,
    )

    if result["ok"]:
        account = update_waba_webhook_status(
            org_id=org_id,
            waba_id=body.waba_id,
            status="SUBSCRIBED",
            raw_response=result["data"],
            error_message=None,
        )

        return {
            "status": "ok",
            "webhook_status": "SUBSCRIBED",
            "account": account,
            "meta_response": result["data"],
        }

    account = update_waba_webhook_status(
        org_id=org_id,
        waba_id=body.waba_id,
        status="FAILED",
        raw_response=result["data"],
        error_message=str(result["data"]),
    )

    return {
        "status": "failed",
        "webhook_status": "FAILED",
        "account": account,
        "meta_response": result["data"],
    }


@router.post("/meta/waba/webhook/check", dependencies=[Depends(require_permission("pilot.settings.manage"))])
def check_waba_webhook(
    body: CheckWabaWebhookRequest,
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]
    account = get_whatsapp_account_by_waba(
        org_id=org_id,
        waba_id=body.waba_id,
    )

    if not account:
        raise HTTPException(
            status_code=404,
            detail="WhatsApp account not found",
        )

    result = get_waba_subscribed_apps(
        waba_id=body.waba_id,
        access_token=body.access_token,
    )

    status = "SUBSCRIBED" if result["ok"] else "FAILED"

    account = update_waba_webhook_status(
        org_id=org_id,
        waba_id=body.waba_id,
        status=status,
        raw_response=result["data"],
        error_message=None if result["ok"] else str(result["data"]),
    )

    return {
        "status": "ok" if result["ok"] else "failed",
        "webhook_status": status,
        "account": account,
        "meta_response": result["data"],
    }
