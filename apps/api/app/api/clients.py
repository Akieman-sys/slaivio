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
    soft_delete_client,
    update_client,
)
from app.core.tenant_context import get_current_tenant


router = APIRouter()


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


def _user_id(tenant: dict) -> str:
    return str(tenant.get("user_id") or "")


@router.get("/clients")
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


@router.get("/clients/stats")
def clients_stats(tenant=Depends(get_current_tenant)):
    return {"status": "ok", "stats": client_stats(tenant["org_id"])}


@router.post("/clients", status_code=status.HTTP_201_CREATED)
def clients_create(body: ClientPayload, tenant=Depends(get_current_tenant)):
    try:
        client = create_client(tenant["org_id"], _user_id(tenant), body.model_dump())
    except ValueError as exc:
        if str(exc) == "duplicate_client":
            raise HTTPException(status_code=409, detail="duplicate_client") from exc
        raise
    return {"status": "ok", "client": client}


@router.get("/clients/export")
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
    )
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


@router.post("/clients/import")
async def clients_import(file: UploadFile = File(...), tenant=Depends(get_current_tenant)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="csv_required")
    content = await file.read()
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail="invalid_csv_encoding") from exc
    reader = csv.DictReader(io.StringIO(decoded))
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail="empty_csv")
    rows = [{str(key).strip(): (value or "").strip() for key, value in row.items()} for row in reader]
    return {"status": "ok", "result": import_clients(tenant["org_id"], _user_id(tenant), rows)}


@router.get("/clients/duplicates")
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


@router.get("/clients/{client_id}")
def clients_show(client_id: str, tenant=Depends(get_current_tenant)):
    client = get_client(tenant["org_id"], client_id)
    if not client:
        raise HTTPException(status_code=404, detail="client_not_found")
    return {"status": "ok", "client": client}


@router.get("/clients/{client_id}/timeline")
def clients_timeline(client_id: str, tenant=Depends(get_current_tenant)):
    client = get_client(tenant["org_id"], client_id)
    if not client:
        raise HTTPException(status_code=404, detail="client_not_found")
    return {"status": "ok", "items": client_timeline(tenant["org_id"], client_id)}


@router.patch("/clients/{client_id}")
def clients_update(client_id: str, body: ClientPatchPayload, tenant=Depends(get_current_tenant)):
    payload = body.model_dump(exclude_unset=True)
    try:
        client = update_client(tenant["org_id"], client_id, _user_id(tenant), payload)
    except ValueError as exc:
        if str(exc) == "duplicate_client":
            raise HTTPException(status_code=409, detail="duplicate_client") from exc
        raise
    if not client:
        raise HTTPException(status_code=404, detail="client_not_found")
    return {"status": "ok", "client": client}


@router.delete("/clients/{client_id}")
def clients_delete(client_id: str, tenant=Depends(get_current_tenant)):
    deleted = soft_delete_client(tenant["org_id"], client_id, _user_id(tenant))
    if not deleted:
        raise HTTPException(status_code=404, detail="client_not_found")
    return {"status": "ok"}
