import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field, model_validator
from starlette.responses import StreamingResponse

from app.clients.repository import (
    CLIENT_SOURCES,
    CLIENT_STATUSES,
    CLIENT_TYPES,
    client_timeline,
    client_stats,
    create_client,
    export_clients,
    find_client_duplicates,
    get_client,
    import_clients,
    list_clients,
    merge_clients,
    restore_client,
    soft_delete_client,
    update_client,
)
from app.core.tenant_context import get_current_tenant
from app.core.permissions import require_permission


router = APIRouter()
MAX_CLIENT_IMPORT_BYTES = 5 * 1024 * 1024
MAX_CLIENT_IMPORT_ROWS = 10_000
MAX_CLIENT_EXPORT_ROWS = 50_000


class ClientPayload(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    display_name: str | None = Field(default=None, max_length=180)
    company_name: str | None = Field(default=None, max_length=180)
    tax_id: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    whatsapp_phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=180)
    country: str | None = Field(default=None, max_length=80)
    city: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=260)
    customer_type: str = "individual"
    lifecycle_status: str = "lead"
    source: str = "manual"
    preferred_language: str | None = Field(default="FR", max_length=10)
    preferred_currency: str | None = Field(default=None, max_length=12)
    notes: str | None = Field(default=None, max_length=2000)
    credit_enabled: bool = False
    credit_limit: float | None = 0
    current_balance: float | None = 0
    total_spent: float | None = 0

    @model_validator(mode="after")
    def validate_client(self):
        if not self.name and not self.company_name and not self.phone and not self.email:
            raise ValueError("name_company_phone_or_email_required")
        if self.customer_type not in CLIENT_TYPES:
            raise ValueError("invalid_customer_type")
        if self.lifecycle_status not in CLIENT_STATUSES:
            raise ValueError("invalid_lifecycle_status")
        if self.source not in CLIENT_SOURCES:
            raise ValueError("invalid_source")
        return self


class ClientPatchPayload(BaseModel):
    row_version: int = Field(ge=1)
    name: str | None = Field(default=None, max_length=160)
    display_name: str | None = Field(default=None, max_length=180)
    company_name: str | None = Field(default=None, max_length=180)
    tax_id: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    whatsapp_phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=180)
    country: str | None = Field(default=None, max_length=80)
    city: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=260)
    customer_type: str | None = None
    lifecycle_status: str | None = None
    source: str | None = None
    preferred_language: str | None = Field(default=None, max_length=10)
    preferred_currency: str | None = Field(default=None, max_length=12)
    notes: str | None = Field(default=None, max_length=2000)
    credit_enabled: bool | None = None
    credit_limit: float | None = None
    current_balance: float | None = None
    total_spent: float | None = None

    @model_validator(mode="after")
    def validate_patch(self):
        if self.customer_type is not None and self.customer_type not in CLIENT_TYPES:
            raise ValueError("invalid_customer_type")
        if self.lifecycle_status is not None and self.lifecycle_status not in CLIENT_STATUSES:
            raise ValueError("invalid_lifecycle_status")
        if self.source is not None and self.source not in CLIENT_SOURCES:
            raise ValueError("invalid_source")
        return self


class ClientMergePayload(BaseModel):
    source_client_id: str = Field(min_length=1, max_length=64)
    target_client_id: str = Field(min_length=1, max_length=64)
    source_version: int = Field(ge=1)
    target_version: int = Field(ge=1)
    idempotency_key: str = Field(min_length=16, max_length=128)

    @model_validator(mode="after")
    def validate_merge(self):
        if self.source_client_id == self.target_client_id:
            raise ValueError("merge_same_client")
        return self


def _user_id(tenant: dict) -> str:
    return str(tenant.get("user_id") or "")


@router.get("/clients", dependencies=[Depends(require_permission("clients.read"))])
def clients_index(
    q: str | None = Query(default=None, max_length=120),
    status_filter: str | None = Query(default=None, alias="status"),
    customer_type: str | None = None,
    source: str | None = None,
    country: str | None = None,
    city: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort: str = "created_desc",
    tenant=Depends(get_current_tenant),
):
    if status_filter and status_filter not in CLIENT_STATUSES:
        raise HTTPException(status_code=422, detail="invalid_status")
    if customer_type and customer_type not in CLIENT_TYPES:
        raise HTTPException(status_code=422, detail="invalid_customer_type")
    if source and source not in CLIENT_SOURCES:
        raise HTTPException(status_code=422, detail="invalid_source")
    return {
        "status": "ok",
        **list_clients(
            tenant["org_id"],
            q=q,
            status=status_filter,
            customer_type=customer_type,
            source=source,
            country=country,
            city=city,
            page=page,
            page_size=page_size,
            sort=sort,
        ),
    }


@router.get("/clients/stats", dependencies=[Depends(require_permission("clients.read"))])
def clients_stats(tenant=Depends(get_current_tenant)):
    return {"status": "ok", "stats": client_stats(tenant["org_id"])}


@router.post("/clients/merge", dependencies=[Depends(require_permission("clients.merge"))])
def clients_merge(body: ClientMergePayload, tenant=Depends(get_current_tenant)):
    try:
        client = merge_clients(
            tenant["org_id"], body.source_client_id, body.target_client_id,
            _user_id(tenant), source_version=body.source_version,
            target_version=body.target_version, idempotency_key=body.idempotency_key,
        )
    except ValueError as exc:
        detail = str(exc)
        if detail in {"stale_client_version", "merge_relationship_conflict"}:
            raise HTTPException(status_code=409, detail=detail) from exc
        if detail in {"merge_client_not_found", "merge_target_not_found"}:
            raise HTTPException(status_code=404, detail=detail) from exc
        raise
    return {"status": "ok", "client": client}


@router.get(
    "/clients/archived",
    dependencies=[Depends(require_permission("clients.archive"))],
)
def clients_archived(
    q: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    tenant=Depends(get_current_tenant),
):
    return {
        "status": "ok",
        **list_clients(
            tenant["org_id"], q=q, page=page, page_size=page_size,
            sort="activity_desc", archived=True,
        ),
    }


@router.post(
    "/clients",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("clients.create"))],
)
def clients_create(body: ClientPayload, tenant=Depends(get_current_tenant)):
    try:
        client = create_client(tenant["org_id"], _user_id(tenant), body.model_dump())
    except ValueError as exc:
        if str(exc) == "duplicate_client":
            raise HTTPException(status_code=409, detail="duplicate_client") from exc
        if str(exc) in {"invalid_phone", "invalid_email"}:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        raise
    return {"status": "ok", "client": client}


@router.get("/clients/export", dependencies=[Depends(require_permission("clients.export"))])
def clients_export(
    q: str | None = Query(default=None, max_length=120),
    status_filter: str | None = Query(default=None, alias="status"),
    customer_type: str | None = None,
    source: str | None = None,
    country: str | None = None,
    city: str | None = None,
    sort: str = "created_desc",
    tenant=Depends(get_current_tenant),
):
    rows = export_clients(
        tenant["org_id"],
        q=q,
        status=status_filter,
        customer_type=customer_type,
        source=source,
        country=country,
        city=city,
        sort=sort,
        limit=MAX_CLIENT_EXPORT_ROWS + 1,
    )
    if len(rows) > MAX_CLIENT_EXPORT_ROWS:
        raise HTTPException(status_code=413, detail="client_export_too_large")
    output = io.StringIO()
    fieldnames = [
        "display_name",
        "name",
        "company_name",
        "phone",
        "whatsapp_phone",
        "email",
        "country",
        "city",
        "customer_type",
        "lifecycle_status",
        "source",
        "preferred_language",
        "preferred_currency",
        "credit_enabled",
        "credit_limit",
        "current_balance",
        "total_spent",
        "notes",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in fieldnames})
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="slaivio-clients.csv"'},
    )


@router.post("/clients/import", dependencies=[Depends(require_permission("clients.import"))])
async def clients_import(file: UploadFile = File(...), tenant=Depends(get_current_tenant)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="csv_required")
    content = await file.read(MAX_CLIENT_IMPORT_BYTES + 1)
    if len(content) > MAX_CLIENT_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="client_import_too_large")
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail="invalid_csv_encoding") from exc
    reader = csv.DictReader(io.StringIO(decoded))
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail="empty_csv")
    rows = []
    for row_number, row in enumerate(reader, start=1):
        if row_number > MAX_CLIENT_IMPORT_ROWS:
            raise HTTPException(status_code=413, detail="client_import_too_many_rows")
        rows.append({str(key).strip(): (value or "").strip() for key, value in row.items()})
    return {"status": "ok", "result": import_clients(tenant["org_id"], _user_id(tenant), rows)}


@router.get("/clients/duplicates", dependencies=[Depends(require_permission("clients.read"))])
def clients_duplicates(
    client_id: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    name: str | None = None,
    tenant=Depends(get_current_tenant),
):
    return {
        "status": "ok",
        "items": find_client_duplicates(
            tenant["org_id"],
            client_id=client_id,
            phone=phone,
            email=email,
            name=name,
        ),
    }


@router.get("/clients/{client_id}", dependencies=[Depends(require_permission("clients.read"))])
def clients_show(client_id: str, tenant=Depends(get_current_tenant)):
    client = get_client(tenant["org_id"], client_id)
    if not client:
        raise HTTPException(status_code=404, detail="client_not_found")
    return {"status": "ok", "client": client}


@router.get(
    "/clients/{client_id}/timeline",
    dependencies=[Depends(require_permission("clients.read"))],
)
def clients_timeline(client_id: str, tenant=Depends(get_current_tenant)):
    client = get_client(tenant["org_id"], client_id)
    if not client:
        raise HTTPException(status_code=404, detail="client_not_found")
    return {"status": "ok", "items": client_timeline(tenant["org_id"], client_id)}


@router.patch(
    "/clients/{client_id}",
    dependencies=[Depends(require_permission("clients.update"))],
)
def clients_update(client_id: str, body: ClientPatchPayload, tenant=Depends(get_current_tenant)):
    payload = body.model_dump(exclude_unset=True)
    try:
        client = update_client(tenant["org_id"], client_id, _user_id(tenant), payload)
    except ValueError as exc:
        if str(exc) == "duplicate_client":
            raise HTTPException(status_code=409, detail="duplicate_client") from exc
        if str(exc) == "stale_client_version":
            raise HTTPException(status_code=409, detail="stale_client_version") from exc
        if str(exc) in {"invalid_phone", "invalid_email"}:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        raise
    if not client:
        raise HTTPException(status_code=404, detail="client_not_found")
    return {"status": "ok", "client": client}


@router.delete(
    "/clients/{client_id}",
    dependencies=[Depends(require_permission("clients.archive"))],
)
def clients_delete(client_id: str, tenant=Depends(get_current_tenant)):
    deleted = soft_delete_client(tenant["org_id"], client_id, _user_id(tenant))
    if not deleted:
        raise HTTPException(status_code=404, detail="client_not_found")
    return {"status": "ok"}


@router.post(
    "/clients/{client_id}/restore",
    dependencies=[Depends(require_permission("clients.archive"))],
)
def clients_restore(client_id: str, tenant=Depends(get_current_tenant)):
    try:
        client = restore_client(tenant["org_id"], client_id, _user_id(tenant))
    except ValueError as exc:
        if str(exc) == "restore_identity_conflict":
            raise HTTPException(status_code=409, detail="restore_identity_conflict") from exc
        raise
    if not client:
        raise HTTPException(status_code=404, detail="archived_client_not_found")
    return {"status": "ok", "client": client}
