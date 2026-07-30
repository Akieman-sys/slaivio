from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.core.tenant_context import get_current_tenant
from app.expeditions.repository import (
    add_document,
    add_financial_line,
    add_note,
    add_package_to_expedition,
    create_anomaly,
    create_expedition,
    create_notification,
    expedition_stats,
    expedition_timeline,
    export_expeditions,
    get_expedition,
    list_expeditions,
    remove_package_from_expedition,
    resolve_anomaly,
    update_checkpoint,
    update_expedition,
)


router = APIRouter()


class ExpeditionPayload(BaseModel):
    expedition_reference: str | None = None
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


def _tenant_ids(tenant: dict) -> tuple[str, str]:
    return tenant["org_id"], tenant.get("user_id") or tenant.get("clerk_user_id") or "system"


@router.get("/shipments")
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


@router.get("/shipments/stats")
def get_shipments_stats(tenant=Depends(get_current_tenant)):
    org_id, _ = _tenant_ids(tenant)
    return {"status": "ok", "stats": expedition_stats(org_id)}


@router.get("/shipments/export")
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


@router.post("/shipments")
def create_shipment(payload: ExpeditionPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    try:
        expedition = create_expedition(org_id, user_id, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.get("/shipments/{shipment_id}")
def get_shipment(shipment_id: str, tenant=Depends(get_current_tenant)):
    org_id, _ = _tenant_ids(tenant)
    expedition = get_expedition(org_id, shipment_id)
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.patch("/shipments/{shipment_id}")
def patch_shipment(shipment_id: str, payload: ExpeditionPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    try:
        expedition = update_expedition(org_id, shipment_id, user_id, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.get("/shipments/{shipment_id}/timeline")
def get_shipment_timeline(shipment_id: str, tenant=Depends(get_current_tenant)):
    org_id, _ = _tenant_ids(tenant)
    items = expedition_timeline(org_id, shipment_id)
    return {"status": "ok", "items": items}


@router.post("/shipments/{shipment_id}/packages")
def attach_package(shipment_id: str, payload: PackageAssignmentPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = add_package_to_expedition(org_id, shipment_id, payload.package_id, user_id)
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition or package not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.delete("/shipments/{shipment_id}/packages/{package_id}")
def detach_package(shipment_id: str, package_id: str, reason: str | None = None, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = remove_package_from_expedition(org_id, shipment_id, package_id, user_id, reason)
    if not expedition:
        raise HTTPException(status_code=404, detail="Package assignment not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.patch("/shipments/{shipment_id}/checkpoints/{checkpoint_key}")
def patch_checkpoint(shipment_id: str, checkpoint_key: str, payload: CheckpointPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    try:
        expedition = update_checkpoint(org_id, shipment_id, checkpoint_key, user_id, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not expedition:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.post("/shipments/{shipment_id}/documents")
def post_document(shipment_id: str, payload: DocumentPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = add_document(org_id, shipment_id, user_id, payload.model_dump(exclude_unset=True))
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.post("/shipments/{shipment_id}/financial-lines")
def post_financial_line(shipment_id: str, payload: FinancialLinePayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = add_financial_line(org_id, shipment_id, user_id, payload.model_dump(exclude_unset=True))
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.post("/shipments/{shipment_id}/anomalies")
def post_anomaly(shipment_id: str, payload: AnomalyPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    try:
        expedition = create_anomaly(org_id, shipment_id, user_id, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.patch("/shipments/{shipment_id}/anomalies/{anomaly_id}/resolve")
def patch_anomaly(shipment_id: str, anomaly_id: str, payload: ResolveAnomalyPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = resolve_anomaly(org_id, shipment_id, anomaly_id, user_id, payload.notes)
    if not expedition:
        raise HTTPException(status_code=404, detail="Anomaly not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.post("/shipments/{shipment_id}/notifications")
def post_notification(shipment_id: str, payload: NotificationPayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = create_notification(org_id, shipment_id, user_id, payload.model_dump(exclude_unset=True))
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}


@router.post("/shipments/{shipment_id}/notes")
def post_note(shipment_id: str, payload: NotePayload, tenant=Depends(get_current_tenant)):
    org_id, user_id = _tenant_ids(tenant)
    expedition = add_note(org_id, shipment_id, user_id, payload.model_dump(exclude_unset=True))
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    return {"status": "ok", "shipment": expedition, "expedition": expedition}
