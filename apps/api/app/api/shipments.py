from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from app.core.tenant_context import get_current_tenant
from app.core.permissions import require_permission
from app.services.dossier_document_storage import create_document_download_url,upload_private_document
from app.expeditions.repository import (
    add_document,
    add_financial_line,
    add_note,
    add_package_to_expedition,
    archive_expedition,
    create_anomaly,
    create_expedition,
    create_notification,
    expedition_stats,
    expedition_analytics,
    expedition_timeline,
    export_expeditions,
    export_manifest,
    get_expedition,
    list_expeditions,
    remove_package_from_expedition,
    resolve_anomaly,
    update_checkpoint,
    update_expedition,
)


router = APIRouter()


class ExpeditionPayload(BaseModel):
    expected_version: int | None = Field(default=None, ge=1)
    expedition_reference: str | None = None
    route_id: str | None = None
    shipping_service_id: str | None = None
    origin_warehouse_id: str | None = None
    destination_office_id: str | None = None
    departure_id: str | None = None
    title: str | None = None
    status: str | None = None
    mode: str | None = None
    service_type: str | None = None
    risk_level: str | None = None
    financial_status: str | None = None
    origin_country: str | None = None
    origin_city: str | None = None
    origin_warehouse: str | None = None
    destination_country: str | None = None
    destination_city: str | None = None
    destination_warehouse: str | None = None
    route_label: str | None = None
    carrier_name: str | None = None
    flight_number: str | None = None
    vessel_name: str | None = None
    container_number: str | None = None
    awb_number: str | None = None
    bl_number: str | None = None
    batch_reference: str | None = None
    manifest_reference: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    planned_departure_at: str | None = None
    departed_at: str | None = None
    eta_at: str | None = None
    arrived_at: str | None = None
    delivered_at: str | None = None
    is_delayed: bool | None = False
    delay_reason: str | None = None
    currency: str | None = "USD"
    notes: str | None = None


class PackageAssignmentPayload(BaseModel):
    package_id: str


class CheckpointPayload(BaseModel):
    status: str | None = None
    planned_at: str | None = None
    completed_at: str | None = None
    location: str | None = None
    notes: str | None = None


class DocumentPayload(BaseModel):
    document_type: str = "DOCUMENT"
    file_url: str
    file_name: str | None = None
    mime_type: str | None = None
    visibility: str = "INTERNAL"
    notes: str | None = None


class FinancialLinePayload(BaseModel):
    line_type: str = "OTHER"
    category: str | None = None
    description: str | None = None
    amount: float = Field(default=0, ge=0)
    currency: str = "USD"
    direction: Literal["COST", "REVENUE"] = "COST"
    status: str = "PENDING"
    client_id: str | None = None
    dossier_id: str | None = None
    package_id: str | None = None
    due_at: str | None = None
    paid_at: str | None = None


class AnomalyPayload(BaseModel):
    anomaly_type: str = "OPERATIONAL"
    severity: str = "MEDIUM"
    title: str
    description: str | None = None


class ResolveAnomalyPayload(BaseModel):
    notes: str | None = None


class NotificationPayload(BaseModel):
    channel: str = "whatsapp"
    audience: str = "ALL_CLIENTS"
    recipient: str | None = None
    notification_type: str = "EXPEDITION_UPDATE"
    message: str


class NotePayload(BaseModel):
    note: str
    priority: str = "NORMAL"
    visibility: str = "PRIVATE"

class BulkNotificationPayload(NotificationPayload):
    shipment_ids:list[str]=Field(min_length=1,max_length=100)


def _tenant_ids(tenant: dict) -> tuple[str, str]:
    return tenant["org_id"], tenant.get("user_id") or tenant.get("clerk_user_id") or "system"


@router.get("/shipments",dependencies=[Depends(require_permission("shipments.read"))])
def list_shipments(
    q: str | None = None,
    status: str | None = None,
    mode: str | None = None,
    risk_level: str | None = None,
    origin_country: str | None = None,
    destination_country: str | None = None,
    page: int = 1,
    page_size: int = 30,
    sort: str = "updated_desc",
    tenant=Depends(get_current_tenant),
):
    org_id, _ = _tenant_ids(tenant)
    data = list_expeditions(
        org_id,
        q=q,
        status=status,
        mode=mode,
        risk_level=risk_level,
        origin_country=origin_country,
        destination_country=destination_country,
        page=page,
        page_size=page_size,
        sort=sort,
    )
    return {"status": "ok", "items": data["items"], "shipments": data["items"], "pagination": data["pagination"]}


@router.get("/shipments/stats",dependencies=[Depends(require_permission("shipments.read"))])
def get_shipments_stats(tenant=Depends(get_current_tenant)):
    org_id, _ = _tenant_ids(tenant)
    return {"status": "ok", "stats": expedition_stats(org_id)}

@router.get("/shipments/analytics",dependencies=[Depends(require_permission("shipments.read"))])
def get_shipments_analytics(tenant=Depends(get_current_tenant)):
    org_id,_=_tenant_ids(tenant);return {"status":"ok","analytics":expedition_analytics(org_id)}


@router.get("/shipments/export",dependencies=[Depends(require_permission("shipments.read"))])
def export_shipments(
    q: str | None = None,
    status: str | None = None,
    mode: str | None = None,
    risk_level: str | None = None,
    origin_country: str | None = None,
    destination_country: str | None = None,
    sort: str = "updated_desc",
    tenant=Depends(get_current_tenant),
):
    org_id, _ = _tenant_ids(tenant)
    csv_data = export_expeditions(
        org_id,
        q=q,
        status=status,
        mode=mode,
        risk_level=risk_level,
        origin_country=origin_country,
        destination_country=destination_country,
        sort=sort,
    )
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=expeditions.csv"},
    )


@router.post("/shipments",dependencies=[Depends(require_permission("shipments.create"))])
def create_shipment(payload: ExpeditionPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    try:
        expedition = create_expedition(org_id, user_id, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.get("/shipments/{shipment_id}",dependencies=[Depends(require_permission("shipments.read"))])
def get_shipment(shipment_id: str, tenant=Depends(get_current_tenant)):
    org_id, _ = _tenant_ids(tenant)
    expedition = get_expedition(org_id, shipment_id)
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.patch("/shipments/{shipment_id}",dependencies=[Depends(require_permission("shipments.update"))])
def patch_shipment(shipment_id: str, payload: ExpeditionPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    try:
        values=payload.model_dump(exclude_unset=True);expected_version=values.pop("expected_version",None)
        expedition = update_expedition(org_id, shipment_id, user_id, values, expected_version)
    except ValueError as exc:
        raise HTTPException(status_code=409 if str(exc)=="stale_shipment_version" else 400, detail=str(exc)) from exc
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.delete("/shipments/{shipment_id}",dependencies=[Depends(require_permission("shipments.update"))])
def delete_shipment(shipment_id:str,expected_version:int|None=None,tenant=Depends(get_current_tenant)):
    org_id,user_id=_tenant_ids(tenant)
    try:archived=archive_expedition(org_id,shipment_id,user_id,expected_version)
    except ValueError as exc:raise HTTPException(status_code=409,detail=str(exc)) from exc
    if not archived:raise HTTPException(status_code=404,detail="Expedition not found")
    return {"status":"ok"}


@router.get("/shipments/{shipment_id}/timeline",dependencies=[Depends(require_permission("shipments.read"))])
def get_shipment_timeline(shipment_id: str, tenant=Depends(get_current_tenant)):
    org_id, _ = _tenant_ids(tenant)
    items = expedition_timeline(org_id, shipment_id)
    return {"status": "ok", "items": items}


@router.post("/shipments/{shipment_id}/packages",dependencies=[Depends(require_permission("shipments.update"))])
def attach_package(shipment_id: str, payload: PackageAssignmentPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = add_package_to_expedition(org_id, shipment_id, payload.package_id, user_id)
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition or package not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.delete("/shipments/{shipment_id}/packages/{package_id}",dependencies=[Depends(require_permission("shipments.update"))])
def detach_package(shipment_id: str, package_id: str, reason: str | None = None, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = remove_package_from_expedition(org_id, shipment_id, package_id, user_id, reason)
    if not expedition:
        raise HTTPException(status_code=404, detail="Package assignment not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.patch("/shipments/{shipment_id}/checkpoints/{checkpoint_key}",dependencies=[Depends(require_permission("shipments.update"))])
def patch_checkpoint(shipment_id: str, checkpoint_key: str, payload: CheckpointPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    try:
        expedition = update_checkpoint(org_id, shipment_id, checkpoint_key, user_id, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not expedition:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.post("/shipments/{shipment_id}/documents",dependencies=[Depends(require_permission("shipments.update"))])
def post_document(shipment_id: str, payload: DocumentPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = add_document(org_id, shipment_id, user_id, payload.model_dump(exclude_unset=True))
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.post("/shipments/{shipment_id}/documents/upload",dependencies=[Depends(require_permission("shipments.update"))])
async def upload_shipment_document(shipment_id:str,file:UploadFile=File(...),document_type:str=Form(default="DOCUMENT"),notes:str|None=Form(default=None),tenant=Depends(get_current_tenant)):
    allowed={"application/pdf","image/jpeg","image/png","image/webp","text/plain","application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
    if file.content_type not in allowed:raise HTTPException(status_code=415,detail="unsupported_document_type")
    content=await file.read()
    if not content or len(content)>26_214_400:raise HTTPException(status_code=413,detail="document_too_large")
    org_id,user_id=_tenant_ids(tenant);safe_name=Path(file.filename or "document").name;object_path=f"{org_id}/{shipment_id}/{uuid4().hex}-{safe_name}"
    try:upload_private_document(object_path,content,file.content_type,"shipment-documents")
    except Exception as exc:raise HTTPException(status_code=503,detail="document_storage_unavailable") from exc
    expedition=add_document(org_id,shipment_id,user_id,{"document_type":document_type,"file_url":f"private://shipment-documents/{object_path}","file_name":safe_name,"mime_type":file.content_type,"notes":notes,"size_bytes":len(content),"checksum_sha256":hashlib.sha256(content).hexdigest(),"object_path":object_path})
    if not expedition:raise HTTPException(status_code=404,detail="Expedition not found")
    return {"status":"ok","shipment":expedition}


@router.get("/shipments/{shipment_id}/documents/{document_id}/view",dependencies=[Depends(require_permission("shipments.read"))])
def view_shipment_document(shipment_id:str,document_id:str,tenant=Depends(get_current_tenant)):
    org_id,_=_tenant_ids(tenant);expedition=get_expedition(org_id,shipment_id)
    if not expedition:raise HTTPException(status_code=404,detail="Expedition not found")
    document=next((entry for entry in expedition["documents"] if str(entry["id"])==document_id),None)
    if not document:raise HTTPException(status_code=404,detail="Document not found")
    value=str(document.get("file_url") or "");prefix="private://shipment-documents/"
    if not value.startswith(prefix):return {"status":"ok","url":value}
    try:url=create_document_download_url(value[len(prefix):],bucket_name="shipment-documents")
    except Exception as exc:raise HTTPException(status_code=503,detail="document_storage_unavailable") from exc
    return {"status":"ok","url":url}


@router.post("/shipments/{shipment_id}/financial-lines",dependencies=[Depends(require_permission("shipments.update"))])
def post_financial_line(shipment_id: str, payload: FinancialLinePayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = add_financial_line(org_id, shipment_id, user_id, payload.model_dump(exclude_unset=True))
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.post("/shipments/{shipment_id}/anomalies",dependencies=[Depends(require_permission("shipments.update"))])
def post_anomaly(shipment_id: str, payload: AnomalyPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    try:
        expedition = create_anomaly(org_id, shipment_id, user_id, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.patch("/shipments/{shipment_id}/anomalies/{anomaly_id}/resolve",dependencies=[Depends(require_permission("shipments.update"))])
def patch_anomaly(shipment_id: str, anomaly_id: str, payload: ResolveAnomalyPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = resolve_anomaly(org_id, shipment_id, anomaly_id, user_id, payload.notes)
    if not expedition:
        raise HTTPException(status_code=404, detail="Anomaly not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.post("/shipments/{shipment_id}/notifications",dependencies=[Depends(require_permission("shipments.update"))])
def post_notification(shipment_id: str, payload: NotificationPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = create_notification(org_id, shipment_id, user_id, payload.model_dump(exclude_unset=True))
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}

@router.post("/shipments/notifications/bulk",dependencies=[Depends(require_permission("shipments.update"))])
def post_bulk_notification(payload:BulkNotificationPayload,tenant=Depends(get_current_tenant)):
    org_id,user_id=_tenant_ids(tenant);created=[];values=payload.model_dump(exclude={"shipment_ids"})
    for shipment_id in dict.fromkeys(payload.shipment_ids):
        if create_notification(org_id,shipment_id,user_id,values):created.append(shipment_id)
    return {"status":"ok","created":created,"count":len(created)}

@router.get("/shipments/{shipment_id}/manifest",dependencies=[Depends(require_permission("shipments.read"))])
def get_manifest(shipment_id:str,tenant=Depends(get_current_tenant)):
    org_id,_=_tenant_ids(tenant);content=export_manifest(org_id,shipment_id)
    if content is None:raise HTTPException(status_code=404,detail="Expedition not found")
    return Response(content=content,media_type="text/csv",headers={"Content-Disposition":f'attachment; filename="manifest-{shipment_id}.csv"'})


@router.post("/shipments/{shipment_id}/notes",dependencies=[Depends(require_permission("shipments.update"))])
def post_note(shipment_id: str, payload: NotePayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = add_note(org_id, shipment_id, user_id, payload.model_dump(exclude_unset=True))
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}
