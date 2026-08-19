REQUIRED_FIELDS_BY_INTENT = {
    "PRICING_REQUEST": [
        "origin_country",
        "destination_city",
    ],
    "TRACKING_REQUEST": [
        "tracking_id",
    ],
    "SHIPMENT_CREATION": [
        "origin_country",
        "destination_city",
        "goods_type",
    ],
    "SUPPLIER_DEPOSIT": [
        "supplier_name",
    ],
}

ESCALATION_INTENTS = {
    "COMPLAINT",
    "HUMAN_AGENT_REQUEST",
}

AUTO_REPLY_INTENTS = {
    "PRICING_REQUEST",
    "WAREHOUSE_ADDRESS_REQUEST",
    "PAYMENT_QUESTION",
    "GENERAL_QUESTION",
}


def get_missing_fields(
    intent: str,
    entities: dict,
):
    required = REQUIRED_FIELDS_BY_INTENT.get(intent, [])
    missing = []

    for field in required:
        value = entities.get(field)
        if value is None or value == "":
            missing.append(field)

    return missing


def decide_response_action(
    intent: str,
    confidence: float,
    entities: dict,
):
    if confidence < 0.45:
        return {
            "decision": "ASK_CLARIFICATION",
            "reason": "Low confidence requires clarification",
            "missing_fields": [],
        }

    if intent in ESCALATION_INTENTS:
        return {
            "decision": "ESCALATE",
            "reason": f"Intent requires human handling: {intent}",
            "missing_fields": [],
        }

    missing_fields = get_missing_fields(intent, entities)

    if missing_fields:
        return {
            "decision": "ASK_MORE_INFO",
            "reason": "Missing required fields",
            "missing_fields": missing_fields,
        }

    if intent in AUTO_REPLY_INTENTS:
        return {
            "decision": "AUTO_REPLY",
            "reason": "Safe auto-reply intent",
            "missing_fields": [],
        }

    return {
        "decision": "DRAFT_ONLY",
        "reason": "Intent should be reviewed by manager",
        "missing_fields": [],
    }

