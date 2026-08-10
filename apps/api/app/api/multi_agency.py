from fastapi import APIRouter, Depends
from app.core.platform_permissions import require_platform_permission
from pydantic import BaseModel

from app.multi_agency.repositories.warehouse_repository import (
    create_warehouse,
    list_warehouses,
)
from app.multi_agency.services.hierarchy_service import (
    get_enterprise_hierarchy,
    setup_group_country,
)


router = APIRouter()


class SetupGroupCountryRequest(BaseModel):
    group_code: str
    group_name: str
    country_code: str
    country_name: str
    default_currency_code: str = "USD"
    default_timezone: str = "UTC"


class CreateWarehouseRequest(BaseModel):
    org_id: str
    group_id: str | None = None
    country_id: str | None = None
    warehouse_code: str
    warehouse_name: str
    warehouse_type: str
    country_code: str | None = None
    city: str | None = None
    address: str | None = None
    contact_phone: str | None = None
    contact_name: str | None = None


@router.post("/multi-agency/setup-country", dependencies=[Depends(require_platform_permission("platform.agencies.manage"))])
def create_group_country_route(
    body: SetupGroupCountryRequest,
):
    return {
        "status": "ok",
        **setup_group_country(
            group_code=body.group_code,
            group_name=body.group_name,
            country_code=body.country_code,
            country_name=body.country_name,
            default_currency_code=body.default_currency_code,
            default_timezone=body.default_timezone,
        ),
    }


@router.get("/multi-agency/hierarchy", dependencies=[Depends(require_platform_permission("platform.admin.read"))])
def hierarchy():
    return {
        "status": "ok",
        **get_enterprise_hierarchy(),
    }


@router.post("/multi-agency/warehouses", dependencies=[Depends(require_platform_permission("platform.agencies.manage"))])
def create_warehouse_route(
    body: CreateWarehouseRequest,
):
    return {
        "status": "ok",
        "warehouse": create_warehouse(
            org_id=body.org_id,
            group_id=body.group_id,
            country_id=body.country_id,
            warehouse_code=body.warehouse_code,
            warehouse_name=body.warehouse_name,
            warehouse_type=body.warehouse_type,
            country_code=body.country_code,
            city=body.city,
            address=body.address,
            contact_phone=body.contact_phone,
            contact_name=body.contact_name,
        ),
    }


@router.get("/multi-agency/warehouses", dependencies=[Depends(require_platform_permission("platform.admin.read"))])
def warehouses(
    org_id: str | None = None,
):
    return {
        "status": "ok",
        "warehouses": list_warehouses(org_id=org_id),
    }

