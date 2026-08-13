from __future__ import annotations
import re
from app.routes_services.repository import list_all,simulate
from app.tracking.repository import tracking_detail
from app.warehouses.repository import list_warehouses
from app.db.office_repository import list_offices

def catalog(org_id:str)->dict:
    routes=list_all(org_id);return {**routes,"warehouses":list_warehouses(org_id),"offices":list_offices(org_id)}

def resolve(org_id:str,question:str,context:dict,actor_id:str)->dict|None:
    q=question.lower()
    if any(x in q for x in ("tarif","prix","coût","cost","quote")):
        required=[x for x in ("service_id","weight_kg","volume_cbm") if context.get(x) is None]
        if required:return {"decision":"NEEDS_CONTEXT","answer":"Informations requises pour un calcul fiable : "+", ".join(required),"structured_sources":[],"required_fields":required}
        result=simulate(org_id,str(context["service_id"]),context.get("weight_kg"),context.get("volume_cbm"),context.get("declared_value",0),context.get("client_id"),context.get("goods_category"),actor_id)
        return {"decision":"ANSWERED","answer":f"Montant calculé : {result['total_minor']/100:.2f} {result['currency']}. Poids facturable : {result['chargeable_weight_kg']} kg. Délai estimé : {result['eta']['min_days']}–{result['eta']['max_days']} jours.","structured_sources":[{"type":"PRICING_ENGINE","id":context["service_id"],"fingerprint":result["pricing_fingerprint"]}],"data":result}
    if any(x in q for x in ("tracking","suivi","où est","statut du colis")):
        tracking_id=context.get("tracking_id") or next(iter(re.findall(r"(?:TRK|SLA|EXP)-[A-Z0-9-]+",question.upper())),None)
        if not tracking_id:return {"decision":"NEEDS_CONTEXT","answer":"Indiquez le numéro de tracking.","structured_sources":[],"required_fields":["tracking_id"]}
        item=tracking_detail(org_id,str(tracking_id))
        if not item:return {"decision":"NO_RESULT","answer":"Aucun suivi correspondant n’a été trouvé dans cette agence.","structured_sources":[]}
        return {"decision":"ANSWERED","answer":f"{item.get('tracking_id') or tracking_id} : {item.get('status')}. Dernière position : {item.get('last_location') or 'non renseignée'}. ETA : {item.get('eta_at') or 'non confirmée'}.","structured_sources":[{"type":"TRACKING","id":str(item.get('id') or tracking_id),"updated_at":str(item.get('updated_at'))}],"data":item}
    return None
