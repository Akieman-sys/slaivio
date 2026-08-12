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
)
from app.ai.services.intent_detector import detect_intent
from app.ai.services.workflow_actions import build_proposed_actions
from app.ai.services.workflow_mapping import get_workflow_type


QUESTION_BY_FIELD = {
    "client_phone": "Quel est le numéro WhatsApp du client ?",
    "origin_country": "De quel pays le colis part-il ?",
    "destination_city": "Dans quelle ville le colis doit-il arriver ?",
    "goods_type": "Que contient le colis ?",
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
    if workflow_type != "CREATE_SHIPMENT_DRAFT":
        return []
    values = {"client_phone": client_phone, **entities}
    return [
        field
        for field in ("client_phone", "origin_country", "destination_city", "goods_type")
        if not values.get(field)
    ]


def _is_cancel_message(message: str):
    return message.lower().strip() in {"annule", "annuler", "abandonne", "abandonner"}


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

    if _is_cancel_message(message):
        update_workflow_status(org_id, str(workflow["id"]), "REJECTED", {"reason": "cancelled"})
        response = "La préparation du dossier a été annulée."
        assistant_message = create_operator_message(
            org_id, user_id, "ASSISTANT", response, workflow_id=str(workflow["id"])
        )
        return {"message": assistant_message, "workflow": workflow, "missing_fields": []}

    if missing:
        field = missing[0]
        if field == "client_phone":
            parsed_phone = explicit_phone or _phone_from_message(message)
            if not parsed_phone:
                response = "Je n’ai pas reconnu le numéro. Indiquez-le avec l’indicatif pays, par exemple +243…"
                assistant_message = create_operator_message(
                    org_id,
                    user_id,
                    "ASSISTANT",
                    response,
                    workflow_id=str(workflow["id"]),
                    metadata={"missing_fields": missing},
                )
                return {"message": assistant_message, "workflow": workflow, "missing_fields": missing}
            resolved_phone = parsed_phone
        else:
            entities[field] = message.strip()

    remaining = _missing_fields("CREATE_SHIPMENT_DRAFT", entities, resolved_phone)
    actions = build_proposed_actions("CREATE_SHIPMENT_DRAFT", entities)
    updated = update_workflow_details(
        org_id=org_id,
        workflow_id=str(workflow["id"]),
        client_phone=resolved_phone or f"internal:{user_id}",
        source_message=f'{workflow["source_message"]}\n{message.strip()}',
        entities=entities,
        proposed_actions=actions,
    )
    response = (
        QUESTION_BY_FIELD[remaining[0]]
        if remaining
        else "Le dossier est complet. Vérifiez le récapitulatif puis validez sa préparation."
    )
    assistant_message = create_operator_message(
        org_id,
        user_id,
        "ASSISTANT",
        response,
        workflow_id=str(workflow["id"]),
        metadata={"missing_fields": remaining, "intent": "SHIPMENT_CREATION"},
    )
    return {"message": assistant_message, "workflow": updated, "missing_fields": remaining}


def prepare_operator_message(
    org_id: str,
    user_id: str,
    actor_name: str | None,
    message: str,
    client_phone: str | None,
):
    clean_message = message.strip()
    resolved_phone = client_phone or _phone_from_message(clean_message)
    create_operator_message(org_id, user_id, "USER", clean_message)

    active_workflow = get_active_operator_workflow(org_id, user_id)
    if active_workflow:
        return _continue_dossier_workflow(
            org_id, user_id, active_workflow, clean_message, client_phone
        )

    try:
        intent_result = detect_intent(org_id=org_id, message=clean_message)
    except Exception:
        intent_result = {"intent": "UNKNOWN", "confidence": 0.0, "entities": {}}

    intent = intent_result.get("intent") or "UNKNOWN"
    confidence = float(intent_result.get("confidence") or 0.0)
    entities = intent_result.get("entities") or {}
    if intent == "UNKNOWN":
        intent, confidence = _fallback_intent(clean_message)

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
    )

    missing = _missing_fields(workflow_type, entities, resolved_phone)
    if missing:
        response = QUESTION_BY_FIELD[missing[0]]
    elif proposed_actions:
        response = "L’action est prête. Vérifiez les informations puis validez-la avant exécution."
    else:
        response = (
            "Je n’ai pas identifié d’action suffisamment sûre. "
            "Précisez le résultat attendu ou transmettez la demande à un responsable."
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


def approve_operator_workflow(org_id: str, workflow_id: str):
    workflow = get_workflow_run(org_id, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    if workflow["workflow_status"] != "PREPARED":
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
