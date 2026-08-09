from app.commercial.engines.goods_rule_engine import check_goods_restriction
from app.commercial.engines.intent_engine import missing_quote_fields
from app.commercial.engines.pricing_engine import calculate_quote_pricing
from app.commercial.repositories.commercial_repository import (
    create_commercial_case,
    create_commercial_dossier,
    create_commercial_event,
    create_commercial_followup,
    create_commercial_task,
    create_quote_request,
    create_quotation,
    get_or_create_client,
)
from app.commercial.resolvers.configuration_resolvers import (
    resolve_shipping_service,
)


def create_quote_flow(
    org_id: str,
    fields: dict,
    source_channel: str = "dashboard",
    last_customer_message: str | None = None,
):
    client = get_or_create_client(
        org_id=org_id,
        phone=fields.get("phone"),
        client_id=fields.get("client_id"),
    )
    dossier = create_commercial_dossier(
        org_id=org_id,
        client_id=str(client["id"]),
        case_type="QUOTE_REQUEST",
        fields=fields,
    )
    missing_fields = missing_quote_fields(fields)
    case_status = "NEEDS_INFO" if missing_fields else "OPEN"

    commercial_case = create_commercial_case(
        org_id=org_id,
        client_id=str(client["id"]),
        dossier_id=str(dossier["id"]),
        source_channel=source_channel,
        case_type="QUOTE_REQUEST",
        status=case_status,
        detected_intent="QUOTE_REQUEST",
        extracted_fields=fields,
        missing_fields=missing_fields,
        assigned_team="commercial",
        last_customer_message=last_customer_message,
    )

    quote_request = create_quote_request(
        org_id=org_id,
        commercial_case_id=str(commercial_case["id"]),
        dossier_id=str(dossier["id"]),
        client_id=str(client["id"]),
        fields=fields,
        status="NEEDS_INFO" if missing_fields else "PENDING",
    )

    if missing_fields:
        task = create_commercial_task(
            org_id=org_id,
            commercial_case_id=str(commercial_case["id"]),
            dossier_id=str(dossier["id"]),
            task_type="COLLECT_QUOTE_FIELDS",
            title="Completer les informations du devis",
            description="Des champs obligatoires manquent pour calculer un devis fiable.",
            assigned_team="commercial",
            metadata={
                "missing_fields": missing_fields,
                "quote_request_id": str(quote_request["id"]),
            },
        )
        create_commercial_event(
            org_id=org_id,
            commercial_case_id=str(commercial_case["id"]),
            dossier_id=str(dossier["id"]),
            event_type="QUOTE_NEEDS_INFO",
            event_title="Informations devis manquantes",
            event_payload={
                "missing_fields": missing_fields,
            },
        )

        return {
            "status": "needs_info",
            "case": commercial_case,
            "dossier": dossier,
            "quote_request": quote_request,
            "quotation": None,
            "task": task,
            "missing_fields": missing_fields,
        }

    service = resolve_shipping_service(
        org_id=org_id,
        origin_country=fields.get("origin_country"),
        destination_country=fields.get("destination_country"),
        destination_city=fields.get("destination_city"),
        shipping_mode=fields.get("shipping_mode"),
    )

    if not service:
        task = create_commercial_task(
            org_id=org_id,
            commercial_case_id=str(commercial_case["id"]),
            dossier_id=str(dossier["id"]),
            task_type="RESOLVE_SHIPPING_SERVICE",
            title="Aucun service shipping configure ne correspond",
            description="Verifier les services disponibles pour cette route.",
            priority="HIGH",
            assigned_team="operations",
            metadata={
                "fields": fields,
                "quote_request_id": str(quote_request["id"]),
            },
        )

        return {
            "status": "manual_review",
            "reason": "shipping_service_not_found",
            "case": commercial_case,
            "dossier": dossier,
            "quote_request": quote_request,
            "quotation": None,
            "task": task,
        }

    restriction = check_goods_restriction(
        org_id=org_id,
        goods_description=fields.get("goods_description"),
        goods_category=fields.get("goods_category"),
        shipping_service_id=str(service["id"]),
    )

    if restriction["decision"] in ["RESTRICTED", "PROHIBITED"]:
        task = create_commercial_task(
            org_id=org_id,
            commercial_case_id=str(commercial_case["id"]),
            dossier_id=str(dossier["id"]),
            task_type="RESTRICTION_ESCALATION",
            title="Marchandise bloquee ou restreinte",
            description=restriction.get("handling_instructions"),
            priority="HIGH",
            assigned_team="compliance",
            metadata={
                "restriction": restriction,
            },
        )

        return {
            "status": "restricted",
            "case": commercial_case,
            "dossier": dossier,
            "quote_request": quote_request,
            "quotation": None,
            "restriction": restriction,
            "task": task,
        }

    pricing = calculate_quote_pricing(
        org_id=org_id,
        shipping_service_id=str(service["id"]),
        weight_kg=fields.get("weight_kg"),
        volume_cbm=fields.get("volume_cbm"),
        declared_value=fields.get("declared_value"),
        client_id=str(client["id"]),
        goods_category=fields.get("goods_category"),
    )

    if not pricing["pricing_available"]:
        task = create_commercial_task(
            org_id=org_id,
            commercial_case_id=str(commercial_case["id"]),
            dossier_id=str(dossier["id"]),
            task_type="PRICING_REVIEW",
            title="Prix non configure pour ce service",
            description="Ajouter les composants tarifaires avant envoi du devis.",
            priority="HIGH",
            assigned_team="pricing",
            metadata={
                "shipping_service_id": str(service["id"]),
            },
        )

        return {
            "status": "manual_review",
            "reason": "pricing_not_configured",
            "case": commercial_case,
            "dossier": dossier,
            "quote_request": quote_request,
            "quotation": None,
            "task": task,
        }

    quotation = create_quotation(
        org_id=org_id,
        quote_request_id=str(quote_request["id"]),
        commercial_case_id=str(commercial_case["id"]),
        dossier_id=str(dossier["id"]),
        service=service,
        pricing=pricing,
        restriction=restriction,
        status="DRAFT",
    )
    followup = create_commercial_followup(
        org_id=org_id,
        commercial_case_id=str(commercial_case["id"]),
        dossier_id=str(dossier["id"]),
        followup_type="QUOTE_FOLLOWUP",
        message_template="Bonjour, souhaitez-vous confirmer ce devis SLAIVIO ?",
        metadata={
            "quotation_id": str(quotation["id"]),
        },
    )
    create_commercial_event(
        org_id=org_id,
        commercial_case_id=str(commercial_case["id"]),
        dossier_id=str(dossier["id"]),
        event_type="QUOTE_DRAFT_CREATED",
        event_title="Devis commercial cree",
        event_payload={
            "quotation_id": str(quotation["id"]),
            "total_minor": quotation["total_minor"],
            "currency_code": quotation["currency_code"],
        },
    )

    return {
        "status": "quoted",
        "case": commercial_case,
        "dossier": dossier,
        "quote_request": quote_request,
        "quotation": quotation,
        "restriction": restriction,
        "followup": followup,
    }
