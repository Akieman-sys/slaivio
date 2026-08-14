from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.core.tenant_context import get_current_tenant
from app.db.pricing_repository import (
    create_pricing_rule,
    list_pricing_rules,
    get_pricing_rule,
    update_pricing_rule,
)

from app.services.pricing_engine import calculate_price
from app.core.permissions import require_permission
from app.pricing_engine import repository as center


router = APIRouter()

def _actor(t): return str(t.get("user_id") or "system")
def _name(t): return str(t.get("actor_name") or "Membre de l'agence")

class GridCreate(BaseModel):
    grid_code:str=Field(min_length=3,max_length=60); name:str=Field(min_length=3,max_length=160); description:str|None=None; workspace_id:str|None=None; route_id:str; shipping_service_id:str
    currency_code:str=Field(default="USD",min_length=3,max_length=3); calculation_method:str="PER_KG"; visibility:str="INTERNAL"; effective_from:datetime=Field(default_factory=lambda:datetime.now(timezone.utc)); effective_until:datetime|None=None
    volumetric_divisor:float=Field(default=6000,gt=0); chargeable_weight_rule:str="MAX"; rounding_increment:float=Field(default=.1,gt=0); minimum_weight_kg:float|None=None; minimum_cbm:float|None=None; maximum_weight_kg:float|None=None; maximum_cbm:float|None=None; maximum_declared_value:float|None=None; tax_inclusive:bool=False; tax_rate:float=Field(default=0,ge=0,le=100); requires_approval:bool=True
class GridRule(BaseModel):
    rule_code:str; name:str; category_id:str|None=None; client_id:str|None=None; client_segment:str|None=None; warehouse_id:str|None=None; office_id:str|None=None; min_weight_kg:float|None=None; max_weight_kg:float|None=None; min_cbm:float|None=None; max_cbm:float|None=None; min_value:float|None=None; max_value:float|None=None; min_units:int|None=None; max_units:int|None=None; conditions:dict={}; action_type:str="SET_PRICE"; calculation_method:str|None=None; amount:float|None=None; percentage:float|None=None; priority:int=100; stackable:bool=False; effective_from:datetime=Field(default_factory=lambda:datetime.now(timezone.utc)); effective_until:datetime|None=None
class Tier(BaseModel): rule_id:str|None=None; basis:str="WEIGHT"; min_quantity:float=0; max_quantity:float|None=None; unit_price:float=Field(ge=0); priority:int=100
class Fee(BaseModel): fee_code:str; name:str; fee_type:str="HANDLING"; calculation_method:str="FIXED"; amount:float=Field(ge=0); conditions:dict={}; taxable:bool=False; priority:int=100
class Cost(BaseModel): cost_code:str; cost_type:str; calculation_method:str="FIXED"; amount:float=Field(ge=0); currency_code:str="USD"; effective_from:datetime=Field(default_factory=lambda:datetime.now(timezone.utc)); effective_until:datetime|None=None
class Transition(BaseModel): status:str; reason:str|None=None
class Decision(BaseModel): note:str|None=None
class Quote(BaseModel):
    route_id:str; shipping_service_id:str; workspace_id:str|None=None; client_id:str|None=None; client_segment:str|None=None; dossier_id:str|None=None; category_code:str; weight_kg:float=Field(default=0,ge=0); volume_cbm:float=Field(default=0,ge=0); length_cm:float|None=None; width_cm:float|None=None; height_cm:float|None=None; units:int=Field(default=1,ge=1); declared_value:float=Field(default=0,ge=0); priced_at:datetime=Field(default_factory=lambda:datetime.now(timezone.utc)); exchange_rate:float=Field(default=1,gt=0); freeze:bool=False; idempotency_key:str|None=None
class SavedView(BaseModel): name:str=Field(min_length=2,max_length=80); filters:dict={}
class Promotion(BaseModel):
    workspace_id:str|None=None; code:str; name:str; discount_type:str="PERCENTAGE"; discount_value:float=Field(gt=0); route_ids:list[str]=[]; service_ids:list[str]=[]; client_ids:list[str]=[]; client_segments:list[str]=[]; conditions:dict={}; stackable:bool=False; usage_limit:int|None=None; status:str="DRAFT"; effective_from:datetime; effective_until:datetime|None=None
class PricingSettings(BaseModel):
    default_currency:str="USD"; minimum_margin_percent:float=15; max_agent_discount_percent:float=3; approval_required:bool=True; allow_discount_stacking:bool=False; default_volumetric_divisor:float=Field(default=6000,gt=0)

@router.get("/pricing")
def pricing_center(tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.read"))): return center.dashboard(tenant["org_id"])
@router.get("/pricing/catalog")
def pricing_catalog(tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.read"))): return center.catalog(tenant["org_id"])
@router.post("/pricing/grids")
def pricing_grid_create(body:GridCreate,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.create"))): return center.create_grid(tenant["org_id"],_actor(tenant),_name(tenant),body.model_dump())
@router.get("/pricing/grids/{grid_id}")
def pricing_grid_detail(grid_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.read"))): return center.detail(tenant["org_id"],grid_id)
@router.post("/pricing/grids/{grid_id}/rules")
def pricing_rule_create(grid_id:str,body:GridRule,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.update"))): return center.add_child(tenant["org_id"],grid_id,"rule",body.model_dump(),_actor(tenant),_name(tenant))
@router.post("/pricing/grids/{grid_id}/tiers")
def pricing_tier_create(grid_id:str,body:Tier,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.update"))): return center.add_child(tenant["org_id"],grid_id,"tier",body.model_dump(),_actor(tenant),_name(tenant))
@router.post("/pricing/grids/{grid_id}/fees")
def pricing_fee_create(grid_id:str,body:Fee,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.update"))): return center.add_child(tenant["org_id"],grid_id,"fee",body.model_dump(),_actor(tenant),_name(tenant))
@router.post("/pricing/grids/{grid_id}/costs")
def pricing_cost_create(grid_id:str,body:Cost,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.costs"))): return center.add_child(tenant["org_id"],grid_id,"cost",body.model_dump(),_actor(tenant),_name(tenant))
@router.post("/pricing/grids/{grid_id}/approve")
def pricing_grid_approve(grid_id:str,body:Decision,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.approve"))): return center.approve(tenant["org_id"],grid_id,_actor(tenant),_name(tenant),body.note)
@router.post("/pricing/grids/{grid_id}/transition")
def pricing_grid_transition(grid_id:str,body:Transition,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.approve"))): return center.transition(tenant["org_id"],grid_id,body.status,_actor(tenant),_name(tenant),body.reason)
@router.post("/pricing/grids/{grid_id}/duplicate")
def pricing_grid_duplicate(grid_id:str,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.create"))): return center.duplicate(tenant["org_id"],grid_id,_actor(tenant),_name(tenant))
@router.post("/pricing/promotions")
def pricing_promotion(body:Promotion,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.update"))): return center.create_promotion(tenant["org_id"],body.model_dump(),_actor(tenant),_name(tenant))
@router.put("/pricing/settings")
def pricing_settings_save(body:PricingSettings,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.settings"))): return center.save_settings(tenant["org_id"],body.model_dump(),_actor(tenant),_name(tenant))
@router.post("/pricing/alerts/detect")
def pricing_alert_detection(tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.analytics"))): return center.detect_alerts(tenant["org_id"])
@router.post("/pricing/quote")
def pricing_quote(body:Quote,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.simulate"))): return center.quote(tenant["org_id"],body.model_dump(),_actor(tenant))
@router.get("/pricing/analytics")
def pricing_analytics(tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.analytics"))): return center.analytics(tenant["org_id"])
@router.post("/pricing/views")
def pricing_view(body:SavedView,tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.read"))): return center.save_view(tenant["org_id"],_actor(tenant),body.name,body.filters)
@router.get("/pricing/export.csv")
def pricing_export(tenant=Depends(get_current_tenant),_=Depends(require_permission("pricing.export"))): return Response(center.export_csv(tenant["org_id"]),media_type="text/csv; charset=utf-8",headers={"Content-Disposition":"attachment; filename=tarification.csv"})


class PricingRequest(BaseModel):
    origin_country: str
    destination_country: str
    origin_city: str | None = None
    destination_city: str | None = None
    shipping_mode: str | None = None
    weight_kg: float | None = None
    volume_cbm: float | None = None
    goods_type: str | None = None
    declared_value: float | None = None


class CreatePricingRuleRequest(BaseModel):
    origin_country: str | None = None
    origin_city: str | None = None
    destination_country: str | None = None
    destination_city: str | None = None
    shipping_mode: str | None = None
    goods_type: str | None = None
    rule_type: str = "PER_KG"
    pricing_mode: str | None = None
    unit: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    price: float
    currency: str = "USD"
    note: str | None = None
    requires_manual_confirmation: bool = False
    priority: int = 0


class UpdatePricingRuleRequest(BaseModel):
    origin_country: str | None = None
    origin_city: str | None = None
    destination_country: str | None = None
    destination_city: str | None = None
    shipping_mode: str | None = None
    goods_type: str | None = None
    rule_type: str | None = None
    pricing_mode: str | None = None
    unit: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    price: float | None = None
    currency: str | None = None
    note: str | None = None
    requires_manual_confirmation: bool | None = None
    priority: int | None = None
    is_active: bool | None = None


@router.post("/pricing/calculate")
def pricing(body: PricingRequest, tenant=Depends(get_current_tenant)):
    org_id = tenant["org_id"]

    result = calculate_price(
        org_id=org_id,
        origin_country=body.origin_country,
        destination_country=body.destination_country,
        origin_city=body.origin_city,
        destination_city=body.destination_city,
        shipping_mode=body.shipping_mode,
        weight_kg=body.weight_kg,
        volume_cbm=body.volume_cbm,
        goods_type=body.goods_type,
        declared_value=body.declared_value,
    )

    return {
        "status": "ok",
        "result": result,
    }


@router.post("/pricing/rules")
def create_rule(body: CreatePricingRuleRequest, tenant=Depends(get_current_tenant)):
    org_id = tenant["org_id"]

    rule = create_pricing_rule(
        org_id=org_id,
        origin_country=body.origin_country,
        origin_city=body.origin_city,
        destination_country=body.destination_country,
        destination_city=body.destination_city,
        shipping_mode=body.shipping_mode,
        goods_type=body.goods_type,
        rule_type=body.rule_type,
        pricing_mode=body.pricing_mode,
        unit=body.unit,
        min_value=body.min_value,
        max_value=body.max_value,
        price=body.price,
        currency=body.currency,
        note=body.note,
        requires_manual_confirmation=body.requires_manual_confirmation,
        priority=body.priority,
    )

    return {
        "status": "ok",
        "rule": rule,
    }


@router.get("/pricing/rules")
def list_rules(limit: int = 100, tenant=Depends(get_current_tenant)):
    org_id = tenant["org_id"]

    rules = list_pricing_rules(
        org_id=org_id,
        limit=limit,
    )

    return {
        "status": "ok",
        "count": len(rules),
        "rules": rules,
    }


@router.get("/pricing/rules/{rule_id}")
def get_rule(rule_id: str, tenant=Depends(get_current_tenant)):
    org_id = tenant["org_id"]

    rule = get_pricing_rule(
        org_id=org_id,
        rule_id=rule_id,
    )

    if not rule:
        raise HTTPException(
            status_code=404,
            detail="Pricing rule not found",
        )

    return {
        "status": "ok",
        "rule": rule,
    }


@router.patch("/pricing/rules/{rule_id}")
def update_rule(
    rule_id: str,
    body: UpdatePricingRuleRequest,
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]

    rule = update_pricing_rule(
        org_id=org_id,
        rule_id=rule_id,
        **body.model_dump(exclude_none=True),
    )

    if not rule:
        raise HTTPException(
            status_code=404,
            detail="Pricing rule not found",
        )

    return {
        "status": "ok",
        "rule": rule,
    }
