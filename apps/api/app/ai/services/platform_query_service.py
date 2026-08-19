"""Read-only transversal tools used by the SLAIVIO conversational engine."""

import re
import unicodedata
from datetime import datetime, timedelta, timezone

from app.ai.repositories.copilot_context_repository import find_client_by_phone
from app.ai.services.dialogue_validation import normalize_text
from app.clients.repository import list_clients
from app.db.dossier_repository import list_dossiers
from app.db.dossier_alert_repository import list_dossier_alerts
from app.db.batch_repository import list_batches
from app.db.broadcast_repository import dashboard as broadcast_dashboard
from app.db.followup_repository import followup_dashboard
from app.departures.repository import listing as departure_listing
from app.expeditions.repository import list_expeditions
from app.finance.repository import list_documents as list_finance_documents, stats as finance_stats
from app.knowledge.repository import search as search_knowledge
from app.packages.repository import list_packages, package_alerts
from app.pickups.repository import queue as pickup_queue
from app.pricing_engine.repository import catalog as pricing_catalog, quote as pricing_quote
from app.reports.repository import dashboard as reports_dashboard
from app.permissions.services.permission_service import assert_permission
from app.routes_services.repository import list_all, route_listing
from app.tracking.repository import tracking_detail, list_alerts as list_tracking_alerts
from app.warehouses.repository import list_warehouses


PERMISSIONS={"clients.search":"clients.read","packages.list":"packages.read","packages.search":"packages.read",
    "dossiers.list":"dossiers.read","tracking.read":"tracking.read","routes.list":"routes.read",
    "services.list":"services.read","warehouses.list":"warehouses.read","pricing.quote":"pricing.simulate",
    "pricing.clarify":"pricing.simulate","departures.list":"departures.read","batches.list":"batches.read",
    "shipments.list":"shipments.read","pickups.list":"pickups.read","finance.list":"finance.read",
    "followups.list":"followups.read","broadcasts.list":"broadcasts.read","knowledge.search":"knowledge.read"}
PERMISSIONS["operations.overview"] = "analytics.read"
WHATSAPP_CAPABILITIES={"packages.list","packages.search","dossiers.list","routes.list","services.list",
                       "warehouses.list","pricing.quote","pricing.clarify","departures.list","knowledge.search"}


def _intent_text(value: str) -> str:
    value=re.sub(r"[’']"," ",value)
    value=unicodedata.normalize("NFKD",value.lower()).encode("ascii","ignore").decode("ascii")
    return " ".join(re.sub(r"[^a-z0-9]+"," ",value).split())


def _require(org_id: str, actor_id: str | None, channel: str, capability: str):
    if channel.upper()=="WHATSAPP":
        if capability not in WHATSAPP_CAPABILITIES: raise PermissionError("channel_capability_denied")
        return
    if not actor_id: raise PermissionError("actor_required")
    assert_permission(actor_id,org_id,PERMISSIONS[capability])


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


def _pricing_answer(org_id: str, message: str, selected: dict | None,
                    workspace_id: str | None) -> dict:
    data=pricing_catalog(org_id); normalized=normalize_text(message)
    weight_match=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:kg|kilo)",normalized)
    cbm_match=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:cbm|m3|m³)",normalized)
    route=next((r for r in data["routes"] if all(
        not value or normalize_text(str(value)) in normalized
        for value in (r.get("origin_city") or r.get("origin_country"),r.get("destination_city") or r.get("destination_country"))
    )),None)
    mode=next((x for x in ("air","sea","express","road") if x in normalized),None)
    services=[s for s in data["services"] if route and str(s.get("route_id"))==str(route.get("id"))]
    service=next((s for s in services if not mode or mode in normalize_text(str(s.get("shipping_mode") or s.get("service_name")))),None)
    missing=[]
    if not route:missing.append("la route (origine et destination)")
    if not service:missing.append("le service")
    if not weight_match and not cbm_match:missing.append("le poids ou le volume")
    if missing:
        return {"content":"Pour calculer le tarif réel, indiquez "+", ".join(missing)+". Exemple : « 45 kg de vêtements, Guangzhou vers Kinshasa en Air ».","tool":"pricing.clarify","cards":[]}
    category=next((c.get("code") for c in data["categories"] if normalize_text(str(c.get("name") or c.get("code"))) in normalized),"ORDINARY_GOODS")
    result=pricing_quote(org_id,{"route_id":str(route["id"]),"shipping_service_id":str(service["id"]),"category_code":category,
        "weight_kg":float(weight_match.group(1).replace(",",".")) if weight_match else 0,
        "volume_cbm":float(cbm_match.group(1).replace(",",".")) if cbm_match else 0,
        "client_id":selected.get("id") if selected else None,"workspace_id":workspace_id,
        "priced_at":datetime.now(timezone.utc),"freeze":False},"ai-assistant")
    breakdown="\n".join(f"• {x.get('label')}: {x.get('amount')} {result['currency']}" for x in result.get("breakdown",[]))
    return {"content":f"Tarif calculé par le moteur officiel : {result['total']} {result['currency']}.\nPoids facturable : {result['chargeable_weight_kg']} kg.\n{breakdown}","tool":"pricing.quote","cards":[]}


def answer_platform_query(org_id: str, message: str, client_phone: str | None = None,
                          workspace_id: str | None = None, actor_id: str | None = None,
                          channel: str = "INTERNAL") -> dict | None:
    """Return an immediate tenant-scoped answer, or None for action workflows."""
    normalized = normalize_text(message)
    intent_text = _intent_text(message)
    selected = _selected_client(org_id, client_phone)
    lookup_words = ("trouve", "cherche", "recherche", "affiche", "montre", "liste", "existe", "enregistre", "enregistré")
    if re.search(r"\bCOL-[A-Z0-9-]+\b",message.upper()) and any(word in normalized for word in ("marque","passe","change","mets")):
        return None
    if re.search(r"\bFUP-[A-Z0-9-]+\b",message.upper()) and any(word in normalized for word in ("reporte","decale","décale","pause","reprend","termine","escalade","annule")):
        return None

    if "client" in normalized and any(word in normalized for word in lookup_words):
        _require(org_id,actor_id,channel,"clients.search")
        query = _client_search_term(message)
        result = list_clients(org_id, q=query or None, page=1, page_size=10, sort="name_asc")
        items = result["items"]
        if not items:
            return {"content": f"Je n’ai trouvé aucun client correspondant à « {query or message} » dans cette agence.", "tool":"clients.search", "cards":[]}
        cards = [_card("CLIENT", item, item.get("display_name") or "Client", item.get("phone") or item.get("email") or "Coordonnées non renseignées", f"/app/clients?open={item['id']}") for item in items]
        summary = ", ".join(f"{x.get('display_name')} ({x.get('phone') or 'sans téléphone'})" for x in items[:5])
        return {"content": f"J’ai trouvé {len(items)} client(s) correspondant(s) : {summary}.", "tool":"clients.search", "cards":cards}

    creation = any(word in normalized for word in ("cree", "creer", "prepare", "ajoute", "nouveau"))

    overview_requested = any(phrase in intent_text for phrase in (
        "resume de l agence", "resume l agence", "situation de l agence", "situation aujourd hui",
        "vue d ensemble", "activite aujourd hui", "activite de l agence", "indicateurs de l agence",
        "rapport de l agence", "bilan de l agence",
    ))
    if overview_requested:
        _require(org_id,actor_id,channel,"operations.overview")
        data=reports_dashboard(org_id)
        kpis=data.get("kpis") or {}; finance=data.get("finance") or []
        lines=[
            f"• {kpis.get('clients',0)} nouveaux clients",
            f"• {kpis.get('dossiers',0)} dossiers créés",
            f"• {kpis.get('packages',0)} colis reçus, pour {kpis.get('weight_kg',0):g} kg",
            f"• {kpis.get('shipments',0)} expéditions créées",
            f"• {kpis.get('pickups',0)} retraits enregistrés",
        ]
        if finance:
            outstanding=" · ".join(f"{row.get('outstanding',0):g} {row.get('currency') or ''} à recevoir" for row in finance)
            lines.append(f"• {outstanding}")
        cards=[
            {"kind":"REPORT","id":"operations","title":"Rapports & analytics","subtitle":f"Période du {data['period']['start']} au {data['period']['end']}","href":"/app/reports"},
            {"kind":"PACKAGE","id":"packages","title":"Colis","subtitle":f"{kpis.get('packages',0)} sur la période","href":"/app/packages"},
            {"kind":"SHIPMENT","id":"shipments","title":"Expéditions","subtitle":f"{kpis.get('shipments',0)} sur la période","href":"/app/shipments"},
        ]
        return {"content":"Voici le bilan opérationnel des 30 derniers jours :\n"+"\n".join(lines),"tool":"operations.overview","cards":cards}

    priorities_requested = any(phrase in intent_text for phrase in (
        "que dois je traiter", "a traiter aujourd hui", "priorites du jour", "priorite du jour",
        "urgences du jour", "blocages de l agence", "problemes a traiter", "actions prioritaires",
    ))
    if priorities_requested:
        _require(org_id,actor_id,channel,"operations.overview")
        followups=followup_dashboard(org_id,date_scope="TODAY",page=1,page_size=10)
        package_issues=package_alerts(org_id,status="OPEN")
        dossier_issues=list_dossier_alerts(org_id)
        tracking_issues=list_tracking_alerts(org_id,status="OPEN")
        ready_pickups=pickup_queue(org_id,status="READY",page=1,page_size=10)
        counts={
            "relances": followups["pagination"]["total"], "colis": len(package_issues),
            "dossiers": len(dossier_issues), "tracking": len(tracking_issues),
            "retraits": ready_pickups["pagination"]["total"],
        }
        cards=[]
        for item in followups.get("items",[])[:3]:
            cards.append(_card("FOLLOWUP",item,item.get("reference") or "Relance",item.get("reason") or "À traiter",f"/app/followups?open={item['id']}"))
        for item in package_issues[:3]:
            cards.append({"kind":"PACKAGE","id":str(item.get("package_id") or item.get("id")),"title":item.get("package_reference") or "Alerte colis","subtitle":item.get("message") or item.get("alert_type") or "À vérifier","href":f"/app/packages?open={item.get('package_id')}"})
        for item in dossier_issues[:2]:
            cards.append({"kind":"DOSSIER","id":str(item.get("dossier_id")),"title":item.get("dossier_reference") or "Alerte dossier","subtitle":item.get("title") or item.get("message") or "À vérifier","href":f"/app/dossiers?open={item.get('dossier_id')}"})
        lines=[
            f"• {counts['relances']} relance(s) prévues aujourd’hui",
            f"• {counts['colis']} alerte(s) colis ouverte(s)",
            f"• {counts['dossiers']} alerte(s) dossier active(s)",
            f"• {counts['tracking']} incident(s) de suivi ouvert(s)",
            f"• {counts['retraits']} retrait(s) prêt(s)",
        ]
        total=sum(counts.values())
        content="Aucune priorité opérationnelle n’est actuellement remontée." if not total else "Voici les priorités opérationnelles détectées :\n"+"\n".join(lines)
        return {"content":content,"tool":"operations.overview","cards":cards[:10]}

    if any(word in normalized for word in ("prix","tarif","combien coute","combien pour","devis")) and not creation:
        _require(org_id,actor_id,channel,"pricing.quote")
        return _pricing_answer(org_id,message,selected,workspace_id)
    if "colis" in normalized and not creation and any(word in normalized for word in lookup_words + ("mes", "ses", "les")):
        _require(org_id,actor_id,channel,"packages.list")
        result = list_packages(org_id, client_id=selected.get("id") if selected else None, q=None, page=1, page_size=20)
        items = result["items"]
        owner = f" de {selected.get('display_name')}" if selected else " de l’agence"
        if not items:
            return {"content": f"Aucun colis enregistré{owner}.", "tool":"packages.list", "cards":[]}
        lines, cards = _package_lines(items)
        total = result["pagination"]["total"]
        return {"content": f"Voici les colis enregistrés{owner} ({total} au total) :\n{lines}", "tool":"packages.list", "cards":cards}

    if "dossier" in normalized and not creation and any(word in normalized for word in lookup_words + ("mes", "ses", "les")):
        _require(org_id,actor_id,channel,"dossiers.list")
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
        _require(org_id,actor_id,channel,"tracking.read")
        reference=tracking_match.group(0); detail=tracking_detail(org_id,reference)
        if detail:
            return {"content":f"{reference} est actuellement « {detail.get('status') or 'statut inconnu'} ». Dernière position : {detail.get('last_location') or 'non renseignée'}.","tool":"tracking.read","cards":[]}
        packages=list_packages(org_id,q=reference,page=1,page_size=5)["items"]
        if packages:
            lines,cards=_package_lines(packages)
            return {"content":f"J’ai retrouvé ce colis :\n{lines}","tool":"packages.search","cards":cards}
        return {"content":f"Je ne trouve aucun suivi correspondant à {reference} dans cette agence.","tool":"tracking.read","cards":[]}

    if "route" in normalized and any(word in normalized for word in lookup_words + ("active", "disponible", "desserv")):
        _require(org_id,actor_id,channel,"routes.list")
        result=route_listing(org_id,status="ACTIVE",workspace=workspace_id,limit=20,offset=0); items=result["items"]
        lines=[f"• {x.get('route_name')} — {x.get('transport_mode')} — {x.get('eta_min_days') or '?'} à {x.get('eta_max_days') or '?'} jours" for x in items[:10]]
        cards=[_card("ROUTE",x,x.get("route_name") or x.get("route_code"),x.get("transport_mode") or "",f"/app/routes?open={x['id']}") for x in items[:10]]
        return {"content":("Routes actives :\n"+"\n".join(lines)) if items else "Aucune route active n’est configurée.","tool":"routes.list","cards":cards}

    if "service" in normalized and any(word in normalized for word in lookup_words + ("propose", "disponible", "actif")):
        _require(org_id,actor_id,channel,"services.list")
        items=[x for x in list_all(org_id)["services"] if x.get("active")][:20]
        lines=[f"• {x.get('service_name')} — {x.get('shipping_mode') or x.get('service_type') or 'Service'}" for x in items[:10]]
        cards=[_card("SERVICE",x,x.get("service_name") or x.get("service_code"),x.get("route_name") or "",f"/app/services?open={x['id']}") for x in items[:10]]
        return {"content":("Services actifs :\n"+"\n".join(lines)) if items else "Aucun service actif n’est configuré.","tool":"services.list","cards":cards}

    if any(word in normalized for word in ("entrepot", "warehouse")) and any(word in normalized for word in lookup_words + ("adresse", "horaire", "ou")):
        _require(org_id,actor_id,channel,"warehouses.list")
        query=None
        for item in ("guangzhou","yiwu","dubai","kinshasa","goma","douala"):
            if item in normalized: query=item; break
        items=list_warehouses(org_id,q=query,active=True)
        lines=[f"• {x.get('warehouse_name')} — {x.get('address') or x.get('city') or 'adresse non renseignée'}" for x in items[:10]]
        cards=[_card("WAREHOUSE",x,x.get("warehouse_name"),x.get("address") or x.get("city") or "",f"/app/warehouses/{x['id']}") for x in items[:10]]
        return {"content":("Entrepôts disponibles :\n"+"\n".join(lines)) if items else "Aucun entrepôt correspondant n’est configuré.","tool":"warehouses.list","cards":cards}

    if any(word in normalized for word in ("depart", "départ", "calendrier")) and not creation:
        _require(org_id,actor_id,channel,"departures.list")
        items=departure_listing(org_id,start=datetime.now(timezone.utc),end=datetime.now(timezone.utc)+timedelta(days=30))
        lines=[];cards=[]
        for x in items[:10]:
            ref=x.get("departure_reference") or x.get("reference") or "Départ"; route=x.get("route_name") or x.get("service_name") or "Route"
            lines.append(f"• {ref} — {route} — {x.get('scheduled_at')} — {x.get('status')}")
            cards.append(_card("DEPARTURE",x,ref,f"{route} · {x.get('status')}",f"/app/departures?open={x['id']}"))
        return {"content":("Prochains départs :\n"+"\n".join(lines)) if items else "Aucun départ n’est planifié dans les 30 prochains jours.","tool":"departures.list","cards":cards}

    if any(word in normalized for word in ("batch","groupage")) and not creation:
        _require(org_id,actor_id,channel,"batches.list")
        items=list_batches(org_id,limit=20);lines=[];cards=[]
        for x in items[:10]:
            ref=x.get("batch_reference") or x.get("batch_code") or "Batch";status=x.get("status") or "Statut non renseigné"
            lines.append(f"• {ref} — {status}");cards.append(_card("BATCH",x,ref,status,f"/app/batches?open={x['id']}"))
        return {"content":("Batchs récents :\n"+"\n".join(lines)) if items else "Aucun batch n’est enregistré.","tool":"batches.list","cards":cards}

    if any(word in normalized for word in ("expedition","expédition")) and not creation:
        _require(org_id,actor_id,channel,"shipments.list")
        result=list_expeditions(org_id,page=1,page_size=20);items=result["items"];lines=[];cards=[]
        for x in items[:10]:
            ref=x.get("expedition_reference") or "Expédition";status=x.get("status") or "Statut non renseigné"
            lines.append(f"• {ref} — {status} — {x.get('route_label') or x.get('destination_city') or ''}");cards.append(_card("SHIPMENT",x,ref,status,f"/app/shipments/{x['id']}"))
        return {"content":("Expéditions récentes :\n"+"\n".join(lines)) if items else "Aucune expédition n’est enregistrée.","tool":"shipments.list","cards":cards}

    if any(word in normalized for word in ("retrait","pickup")) and not creation:
        _require(org_id,actor_id,channel,"pickups.list")
        result=pickup_queue(org_id,page=1,page_size=20);items=result["items"];lines=[];cards=[]
        for x in items[:10]:
            ref=x.get("pickup_reference") or "Retrait";status=x.get("status") or "Statut non renseigné"
            lines.append(f"• {ref} — {x.get('client_name') or 'Client'} — {status}");cards.append(_card("PICKUP",x,ref,status,f"/app/pickups?open={x['id']}"))
        return {"content":("Retraits :\n"+"\n".join(lines)) if items else "Aucun retrait correspondant n’est enregistré.","tool":"pickups.list","cards":cards}

    if any(word in normalized for word in ("facture","paiement","impaye","impayé","finance")) and not creation:
        _require(org_id,actor_id,channel,"finance.list")
        status="OVERDUE" if any(x in normalized for x in ("impaye","impayé","retard")) else None
        result=list_finance_documents(org_id,status=status,page=1,page_size=20);items=result["items"];summary=finance_stats(org_id);lines=[];cards=[]
        for x in items[:10]:
            ref=x.get("document_number") or x.get("reference") or "Document";state=x.get("status") or "Statut non renseigné"
            lines.append(f"• {ref} — {state} — {x.get('total') or 0} {x.get('currency') or ''}");cards.append(_card("FINANCE",x,ref,state,f"/app/finance?open={x['id']}"))
        return {"content":f"Situation financière : {summary.get('outstanding',0)} à recevoir.\n"+("Documents :\n"+"\n".join(lines) if lines else "Aucun document correspondant."),"tool":"finance.list","cards":cards}

    if any(word in normalized for word in ("relance","relancer")) and not creation:
        _require(org_id,actor_id,channel,"followups.list")
        scope="TODAY" if "aujourd" in normalized else "OVERDUE" if "retard" in normalized else None
        result=followup_dashboard(org_id,date_scope=scope,page=1,page_size=20);items=result["items"];lines=[];cards=[]
        for x in items[:10]:
            ref=x.get("reference") or "Relance";status=x.get("status") or "Statut non renseigné"
            lines.append(f"• {ref} — {x.get('client_name') or 'Client'} — {x.get('reason') or x.get('followup_type')} — {status}");cards.append(_card("FOLLOWUP",x,ref,status,f"/app/followups?open={x['id']}"))
        return {"content":f"Relances : {result['stats'].get('due_today',0)} aujourd’hui, {result['stats'].get('overdue',0)} en retard.\n"+"\n".join(lines),"tool":"followups.list","cards":cards}

    if any(word in normalized for word in ("broadcast","campagne")) and not creation:
        _require(org_id,actor_id,channel,"broadcasts.list")
        result=broadcast_dashboard(org_id,page=1,page_size=20);items=result["items"];lines=[];cards=[]
        for x in items[:10]:
            ref=x.get("reference") or x.get("title") or "Campagne";status=x.get("status") or "Statut non renseigné"
            lines.append(f"• {ref} — {status} — {x.get('recipients') or 0} destinataires");cards.append(_card("BROADCAST",x,ref,status,f"/app/broadcasts?open={x['id']}"))
        return {"content":f"Campagnes : {result['stats'].get('active',0)} actives, {result['stats'].get('scheduled',0)} programmées.\n"+"\n".join(lines),"tool":"broadcasts.list","cards":cards}

    if any(word in normalized for word in ("document", "interdit", "autorise", "autorisé", "procedure", "procédure", "regle", "règle", "comment", "horaire")):
        _require(org_id,actor_id,channel,"knowledge.search")
        items=search_knowledge(org_id,message,"INTERNAL",workspace_id=workspace_id,limit=5)
        if items:
            sources=", ".join(f"{x.get('title')} ({x.get('reference')})" for x in items[:3])
            return {"content":f"{items[0].get('content')}\n\nSources internes : {sources}","tool":"knowledge.search","cards":[]}

    return None
