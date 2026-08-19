"""Read-only transversal tools used by the SLAIVIO conversational engine."""

import re

from app.ai.repositories.copilot_context_repository import find_client_by_phone
from app.ai.services.dialogue_validation import normalize_text
from app.clients.repository import list_clients
from app.db.dossier_repository import list_dossiers
from app.packages.repository import list_packages
from app.routes_services.repository import list_all, route_listing
from app.tracking.repository import tracking_detail
from app.warehouses.repository import list_warehouses


def _card(kind: str, item: dict, title: str, subtitle: str, href: str) -> dict:
    return {"kind": kind, "id": str(item.get("id") or ""), "title": title,
            "subtitle": subtitle, "href": href}


def _selected_client(org_id: str, phone: str | None) -> dict | None:
    if not phone or str(phone).startswith("internal:"):
        return None
    return find_client_by_phone(org_id, phone)


def _client_search_term(message: str) -> str:
    after_client = re.search(r"(?i)\bclient\b(?:\s+(?:nomm?[ée]?|nomer|appel[ée]?))?\s+(.+?)[?.!]*$", message.strip())
    if after_client:
        return " ".join(after_client.group(1).split()).strip(" ?.!")
    value = re.sub(
        r"(?i)\b(est[- ]?ce qu['’]il y a|existe[- ]?t[- ]?il|trouve|cherche|recherche|affiche|montre|client|nomm?[ée]?|appel[ée]?)\b",
        " ", message,
    )
    return " ".join(value.replace("?", " ").split()).strip()


def _package_lines(items: list[dict]) -> tuple[str, list[dict]]:
    lines, cards = [], []
    for item in items[:10]:
        reference = item.get("package_reference") or item.get("tracking_id") or "Colis"
        status = item.get("status") or "Statut non renseigné"
        route = " → ".join(filter(None, [item.get("origin_city") or item.get("origin_country"), item.get("destination_city") or item.get("destination_country")]))
        lines.append(f"• {reference} — {status}" + (f" — {route}" if route else ""))
        cards.append(_card("PACKAGE", item, reference, f"{status}" + (f" · {route}" if route else ""), f"/app/packages?open={item.get('id')}"))
    return "\n".join(lines), cards


def answer_platform_query(org_id: str, message: str, client_phone: str | None = None,
                          workspace_id: str | None = None) -> dict | None:
    """Return an immediate tenant-scoped answer, or None for action workflows."""
    normalized = normalize_text(message)
    selected = _selected_client(org_id, client_phone)
    lookup_words = ("trouve", "cherche", "recherche", "affiche", "montre", "liste", "existe", "enregistre", "enregistré")

    if "client" in normalized and any(word in normalized for word in lookup_words):
        query = _client_search_term(message)
        result = list_clients(org_id, q=query or None, page=1, page_size=10, sort="name_asc")
        items = result["items"]
        if not items:
            return {"content": f"Je n’ai trouvé aucun client correspondant à « {query or message} » dans cette agence.", "tool":"clients.search", "cards":[]}
        cards = [_card("CLIENT", item, item.get("display_name") or "Client", item.get("phone") or item.get("email") or "Coordonnées non renseignées", f"/app/clients?open={item['id']}") for item in items]
        summary = ", ".join(f"{x.get('display_name')} ({x.get('phone') or 'sans téléphone'})" for x in items[:5])
        return {"content": f"J’ai trouvé {len(items)} client(s) correspondant(s) : {summary}.", "tool":"clients.search", "cards":cards}

    creation = any(word in normalized for word in ("cree", "creer", "prepare", "ajoute", "nouveau"))
    if "colis" in normalized and not creation and any(word in normalized for word in lookup_words + ("mes", "ses", "les")):
        result = list_packages(org_id, client_id=selected.get("id") if selected else None, q=None, page=1, page_size=20)
        items = result["items"]
        owner = f" de {selected.get('display_name')}" if selected else " de l’agence"
        if not items:
            return {"content": f"Aucun colis enregistré{owner}.", "tool":"packages.list", "cards":[]}
        lines, cards = _package_lines(items)
        total = result["pagination"]["total"]
        return {"content": f"Voici les colis enregistrés{owner} ({total} au total) :\n{lines}", "tool":"packages.list", "cards":cards}

    if "dossier" in normalized and not creation and any(word in normalized for word in lookup_words + ("mes", "ses", "les")):
        result = list_dossiers(org_id, client_id=selected.get("id") if selected else None, page=1, page_size=20)
        items = result["items"]
        if not items:
            return {"content":"Aucun dossier correspondant n’a été trouvé.", "tool":"dossiers.list", "cards":[]}
        cards=[]; lines=[]
        for item in items[:10]:
            ref=item.get("dossier_reference") or "Dossier"; status=item.get("status_global") or "Statut non renseigné"
            lines.append(f"• {ref} — {status} — {item.get('client_name') or 'Client non renseigné'}")
            cards.append(_card("DOSSIER",item,ref,f"{status} · {item.get('client_name') or ''}",f"/app/dossiers?open={item['id']}"))
        return {"content":f"J’ai trouvé {result['pagination']['total']} dossier(s) :\n"+"\n".join(lines),"tool":"dossiers.list","cards":cards}

    tracking_match = re.search(r"\b(?:COL|EXP|TRK)-[A-Z0-9-]+\b", message.upper())
    if tracking_match and any(word in normalized for word in ("ou", "statut", "suivi", "tracking", "arrive")):
        reference=tracking_match.group(0); detail=tracking_detail(org_id,reference)
        if detail:
            return {"content":f"{reference} est actuellement « {detail.get('status') or 'statut inconnu'} ». Dernière position : {detail.get('last_location') or 'non renseignée'}.","tool":"tracking.read","cards":[]}
        packages=list_packages(org_id,q=reference,page=1,page_size=5)["items"]
        if packages:
            lines,cards=_package_lines(packages)
            return {"content":f"J’ai retrouvé ce colis :\n{lines}","tool":"packages.search","cards":cards}
        return {"content":f"Je ne trouve aucun suivi correspondant à {reference} dans cette agence.","tool":"tracking.read","cards":[]}

    if "route" in normalized and any(word in normalized for word in lookup_words + ("active", "disponible", "desserv")):
        result=route_listing(org_id,status="ACTIVE",workspace=workspace_id,limit=20,offset=0); items=result["items"]
        lines=[f"• {x.get('route_name')} — {x.get('transport_mode')} — {x.get('eta_min_days') or '?'} à {x.get('eta_max_days') or '?'} jours" for x in items[:10]]
        cards=[_card("ROUTE",x,x.get("route_name") or x.get("route_code"),x.get("transport_mode") or "",f"/app/routes?open={x['id']}") for x in items[:10]]
        return {"content":("Routes actives :\n"+"\n".join(lines)) if items else "Aucune route active n’est configurée.","tool":"routes.list","cards":cards}

    if "service" in normalized and any(word in normalized for word in lookup_words + ("propose", "disponible", "actif")):
        items=[x for x in list_all(org_id)["services"] if x.get("active")][:20]
        lines=[f"• {x.get('service_name')} — {x.get('shipping_mode') or x.get('service_type') or 'Service'}" for x in items[:10]]
        cards=[_card("SERVICE",x,x.get("service_name") or x.get("service_code"),x.get("route_name") or "",f"/app/services?open={x['id']}") for x in items[:10]]
        return {"content":("Services actifs :\n"+"\n".join(lines)) if items else "Aucun service actif n’est configuré.","tool":"services.list","cards":cards}

    if any(word in normalized for word in ("entrepot", "warehouse")) and any(word in normalized for word in lookup_words + ("adresse", "horaire", "ou")):
        query=None
        for item in ("guangzhou","yiwu","dubai","kinshasa","goma","douala"):
            if item in normalized: query=item; break
        items=list_warehouses(org_id,q=query,active=True)
        lines=[f"• {x.get('warehouse_name')} — {x.get('address') or x.get('city') or 'adresse non renseignée'}" for x in items[:10]]
        cards=[_card("WAREHOUSE",x,x.get("warehouse_name"),x.get("address") or x.get("city") or "",f"/app/warehouses/{x['id']}") for x in items[:10]]
        return {"content":("Entrepôts disponibles :\n"+"\n".join(lines)) if items else "Aucun entrepôt correspondant n’est configuré.","tool":"warehouses.list","cards":cards}

    return None
