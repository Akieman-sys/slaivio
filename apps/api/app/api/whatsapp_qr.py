from datetime import datetime, timezone
import base64
import binascii
import json
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.webhook import process_normalized_whatsapp_message
from app.core.auth import get_current_manager
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant
from app.core.websocket_manager import manager
from app.db.whatsapp_number_repository import upsert_whatsapp_number
from app.db.whatsapp_qr_repository import (
    create_or_restart_connection, disable_linked_number, finish_event, get_connection, link_number,
    revoke_connection, store_event, update_connection_from_gateway,
)
from app.models.message import NormalizedMessage
from app.services.pilot_inbound_ai_dispatch import run_pilot_inbox_ai
from app.services.dossier_document_storage import upload_private_document
from app.services.whatsapp_qr_gateway_client import qr_gateway_request, verify_gateway_signature


router = APIRouter(tags=["whatsapp-qr"])

_MAX_INBOUND_MEDIA_BYTES = 12 * 1024 * 1024
_MEDIA_EXTENSIONS = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
    "video/mp4": "mp4", "application/pdf": "pdf",
}


def _store_inbound_media(org_id: str, connection_id: str, payload: dict) -> dict:
    encoded = payload.pop("media_base64", None)
    if not encoded:
        return {}
    if not isinstance(encoded, str) or len(encoded) > (_MAX_INBOUND_MEDIA_BYTES * 4 // 3) + 16:
        raise ValueError("qr_inbound_media_too_large")
    try:
        content = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("qr_inbound_media_invalid") from exc
    if not content or len(content) > _MAX_INBOUND_MEDIA_BYTES:
        raise ValueError("qr_inbound_media_too_large")
    mime_type = str(payload.get("media_mime_type") or "application/octet-stream").split(";", 1)[0].lower()
    extension = _MEDIA_EXTENSIONS.get(mime_type, "bin")
    message_id = re.sub(r"[^A-Za-z0-9_-]", "_", str(payload.get("provider_message_id") or uuid.uuid4()))[:180]
    object_path = f"whatsapp/{org_id}/{connection_id}/{message_id}.{extension}"
    # Callback retries are idempotent: the same provider message replaces the
    # same private object if persistence failed after a successful upload.
    upload_private_document(object_path, content, mime_type, upsert=True)
    return {
        "media_object_path": object_path,
        "media_mime_type": mime_type,
        "media_file_name": str(payload.get("media_file_name") or f"media.{extension}")[:255],
        "media_size_bytes": len(content),
    }


def _actor(manager: dict) -> str:
    return str(manager.get("user_id") or manager.get("id"))


class QRStart(BaseModel):
    terms_accepted: bool


@router.post("/organization/admin/pilot/whatsapp-qr/start", dependencies=[Depends(require_permission("pilot.whatsapp_qr.connect"))])
def start_qr_connection(body: QRStart, tenant=Depends(get_current_tenant), manager=Depends(get_current_manager)):
    connection = create_or_restart_connection(tenant["org_id"], _actor(manager), body.terms_accepted)
    gateway = qr_gateway_request("POST", f"/connections/{connection['id']}/start", {"org_id": tenant["org_id"]})
    return {"status": "ok", "connection": {**connection, **gateway}}


@router.get("/organization/admin/pilot/whatsapp-qr/status", dependencies=[Depends(require_permission("pilot.settings.read"))])
def qr_connection_status(tenant=Depends(get_current_tenant)):
    connection = get_connection(tenant["org_id"])
    if not connection:
        return {"status": "ok", "connection": None}
    gateway = {}
    if connection["status"] not in {"REVOKED", "LOGGED_OUT"}:
        try:
            gateway = qr_gateway_request("GET", f"/connections/{connection['id']}")
        except ValueError:
            gateway = {"gateway_reachable": False}
    return {"status": "ok", "connection": {**connection, **gateway}}


@router.post("/organization/admin/pilot/whatsapp-qr/{connection_id}/disconnect", dependencies=[Depends(require_permission("pilot.whatsapp_qr.disconnect"))])
def disconnect_qr_connection(connection_id: str, tenant=Depends(get_current_tenant), manager=Depends(get_current_manager)):
    connection = get_connection(tenant["org_id"], connection_id)
    if not connection:
        raise HTTPException(404, "pilot_whatsapp_qr_connection_not_found")
    try:
        qr_gateway_request("POST", f"/connections/{connection_id}/logout", {"org_id": tenant["org_id"]})
    finally:
        revoked = revoke_connection(tenant["org_id"], connection_id, _actor(manager))
    return {"status": "ok", "connection": revoked}


@router.post("/internal/whatsapp-qr/events")
async def receive_qr_gateway_event(request: Request):
    raw = await request.body()
    timestamp = request.headers.get("X-Slaivio-Timestamp")
    signature = request.headers.get("X-Slaivio-Signature")
    if not verify_gateway_signature("POST", request.url.path, raw, timestamp, signature):
        raise HTTPException(401, "invalid_qr_gateway_signature")
    try:
        event = json.loads(raw)
        org_id = str(event["org_id"])
        connection_id = str(uuid.UUID(event["connection_id"]))
        event_type = str(event["event_type"]).upper()
        event_key = str(event["event_key"])
        payload = event.get("payload") or {}
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(422, "invalid_qr_gateway_event")
    if event_type not in {"QR_READY", "CONNECTING", "CONNECTED", "DISCONNECTED", "LOGGED_OUT", "FAILED", "MESSAGE_RECEIVED"}:
        raise HTTPException(422, "unsupported_qr_gateway_event")
    connection = get_connection(org_id, connection_id)
    if not connection:
        raise HTTPException(404, "pilot_whatsapp_qr_connection_not_found")
    # Never copy binary base64 into audit/raw-payload tables.
    media_base64 = payload.get("media_base64")
    audit_payload = {key: value for key, value in payload.items() if key != "media_base64"}
    if not store_event(org_id, connection_id, event_key, event_type, audit_payload):
        return {"status": "duplicate"}
    try:
        updated = update_connection_from_gateway(connection_id, org_id, event_type, audit_payload)
        if event_type == "CONNECTED":
            linked_jid = str(payload.get("linked_jid") or "").strip()
            phone = str(payload.get("phone_number") or "").strip()
            if not linked_jid or not phone:
                raise ValueError("qr_connected_identity_missing")
            number = upsert_whatsapp_number(
                org_id=org_id, provider="QR_LINKED_DEVICE", phone_number_id=linked_jid,
                display_phone_number=phone, verified_name=payload.get("verified_name") or "WhatsApp lié",
                connection_status="CONNECTED", is_default=True,
                provider_metadata={"connection_id": connection_id, "transport": "linked_device", "temporary_pilot": True},
            )
            link_number(connection_id, org_id, str(number["id"]))
        elif event_type in {"DISCONNECTED", "LOGGED_OUT", "FAILED"}:
            disable_linked_number(connection_id, org_id, event_type)
        elif event_type == "MESSAGE_RECEIVED":
            if payload.get("is_newsletter"):
                finish_event(org_id, event_key, "PROCESSED")
                return {"status": "ignored", "reason": "whatsapp_newsletter"}
            media_payload = dict(audit_payload)
            if media_base64:
                media_payload["media_base64"] = media_base64
            media = _store_inbound_media(org_id, connection_id, media_payload)
            received = payload.get("received_at")
            try:
                received_at = datetime.fromisoformat(str(received).replace("Z", "+00:00"))
            except (TypeError, ValueError):
                received_at = datetime.now(timezone.utc)
            normalized = NormalizedMessage(
                provider_message_id=payload.get("provider_message_id"),
                from_phone=str(payload.get("from_phone") or payload.get("sender_jid") or "unknown"), to_phone=payload.get("to_phone"),
                text_body=payload.get("text_body"), message_type=payload.get("message_type") or "text",
                received_at=received_at, dedupe_key=str(payload.get("provider_message_id") or event_key),
                conversation_jid=payload.get("group_jid"),
                sender_name=payload.get("sender_name"),
                conversation_name=payload.get("group_name"),
                is_group=bool(payload.get("group_jid")),
                sender_jid=payload.get("sender_jid"),
                **media,
            )
            number_id = connection.get("whatsapp_number_id") or updated.get("whatsapp_number_id")
            result = await process_normalized_whatsapp_message(
                normalized, audit_payload, org_id=org_id, provider="QR_LINKED_DEVICE",
                provider_phone_number_id=connection.get("linked_jid"), whatsapp_number_id=number_id,
                number_role="SUPPORT",
            )
            if result.get("status") != "duplicate":
                conversation_key = normalized.conversation_jid or normalized.from_phone
                await manager.broadcast_to_org(org_id, {"event": "NEW_MESSAGE", "org_id": org_id,
                    "phone": conversation_key, "sender_phone": normalized.from_phone,
                    "sender_name": normalized.sender_name, "is_group": normalized.is_group,
                    "message": normalized.text_body, "direction": "inbound"})
                # Group discussions can involve several people and must remain
                # under human control until group-aware AI policies exist.
                if not normalized.is_group:
                    await run_pilot_inbox_ai(org_id, normalized.from_phone, normalized.text_body or "", "SUPPORT", f"whatsapp:{normalized.dedupe_key}")
        finish_event(org_id, event_key, "PROCESSED")
        return {"status": "processed"}
    except Exception as exc:
        finish_event(org_id, event_key, "FAILED", str(exc)[:1000])
        raise
