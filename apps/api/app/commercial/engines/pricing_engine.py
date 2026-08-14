from fastapi import HTTPException
from app.routes_services.repository import simulate
from app.pricing_engine.repository import quote as quote_from_engine
from app.db.database import engine
from sqlalchemy import text
from datetime import datetime, timezone

def calculate_quote_pricing(org_id:str,shipping_service_id:str,weight_kg:float|None=None,volume_cbm:float|None=None,declared_value:float|None=None,client_id:str|None=None,goods_category:str|None=None):
    # The governed Pricing Engine is the primary source. Legacy service
    # components remain a compatibility fallback during migration.
    with engine.connect() as conn:
        service = conn.execute(text("select route_id from shipping_services where org_id=:o and id=cast(:s as uuid)"), {"o": org_id, "s": shipping_service_id}).mappings().first()
    if service and service.get("route_id"):
        try:
            priced = quote_from_engine(org_id, {
                "route_id": str(service["route_id"]), "shipping_service_id": shipping_service_id,
                "category_code": goods_category or "ORDINARY_GOODS", "weight_kg": weight_kg or 0,
                "volume_cbm": volume_cbm or 0, "declared_value": declared_value or 0,
                "units": 1, "client_id": client_id, "priced_at": datetime.now(timezone.utc),
                "freeze": False, "exchange_rate": 1,
            }, "commercial-engine")
            return {"pricing_available":True,"subtotal_minor":round(priced["subtotal"]*100),"total_minor":round(priced["total"]*100),"currency_code":priced["currency"],"breakdown":priced["breakdown"],"pricing_fingerprint":priced["fingerprint"],"restriction":None,"chargeable_weight_kg":priced["chargeable_weight_kg"],"grid_id":priced["grid_id"],"grid_version":priced["grid_version"]}
        except HTTPException as exc:
            if exc.detail not in {"no_active_pricing_grid"}: raise
    try:
        result=simulate(org_id,shipping_service_id,weight_kg,volume_cbm,declared_value or 0,client_id,goods_category,"commercial-engine")
    except HTTPException as exc:
        if exc.detail in {"service_not_found"}:return {"pricing_available":False,"subtotal_minor":None,"total_minor":None,"currency_code":None,"breakdown":[]}
        raise
    return {"pricing_available":True,"subtotal_minor":result["total_minor"],"total_minor":result["total_minor"],"currency_code":result["currency"],"breakdown":result["breakdown"],"pricing_fingerprint":result["pricing_fingerprint"],"restriction":result["restriction"],"chargeable_weight_kg":result["chargeable_weight_kg"]}
