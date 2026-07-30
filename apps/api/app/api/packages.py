import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field, model_validator
from starlette.responses import StreamingResponse

from app.core.tenant_context import get_current_tenant
from app.packages.repository import (
    ANOMALY_SEVERITIES,
    INVENTORY_STATUSES,
    NOTIFICATION_CHANNELS,
    PACKAGE_CONDITIONS,
    PACKAGE_SOURCES,
    PACKAGE_STATUSES,
    PACKAGE_TYPES,
    PAYMENT_STATUSES,
    VALIDATION_STATUSES,
    add_package_media,
    create_package,
    create_package_anomaly,
    create_package_notification,
    export_packages,
    get_package,
    import_packages,
    list_packages,
    package_stats,
    package_timeline,
    resolve_package_anomaly,
    update_package,
)


router = APIRouter()


class PackagePayload(BaseModel):
    dossier_id: str
    package_reference: str | None = Field(default=None, max_length=120)
    tracking_id: str | None = Field(default=None, max_length=120)
    source: str = "manual"
    package_type: str = "carton"
    description: str | None = Field(default=None, max_length=260)
    category: str | None = Field(default=None, max_length=120)
    status: str = "CREATED"
    validation_status: str = "PENDING"
    payment_status: str = "UNKNOWN"
    payment_clearance_status: str | None = None
    package_condition: str = "UNKNOWN"
    inventory_status: str = "NOT_STORED"
    warehouse_name: str | None = Field(default=None, max_length=160)
    warehouse_zone: str | None = Field(default=None, max_length=80)
    warehouse_rack: str | None = Field(default=None, max_length=80)
    warehouse_location: str | None = Field(default=None, max_length=160)
    origin_country: str | None = Field(default=None, max_length=80)
    origin_city: str | None = Field(default=None, max_length=80)
    destination_country: str | None = Field(default=None, max_length=80)
    destination_city: str | None = Field(default=None, max_length=80)
    service_type: str | None = Field(default=None, max_length=80)
    shipping_mode: str | None = Field(default=None, max_length=80)
    shipment_reference: str | None = Field(default=None, max_length=120)
    public_tracking_enabled: bool = True
    eta_at: str | None = None
    received_at: str | None = None
    dispatched_at: str | None = None
    delivered_at: str | None = None
    weight_kg: float | None = None
    volumetric_weight_kg: float | None = None
    length_cm: float | None = None
    width_cm: float | None = None
    height_cm: float | None = None
    volume_cbm: float | None = None
    pieces_count: int = Field(default=1, ge=1)
    declared_value: float | None = None
    declared_currency: str | None = Field(default=None, max_length=12)
    is_fragile: bool = False
    notes: str | None = None
    fees_total: float | None = None
    fees_paid: float | None = None
    currency: str | None = Field(default=None, max_length=12)
    barcode: str | None = Field(default=None, max_length=160)
    qr_code_value: str | None = Field(default=None, max_length=220)
    last_scan_location: str | None = Field(default=None, max_length=180)

    @model_validator(mode="after")
    def validate_package(self):
        _assert_allowed(self.status, PACKAGE_STATUSES, "invalid_status")
        _assert_allowed(self.package_condition, PACKAGE_CONDITIONS, "invalid_package_condition")
        _assert_allowed(self.inventory_status, INVENTORY_STATUSES, "invalid_inventory_status")
        _assert_allowed(self.validation_status, VALIDATION_STATUSES, "invalid_validation_status")
        _assert_allowed(self.payment_status, PAYMENT_STATUSES, "invalid_payment_status")
        _assert_allowed(self.source, PACKAGE_SOURCES, "invalid_source")
        _assert_allowed(self.package_type, PACKAGE_TYPES, "invalid_package_type")
        return self


class PackagePatchPayload(BaseModel):
    tracking_id: str | None = Field(default=None, max_length=120)
    source: str | None = None
    package_type: str | None = None
    description: str | None = Field(default=None, max_length=260)
    category: str | None = Field(default=None, max_length=120)
    status: str | None = None
    validation_status: str | None = None
    payment_status: str | None = None
    payment_clearance_status: str | None = None
    package_condition: str | None = None
    inventory_status: str | None = None
    warehouse_name: str | None = Field(default=None, max_length=160)
    warehouse_zone: str | None = Field(default=None, max_length=80)
    warehouse_rack: str | None = Field(default=None, max_length=80)
    warehouse_location: str | None = Field(default=None, max_length=160)
    origin_country: str | None = Field(default=None, max_length=80)
    origin_city: str | None = Field(default=None, max_length=80)
    destination_country: str | None = Field(default=None, max_length=80)
    destination_city: str | None = Field(default=None, max_length=80)
    service_type: str | None = Field(default=None, max_length=80)
    shipping_mode: str | None = Field(default=None, max_length=80)
    shipment_reference: str | None = Field(default=None, max_length=120)
    public_tracking_enabled: bool | None = None
    eta_at: str | None = None
    received_at: str | None = None
    dispatched_at: str | None = None
    delivered_at: str | None = None
    weight_kg: float | None = None
    volumetric_weight_kg: float | None = None
    length_cm: float | None = None
    width_cm: float | None = None
    height_cm: float | None = None
    volume_cbm: float | None = None
    pieces_count: int | None = Field(default=None, ge=1)
    declared_value: float | None = None
    declared_currency: str | None = Field(default=None, max_length=12)
    is_fragile: bool | None = None
    notes: str | None = None
    fees_total: float | None = None
    fees_paid: float | None = None
    currency: str | None = Field(default=None, max_length=12)
    barcode: str | None = Field(default=None, max_length=160)
    qr_code_value: str | None = Field(default=None, max_length=220)
    last_scan_location: str | None = Field(default=None, max_length=180)

    @model_validator(mode="after")
    def validate_patch(self):
        for value, allowed, detail in [
            (self.status, PACKAGE_STATUSES, "invalid_status"),
            (self.package_condition, PACKAGE_CONDITIONS, "invalid_package_condition"),
            (self.inventory_status, INVENTORY_STATUSES, "invalid_inventory_status"),
            (self.validation_status, VALIDATION_STATUSES, "invalid_validation_status"),
            (self.payment_status, PAYMENT_STATUSES, "invalid_payment_status"),
            (self.source, PACKAGE_SOURCES, "invalid_source"),
            (self.package_type, PACKAGE_TYPES, "invalid_package_type"),
        ]:
            if value is not None:
                _assert_allowed(value, allowed, detail)
        return self


class PackageMediaPayload(BaseModel):
    media_url: str = Field(min_length=4, max_length=900)
    media_type: str = Field(default="IMAGE", max_length=40)
    caption: str | None = Field(default=None, max_length=220)


class PackageAnomalyPayload(BaseModel):
    anomaly_type: str = Field(default="OTHER", max_length=80)
    severity: str = "MEDIUM"
    title: str = Field(min_length=2, max_length=180)
    description: str | None = None

    @model_validator(mode="after")
    def validate_anomaly(self):
        _assert_allowed(self.severity, ANOMALY_SEVERITIES, "invalid_severity")
        return self


class PackageAnomalyResolvePayload(BaseModel):
    notes: str | None = Field(default=None, max_length=500)


class PackageNotificationPayload(BaseModel):
    channel: str = "whatsapp"
    notification_type: str = Field(default="PACKAGE_UPDATE", max_length=80)
    recipient: str | None = Field(default=None, max_length=160)
    message: str = Field(min_length=2, max_length=1200)

    @model_validator(mode="after")
    def validate_notification(self):
        _assert_allowed(self.channel, NOTIFICATION_CHANNELS, "invalid_channel")
        return self


def _user_id(tenant: dict) -> str:
    return str(tenant.get("user_id") or "")


def _assert_allowed(value: str, allowed: set[str], detail: str):
    if value not in allowed:
        raise ValueError(detail)


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
    payment_status: str | None = None,
    validation_status: str | None = None,
    package_type: str | None = None,
    source: str | None = None,
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
    _validate_query_value(payment_clearance_status, PAYMENT_STATUSES, "invalid_payment_status")
    _validate_query_value(payment_status, PAYMENT_STATUSES, "invalid_payment_status")
    _validate_query_value(validation_status, VALIDATION_STATUSES, "invalid_validation_status")
    _validate_query_value(package_type, PACKAGE_TYPES, "invalid_package_type")
    _validate_query_value(source, PACKAGE_SOURCES, "invalid_source")
    response = list_packages(
        tenant["org_id"],
        q=q,
        status=status_filter,
        condition=condition,
        inventory_status=inventory_status,
        payment_clearance_status=payment_clearance_status,
        payment_status=payment_status,
        validation_status=validation_status,
        package_type=package_type,
        source=source,
        dossier_id=dossier_id,
        client_id=client_id,
        page=page,
        page_size=page_size,
        sort=sort,
    )
    return {"status": "ok", "count": len(response["items"]), "packages": response["items"], **response}


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
    payment_status: str | None = None,
    validation_status: str | None = None,
    package_type: str | None = None,
    source: str | None = None,
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
        payment_status=payment_status,
        validation_status=validation_status,
        package_type=package_type,
        source=source,
        sort=sort,
    )
    output = io.StringIO()
    fieldnames = [
        "package_reference",
        "tracking_id",
        "client_name",
        "dossier_reference",
        "source",
        "package_type",
        "description",
        "category",
        "status",
        "validation_status",
        "payment_status",
        "package_condition",
        "inventory_status",
        "warehouse_name",
        "warehouse_location",
        "origin_country",
        "origin_city",
        "destination_country",
        "destination_city",
        "service_type",
        "weight_kg",
        "volumetric_weight_kg",
        "length_cm",
        "width_cm",
        "height_cm",
        "volume_cbm",
        "pieces_count",
        "declared_value",
        "declared_currency",
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


@router.post("/packages/import")
async def packages_import(file: UploadFile = File(...), tenant=Depends(get_current_tenant)):
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail="invalid_csv_encoding") from exc
    return {"status": "ok", "result": import_packages(tenant["org_id"], _user_id(tenant), text)}


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


@router.post("/packages/{package_id}/media")
def packages_media_create(package_id: str, body: PackageMediaPayload, tenant=Depends(get_current_tenant)):
    package = add_package_media(tenant["org_id"], package_id, _user_id(tenant), body.model_dump())
    if not package:
        raise HTTPException(status_code=404, detail="package_not_found")
    return {"status": "ok", "package": package}


@router.post("/packages/{package_id}/anomalies")
def packages_anomaly_create(package_id: str, body: PackageAnomalyPayload, tenant=Depends(get_current_tenant)):
    package = create_package_anomaly(tenant["org_id"], package_id, _user_id(tenant), body.model_dump())
    if not package:
        raise HTTPException(status_code=404, detail="package_not_found")
    return {"status": "ok", "package": package}


@router.patch("/packages/{package_id}/anomalies/{anomaly_id}/resolve")
def packages_anomaly_resolve(package_id: str, anomaly_id: str, body: PackageAnomalyResolvePayload, tenant=Depends(get_current_tenant)):
    package = resolve_package_anomaly(tenant["org_id"], package_id, anomaly_id, _user_id(tenant), body.notes)
    if not package:
        raise HTTPException(status_code=404, detail="package_or_anomaly_not_found")
    return {"status": "ok", "package": package}


@router.post("/packages/{package_id}/notifications")
def packages_notification_create(package_id: str, body: PackageNotificationPayload, tenant=Depends(get_current_tenant)):
    package = create_package_notification(tenant["org_id"], package_id, _user_id(tenant), body.model_dump())
    if not package:
        raise HTTPException(status_code=404, detail="package_not_found")
    return {"status": "ok", "package": package}
