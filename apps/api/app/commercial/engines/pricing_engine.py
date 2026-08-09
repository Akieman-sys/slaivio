from fastapi import HTTPException
from app.routes_services.repository import simulate

def calculate_quote_pricing(org_id:str,shipping_service_id:str,weight_kg:float|None=None,volume_cbm:float|None=None,declared_value:float|None=None,client_id:str|None=None,goods_category:str|None=None):
    try:
        result=simulate(org_id,shipping_service_id,weight_kg,volume_cbm,declared_value or 0,client_id,goods_category,"commercial-engine")
    except HTTPException as exc:
        if exc.detail in {"service_not_found"}:return {"pricing_available":False,"subtotal_minor":None,"total_minor":None,"currency_code":None,"breakdown":[]}
        raise
    return {"pricing_available":True,"subtotal_minor":result["total_minor"],"total_minor":result["total_minor"],"currency_code":result["currency"],"breakdown":result["breakdown"],"pricing_fingerprint":result["pricing_fingerprint"],"restriction":result["restriction"],"chargeable_weight_kg":result["chargeable_weight_kg"]}
