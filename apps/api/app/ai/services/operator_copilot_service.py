import re

from fastapi import HTTPException

from app.ai.repositories.dossier_draft_repository import create_dossier_draft
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
from app.packages.repository import create_package


QUESTION_BY_FIELD = {
    "client_phone": "Quel est le numéro WhatsApp du client, avec l’indicatif du pays ?",
    "client_name": "Je ne trouve pas encore ce numéro. Quel est le nom complet du client ?",
    "origin_country": "Depuis quel pays le colis sera-t-il envoyé ?",
    "destination_city": "Dans quelle ville le colis doit-il arriver ?",
    "goods_type": "Que contient réellement le colis ? Par exemple : vêtements, téléphones ou pièces automobiles.",
}


def _fallback_intent(message: str):
    normalized = message.lower()
    create_words = ("crée", "creer", "créer", "ouvre", "prépare", "prepare")
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
    create_operator_message(org_id, user_id, "USER", clean_message)

    act = dialogue_act(clean_message, False)
    if act == "GREETING":
        response = "Bonjour ! Oui, je suis là. Je peux rechercher un client ou un colis, vérifier un suivi, calculer un tarif ou préparer une opération cargo."
        assistant_message = create_operator_message(org_id,user_id,"ASSISTANT",response,metadata={"dialogue_act":"GREETING"})
        return {"message":assistant_message,"workflow":None,"missing_fields":[],"dialogue_state":"CONVERSATION"}

    active_workflow = get_active_operator_workflow(org_id, user_id)
    if active_workflow:
        return _continue_dossier_workflow(
            org_id, user_id, active_workflow, clean_message, client_phone
        )

    try:
        platform_answer = answer_platform_query(org_id, clean_message, resolved_phone, workspace_id)
    except Exception:
        platform_answer = None
    if platform_answer:
        response = platform_answer["content"]
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
    if intent == "UNKNOWN":
        intent, confidence = _fallback_intent(clean_message)

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


def approve_operator_workflow(org_id: str, workflow_id: str, actor_id: str = "ai-copilot"):
    workflow = get_workflow_run(org_id, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    if workflow["workflow_status"] not in {"PREPARED","FAILED","EXECUTING"}:
        raise HTTPException(status_code=409, detail="workflow_already_decided")
    if workflow["workflow_type"] != "CREATE_SHIPMENT_DRAFT":
        raise HTTPException(status_code=422, detail="workflow_execution_not_supported")
    entities = workflow.get("entities") or {}
    missing = _missing_fields("CREATE_SHIPMENT_DRAFT", entities, workflow["client_phone"])
    if missing:
        raise HTTPException(
            status_code=422,
            detail={"code": "workflow_incomplete", "missing_fields": missing},
        )

    if str(workflow["client_phone"]).startswith("internal:"):
        raise HTTPException(status_code=422, detail="client_phone_required")
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
    draft = create_dossier_draft(
        org_id=org_id,
        client_phone=workflow["client_phone"],
        source_message=workflow["source_message"],
        workflow_id=str(workflow["id"]),
        client_name=entities.get("client_name"),
        origin_country=entities.get("origin_country"),
        origin_city=entities.get("origin_city"),
        destination_country=entities.get("destination_country"),
        destination_city=entities.get("destination_city"),
        goods_type=entities.get("goods_type"),
        estimated_weight_kg=entities.get("weight_kg"),
        estimated_volume_cbm=entities.get("volume_cbm"),
        shipping_mode=entities.get("shipping_mode"),
        missing_fields=missing,
        manager_id=workflow.get("manager_id"),
        manager_name=workflow.get("manager_name"),
    )
    updated = update_workflow_status(
        org_id=org_id,
        workflow_id=workflow_id,
        status="APPROVED",
        result_payload={"draft_id": str(draft["id"]), "missing_fields": missing},
    )
    return {"workflow": updated, "draft": draft}


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
