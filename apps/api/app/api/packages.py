import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator
from starlette.responses import StreamingResponse

from app.core.tenant_context import get_current_tenant
from app.packages.repository import (
    INVENTORY_STATUSES,
    PACKAGE_CONDITIONS,
    PACKAGE_STATUSES,
    PAYMENT_CLEARANCE_STATUSES,
    create_package,
    export_packages,
    get_package,
    list_packages,
    package_stats,
    package_timeline,
    update_package,
)


router = APIRouter()


class PackagePayload(BaseModel):
    dossier_id: str
    tracking_id: str | None = Field(default=None, max_length=120)
    status: str = "CREATED"
    package_condition: str = "UNKNOWN"
    inventory_status: str = "NOT_STORED"
    payment_clearance_status: str = "UNKNOWN"
    origin_country: str | None = Field(default=None, max_length=80)
    origin_city: str | None = Field(default=None, max_length=80)
    destination_country: str | None = Field(default=None, max_length=80)
    destination_city: str | None = Field(default=None, max_length=80)
    goods_type: str | None = Field(default=None, max_length=160)
    weight_kg: float | None = None
    volume_cbm: float | None = None
    actual_weight_kg: float | None = None
    actual_volume_cbm: float | None = None
    shipping_mode: str | None = Field(default=None, max_length=80)
    fees_total: float | None = None
    fees_paid: float | None = None
    currency: str | None = Field(default=None, max_length=12)
    barcode: str | None = Field(default=None, max_length=160)
    qr_code_value: str | None = Field(default=None, max_length=220)
    public_tracking_enabled: bool = True
    eta_at: str | None = None
    last_scan_location: str | None = Field(default=None, max_length=180)

    @model_validator(mode="after")
    def validate_package(self):
        if self.status not in PACKAGE_STATUSES:
            raise ValueError("invalid_status")
        if self.package_condition not in PACKAGE_CONDITIONS:
            raise ValueError("invalid_package_condition")
        if self.inventory_status not in INVENTORY_STATUSES:
            raise ValueError("invalid_inventory_status")
        if self.payment_clearance_status not in PAYMENT_CLEARANCE_STATUSES:
            raise ValueError("invalid_payment_clearance_status")
        return self


class PackagePatchPayload(BaseModel):
    status: str | None = None
    package_condition: str | None = None
    inventory_status: str | None = None
    payment_clearance_status: str | None = None
    origin_country: str | None = Field(default=None, max_length=80)
    origin_city: str | None = Field(default=None, max_length=80)
    destination_country: str | None = Field(default=None, max_length=80)
    destination_city: str | None = Field(default=None, max_length=80)
    goods_type: str | None = Field(default=None, max_length=160)
    weight_kg: float | None = None
    volume_cbm: float | None = None
    actual_weight_kg: float | None = None
    actual_volume_cbm: float | None = None
    shipping_mode: str | None = Field(default=None, max_length=80)
    fees_total: float | None = None
    fees_paid: float | None = None
    currency: str | None = Field(default=None, max_length=12)
    barcode: str | None = Field(default=None, max_length=160)
    qr_code_value: str | None = Field(default=None, max_length=220)
    public_tracking_enabled: bool | None = None
    eta_at: str | None = None
    last_scan_location: str | None = Field(default=None, max_length=180)

    @model_validator(mode="after")
    def validate_patch(self):
        if self.status is not None and self.status not in PACKAGE_STATUSES:
            raise ValueError("invalid_status")
        if self.package_condition is not None and self.package_condition not in PACKAGE_CONDITIONS:
            raise ValueError("invalid_package_condition")
        if self.inventory_status is not None and self.inventory_status not in INVENTORY_STATUSES:
            raise ValueError("invalid_inventory_status")
        if self.payment_clearance_status is not None and self.payment_clearance_status not in PAYMENT_CLEARANCE_STATUSES:
            raise ValueError("invalid_payment_clearance_status")
        return self


def _user_id(tenant: dict) -> str:
    return str(tenant.get("user_id") or "")


def _validate_query_value(value: str | None, allowed: set[str], detail: str):
    if value and value not in allowed:
        raise HTTPException(status_code=422, detail=detail)


@router.get("/packages")
def packages_index(
    q: str | None = Query(default=None, max_length=120),
    status_filter: str | None = Query(default=None, alias="status"),
    condition: str | None = None,
    inventory_status: str | None = None,
    payment_clearance_status: str | None = None,
    dossier_id: str | None = None,
    client_id: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    sort: str = "updated_desc",
    tenant=Depends(get_current_tenant),
):
    _validate_query_value(status_filter, PACKAGE_STATUSES, "invalid_status")
    _validate_query_value(condition, PACKAGE_CONDITIONS, "invalid_package_condition")
    _validate_query_value(inventory_status, INVENTORY_STATUSES, "invalid_inventory_status")
    _validate_query_value(payment_clearance_status, PAYMENT_CLEARANCE_STATUSES, "invalid_payment_clearance_status")
    response = list_packages(
        tenant["org_id"],
        q=q,
        status=status_filter,
        condition=condition,
        inventory_status=inventory_status,
        payment_clearance_status=payment_clearance_status,
        dossier_id=dossier_id,
        client_id=client_id,
        page=page,
        page_size=page_size,
        sort=sort,
    )
    return {
        "status": "ok",
        "count": len(response["items"]),
        "packages": response["items"],
        **response,
    }


@router.get("/packages/stats")
def packages_stats(tenant=Depends(get_current_tenant)):
    return {"status": "ok", "stats": package_stats(tenant["org_id"])}


@router.get("/packages/export")
def packages_export(
    q: str | None = Query(default=None, max_length=120),
    status_filter: str | None = Query(default=None, alias="status"),
    condition: str | None = None,
    inventory_status: str | None = None,
    payment_clearance_status: str | None = None,
    sort: str = "updated_desc",
    tenant=Depends(get_current_tenant),
):
    rows = export_packages(
        tenant["org_id"],
        q=q,
        status=status_filter,
        condition=condition,
        inventory_status=inventory_status,
        payment_clearance_status=payment_clearance_status,
        sort=sort,
    )
    output = io.StringIO()
    fieldnames = [
        "package_reference",
        "tracking_id",
        "client_name",
        "dossier_reference",
        "status",
        "package_condition",
        "inventory_status",
        "payment_clearance_status",
        "origin_country",
        "origin_city",
        "destination_country",
        "destination_city",
        "goods_type",
        "weight_kg",
        "volume_cbm",
        "shipping_mode",
        "fees_total",
        "fees_paid",
        "currency",
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
        headers={"Content-Disposition": 'attachment; filename="slaivio-colis.csv"'},
    )


@router.post("/packages", status_code=status.HTTP_201_CREATED)
def packages_create(body: PackagePayload, tenant=Depends(get_current_tenant)):
    try:
        package = create_package(tenant["org_id"], _user_id(tenant), body.model_dump())
    except ValueError as exc:
        if str(exc) == "dossier_required":
            raise HTTPException(status_code=422, detail="dossier_required") from exc
        if str(exc) == "dossier_not_found":
            raise HTTPException(status_code=404, detail="dossier_not_found") from exc
        raise
    return {"status": "ok", "package": package}


@router.get("/packages/{package_id}")
def packages_show(package_id: str, tenant=Depends(get_current_tenant)):
    package = get_package(tenant["org_id"], package_id)
    if not package:
        raise HTTPException(status_code=404, detail="package_not_found")
    return {"status": "ok", "package": package, "data": package}


@router.get("/packages/{package_id}/timeline")
def packages_timeline(package_id: str, tenant=Depends(get_current_tenant)):
    package = get_package(tenant["org_id"], package_id)
    if not package:
        raise HTTPException(status_code=404, detail="package_not_found")
    return {"status": "ok", "items": package_timeline(tenant["org_id"], package_id)}


@router.patch("/packages/{package_id}")
def packages_update(package_id: str, body: PackagePatchPayload, tenant=Depends(get_current_tenant)):
    package = update_package(
        tenant["org_id"],
        package_id,
        _user_id(tenant),
        body.model_dump(exclude_unset=True),
    )
    if not package:
        raise HTTPException(status_code=404, detail="package_not_found")
    return {"status": "ok", "package": package}
