import re
from datetime import datetime,timedelta,timezone

from fastapi import HTTPException

from app.ai.repositories.escalation_repository import log_escalation_event
from app.ai.repositories.operator_message_repository import create_operator_message
from app.ai.repositories.workflow_repository import (
    create_workflow_run,
    get_active_operator_workflow,
    get_workflow_run,
    update_workflow_details,
    update_workflow_status,
    save_field_validation,
    claim_workflow_execution,
)
from app.ai.repositories.tool_execution_repository import record_tool_execution
from app.ai.repositories.copilot_context_repository import (
    client_dossier_choices, find_client_by_phone, location_choices, resolve_location,
)
from app.ai.services.dialogue_validation import correction_from_message, dialogue_act, validate_field
from app.ai.services.intent_detector import detect_intent
from app.ai.services.workflow_actions import build_proposed_actions
from app.ai.services.workflow_mapping import get_workflow_type
from app.ai.services.platform_query_service import answer_platform_query
from app.clients.repository import create_client
from app.db.dossier_repository import create_dossier
from app.db.followup_repository import create_manual_followup,followup_dashboard,mutate_followup
from app.departures.repository import create as create_departure
from app.packages.repository import create_package,list_packages,update_package
from app.pricing_engine.repository import catalog as pricing_catalog
from app.routes_services.repository import route_listing,list_all
from app.permissions.services.permission_service import assert_permission


QUESTION_BY_FIELD = {
    "client_phone": "Quel est le numéro WhatsApp du client, avec l’indicatif du pays ?",
    "client_name": "Je ne trouve pas encore ce numéro. Quel est le nom complet du client ?",
    "origin_country": "Depuis quel pays le colis sera-t-il envoyé ?",
    "destination_city": "Dans quelle ville le colis doit-il arriver ?",
    "goods_type": "Que contient réellement le colis ? Par exemple : vêtements, téléphones ou pièces automobiles.",
    "followup_reason":"Pourquoi souhaitez-vous relancer ce client ?",
    "due_at":"Quand faut-il effectuer la relance ? Par exemple : aujourd’hui à 16 h, demain ou le 25 août à 10 h.",
}

PACKAGE_STATUS_LABELS={"recu":"RECEIVED","reçu":"RECEIVED","confirme":"CONFIRMED","confirmé":"CONFIRMED",
    "entrepot":"WAREHOUSED","entrepôt":"WAREHOUSED","pret au groupage":"READY_FOR_BATCH",
    "prêt au groupage":"READY_FOR_BATCH","bloque":"BLOCKED","bloqué":"BLOCKED","annule":"CANCELLED",
    "annulé":"CANCELLED","livre":"DELIVERED","livré":"DELIVERED"}


def _fallback_intent(message: str):
    normalized = message.lower()
    create_words = ("crée", "creer", "créer", "ouvre", "prépare", "prepare")
    if any(word in normalized for word in create_words+("planifie","programme")) and any(word in normalized for word in ("départ","depart")):
        return "DEPARTURE_CREATION",0.93
    if re.search(r"\bFUP-[A-Z0-9-]+\b",message.upper()) and any(word in normalized for word in ("reporte","décale","decale","pause","reprend","termine","escalade","annule")):
        return "FOLLOWUP_STATUS_UPDATE",0.95
    if re.search(r"\b(?:COL)-[A-Z0-9-]+\b",message.upper()) and any(word in normalized for word in ("marque","passe","change","mets")):
        return "PACKAGE_STATUS_UPDATE",0.95
    if any(word in normalized for word in create_words) and any(word in normalized for word in ("relance","rappel")):
        return "FOLLOWUP_CREATION", 0.9
    if any(word in normalized for word in create_words) and "client" in normalized:
        return "CLIENT_CREATION", 0.9
    if any(word in normalized for word in create_words) and "dossier" in normalized:
        return "SHIPMENT_CREATION", 0.62
    if any(word in normalized for word in create_words) and "colis" in normalized:
        return "SHIPMENT_CREATION", 0.58
    if any(word in normalized for word in ("où", "tracking", "suivi")) and "colis" in normalized:
        return "TRACKING_REQUEST", 0.58
    if any(word in normalized for word in ("prix", "tarif", "coût", "combien")):
        return "PRICING_REQUEST", 0.55
    if any(word in normalized for word in ("humain", "responsable", "plainte", "réclamation")):
        return "HUMAN_AGENT_REQUEST", 0.7
    return "UNKNOWN", 0.0


def _phone_from_message(message: str):
    match = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", message)
    return re.sub(r"[^\d+]", "", match.group(0)) if match else None


def _missing_fields(workflow_type: str, entities: dict, client_phone: str | None):
    if workflow_type=="CREATE_DEPARTURE":
        return [field for field in ("route_id","shipping_service_id","scheduled_at") if not entities.get(field)]
    if workflow_type=="UPDATE_FOLLOWUP":
        return [field for field in ("followup_id","mutation_action","row_version") if not entities.get(field)]
    if workflow_type=="UPDATE_PACKAGE_STATUS":
        return [field for field in ("package_id","target_status") if not entities.get(field)]
    if workflow_type == "CREATE_CLIENT":
        values={"client_phone":client_phone,**entities}
        return [field for field in ("client_phone","client_name") if not values.get(field)]
    if workflow_type == "CREATE_FOLLOWUP":
        values={"client_phone":client_phone if entities.get("client_id") else None,**entities}
        return [field for field in ("client_phone","followup_reason","due_at") if not values.get(field)]
    if workflow_type not in {"CREATE_SHIPMENT_DRAFT", "CREATE_PACKAGE_DRAFT"}:
        return []
    values = {"client_phone": client_phone, **entities}
    required = ["client_phone"]
    if client_phone and entities.get("client_lookup") == "NOT_FOUND":
        required.append("client_name")
    required.extend(("origin_country", "destination_city", "goods_type"))
    return [
        field for field in required
        if not values.get(field)
    ]


def _is_cancel_message(message: str):
    return dialogue_act(message, True) == "CANCEL"


def _question(field: str, choices: list[dict] | None = None) -> str:
    base = QUESTION_BY_FIELD[field]
    if choices:
        labels = ", ".join(str(item.get("label") or item.get("value")) for item in choices[:6])
        return f"{base} Options disponibles : {labels}."
    return base


def _save_validation(org_id: str, workflow: dict, field: str, raw: str, result: dict):
    try:
        save_field_validation(org_id,str(workflow["id"]),field,raw,result,workflow.get("workspace_id"))
    except Exception:
        # Compatibility during rolling deploys: validation still blocks the
        # workflow even if the new audit table has not been migrated yet.
        return None


def _continue_dossier_workflow(
    org_id: str,
    user_id: str,
    workflow: dict,
    message: str,
    explicit_phone: str | None,
):
    entities = dict(workflow.get("entities") or {})
    current_phone = explicit_phone or workflow["client_phone"]
    resolved_phone = None if str(current_phone).startswith("internal:") else current_phone
    missing = _missing_fields("CREATE_SHIPMENT_DRAFT", entities, resolved_phone)
    act = dialogue_act(message, True)

    if workflow.get("workflow_status") == "PAUSED" and act != "RESUME":
        response = "Cette préparation est en pause. Dites « continue » pour la reprendre, ou « annule » pour la fermer."
        assistant_message = create_operator_message(
            org_id, user_id, "ASSISTANT", response, workflow_id=str(workflow["id"])
        )
        return {"message": assistant_message, "workflow": workflow, "missing_fields": missing}

    if act == "RESUME":
        updated = update_workflow_status(org_id, str(workflow["id"]), "PREPARED", {"resumed_by": user_id})
        response = _question(missing[0]) if missing else "La préparation est reprise et prête à être vérifiée."
        assistant_message = create_operator_message(
            org_id, user_id, "ASSISTANT", response, workflow_id=str(workflow["id"]),
            metadata={"missing_fields": missing, "dialogue_state": "COLLECTING" if missing else "READY_FOR_REVIEW"},
        )
        return {"message": assistant_message, "workflow": updated, "missing_fields": missing}

    if act == "CANCEL":
        update_workflow_status(org_id, str(workflow["id"]), "REJECTED", {"reason": "cancelled"})
        response = "La préparation du colis a été annulée. Aucune donnée métier n’a été créée."
        assistant_message = create_operator_message(
            org_id, user_id, "ASSISTANT", response, workflow_id=str(workflow["id"])
        )
        return {"message": assistant_message, "workflow": workflow, "missing_fields": []}

    if act == "PAUSE":
        updated = update_workflow_status(org_id, str(workflow["id"]), "PAUSED", {"reason": "user_pause"})
        response = "La préparation est en pause. Dites « continue » lorsque vous souhaitez la reprendre."
        assistant_message = create_operator_message(org_id,user_id,"ASSISTANT",response,workflow_id=str(workflow["id"]))
        return {"message": assistant_message, "workflow": updated, "missing_fields": missing}

    if act == "GREETING":
        response = "Oui, je suis là. Nous pouvons continuer la préparation du colis ou traiter une autre demande."
        assistant_message = create_operator_message(org_id,user_id,"ASSISTANT",response,workflow_id=str(workflow["id"]))
        return {"message": assistant_message, "workflow": workflow, "missing_fields": missing}

    if act == "STATUS_QUESTION":
        response = "Le colis n’est pas encore créé : je prépare uniquement les informations. " + (
            f"Il manque encore : {', '.join(QUESTION_BY_FIELD.get(x, x) for x in missing)}."
            if missing else "Les informations sont prêtes et attendent votre validation."
        )
        assistant_message = create_operator_message(org_id,user_id,"ASSISTANT",response,workflow_id=str(workflow["id"]))
        return {"message": assistant_message, "workflow": workflow, "missing_fields": missing}

    if act == "CORRECTION":
        field, corrected = correction_from_message(message)
        if not field or not corrected:
            response = "Indiquez précisément l’information à corriger, par exemple : « remplace la destination par Goma »."
            assistant_message = create_operator_message(org_id,user_id,"ASSISTANT",response,workflow_id=str(workflow["id"]))
            return {"message": assistant_message, "workflow": workflow, "missing_fields": missing}
        result = validate_field(field, corrected)
        if result["status"] == "VALID":
            entities[field] = result["value"]
        _save_validation(org_id,workflow,field,corrected,result)

    elif missing:
        field = missing[0]
        raw = explicit_phone or _phone_from_message(message) or message if field == "client_phone" else message
        result = validate_field(field, raw)
        choices = []
        if result["status"] == "VALID" and field in {"origin_country", "destination_city"}:
            try:
                result = resolve_location(org_id,field,str(result["value"]))
            except Exception:
                pass
        if result["status"] != "VALID":
            choices = result.get("choices") or (location_choices(org_id,field) if field in {"origin_country","destination_city"} else [])
            result["choices"] = choices
            _save_validation(org_id,workflow,field,raw,result)
            response = {
                "UNKNOWN": "Ce n’est pas grave, mais cette information est nécessaire pour éviter une mauvaise opération. ",
                "AMBIGUOUS": "Plusieurs choix correspondent à votre réponse. ",
                "INVALID": "Cette réponse ne correspond pas à l’information demandée. ",
            }.get(result["status"], "Je dois vérifier cette information. ") + _question(field, choices)
            assistant_message = create_operator_message(org_id,user_id,"ASSISTANT",response,workflow_id=str(workflow["id"]),metadata={"missing_fields":missing,"choices":choices,"validation":result})
            return {"message":assistant_message,"workflow":workflow,"missing_fields":missing,"choices":choices,"validation":result}
        _save_validation(org_id,workflow,field,raw,result)
        if field == "client_phone":
            resolved_phone = result["value"]
            try:
                client = find_client_by_phone(org_id,resolved_phone)
            except Exception:
                client = None
            if client:
                entities.update({"client_id":client["id"],"client_name":client["display_name"],"client_lookup":"FOUND"})
                try: entities["dossier_choices"] = client_dossier_choices(org_id,client["id"])
                except Exception: entities["dossier_choices"] = []
            else:
                entities["client_lookup"] = "NOT_FOUND"
        else:
            entities[field] = result["value"]

    remaining = _missing_fields("CREATE_SHIPMENT_DRAFT", entities, resolved_phone)
    actions = build_proposed_actions("CREATE_SHIPMENT_DRAFT", entities)
    updated = update_workflow_details(
        org_id=org_id,
        workflow_id=str(workflow["id"]),
        client_phone=resolved_phone or f"internal:{user_id}",
        source_message=f'{workflow["source_message"]}\n{message.strip()}',
        entities=entities,
        proposed_actions=actions,
        dialogue_state="COLLECTING" if remaining else "READY_FOR_REVIEW",
        client_id=entities.get("client_id"),
        dossier_id=entities.get("dossier_id"),
    )
    response = (
        _question(remaining[0], location_choices(org_id,remaining[0]) if remaining[0] in {"origin_country","destination_city"} else None)
        if remaining
        else "La préparation du colis est complète. Vérifiez le récapitulatif Client → Dossier → Colis avant de l’exécuter."
    )
    assistant_message = create_operator_message(
        org_id,
        user_id,
        "ASSISTANT",
        response,
        workflow_id=str(workflow["id"]),
        metadata={"missing_fields": remaining, "intent": "PACKAGE_CREATION", "dialogue_state":"COLLECTING" if remaining else "READY_FOR_REVIEW", "summary":entities},
    )
    return {"message": assistant_message, "workflow": updated, "missing_fields": remaining, "summary":entities, "dialogue_state":"COLLECTING" if remaining else "READY_FOR_REVIEW"}


def _continue_client_workflow(org_id:str,user_id:str,workflow:dict,message:str,explicit_phone:str|None):
    entities=dict(workflow.get("entities") or {}); phone=explicit_phone or workflow.get("client_phone")
    if str(phone).startswith("internal:"):phone=None
    act=dialogue_act(message,True);missing=_missing_fields("CREATE_CLIENT",entities,phone)
    if act=="CANCEL":
        updated=update_workflow_status(org_id,str(workflow["id"]),"REJECTED",{"reason":"cancelled"})
        assistant=create_operator_message(org_id,user_id,"ASSISTANT","La création du client a été annulée.",workflow_id=str(workflow["id"]))
        return {"message":assistant,"workflow":updated,"missing_fields":[]}
    if act=="PAUSE":
        updated=update_workflow_status(org_id,str(workflow["id"]),"PAUSED",{"reason":"user_pause"})
        assistant=create_operator_message(org_id,user_id,"ASSISTANT","La création du client est en pause. Dites « continue » pour reprendre.",workflow_id=str(workflow["id"]))
        return {"message":assistant,"workflow":updated,"missing_fields":missing}
    if workflow.get("workflow_status")=="PAUSED" and act!="RESUME":
        assistant=create_operator_message(org_id,user_id,"ASSISTANT","Cette création est en pause. Dites « continue » ou « annule ».",workflow_id=str(workflow["id"]))
        return {"message":assistant,"workflow":workflow,"missing_fields":missing}
    if act=="RESUME":
        workflow=update_workflow_status(org_id,str(workflow["id"]),"PREPARED",{"resumed_by":user_id})
    elif missing:
        field=missing[0];raw=explicit_phone or _phone_from_message(message) or message if field=="client_phone" else message
        result=validate_field(field,raw);_save_validation(org_id,workflow,field,raw,result)
        if result["status"]!="VALID":
            assistant=create_operator_message(org_id,user_id,"ASSISTANT",_question(field),workflow_id=str(workflow["id"]),metadata={"validation":result,"missing_fields":missing})
            return {"message":assistant,"workflow":workflow,"missing_fields":missing}
        if field=="client_phone":
            phone=result["value"]
            existing=find_client_by_phone(org_id,phone)
            if existing:
                update_workflow_status(org_id,str(workflow["id"]),"REJECTED",{"reason":"client_already_exists","client":existing})
                assistant=create_operator_message(org_id,user_id,"ASSISTANT",f"Ce numéro appartient déjà à {existing.get('display_name')}. Aucun doublon n’a été créé.",workflow_id=str(workflow["id"]),metadata={"cards":[{"kind":"CLIENT","id":str(existing['id']),"title":existing.get('display_name'),"subtitle":phone,"href":f"/app/clients?open={existing['id']}"}]})
                return {"message":assistant,"workflow":None,"missing_fields":[]}
        else:entities[field]=result["value"]
    remaining=_missing_fields("CREATE_CLIENT",entities,phone)
    updated=update_workflow_details(org_id=org_id,workflow_id=str(workflow["id"]),client_phone=phone or f"internal:{user_id}",source_message=f'{workflow["source_message"]}\n{message.strip()}',entities=entities,proposed_actions=build_proposed_actions("CREATE_CLIENT",{**entities,"client_phone":phone}),dialogue_state="COLLECTING" if remaining else "READY_FOR_REVIEW")
    response=_question(remaining[0]) if remaining else f"Le client {entities.get('client_name')} ({phone}) est prêt à être créé. Vérifiez puis confirmez."
    assistant=create_operator_message(org_id,user_id,"ASSISTANT",response,workflow_id=str(workflow["id"]),metadata={"missing_fields":remaining,"summary":{**entities,"client_phone":phone},"dialogue_state":"COLLECTING" if remaining else "READY_FOR_REVIEW"})
    return {"message":assistant,"workflow":updated,"missing_fields":remaining}


def _parse_due_at(value:str):
    normalized=" ".join(value.lower().replace("’","'").split());now=datetime.now(timezone.utc)
    hour_match=re.search(r"(?:a|à)?\s*(\d{1,2})\s*h(?:\s*(\d{2}))?",normalized)
    hour=int(hour_match.group(1)) if hour_match else 9;minute=int(hour_match.group(2) or 0) if hour_match else 0
    if "aujourd" in normalized:target=now
    elif "demain" in normalized:target=now+timedelta(days=1)
    else:
        delay=re.search(r"dans\s+(\d+)\s+jour",normalized)
        if delay:target=now+timedelta(days=int(delay.group(1)))
        else:
            iso=re.search(r"(20\d{2})-(\d{2})-(\d{2})",normalized)
            if iso:target=datetime(int(iso.group(1)),int(iso.group(2)),int(iso.group(3)),tzinfo=timezone.utc)
            else:
                weekdays={"lundi":0,"mardi":1,"mercredi":2,"jeudi":3,"vendredi":4,"samedi":5,"dimanche":6}
                weekday=next((number for label,number in weekdays.items() if label in normalized),None)
                if weekday is None:return None
                delta=(weekday-now.weekday())%7;target=now+timedelta(days=delta)
                if delta==0 and target.replace(hour=hour,minute=minute,second=0,microsecond=0)<=now:target+=timedelta(days=7)
    target=target.replace(hour=hour,minute=minute,second=0,microsecond=0)
    if target<=now:return None
    return target.isoformat()


def _continue_followup_workflow(org_id:str,user_id:str,workflow:dict,message:str,explicit_phone:str|None):
    entities=dict(workflow.get("entities") or {});phone=explicit_phone or workflow.get("client_phone")
    if str(phone).startswith("internal:"):phone=None
    missing=_missing_fields("CREATE_FOLLOWUP",entities,phone);act=dialogue_act(message,True)
    if act=="CANCEL":
        updated=update_workflow_status(org_id,str(workflow["id"]),"REJECTED",{"reason":"cancelled"})
        assistant=create_operator_message(org_id,user_id,"ASSISTANT","La programmation de la relance a été annulée.",workflow_id=str(workflow["id"]))
        return {"message":assistant,"workflow":updated,"missing_fields":[]}
    if act=="PAUSE":
        updated=update_workflow_status(org_id,str(workflow["id"]),"PAUSED",{"reason":"user_pause"})
        assistant=create_operator_message(org_id,user_id,"ASSISTANT","La préparation de la relance est en pause.",workflow_id=str(workflow["id"]))
        return {"message":assistant,"workflow":updated,"missing_fields":missing}
    if workflow.get("workflow_status")=="PAUSED" and act!="RESUME":
        assistant=create_operator_message(org_id,user_id,"ASSISTANT","Cette relance est en pause. Dites « continue » ou « annule ».",workflow_id=str(workflow["id"]))
        return {"message":assistant,"workflow":workflow,"missing_fields":missing}
    if act=="RESUME":workflow=update_workflow_status(org_id,str(workflow["id"]),"PREPARED",{"resumed_by":user_id})
    elif missing:
        field=missing[0]
        if field=="client_phone":
            raw=explicit_phone or _phone_from_message(message) or message;validation=validate_field(field,raw)
            if validation["status"]=="VALID":
                phone=validation["value"];client=find_client_by_phone(org_id,phone)
                if not client:validation={"status":"INVALID","value":None,"reason":"client_not_found"}
                else:entities.update({"client_id":client["id"],"client_name":client.get("display_name")})
        elif field=="due_at":
            parsed=_parse_due_at(message);validation={"status":"VALID" if parsed else "INVALID","value":parsed,"reason":None if parsed else "invalid_future_date"}
            if parsed:entities[field]=parsed
        else:
            validation={"status":"VALID" if len(message.strip())>=4 else "INVALID","value":message.strip(),"reason":None}
            if validation["status"]=="VALID":entities[field]=validation["value"]
        _save_validation(org_id,workflow,field,message,validation)
        if validation["status"]!="VALID":
            assistant=create_operator_message(org_id,user_id,"ASSISTANT",("Je ne trouve aucun client avec ce numéro. " if validation.get("reason")=="client_not_found" else "Je n’ai pas pu valider cette information. ")+_question(field),workflow_id=str(workflow["id"]),metadata={"validation":validation,"missing_fields":missing})
            return {"message":assistant,"workflow":workflow,"missing_fields":missing}
    remaining=_missing_fields("CREATE_FOLLOWUP",entities,phone)
    if not remaining and not entities.get("followup_message"):
        entities["followup_message"]=f"Bonjour {entities.get('client_name') or ''}, nous vous contactons concernant {entities.get('followup_reason')}. Merci de nous répondre directement."
    updated=update_workflow_details(org_id=org_id,workflow_id=str(workflow["id"]),client_phone=phone or f"internal:{user_id}",source_message=f'{workflow["source_message"]}\n{message.strip()}',entities=entities,proposed_actions=build_proposed_actions("CREATE_FOLLOWUP",entities),dialogue_state="COLLECTING" if remaining else "READY_FOR_REVIEW",client_id=entities.get("client_id"))
    response=_question(remaining[0]) if remaining else f"La relance de {entities.get('client_name')} est prête pour le {entities.get('due_at')}. Vérifiez le motif et confirmez la programmation."
    assistant=create_operator_message(org_id,user_id,"ASSISTANT",response,workflow_id=str(workflow["id"]),metadata={"missing_fields":remaining,"summary":entities,"dialogue_state":"COLLECTING" if remaining else "READY_FOR_REVIEW"})
    return {"message":assistant,"workflow":updated,"missing_fields":remaining}


def prepare_operator_message(
    org_id: str,
    user_id: str,
    actor_name: str | None,
    message: str,
    client_phone: str | None,
    workspace_id: str | None = None,
    channel: str = "INTERNAL",
):
    clean_message = message.strip()
    resolved_phone = client_phone or _phone_from_message(clean_message)
    user_message = create_operator_message(org_id, user_id, "USER", clean_message)

    act = dialogue_act(clean_message, False)
    if act == "GREETING":
        response = "Bonjour ! Oui, je suis là. Je peux rechercher un client ou un colis, vérifier un suivi, calculer un tarif ou préparer une opération cargo."
        assistant_message = create_operator_message(org_id,user_id,"ASSISTANT",response,metadata={"dialogue_act":"GREETING"})
        return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"CONVERSATION"}

    active_workflow = get_active_operator_workflow(org_id, user_id)
    if active_workflow:
        if active_workflow.get("workflow_type")=="CREATE_CLIENT":
            return _continue_client_workflow(org_id,user_id,active_workflow,clean_message,client_phone)
        if active_workflow.get("workflow_type")=="CREATE_FOLLOWUP":
            return _continue_followup_workflow(org_id,user_id,active_workflow,clean_message,client_phone)
        return _continue_dossier_workflow(
            org_id, user_id, active_workflow, clean_message, client_phone
        )

    try:
        platform_answer = answer_platform_query(org_id, clean_message, resolved_phone, workspace_id,user_id,channel)
    except HTTPException as exc:
        if exc.status_code == 403:
            record_tool_execution(org_id=org_id,workspace_id=workspace_id,tool_name="platform.query",
                actor_id=user_id,idempotency_key=f"query:{user_message['id']}:blocked",
                input_payload={"message":clean_message,"channel":channel},status="BLOCKED",error_code="permission_denied")
            response="Vous n’avez pas la permission nécessaire pour consulter ces informations. Demandez l’accès à un administrateur de l’agence."
            assistant_message=create_operator_message(org_id,user_id,"ASSISTANT",response,metadata={"dialogue_state":"BLOCKED","reason":"permission_denied"})
            return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"BLOCKED"}
        platform_answer = None
    except PermissionError:
        record_tool_execution(org_id=org_id,workspace_id=workspace_id,tool_name="platform.query",
            actor_id=user_id,idempotency_key=f"query:{user_message['id']}:channel-blocked",
            input_payload={"message":clean_message,"channel":channel},status="BLOCKED",error_code="channel_capability_denied")
        response="Cette information n’est pas disponible depuis ce canal. Un agent autorisé peut vous assister."
        assistant_message=create_operator_message(org_id,user_id,"ASSISTANT",response,metadata={"dialogue_state":"BLOCKED","reason":"channel_capability_denied"})
        return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"BLOCKED"}
    except Exception:
        platform_answer = None
    if platform_answer:
        response = platform_answer["content"]
        record_tool_execution(org_id=org_id,workspace_id=workspace_id,tool_name=platform_answer["tool"],
            actor_id=user_id,idempotency_key=f"query:{user_message['id']}:{platform_answer['tool']}",
            input_payload={"message":clean_message,"client_phone":resolved_phone,"channel":channel},
            output_payload={"answer":response,"result_count":len(platform_answer.get("cards") or [])})
        assistant_message = create_operator_message(
            org_id, user_id, "ASSISTANT", response,
            metadata={"dialogue_state":"ANSWERED","tool":platform_answer["tool"],"cards":platform_answer.get("cards") or []},
        )
        return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"ANSWERED","tool":platform_answer["tool"]}

    try:
        intent_result = detect_intent(org_id=org_id, message=clean_message)
    except Exception:
        intent_result = {"intent": "UNKNOWN", "confidence": 0.0, "entities": {}}

    intent = intent_result.get("intent") or "UNKNOWN"
    confidence = float(intent_result.get("confidence") or 0.0)
    entities = intent_result.get("entities") or {}
    fallback_intent,fallback_confidence=_fallback_intent(clean_message)
    if fallback_intent in {"PACKAGE_STATUS_UPDATE","FOLLOWUP_STATUS_UPDATE"} or intent == "UNKNOWN":
        intent, confidence = fallback_intent,fallback_confidence

    if fallback_intent=="DEPARTURE_CREATION":
        intent,confidence=fallback_intent,fallback_confidence
        normalized=clean_message.lower();catalog=pricing_catalog(org_id)
        routes=route_listing(org_id,workspace=workspace_id,limit=100,offset=0)["items"]
        routes=[r for r in routes if r.get("status") in {"ACTIVE","LIMITED"}]
        route=next((r for r in routes if str(r.get("route_code") or "").lower() in normalized and r.get("route_code")),None)
        if not route:
            route=next((r for r in routes if all(str(v).lower() in normalized for v in (r.get("origin_city") or r.get("origin_country"),r.get("destination_city") or r.get("destination_country")) if v)),None)
        if not route:
            options=", ".join(str(r.get("route_name") or r.get("route_code")) for r in routes[:6])
            response="Quelle route configurée doit utiliser ce départ ?"+(f" Options : {options}." if options else " Aucune route active n’est disponible.")
            assistant_message=create_operator_message(org_id,user_id,"ASSISTANT",response,metadata={"dialogue_state":"CLARIFICATION"})
            return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"CLARIFICATION"}
        services=[s for s in catalog.get("services",[]) if str(s.get("route_id"))==str(route.get("id"))]
        service=next((s for s in services if str(s.get("service_code") or "").lower() in normalized and s.get("service_code")),None)
        if not service:
            service=next((s for s in services if str(s.get("service_name") or "").lower() in normalized),None)
        if not service:
            mode=next((x for x in ("air","sea","express","road") if x in normalized),None)
            matches=[s for s in services if not mode or mode in str(s.get("shipping_mode") or "").lower()]
            service=matches[0] if len(matches)==1 else None
        if not service:
            options=", ".join(str(s.get("service_name") or s.get("service_code")) for s in services[:6])
            response=f"Quel service faut-il utiliser sur {route.get('route_name')} ?"+(f" Options : {options}." if options else " Aucun service actif n’est lié à cette route.")
            assistant_message=create_operator_message(org_id,user_id,"ASSISTANT",response,metadata={"dialogue_state":"CLARIFICATION"})
            return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"CLARIFICATION"}
        scheduled_at=_parse_due_at(clean_message)
        if not scheduled_at:
            response="À quelle date et heure le départ est-il prévu ? Exemple : « vendredi à 18 h » ou « 2026-08-28 à 18 h »."
            assistant_message=create_operator_message(org_id,user_id,"ASSISTANT",response,metadata={"dialogue_state":"CLARIFICATION"})
            return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"CLARIFICATION"}
        service_full=next((s for s in list_all(org_id).get("services",[]) if str(s.get("id"))==str(service.get("id"))),{})
        scheduled_dt=datetime.fromisoformat(scheduled_at);eta_days=service_full.get("eta_max_days") or route.get("eta_max_days")
        entities.update({"route_id":route["id"],"route_name":route.get("route_name"),
            "shipping_service_id":service["id"],"service_name":service.get("service_name"),"scheduled_at":scheduled_at,
            "estimated_arrival_at":(scheduled_dt+timedelta(days=int(eta_days))).isoformat() if eta_days else None,
            "timezone":route.get("timezone") or "UTC","warehouse_id":route.get("origin_warehouse_id"),
            "destination_office":route.get("destination_office_city"),"published":False})

    if intent=="FOLLOWUP_STATUS_UPDATE":
        reference_match=re.search(r"\bFUP-[A-Z0-9-]+\b",clean_message.upper())
        matches=followup_dashboard(org_id,q=reference_match.group(0) if reference_match else clean_message,page=1,page_size=5)["items"]
        exact=next((x for x in matches if str(x.get("reference") or "").upper()==(reference_match.group(0) if reference_match else "")),None)
        normalized=clean_message.lower();mutation=None;label=None
        if any(x in normalized for x in ("reporte","décale","decale")):mutation,label="RESUME","Reporter la relance"
        elif "pause" in normalized:mutation,label="PAUSE","Mettre la relance en pause"
        elif "reprend" in normalized:mutation,label="RESUME","Reprendre la relance"
        elif "termine" in normalized:mutation,label="COMPLETE","Terminer la relance"
        elif "escalade" in normalized:mutation,label="ESCALATE","Escalader la relance"
        elif "annule" in normalized:mutation,label="CANCEL","Annuler la relance"
        due_at=_parse_due_at(clean_message) if mutation=="RESUME" and any(x in normalized for x in ("reporte","décale","decale")) else None
        if not exact:
            response="Je ne trouve pas cette relance dans l’agence. Vérifiez sa référence, par exemple FUP-2026-001284."
            assistant_message=create_operator_message(org_id,user_id,"ASSISTANT",response,metadata={"dialogue_state":"CLARIFICATION"})
            return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"CLARIFICATION"}
        if exact.get("status") in {"COMPLETED","CANCELLED"}:
            response=f"La relance {exact.get('reference')} est déjà clôturée ({exact.get('status')}). Elle ne peut plus être modifiée."
            assistant_message=create_operator_message(org_id,user_id,"ASSISTANT",response,metadata={"dialogue_state":"BLOCKED","reason":"followup_closed"})
            return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"BLOCKED"}
        if mutation=="RESUME" and any(x in normalized for x in ("reporte","décale","decale")) and not due_at:
            response="À quelle date faut-il reporter cette relance ? Exemple : « reporte "+str(exact.get("reference"))+" à demain 16 h »."
            assistant_message=create_operator_message(org_id,user_id,"ASSISTANT",response,metadata={"dialogue_state":"CLARIFICATION"})
            return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"CLARIFICATION"}
        entities.update({"followup_id":exact["id"],"followup_reference":exact.get("reference"),
            "current_status":exact.get("status"),"mutation_action":mutation,"action_label":label,
            "due_at":due_at,"row_version":exact.get("row_version")})

    if intent=="PACKAGE_STATUS_UPDATE":
        reference_match=re.search(r"\bCOL-[A-Z0-9-]+\b",clean_message.upper())
        normalized=clean_message.lower();target=next((code for label,code in PACKAGE_STATUS_LABELS.items() if label in normalized),None)
        package_items=list_packages(org_id,q=reference_match.group(0) if reference_match else clean_message,page=1,page_size=5)["items"]
        exact=next((x for x in package_items if (x.get("package_reference") or x.get("tracking_id") or "").upper()==(reference_match.group(0) if reference_match else "")),None)
        if not exact or not target:
            response="Indiquez la référence exacte du colis et le nouveau statut souhaité. Exemple : « marque COL-2026-00124 comme reçu »."
            assistant_message=create_operator_message(org_id,user_id,"ASSISTANT",response,metadata={"dialogue_state":"CLARIFICATION"})
            return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"CLARIFICATION"}
        if target=="DELIVERED":
            response="Le statut Livré nécessite une preuve de livraison ou de retrait. Utilisez le workflow Retrait/Livraison afin de conserver le réceptionnaire, la signature, la photo ou l’OTP."
            assistant_message=create_operator_message(org_id,user_id,"ASSISTANT",response,metadata={"dialogue_state":"BLOCKED","reason":"delivery_proof_required"})
            return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"BLOCKED"}
        entities.update({"package_id":exact["id"],"package_reference":exact.get("package_reference") or exact.get("tracking_id"),
            "current_status":exact.get("status"),"target_status":target,"row_version":exact.get("row_version")})

    if intent=="CLIENT_CREATION":
        name_match=re.search(r"(?:client\s+(?:nomm?[ée]?|appel[ée]?)?\s*)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '\-]{1,80})",clean_message,re.IGNORECASE)
        if name_match: entities["client_name"]=name_match.group(1).strip()
    if intent=="FOLLOWUP_CREATION" and resolved_phone:
        client=find_client_by_phone(org_id,resolved_phone)
        if client:entities.update({"client_id":client["id"],"client_name":client.get("display_name")})

    if intent == "UNKNOWN":
        response = "Je peux vous aider sur les clients, dossiers, colis, routes, services, tarifs, entrepôts et suivis. Dites-moi simplement le résultat recherché."
        assistant_message = create_operator_message(org_id,user_id,"ASSISTANT",response,metadata={"dialogue_act":"CLARIFICATION"})
        return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"CONVERSATION"}

    if "colis" in clean_message.lower() and any(word in clean_message.lower() for word in ("crée","creer","créer","prépare","prepare")):
        entities["requested_operation"] = "CREATE_PACKAGE"

    workflow_type = get_workflow_type(intent)
    proposed_actions = build_proposed_actions(workflow_type, entities)
    storage_phone = resolved_phone or f"internal:{user_id}"
    workflow = create_workflow_run(
        org_id=org_id,
        client_phone=storage_phone,
        source_message=clean_message,
        intent=intent,
        confidence=confidence,
        workflow_type=workflow_type,
        entities=entities,
        proposed_actions=proposed_actions,
        manager_id=user_id,
        manager_name=actor_name,
        workspace_id=workspace_id,
        channel=channel,
        dialogue_state="COLLECTING",
    )

    missing = _missing_fields(workflow_type, entities, resolved_phone)
    if missing:
        response = _question(missing[0])
    elif proposed_actions:
        response = "L’action est prête. Vérifiez les informations puis validez-la avant exécution."
    else:
        response = (
            "Je n’ai pas encore assez d’éléments pour préparer cette opération. Précisez ce que vous souhaitez consulter ou créer."
        )

    if workflow_type == "ESCALATION_REQUIRED":
        log_escalation_event(
            org_id=org_id,
            client_phone=resolved_phone,
            message=clean_message,
            intent=intent,
            escalation_score=max(confidence, 0.7),
            escalation_reason="Validation humaine requise",
            triggered_rules=["operator_copilot_sensitive_request"],
            decision="ESCALATE",
        )
        response = "Cette demande nécessite une réponse humaine. Je l’ai ajoutée aux escalades."

    assistant_message = create_operator_message(
        org_id,
        user_id,
        "ASSISTANT",
        response,
        workflow_id=str(workflow["id"]),
        metadata={"missing_fields": missing, "intent": intent},
    )
    return {"message": assistant_message, "workflow": workflow, "missing_fields": missing}


def _execute_package_workflow(org_id: str, workflow_id: str, actor_id: str, workflow: dict, entities: dict):
    previous = workflow.get("result_payload") or {}
    client_id = workflow.get("client_id") or entities.get("client_id") or (previous.get("client") or {}).get("id")
    created_client = None
    if not client_id:
        existing = find_client_by_phone(org_id,workflow["client_phone"])
        if existing:
            client_id = existing["id"]
            created_client = existing
        else:
            if not entities.get("client_name"):
                raise HTTPException(status_code=422, detail={"code":"client_identity_required","missing_fields":["client_name"]})
            created_client = create_client(org_id,actor_id,{
                "name":entities["client_name"],"display_name":entities["client_name"],
                "phone":workflow["client_phone"],"whatsapp_phone":workflow["client_phone"],
                "customer_type":"individual","lifecycle_status":"lead",
                "source":"whatsapp" if workflow.get("channel")=="WHATSAPP" else "manual",
            })
            client_id = created_client["id"]
        update_workflow_status(org_id,workflow_id,"EXECUTING",{"client":created_client or {"id":client_id}})
    dossier_id = workflow.get("dossier_id") or entities.get("dossier_id") or (previous.get("dossier") or {}).get("id")
    created_dossier = None
    dossier_choices = entities.get("dossier_choices") or []
    if not dossier_id and len(dossier_choices) == 1:
        dossier_id = dossier_choices[0]["id"]
    if not dossier_id:
        created_dossier = create_dossier(org_id,actor_id,{
            "client_id":client_id,"workspace_id":workflow.get("workspace_id"),
            "case_type":"SEND_CARGO","status_global":"LEAD","intake_status":"PARTIAL",
            "validation_status":"PENDING","primary_channel":"whatsapp" if workflow.get("channel")=="WHATSAPP" else "assistant",
            "origin_country":entities.get("origin_country"),"destination_city":entities.get("destination_city"),
            "goods_type":entities.get("goods_type"),"client_full_name":entities.get("client_name"),
        })
        dossier_id = created_dossier["id"]
        update_workflow_status(org_id,workflow_id,"EXECUTING",{"client":created_client or {"id":client_id},"dossier":created_dossier})
    package = create_package(org_id,actor_id,{
        "dossier_id":dossier_id,"source":"api","description":entities.get("goods_type"),
        "category":entities.get("goods_type"),"origin_country":entities.get("origin_country"),
        "destination_city":entities.get("destination_city"),"status":"PENDING_VALIDATION",
        "validation_status":"PENDING","payment_status":"UNKNOWN","package_type":"carton",
        "package_condition":"UNKNOWN","inventory_status":"NOT_STORED","pieces_count":1,
        "public_tracking_enabled":True,"priority":"NORMAL","goods_classification":"ORDINARY_GOODS",
    })
    result={"client":created_client or {"id":client_id,"display_name":entities.get("client_name")},
            "dossier":created_dossier or {"id":dossier_id},"package":package}
    updated=update_workflow_status(org_id,workflow_id,"APPROVED",result)
    return {"workflow":updated,"result":result,"draft":None}


def _execute_dossier_workflow(org_id:str,workflow_id:str,actor_id:str,workflow:dict,entities:dict):
    previous=workflow.get("result_payload") or {}
    client_id=workflow.get("client_id") or entities.get("client_id") or (previous.get("client") or {}).get("id")
    client=None
    if not client_id:
        existing=find_client_by_phone(org_id,workflow["client_phone"])
        if existing:
            client=existing;client_id=existing["id"]
        else:
            if not entities.get("client_name"):
                raise HTTPException(422,{"code":"client_identity_required","missing_fields":["client_name"]})
            client=create_client(org_id,actor_id,{"name":entities["client_name"],"display_name":entities["client_name"],
                "phone":workflow["client_phone"],"whatsapp_phone":workflow["client_phone"],"customer_type":"individual",
                "lifecycle_status":"lead","source":"whatsapp" if workflow.get("channel")=="WHATSAPP" else "manual"})
            client_id=client["id"]
        update_workflow_status(org_id,workflow_id,"EXECUTING",{"client":client or {"id":client_id}})
    dossier=(previous.get("dossier") or None)
    if not dossier:
        dossier=create_dossier(org_id,actor_id,{"client_id":client_id,"workspace_id":workflow.get("workspace_id"),
            "case_type":"SEND_CARGO","status_global":"WAITING_PACKAGES","intake_status":"PARTIAL",
            "validation_status":"PENDING","primary_channel":"whatsapp" if workflow.get("channel")=="WHATSAPP" else "assistant",
            "origin_country":entities.get("origin_country"),"origin_city":entities.get("origin_city"),
            "destination_country":entities.get("destination_country"),"destination_city":entities.get("destination_city"),
            "goods_type":entities.get("goods_type"),"estimated_weight_kg":entities.get("weight_kg"),
            "estimated_volume_cbm":entities.get("volume_cbm"),"shipping_mode":entities.get("shipping_mode"),
            "client_full_name":entities.get("client_name")})
    result={"client":client or {"id":client_id,"display_name":entities.get("client_name")},"dossier":dossier}
    updated=update_workflow_status(org_id,workflow_id,"APPROVED",result)
    return {"workflow":updated,"result":result,"draft":None}


def approve_operator_workflow(org_id: str, workflow_id: str, actor_id: str = "ai-copilot"):
    workflow = get_workflow_run(org_id, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    if workflow["workflow_status"] not in {"PREPARED","FAILED","EXECUTING"}:
        raise HTTPException(status_code=409, detail="workflow_already_decided")
    if workflow["workflow_type"] not in {"CREATE_SHIPMENT_DRAFT","CREATE_CLIENT","CREATE_FOLLOWUP","UPDATE_PACKAGE_STATUS","UPDATE_FOLLOWUP","CREATE_DEPARTURE"}:
        raise HTTPException(status_code=422, detail="workflow_execution_not_supported")
    entities = workflow.get("entities") or {}
    missing = _missing_fields(workflow["workflow_type"], entities, workflow["client_phone"])
    if missing:
        raise HTTPException(
            status_code=422,
            detail={"code": "workflow_incomplete", "missing_fields": missing},
        )

    if workflow["workflow_type"] in {"CREATE_SHIPMENT_DRAFT", "CREATE_CLIENT", "CREATE_FOLLOWUP"} and str(workflow["client_phone"]).startswith("internal:"):
        raise HTTPException(status_code=422, detail="client_phone_required")
    if workflow["workflow_type"]=="CREATE_CLIENT":
        assert_permission(actor_id,org_id,"clients.create")
        claimed=claim_workflow_execution(org_id,workflow_id)
        if not claimed:raise HTTPException(409,"workflow_execution_in_progress")
        try:
            existing=find_client_by_phone(org_id,workflow["client_phone"])
            client=existing or create_client(org_id,actor_id,{"name":entities["client_name"],"display_name":entities["client_name"],"phone":workflow["client_phone"],"whatsapp_phone":workflow["client_phone"],"customer_type":"individual","lifecycle_status":"lead","source":"whatsapp" if workflow.get("channel")=="WHATSAPP" else "manual"})
            updated=update_workflow_status(org_id,workflow_id,"APPROVED",{"client":client,"reused_existing":bool(existing)})
            return {"workflow":updated,"result":{"client":client},"draft":None}
        except Exception as exc:
            update_workflow_status(org_id,workflow_id,"FAILED",{"error":str(exc)[:500]})
            raise
    if workflow["workflow_type"]=="CREATE_FOLLOWUP":
        assert_permission(actor_id,org_id,"followups.create")
        claimed=claim_workflow_execution(org_id,workflow_id)
        if not claimed:raise HTTPException(409,"workflow_execution_in_progress")
        try:
            followup=create_manual_followup(org_id,actor_id,{"workspace_id":workflow.get("workspace_id"),
                "client_id":entities["client_id"],"dossier_id":None,"followup_type":"MANUAL",
                "subject_type":"CLIENT","subject_id":entities["client_id"],"subject_reference":entities.get("client_name"),
                "reason":entities["followup_reason"],"channel":"WHATSAPP","message":entities["followup_message"],
                "due_at":entities["due_at"],"priority":"NORMAL","responsible_id":actor_id,
                "responsible_name":workflow.get("manager_name"),"amount_context":None,"currency":None,
                "consent_type":"OPERATIONAL","condition_snapshot":{"source":"AI_ASSISTANT"},
                "idempotency_key":f"ai-followup:{workflow_id}"})
            updated=update_workflow_status(org_id,workflow_id,"APPROVED",{"followup":followup})
            return {"workflow":updated,"result":{"followup":followup},"draft":None}
        except Exception as exc:
            update_workflow_status(org_id,workflow_id,"FAILED",{"error":str(exc)[:500]});raise
    if workflow["workflow_type"]=="UPDATE_PACKAGE_STATUS":
        assert_permission(actor_id,org_id,"packages.update")
        claimed=claim_workflow_execution(org_id,workflow_id)
        if not claimed:raise HTTPException(409,"workflow_execution_in_progress")
        try:
            package=update_package(org_id,entities["package_id"],actor_id,{"status":entities["target_status"]})
            if not package:raise HTTPException(404,"package_not_found")
            updated=update_workflow_status(org_id,workflow_id,"APPROVED",{"package":package,"previous_status":entities.get("current_status")})
            return {"workflow":updated,"result":{"package":package},"draft":None}
        except Exception as exc:
            update_workflow_status(org_id,workflow_id,"FAILED",{"error":str(exc)[:500]});raise
    if workflow["workflow_type"]=="UPDATE_FOLLOWUP":
        assert_permission(actor_id,org_id,"followups.update")
        claimed=claim_workflow_execution(org_id,workflow_id)
        if not claimed:raise HTTPException(409,"workflow_execution_in_progress")
        try:
            followup=mutate_followup(org_id,entities["followup_id"],actor_id,entities["mutation_action"],
                int(entities["row_version"]),entities.get("due_at"),"Modification confirmée depuis l’Assistant Slaivio")
            if not followup:raise HTTPException(409,"followup_was_modified_or_closed")
            updated=update_workflow_status(org_id,workflow_id,"APPROVED",{"followup":followup,"previous_status":entities.get("current_status")})
            return {"workflow":updated,"result":{"followup":followup},"draft":None}
        except Exception as exc:
            update_workflow_status(org_id,workflow_id,"FAILED",{"error":str(exc)[:500]});raise
    if workflow["workflow_type"]=="CREATE_DEPARTURE":
        assert_permission(actor_id,org_id,"departures.manage")
        claimed=claim_workflow_execution(org_id,workflow_id)
        if not claimed:raise HTTPException(409,"workflow_execution_in_progress")
        try:
            departure=create_departure(org_id,actor_id,workflow.get("manager_name") or "Membre de l’agence",{
                "shipping_service_id":entities["shipping_service_id"],"departure_code":f"DEP-AI-{workflow_id[:8].upper()}",
                "scheduled_at":entities["scheduled_at"],"cutoff_at":entities.get("cutoff_at"),
                "estimated_arrival_at":entities.get("estimated_arrival_at"),"capacity_weight_kg":None,
                "capacity_cbm":None,"capacity_packages":None,"carrier_name":None,"transport_reference":None,
                "timezone":entities.get("timezone") or "UTC","responsible_name":workflow.get("manager_name"),
                "warehouse_id":entities.get("warehouse_id"),"destination_office":entities.get("destination_office"),
                "published":False,"notes":"Départ préparé depuis l’Assistant Slaivio"})
            updated=update_workflow_status(org_id,workflow_id,"APPROVED",{"departure":departure})
            return {"workflow":updated,"result":{"departure":departure},"draft":None}
        except Exception as exc:
            update_workflow_status(org_id,workflow_id,"FAILED",{"error":str(exc)[:500]});raise
    assert_permission(actor_id,org_id,"clients.create")
    assert_permission(actor_id,org_id,"dossiers.create")
    if entities.get("requested_operation")=="CREATE_PACKAGE": assert_permission(actor_id,org_id,"packages.create")
    if entities.get("requested_operation") == "CREATE_PACKAGE":
        claimed=claim_workflow_execution(org_id,workflow_id)
        if not claimed:
            raise HTTPException(status_code=409,detail="workflow_execution_in_progress")
        try:
            return _execute_package_workflow(org_id,workflow_id,actor_id,claimed,entities)
        except HTTPException as exc:
            update_workflow_status(org_id,workflow_id,"FAILED",{"error":exc.detail})
            raise
        except Exception as exc:
            update_workflow_status(org_id,workflow_id,"FAILED",{"error":str(exc)[:500]})
            raise HTTPException(status_code=422,detail="package_creation_failed") from exc
    claimed=claim_workflow_execution(org_id,workflow_id)
    if not claimed:raise HTTPException(409,"workflow_execution_in_progress")
    try:
        return _execute_dossier_workflow(org_id,workflow_id,actor_id,claimed,entities)
    except HTTPException as exc:
        update_workflow_status(org_id,workflow_id,"FAILED",{"error":exc.detail});raise
    except Exception as exc:
        update_workflow_status(org_id,workflow_id,"FAILED",{"error":str(exc)[:500]})
        raise HTTPException(422,"dossier_creation_failed") from exc


def reject_operator_workflow(org_id: str, workflow_id: str, reason: str | None):
    workflow = get_workflow_run(org_id, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    if workflow["workflow_status"] != "PREPARED":
        raise HTTPException(status_code=409, detail="workflow_already_decided")
    return update_workflow_status(
        org_id=org_id,
        workflow_id=workflow_id,
        status="REJECTED",
        result_payload={"reason": reason} if reason else {},
    )


def control_operator_workflow(org_id: str, user_id: str, workflow_id: str, action: str,
                              value: str | None = None):
    workflow = get_workflow_run(org_id,workflow_id)
    if not workflow:
        raise HTTPException(404,"workflow_not_found")
    if action == "pause" and workflow["workflow_status"] == "PREPARED":
        return update_workflow_status(org_id,workflow_id,"PAUSED",{"reason":value or "manual_pause"})
    if action == "resume" and workflow["workflow_status"] == "PAUSED":
        return update_workflow_status(org_id,workflow_id,"PREPARED",{"resumed":True})
    if action == "cancel" and workflow["workflow_status"] in {"PREPARED","PAUSED"}:
        return update_workflow_status(org_id,workflow_id,"REJECTED",{"reason":value or "cancelled"})
    if action == "correct" and workflow["workflow_status"] == "PREPARED" and value:
        return _continue_dossier_workflow(org_id,user_id,workflow,value,None)["workflow"]
    raise HTTPException(409,"invalid_workflow_transition")
