from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.tenant_context import get_current_tenant
from app.db.whatsapp_template_repository import (
    create_whatsapp_template,
    list_whatsapp_templates,
    get_template_by_key,
    update_meta_template_by_name,
    update_meta_template_sync,
)
from app.db.whatsapp_account_repository import get_whatsapp_account_by_waba
from app.services.meta_template_service import (
    create_meta_template,
    list_meta_templates,
)
from app.services.whatsapp_template_service import send_whatsapp_template


router = APIRouter()



class CreateTemplateRequest(BaseModel):
    template_key: str
    template_name: str
    content_sid: str
    language: str = "fr"
    category: str | None = None
    description: str | None = None
    variables: dict | None = None
    provider: Literal["meta"] = "meta"
    status: str = "APPROVED"


class SendTemplateRequest(BaseModel):
    recipient_phone: str
    variables: dict | None = None


class CreateMetaTemplateRequest(BaseModel):
    waba_id: str
    template_key: str
    template_name: str
    category: str
    language: str = "fr"
    body_text: str
    variables: dict | None = None


class SyncMetaTemplatesRequest(BaseModel):
    waba_id: str


def _get_meta_account(org_id: str, waba_id: str):
    account = get_whatsapp_account_by_waba(
        org_id=org_id,
        waba_id=waba_id,
    )

    if not account or not account.get("access_token"):
        raise HTTPException(
            status_code=404,
            detail="Connected Meta WABA not found",
        )

    return account


@router.post("/whatsapp/templates")
def create_template(body: CreateTemplateRequest, tenant=Depends(get_current_tenant)):
    org_id = tenant["org_id"]

    template = create_whatsapp_template(
        org_id=org_id,
        template_key=body.template_key,
        template_name=body.template_name,
        content_sid=body.content_sid,
        language=body.language,
        category=body.category,
        description=body.description,
        variables=body.variables,
        provider=body.provider,
        status=body.status,
    )

    return {
        "status": "ok",
        "template": template,
    }


@router.post("/whatsapp/templates/meta")
def create_managed_meta_template(
    body: CreateMetaTemplateRequest,
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]
    account = _get_meta_account(org_id, body.waba_id)
    meta_result = create_meta_template(
        waba_id=body.waba_id,
        access_token=account["access_token"],
        template_name=body.template_name,
        category=body.category,
        language=body.language,
        body_text=body.body_text,
    )

    status = (
        (meta_result["data"].get("status") or "PENDING")
        if meta_result["ok"]
        else "REJECTED"
    )
    template = create_whatsapp_template(
        org_id=org_id,
        template_key=body.template_key,
        template_name=body.template_name,
        content_sid=meta_result["data"].get("id") or body.template_name,
        language=body.language,
        category=body.category,
        variables=body.variables,
        provider="meta",
        status=status,
    )
    template = update_meta_template_sync(
        template_id=str(template["id"]),
        status=status,
        meta_template_id=meta_result["data"].get("id"),
        body_text=body.body_text,
        rejection_reason=None if meta_result["ok"] else str(meta_result["data"]),
        raw_payload=meta_result["data"],
    )

    return {
        "status": "ok" if meta_result["ok"] else "failed",
        "template": template,
        "meta_response": meta_result["data"],
    }


@router.post("/whatsapp/templates/meta/sync")
def sync_managed_meta_templates(
    body: SyncMetaTemplatesRequest,
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]
    account = _get_meta_account(org_id, body.waba_id)
    meta_result = list_meta_templates(
        waba_id=body.waba_id,
        access_token=account["access_token"],
    )

    if not meta_result["ok"]:
        raise HTTPException(
            status_code=400,
            detail=meta_result["data"],
        )

    updated = []

    for item in meta_result["data"].get("data") or []:
        template = update_meta_template_by_name(
            org_id=org_id,
            template_name=item["name"],
            language=item.get("language") or "fr",
            status=item.get("status") or "PENDING",
            meta_template_id=item.get("id"),
            quality_score=(item.get("quality_score") or {}).get("score"),
            raw_payload=item,
        )

        if template:
            updated.append(template)

    return {
        "status": "ok",
        "count": len(updated),
        "templates": updated,
    }


@router.get("/whatsapp/templates")
def list_templates(limit: int = 100, tenant=Depends(get_current_tenant)):
    org_id = tenant["org_id"]

    templates = list_whatsapp_templates(
        org_id=org_id,
        limit=limit,
    )

    return {
        "status": "ok",
        "count": len(templates),
        "templates": templates,
    }


@router.get("/whatsapp/templates/{template_key}")
def get_template(template_key: str, tenant=Depends(get_current_tenant)):
    org_id = tenant["org_id"]

    template = get_template_by_key(
        org_id=org_id,
        template_key=template_key,
    )

    if not template:
        raise HTTPException(
            status_code=404,
            detail="Template not found",
        )

    return {
        "status": "ok",
        "template": template,
    }


@router.post("/whatsapp/templates/{template_key}/send")
def send_template(
    template_key: str,
    body: SendTemplateRequest,
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]

    result = send_whatsapp_template(
        org_id=org_id,
        template_key=template_key,
        recipient_phone=body.recipient_phone,
        variables=body.variables,
    )

    if result.get("status") == "error":
        raise HTTPException(
            status_code=404,
            detail=result.get("message"),
        )

    return result
