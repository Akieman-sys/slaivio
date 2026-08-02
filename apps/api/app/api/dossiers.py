import csv
import hashlib
import io
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field, model_validator
from starlette.responses import StreamingResponse

from app.core.tenant_context import get_current_tenant
from app.core.permissions import require_permission
from app.db.dossier_repository import (
    DOSSIER_CASE_TYPES,
    DOSSIER_INTAKE_STATUSES,
    DOSSIER_PAYMENT_STATUSES,
    DOSSIER_STATUSES,
    DOSSIER_VALIDATION_STATUSES,
    archive_dossier,
    create_dossier,
    dossier_stats,
    dossier_timeline,
    export_dossiers,
    get_dossier,
    list_dossiers,
    restore_dossier,
    update_dossier,
)
from app.core.config import settings
from app.db.dossier_document_repository import (
    create_document,
    get_document,
    list_checklist,
    list_documents,
    update_checklist_item,
)
from app.services.dossier_document_storage import create_document_download_url, upload_private_document


router = APIRouter()


class DossierPayload(BaseModel):
    client_id: str
    case_type: str = "UNKNOWN"
    status_global: str = "LEAD"
    intake_status: str = "PARTIAL"
    validation_status: str = "PENDING"
    primary_channel: str = Field(default="manual", max_length=40)
    origin_country: str | None = Field(default=None, max_length=80)
    origin_city: str | None = Field(default=None, max_length=80)
    destination_country: str | None = Field(default=None, max_length=80)
    destination_city: str | None = Field(default=None, max_length=80)
    goods_type: str | None = Field(default=None, max_length=160)
    estimated_weight_kg: float | None = Field(default=None, ge=0)
    estimated_volume_cbm: float | None = Field(default=None, ge=0)
    shipping_mode: str | None = Field(default=None, max_length=80)
    tracking_id: str | None = Field(default=None, max_length=120)
    quoted_total: float | None = Field(default=None, ge=0)
    quoted_currency: str | None = Field(default=None, max_length=12)
    pricing_status: str | None = Field(default=None, max_length=40)
    final_total: float | None = Field(default=None, ge=0)
    final_currency: str | None = Field(default=None, max_length=12)
    payment_status: str = "PENDING"
    client_full_name: str | None = Field(default=None, max_length=180)
    supplier_payment_amount: float | None = Field(default=None, ge=0)
    supplier_payment_currency: str | None = Field(default=None, max_length=12)

    @model_validator(mode="after")
    def validate_dossier(self):
        if self.case_type not in DOSSIER_CASE_TYPES:
            raise ValueError("invalid_case_type")
        if self.status_global not in DOSSIER_STATUSES:
            raise ValueError("invalid_status_global")
        if self.intake_status not in DOSSIER_INTAKE_STATUSES:
            raise ValueError("invalid_intake_status")
        if self.validation_status not in DOSSIER_VALIDATION_STATUSES:
            raise ValueError("invalid_validation_status")
        if self.payment_status not in DOSSIER_PAYMENT_STATUSES:
            raise ValueError("invalid_payment_status")
        if self.status_global not in {"LEAD", "DRAFT"}:
            raise ValueError("invalid_initial_dossier_status")
        return self


class DossierPatchPayload(BaseModel):
    row_version: int = Field(ge=1)
    client_id: str | None = None
    case_type: str | None = None
    status_global: str | None = None
    intake_status: str | None = None
    validation_status: str | None = None
    primary_channel: str | None = Field(default=None, max_length=40)
    origin_country: str | None = Field(default=None, max_length=80)
    origin_city: str | None = Field(default=None, max_length=80)
    destination_country: str | None = Field(default=None, max_length=80)
    destination_city: str | None = Field(default=None, max_length=80)
    goods_type: str | None = Field(default=None, max_length=160)
    estimated_weight_kg: float | None = Field(default=None, ge=0)
    estimated_volume_cbm: float | None = Field(default=None, ge=0)
    shipping_mode: str | None = Field(default=None, max_length=80)
    tracking_id: str | None = Field(default=None, max_length=120)
    quoted_total: float | None = Field(default=None, ge=0)
    quoted_currency: str | None = Field(default=None, max_length=12)
    pricing_status: str | None = Field(default=None, max_length=40)
    final_total: float | None = Field(default=None, ge=0)
    final_currency: str | None = Field(default=None, max_length=12)
    payment_status: str | None = None
    client_full_name: str | None = Field(default=None, max_length=180)
    supplier_payment_amount: float | None = Field(default=None, ge=0)
    supplier_payment_currency: str | None = Field(default=None, max_length=12)

    @model_validator(mode="after")
    def validate_patch(self):
        if self.case_type is not None and self.case_type not in DOSSIER_CASE_TYPES:
            raise ValueError("invalid_case_type")
        if self.status_global is not None and self.status_global not in DOSSIER_STATUSES:
            raise ValueError("invalid_status_global")
        if self.intake_status is not None and self.intake_status not in DOSSIER_INTAKE_STATUSES:
            raise ValueError("invalid_intake_status")
        if self.validation_status is not None and self.validation_status not in DOSSIER_VALIDATION_STATUSES:
            raise ValueError("invalid_validation_status")
        if self.payment_status is not None and self.payment_status not in DOSSIER_PAYMENT_STATUSES:
            raise ValueError("invalid_payment_status")
        return self


class ChecklistPatchPayload(BaseModel):
    status: str
    row_version: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_status(self):
        if self.status not in {"PENDING", "COMPLETED", "NOT_APPLICABLE"}:
            raise ValueError("invalid_checklist_status")
        return self


def _user_id(tenant: dict) -> str:
    return str(tenant.get("user_id") or "")


def _validate_query_value(value: str | None, allowed: set[str], detail: str):
    if value and value not in allowed:
        raise HTTPException(status_code=422, detail=detail)


@router.get("/dossiers", dependencies=[Depends(require_permission("dossiers.read"))])
def dossiers_index(
    q: str | None = Query(default=None, max_length=120),
    status_global: str | None = None,
    case_type: str | None = None,
    intake_status: str | None = None,
    validation_status: str | None = None,
    payment_status: str | None = None,
    client_id: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    limit: int | None = Query(default=None, ge=1, le=100),
    sort: str = "updated_desc",
    tenant=Depends(get_current_tenant),
):
    _validate_query_value(status_global, DOSSIER_STATUSES, "invalid_status_global")
    _validate_query_value(case_type, DOSSIER_CASE_TYPES, "invalid_case_type")
    _validate_query_value(intake_status, DOSSIER_INTAKE_STATUSES, "invalid_intake_status")
    _validate_query_value(validation_status, DOSSIER_VALIDATION_STATUSES, "invalid_validation_status")
    _validate_query_value(payment_status, DOSSIER_PAYMENT_STATUSES, "invalid_payment_status")
    response = list_dossiers(
        tenant["org_id"],
        q=q,
        status_global=status_global,
        case_type=case_type,
        intake_status=intake_status,
        validation_status=validation_status,
        payment_status=payment_status,
        client_id=client_id,
        page=page,
        page_size=limit or page_size,
        sort=sort,
    )
    return {
        "status": "ok",
        "count": len(response["items"]),
        "dossiers": response["items"],
        **response,
    }


@router.get("/dossiers/stats", dependencies=[Depends(require_permission("dossiers.read"))])
def dossiers_stats(tenant=Depends(get_current_tenant)):
    return {"status": "ok", "stats": dossier_stats(tenant["org_id"])}


@router.get("/dossiers/archived", dependencies=[Depends(require_permission("dossiers.archive"))])
def dossiers_archived(
    q: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    tenant=Depends(get_current_tenant),
):
    response = list_dossiers(
        tenant["org_id"], q=q, page=page, page_size=page_size, archived=True
    )
    return {"status": "ok", "items": response["items"], "dossiers": response["items"], **response}


@router.get("/dossiers/export", dependencies=[Depends(require_permission("dossiers.export"))])
def dossiers_export(
    q: str | None = Query(default=None, max_length=120),
    status_global: str | None = None,
    case_type: str | None = None,
    intake_status: str | None = None,
    validation_status: str | None = None,
    payment_status: str | None = None,
    sort: str = "updated_desc",
    tenant=Depends(get_current_tenant),
):
    _validate_query_value(status_global, DOSSIER_STATUSES, "invalid_status_global")
    _validate_query_value(case_type, DOSSIER_CASE_TYPES, "invalid_case_type")
    _validate_query_value(intake_status, DOSSIER_INTAKE_STATUSES, "invalid_intake_status")
    _validate_query_value(validation_status, DOSSIER_VALIDATION_STATUSES, "invalid_validation_status")
    _validate_query_value(payment_status, DOSSIER_PAYMENT_STATUSES, "invalid_payment_status")
    rows = export_dossiers(
        tenant["org_id"],
        q=q,
        status_global=status_global,
        case_type=case_type,
        intake_status=intake_status,
        validation_status=validation_status,
        payment_status=payment_status,
        sort=sort,
    )
    output = io.StringIO()
    fieldnames = [
        "dossier_reference",
        "client_name",
        "client_phone",
        "case_type",
        "status_global",
        "intake_status",
        "validation_status",
        "origin_country",
        "origin_city",
        "destination_country",
        "destination_city",
        "goods_type",
        "estimated_weight_kg",
        "estimated_volume_cbm",
        "shipping_mode",
        "quoted_total",
        "quoted_currency",
        "final_total",
        "final_currency",
        "payment_status",
        "created_at",
        "updated_at",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in fieldnames})
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="slaivio-dossiers.csv"'},
    )


@router.post(
    "/dossiers",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("dossiers.create"))],
)
def dossiers_create(body: DossierPayload, tenant=Depends(get_current_tenant)):
    try:
        dossier = create_dossier(tenant["org_id"], _user_id(tenant), body.model_dump())
    except ValueError as exc:
        if str(exc) == "client_not_found":
            raise HTTPException(status_code=404, detail="client_not_found") from exc
        if str(exc) == "client_required":
            raise HTTPException(status_code=422, detail="client_required") from exc
        if str(exc) in {
            "quoted_currency_required", "final_currency_required",
            "supplier_payment_currency_required",
        }:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        raise
    return {"status": "ok", "dossier": dossier}


@router.get(
    "/dossiers/{dossier_id}",
    dependencies=[Depends(require_permission("dossiers.read"))],
)
def dossiers_show(dossier_id: str, tenant=Depends(get_current_tenant)):
    dossier = get_dossier(tenant["org_id"], dossier_id)
    if not dossier:
        raise HTTPException(status_code=404, detail="dossier_not_found")
    return {"status": "ok", "dossier": dossier, "data": dossier}


@router.get(
    "/dossiers/{dossier_id}/timeline",
    dependencies=[Depends(require_permission("dossiers.read"))],
)
def dossiers_timeline(dossier_id: str, tenant=Depends(get_current_tenant)):
    dossier = get_dossier(tenant["org_id"], dossier_id)
    if not dossier:
        raise HTTPException(status_code=404, detail="dossier_not_found")
    return {"status": "ok", "items": dossier_timeline(tenant["org_id"], dossier_id)}


@router.patch(
    "/dossiers/{dossier_id}",
    dependencies=[Depends(require_permission("dossiers.update"))],
)
def dossiers_update(dossier_id: str, body: DossierPatchPayload, tenant=Depends(get_current_tenant)):
    try:
        dossier = update_dossier(tenant["org_id"], dossier_id, _user_id(tenant), body.model_dump(exclude_unset=True))
    except ValueError as exc:
        if str(exc) == "client_not_found":
            raise HTTPException(status_code=404, detail="client_not_found") from exc
        if str(exc) in {"stale_dossier_version", "invalid_dossier_status_transition"}:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        if str(exc) in {
            "dossier_intake_incomplete", "dossier_not_validated", "dossier_route_incomplete",
            "quoted_currency_required", "final_currency_required",
            "supplier_payment_currency_required",
        }:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        raise
    if not dossier:
        raise HTTPException(status_code=404, detail="dossier_not_found")
    return {"status": "ok", "dossier": dossier}


@router.delete("/dossiers/{dossier_id}", dependencies=[Depends(require_permission("dossiers.archive"))])
def dossiers_archive(
    dossier_id: str,
    row_version: int = Query(ge=1),
    tenant=Depends(get_current_tenant),
):
    try:
        archived = archive_dossier(
            tenant["org_id"], dossier_id, _user_id(tenant), expected_version=row_version
        )
    except ValueError as exc:
        if str(exc) == "stale_dossier_version":
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        raise
    if not archived:
        raise HTTPException(status_code=404, detail="dossier_not_found")
    return {"status": "ok"}


@router.post("/dossiers/{dossier_id}/restore", dependencies=[Depends(require_permission("dossiers.archive"))])
def dossiers_restore(
    dossier_id: str,
    row_version: int = Query(ge=1),
    tenant=Depends(get_current_tenant),
):
    try:
        dossier = restore_dossier(
            tenant["org_id"], dossier_id, _user_id(tenant), expected_version=row_version
        )
    except ValueError as exc:
        if str(exc) == "stale_dossier_version":
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        raise
    if not dossier:
        raise HTTPException(status_code=404, detail="archived_dossier_not_found")
    return {"status": "ok", "dossier": dossier}


@router.get("/dossiers/{dossier_id}/documents", dependencies=[Depends(require_permission("dossiers.read"))])
def dossier_documents(dossier_id: str, tenant=Depends(get_current_tenant)):
    if not get_dossier(tenant["org_id"], dossier_id):
        raise HTTPException(status_code=404, detail="dossier_not_found")
    return {"status": "ok", "items": list_documents(tenant["org_id"], dossier_id)}


@router.post("/dossiers/{dossier_id}/documents", dependencies=[Depends(require_permission("dossiers.update"))])
async def dossier_document_upload(
    dossier_id: str, file: UploadFile = File(...),
    document_type: str = Form(default="OTHER"), notes: str | None = Form(default=None),
    tenant=Depends(get_current_tenant),
):
    if not get_dossier(tenant["org_id"], dossier_id):
        raise HTTPException(status_code=404, detail="dossier_not_found")
    if file.content_type not in {"application/pdf", "image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="unsupported_document_type")
    content = await file.read(settings.dossier_document_max_bytes + 1)
    if not content or len(content) > settings.dossier_document_max_bytes:
        raise HTTPException(status_code=413, detail="document_too_large")
    safe_name = Path(file.filename or "document").name
    object_path = f"{tenant['org_id']}/{dossier_id}/{uuid4().hex}-{safe_name}"
    try:
        upload_private_document(object_path, content, file.content_type)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    document = create_document(tenant["org_id"], dossier_id, _user_id(tenant), {
        "document_type": document_type[:50].upper(), "file_name": safe_name,
        "object_path": object_path, "mime_type": file.content_type,
        "size_bytes": len(content), "checksum_sha256": hashlib.sha256(content).hexdigest(),
        "notes": notes[:500] if notes else None,
    })
    return {"status": "ok", "document": document}


@router.get("/dossiers/{dossier_id}/documents/{document_id}/download", dependencies=[Depends(require_permission("dossiers.read"))])
def dossier_document_download(dossier_id: str, document_id: str, tenant=Depends(get_current_tenant)):
    document = get_document(tenant["org_id"], document_id)
    if not document or document["dossier_id"] != dossier_id:
        raise HTTPException(status_code=404, detail="document_not_found")
    try:
        url = create_document_download_url(document["object_path"])
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"status": "ok", "url": url, "expires_in": 300}


@router.get("/dossiers/{dossier_id}/checklist", dependencies=[Depends(require_permission("dossiers.read"))])
def dossier_checklist(dossier_id: str, tenant=Depends(get_current_tenant)):
    if not get_dossier(tenant["org_id"], dossier_id):
        raise HTTPException(status_code=404, detail="dossier_not_found")
    return {"status": "ok", "items": list_checklist(tenant["org_id"], dossier_id)}


@router.patch("/dossiers/{dossier_id}/checklist/{item_id}", dependencies=[Depends(require_permission("dossiers.update"))])
def dossier_checklist_update(dossier_id: str, item_id: str, body: ChecklistPatchPayload, tenant=Depends(get_current_tenant)):
    item = update_checklist_item(tenant["org_id"], dossier_id, item_id, _user_id(tenant), body.status, body.row_version)
    if not item:
        raise HTTPException(status_code=409, detail="stale_checklist_version")
    return {"status": "ok", "item": item}
