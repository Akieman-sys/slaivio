import csv
import hashlib
import io
from datetime import datetime
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
from app.db.dossier_collaboration_repository import (
    create_note,
    delete_note,
    list_active_members,
    list_notes,
    update_collaboration,
    update_note,
)
from app.db.dossier_alert_repository import (
    acknowledge_dossier_alert,
    list_dossier_alerts,
    refresh_dossier_alerts,
)
from app.services.dossier_document_storage import create_document_download_url, upload_private_document
from app.clients.repository import CLIENT_SOURCES, CLIENT_STATUSES, CLIENT_TYPES
from app.db.dossier_client_repository import (
    DuplicateDossierClientError,
    archive_dossier_client,
    attach_client_to_dossier,
    create_client_in_dossier,
    dossier_client_history,
    list_dossier_clients,
    move_dossier_client,
    restore_dossier_client,
    search_clients_for_dossier,
    update_client_profile_in_dossier,
    update_dossier_client,
)


router = APIRouter()


class DossierPayload(BaseModel):
    client_id: str | None = None
    client_ids: list[str] = Field(default_factory=list, max_length=100)
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=160)
    title: str | None = Field(default=None, max_length=180)
    description: str | None = Field(default=None, max_length=3000)
    assigned_to: str | None = Field(default=None, max_length=200)
    workspace_id: str | None = None
    route_id: str | None = None
    shipping_service_id: str | None = None
    origin_warehouse_id: str | None = None
    destination_office_id: str | None = None
    pricing_snapshot_id: str | None = None
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
        self.client_ids = list(dict.fromkeys(client_id for client_id in self.client_ids if client_id))
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
    title: str | None = Field(default=None, max_length=180)
    description: str | None = Field(default=None, max_length=3000)
    assigned_to: str | None = Field(default=None, max_length=200)
    workspace_id: str | None = None
    route_id: str | None = None
    shipping_service_id: str | None = None
    origin_warehouse_id: str | None = None
    destination_office_id: str | None = None
    pricing_snapshot_id: str | None = None
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


class DossierCollaborationPayload(BaseModel):
    row_version: int = Field(ge=1)
    priority: str = "NORMAL"
    assigned_to: str | None = Field(default=None, max_length=200)
    due_at: datetime | None = None

    @model_validator(mode="after")
    def validate_priority(self):
        if self.priority not in {"LOW", "NORMAL", "HIGH", "URGENT"}:
            raise ValueError("invalid_dossier_priority")
        return self


class DossierNotePayload(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class DossierNotePatchPayload(DossierNotePayload):
    row_version: int = Field(ge=1)


class DossierClientRelationPayload(BaseModel):
    relationship_role: str | None = Field(default=None, max_length=80)
    situation: str | None = Field(default=None, max_length=500)
    status_in_dossier: str | None = Field(default=None, max_length=120)
    attention_required: bool = False
    attention_reason: str | None = Field(default=None, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=160)

    @model_validator(mode="after")
    def validate_attention(self):
        if self.attention_required and not (self.attention_reason or "").strip():
            raise ValueError("attention_reason_required")
        return self


class DossierClientCreatePayload(DossierClientRelationPayload):
    name: str | None = Field(default=None, max_length=180)
    display_name: str | None = Field(default=None, max_length=180)
    company_name: str | None = Field(default=None, max_length=180)
    phone: str | None = Field(default=None, max_length=40)
    whatsapp_phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=200)
    customer_type: str = "individual"
    lifecycle_status: str = "lead"
    source: str = "manual"
    preferred_language: str = Field(default="FR", min_length=2, max_length=10)

    @model_validator(mode="after")
    def validate_client(self):
        if not any((self.name, self.display_name, self.company_name)):
            raise ValueError("client_identity_required")
        if not any((self.phone, self.whatsapp_phone, self.email)):
            raise ValueError("client_contact_required")
        if self.customer_type not in CLIENT_TYPES:
            raise ValueError("invalid_customer_type")
        if self.lifecycle_status not in CLIENT_STATUSES:
            raise ValueError("invalid_lifecycle_status")
        if self.source not in CLIENT_SOURCES:
            raise ValueError("invalid_client_source")
        return self


class DossierClientAttachPayload(DossierClientRelationPayload):
    client_id: str


class DossierClientPatchPayload(BaseModel):
    row_version: int = Field(ge=1)
    relationship_role: str | None = Field(default=None, max_length=80)
    situation: str | None = Field(default=None, max_length=500)
    status_in_dossier: str | None = Field(default=None, max_length=120)
    attention_required: bool | None = None
    attention_reason: str | None = Field(default=None, max_length=500)
    make_primary: bool = False

    @model_validator(mode="after")
    def validate_attention(self):
        if self.attention_required is True and not (self.attention_reason or "").strip():
            raise ValueError("attention_reason_required")
        return self


class DossierClientProfilePatchPayload(BaseModel):
    client_row_version: int = Field(ge=1)
    name: str | None = Field(default=None, max_length=180)
    company_name: str | None = Field(default=None, max_length=180)
    phone: str | None = Field(default=None, max_length=40)
    whatsapp_phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=200)
    customer_type: str | None = None
    lifecycle_status: str | None = None
    preferred_language: str | None = Field(default=None, max_length=10)

    @model_validator(mode="after")
    def validate_profile(self):
        if not any((self.name, self.company_name)):
            raise ValueError("client_identity_required")
        if not any((self.phone, self.whatsapp_phone, self.email)):
            raise ValueError("client_contact_required")
        if self.customer_type is not None and self.customer_type not in CLIENT_TYPES:
            raise ValueError("invalid_customer_type")
        if self.lifecycle_status is not None and self.lifecycle_status not in CLIENT_STATUSES:
            raise ValueError("invalid_lifecycle_status")
        return self


class DossierClientMovePayload(BaseModel):
    target_dossier_id: str
    row_version: int = Field(ge=1)
    idempotency_key: str = Field(min_length=8, max_length=160)
    situation: str | None = Field(default=None, max_length=500)
    status_in_dossier: str | None = Field(default=None, max_length=120)
    attention_required: bool | None = None
    attention_reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_attention(self):
        if self.attention_required is True and not (self.attention_reason or "").strip():
            raise ValueError("attention_reason_required")
        return self


def _user_id(tenant: dict) -> str:
    return str(tenant.get("user_id") or "")


def _validate_query_value(value: str | None, allowed: set[str], detail: str):
    if value and value not in allowed:
        raise HTTPException(status_code=422, detail=detail)


def _raise_dossier_client_error(exc: ValueError) -> None:
    detail = str(exc)
    if detail in {
        "dossier_not_found", "target_dossier_not_found", "client_not_found",
        "dossier_client_not_found", "archived_dossier_client_not_found",
    }:
        raise HTTPException(status_code=404, detail=detail) from exc
    if detail in {
        "duplicate_client", "dossier_client_conflict", "stale_dossier_client_version",
        "stale_client_version", "client_already_in_target_dossier", "same_target_dossier",
    }:
        raise HTTPException(status_code=409, detail=detail) from exc
    raise HTTPException(status_code=422, detail=detail) from exc


@router.get("/dossiers", dependencies=[Depends(require_permission("dossiers.read"))])
def dossiers_index(
    q: str | None = Query(default=None, max_length=120),
    status_global: str | None = None,
    case_type: str | None = None,
    intake_status: str | None = None,
    validation_status: str | None = None,
    payment_status: str | None = None,
    client_id: str | None = None,
    active_only: bool = False,
    attention_required: bool = False,
    updated_since_hours: int | None = Query(default=None, ge=1, le=8760),
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
        active_only=active_only,
        attention_required=attention_required,
        updated_since_hours=updated_since_hours,
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


@router.get("/dossiers/alerts", dependencies=[Depends(require_permission("dossiers.read"))])
def dossiers_alerts(
    dossier_id: str | None = None,
    include_resolved: bool = False,
    tenant=Depends(get_current_tenant),
):
    summary = refresh_dossier_alerts(tenant["org_id"])
    return {"status": "ok", "items": list_dossier_alerts(
        tenant["org_id"], dossier_id=dossier_id, include_resolved=include_resolved
    ), "refresh": summary}


@router.patch("/dossiers/alerts/{alert_id}/acknowledge", dependencies=[Depends(require_permission("dossiers.update"))])
def dossiers_alert_acknowledge(alert_id: str, tenant=Depends(get_current_tenant)):
    alert = acknowledge_dossier_alert(tenant["org_id"], alert_id, _user_id(tenant))
    if not alert:
        raise HTTPException(status_code=409, detail="alert_not_open_or_not_found")
    return {"status": "ok", "alert": alert}


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
        if str(exc) == "invalid_dossier_assignee":
            raise HTTPException(status_code=422, detail="invalid_dossier_assignee") from exc
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
def dossiers_show(dossier_id: str, include_archived: bool = False, tenant=Depends(get_current_tenant)):
    dossier = get_dossier(tenant["org_id"], dossier_id, include_archived=include_archived)
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


@router.get("/dossiers/collaboration/members", dependencies=[Depends(require_permission("dossiers.read"))])
def dossier_collaboration_members(tenant=Depends(get_current_tenant)):
    return {"status": "ok", "items": list_active_members(tenant["org_id"])}


@router.patch("/dossiers/{dossier_id}/collaboration", dependencies=[Depends(require_permission("dossiers.update"))])
def dossier_collaboration_update(dossier_id: str, body: DossierCollaborationPayload, tenant=Depends(get_current_tenant)):
    try:
        dossier = update_collaboration(
            tenant["org_id"], dossier_id, _user_id(tenant), body.model_dump()
        )
    except ValueError as exc:
        if str(exc) == "invalid_dossier_assignee":
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if str(exc) == "stale_dossier_version":
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        raise
    if not dossier:
        raise HTTPException(status_code=404, detail="dossier_not_found")
    return {"status": "ok", "dossier": dossier}


@router.get("/dossiers/clients/search", dependencies=[Depends(require_permission("dossiers.clients.read"))])
def dossiers_client_search(
    q: str = Query(min_length=2, max_length=120),
    dossier_id: str | None = None,
    limit: int = Query(default=20, ge=1, le=50),
    tenant=Depends(get_current_tenant),
):
    items = search_clients_for_dossier(
        tenant["org_id"], q, dossier_id=dossier_id, limit=limit
    )
    return {"status": "ok", "items": items, "count": len(items)}


@router.get("/dossiers/{dossier_id}/clients", dependencies=[Depends(require_permission("dossiers.clients.read"))])
def dossier_clients_index(
    dossier_id: str,
    q: str | None = Query(default=None, max_length=120),
    include_archived: bool = False,
    tenant=Depends(get_current_tenant),
):
    if not get_dossier(tenant["org_id"], dossier_id, include_archived=True):
        raise HTTPException(status_code=404, detail="dossier_not_found")
    items = list_dossier_clients(
        tenant["org_id"], dossier_id, include_archived=include_archived, q=q
    )
    return {"status": "ok", "items": items, "count": len(items)}


@router.post(
    "/dossiers/{dossier_id}/clients",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("dossiers.clients.manage"))],
)
def dossier_client_attach(
    dossier_id: str,
    body: DossierClientAttachPayload,
    tenant=Depends(get_current_tenant),
):
    data = body.model_dump()
    client_id = data.pop("client_id")
    try:
        relation, replayed = attach_client_to_dossier(
            tenant["org_id"], dossier_id, client_id, _user_id(tenant), data
        )
    except ValueError as exc:
        _raise_dossier_client_error(exc)
    return {"status": "ok", "relation": relation, "replayed": replayed}


@router.post(
    "/dossiers/{dossier_id}/clients/new",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("dossiers.clients.manage"))],
)
def dossier_client_create(
    dossier_id: str,
    body: DossierClientCreatePayload,
    tenant=Depends(get_current_tenant),
):
    data = body.model_dump()
    relation_fields = {
        key: data.pop(key)
        for key in (
            "relationship_role", "situation", "status_in_dossier",
            "attention_required", "attention_reason", "idempotency_key",
        )
    }
    try:
        client, relation, replayed = create_client_in_dossier(
            tenant["org_id"], dossier_id, _user_id(tenant), data, relation_fields
        )
    except DuplicateDossierClientError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "duplicate_client", "existing_client": exc.client},
        ) from exc
    except ValueError as exc:
        _raise_dossier_client_error(exc)
    return {
        "status": "ok", "client": client, "relation": relation, "replayed": replayed,
    }


@router.patch(
    "/dossiers/{dossier_id}/clients/{client_id}",
    dependencies=[Depends(require_permission("dossiers.clients.manage"))],
)
def dossier_client_update(
    dossier_id: str,
    client_id: str,
    body: DossierClientPatchPayload,
    tenant=Depends(get_current_tenant),
):
    try:
        relation = update_dossier_client(
            tenant["org_id"], dossier_id, client_id, _user_id(tenant),
            body.model_dump(exclude_unset=True),
        )
    except ValueError as exc:
        _raise_dossier_client_error(exc)
    return {"status": "ok", "relation": relation}


@router.patch(
    "/dossiers/{dossier_id}/clients/{client_id}/profile",
    dependencies=[Depends(require_permission("dossiers.clients.manage"))],
)
def dossier_client_profile_update(
    dossier_id: str,
    client_id: str,
    body: DossierClientProfilePatchPayload,
    tenant=Depends(get_current_tenant),
):
    data = body.model_dump(exclude_unset=True)
    data["row_version"] = data.pop("client_row_version")
    data["display_name"] = data.get("name") or data.get("company_name")
    try:
        relation = update_client_profile_in_dossier(
            tenant["org_id"], dossier_id, client_id, _user_id(tenant), data
        )
    except ValueError as exc:
        _raise_dossier_client_error(exc)
    return {"status": "ok", "relation": relation}


@router.delete(
    "/dossiers/{dossier_id}/clients/{client_id}",
    dependencies=[Depends(require_permission("dossiers.clients.manage"))],
)
def dossier_client_remove(
    dossier_id: str,
    client_id: str,
    row_version: int = Query(ge=1),
    tenant=Depends(get_current_tenant),
):
    try:
        relation = archive_dossier_client(
            tenant["org_id"], dossier_id, client_id, _user_id(tenant), row_version
        )
    except ValueError as exc:
        _raise_dossier_client_error(exc)
    return {"status": "ok", "relation": relation}


@router.post(
    "/dossiers/{dossier_id}/clients/{client_id}/restore",
    dependencies=[Depends(require_permission("dossiers.clients.manage"))],
)
def dossier_client_restore(
    dossier_id: str,
    client_id: str,
    row_version: int = Query(ge=1),
    tenant=Depends(get_current_tenant),
):
    try:
        relation = restore_dossier_client(
            tenant["org_id"], dossier_id, client_id, _user_id(tenant), row_version
        )
    except ValueError as exc:
        _raise_dossier_client_error(exc)
    return {"status": "ok", "relation": relation}


@router.post(
    "/dossiers/{dossier_id}/clients/{client_id}/move",
    dependencies=[Depends(require_permission("dossiers.clients.manage"))],
)
def dossier_client_move(
    dossier_id: str,
    client_id: str,
    body: DossierClientMovePayload,
    tenant=Depends(get_current_tenant),
):
    try:
        relation, replayed = move_dossier_client(
            tenant["org_id"], dossier_id, client_id, body.target_dossier_id,
            _user_id(tenant), body.model_dump(),
        )
    except ValueError as exc:
        _raise_dossier_client_error(exc)
    return {"status": "ok", "relation": relation, "replayed": replayed}


@router.get(
    "/dossiers/{dossier_id}/clients/{client_id}/history",
    dependencies=[Depends(require_permission("dossiers.clients.read"))],
)
def dossier_client_history_index(
    dossier_id: str,
    client_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    tenant=Depends(get_current_tenant),
):
    items = dossier_client_history(tenant["org_id"], dossier_id, client_id, limit=limit)
    return {"status": "ok", "items": items, "count": len(items)}


@router.get("/dossiers/{dossier_id}/notes", dependencies=[Depends(require_permission("dossiers.read"))])
def dossier_notes(dossier_id: str, tenant=Depends(get_current_tenant)):
    if not get_dossier(tenant["org_id"], dossier_id):
        raise HTTPException(status_code=404, detail="dossier_not_found")
    return {"status": "ok", "items": list_notes(tenant["org_id"], dossier_id)}


@router.post("/dossiers/{dossier_id}/notes", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("dossiers.update"))])
def dossier_note_create(dossier_id: str, body: DossierNotePayload, tenant=Depends(get_current_tenant)):
    note = create_note(tenant["org_id"], dossier_id, _user_id(tenant), body.body)
    if not note:
        raise HTTPException(status_code=404, detail="dossier_not_found")
    return {"status": "ok", "note": note}


@router.patch("/dossiers/{dossier_id}/notes/{note_id}", dependencies=[Depends(require_permission("dossiers.update"))])
def dossier_note_update(dossier_id: str, note_id: str, body: DossierNotePatchPayload, tenant=Depends(get_current_tenant)):
    note = update_note(tenant["org_id"], dossier_id, note_id, _user_id(tenant), body.body, body.row_version)
    if not note:
        raise HTTPException(status_code=409, detail="note_not_owned_or_stale")
    return {"status": "ok", "note": note}


@router.delete("/dossiers/{dossier_id}/notes/{note_id}", dependencies=[Depends(require_permission("dossiers.update"))])
def dossier_note_delete(dossier_id: str, note_id: str, row_version: int = Query(ge=1), tenant=Depends(get_current_tenant)):
    if not delete_note(tenant["org_id"], dossier_id, note_id, _user_id(tenant), row_version):
        raise HTTPException(status_code=409, detail="note_not_owned_or_stale")
    return {"status": "ok"}


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
        if str(exc) == "invalid_dossier_assignee":
            raise HTTPException(status_code=422, detail="invalid_dossier_assignee") from exc
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
