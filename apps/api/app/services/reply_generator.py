from app.services.client_shipments_service import (
    is_multiple_shipments_question,
    get_client_shipments_reply,
)
from app.services.ai_knowledge_router import route_knowledge_answer
from app.services.address_service import handle_address_request
from app.services.pricing_orchestrator import handle_pricing_request
from app.services.intake_service import (
    get_missing_intake_fields,
    build_human_intake_message,
)
from app.services.goods_rules_engine import build_goods_reply, find_goods_rule_answer
from app.core.config import settings


def _merge_fields(
    dossier: dict | None,
    understanding: dict | None,
):
    fields = {}

    if dossier:
        fields.update({
            "origin_country": dossier.get("origin_country"),
            "origin_city": dossier.get("origin_city"),
            "destination_country": dossier.get("destination_country"),
            "destination_city": dossier.get("destination_city"),
            "goods_type": dossier.get("goods_type"),
            "estimated_weight_kg": dossier.get("estimated_weight_kg"),
            "estimated_volume_cbm": dossier.get("estimated_volume_cbm"),
            "shipping_mode": dossier.get("shipping_mode"),
            "tracking_id": dossier.get("tracking_id"),
            "supplier_payment_amount": dossier.get("supplier_payment_amount"),
            "supplier_payment_currency": dossier.get("supplier_payment_currency"),
            "supplier_mentioned": dossier.get("supplier_mentioned"),
        })

    if understanding and understanding.get("ai_result"):
        ai_fields = understanding["ai_result"].get("extracted_fields") or {}

        for key, value in ai_fields.items():
            if value not in [None, ""]:
                fields[key] = value

    return fields


def _format_known_fields(fields: dict) -> str:
    lines = []

    origin = fields.get("origin_country") or fields.get("origin_city")
    destination = fields.get("destination_city") or fields.get("destination_country")
    goods_type = fields.get("goods_type")
    weight = fields.get("estimated_weight_kg")
    volume = fields.get("estimated_volume_cbm")
    shipping_mode = fields.get("shipping_mode")

    if origin:
        lines.append(f"- Origine : {origin}")

    if destination:
        lines.append(f"- Destination : {destination}")

    if goods_type:
        lines.append(f"- Marchandise : {goods_type}")

    if weight:
        lines.append(f"- Poids estimé : {weight} kg")

    if volume:
        lines.append(f"- Volume estimé : {volume} CBM")

    if shipping_mode:
        lines.append(f"- Mode souhaité : {shipping_mode}")

    if not lines:
        return ""

    return "J’ai bien noté :\n" + "\n".join(lines) + "\n\n"


def _missing_shipping_fields(fields: dict) -> list[str]:
    missing = []

    origin = fields.get("origin_country") or fields.get("origin_city")
    destination = fields.get("destination_country") or fields.get("destination_city")
    goods_type = fields.get("goods_type")
    weight = fields.get("estimated_weight_kg")
    volume = fields.get("estimated_volume_cbm")

    if not origin:
        missing.append("le pays ou la ville d’origine")

    if not destination:
        missing.append("le pays ou la ville de destination")

    if not goods_type:
        missing.append("le type de marchandise")

    if not weight and not volume:
        missing.append("le poids ou volume approximatif")

    return missing


def _format_missing_questions(missing_fields: list[str]) -> str:
    if not missing_fields:
        return (
            "Nous avons les premières informations. "
            "L’équipe pourra vérifier les détails et vous confirmer la suite."
        )

    lines = [
        f"{index}. {field}"
        for index, field in enumerate(missing_fields, start=1)
    ]

    return "Merci de préciser aussi :\n" + "\n".join(lines)


def _supplier_payment_reply(
    org_name: str,
    fields: dict,
):
    amount = fields.get("supplier_payment_amount")
    currency = fields.get("supplier_payment_currency")

    known_payment = ""

    if amount and currency:
        known_payment = (
            f"J’ai bien noté le montant : {amount} {currency}.\n\n"
        )

    return {
        "reply_type": "supplier_payment_intake",
        "should_escalate": False,
        "message": (
            f"Merci d’avoir contacté {org_name}.\n\n"
            f"{known_payment}"
            "Pour le paiement fournisseur, merci de préciser :\n"
            "1. le montant exact\n"
            "2. la devise\n"
            "3. le moyen souhaité si connu : WeChat Pay, Alipay ou autre\n"
            "4. les informations du fournisseur"
        ),
    }


def _tracking_reply(
    org_name: str,
    fields: dict,
):
    tracking_id = fields.get("tracking_id")

    if tracking_id:
        message = (
            f"Merci d’avoir contacté {org_name}.\n\n"
            f"J’ai bien reçu votre numéro de suivi : {tracking_id}.\n"
            "Nous allons vérifier le statut de votre colis."
        )

    else:
        message = (
            f"Merci d’avoir contacté {org_name}.\n\n"
            "Veuillez nous envoyer votre numéro de tracking afin que nous puissions "
            "vérifier le statut de votre colis."
        )

    return {
        "reply_type": "tracking_lookup_needed",
        "should_escalate": False,
        "message": message,
    }


def _pricing_reply(
    org_id: str,
    text: str,
    dossier: dict | None,
):
    pricing = handle_pricing_request(
        org_id=org_id,
        text=text,
        dossier=dossier,
    )

    if pricing["pricing_status"] == "MISSING_ROUTE":
        return {
            "reply_type": "PRICING_INCOMPLETE",
            "message": (
                "Veuillez préciser le pays de départ et le pays de destination."
            ),
            "should_escalate": False,
            "pricing": pricing,
        }

    if pricing["pricing_status"] == "MISSING_QUANTITY":
        return {
            "reply_type": "PRICING_INCOMPLETE",
            "message": "Veuillez préciser le poids estimé en kg.",
            "should_escalate": False,
            "pricing": pricing,
        }
    
    if pricing["pricing_status"] == "MANUAL_CONFIRMATION_REQUIRED":
        result = pricing["result"]

        return {
            "reply_type": "PRICING_MANUAL_CONFIRMATION_REQUIRED",
            "message": (
                "Cette tarification doit être confirmée par l’agence.\n\n"
                f"{result.get('message') or 'Un membre de l’équipe va vérifier le tarif exact.'}"
            ),
            "should_escalate": True,
            "pricing": pricing,
        }


    if pricing["pricing_status"] == "NO_RULE_FOUND":
        return {
            "reply_type": "PRICING_NOT_FOUND",
            "message": (
                "Nous n’avons pas encore de tarif disponible pour cette route. "
                "Veuillez contacter l’agence pour une confirmation."
            ),
            "should_escalate": True,
            "pricing": pricing,
        }

    parsed = pricing["parsed"]
    result = pricing["result"]

    return {
        "reply_type": "PRICING_RESPONSE",
        "message": (
            "💰 Estimation de votre envoi :\n\n"
            f"Origine : {parsed['origin_country']}\n"
            f"Destination : {parsed['destination_country']}\n"
            f"Poids : {parsed['weight_kg']} kg\n\n"
            f"Prix : {result['total']} {result['currency']}\n\n"
            "Veuillez confirmer pour continuer votre dossier."
        ),
        "should_escalate": False,
        "pricing": pricing,
    }


def _confirmed_client_reply(
    org_name: str,
    dossier: dict | None,
):
    missing = get_missing_intake_fields(dossier)

    if missing:
        return {
            "reply_type": "CONFIRMATION_INTAKE",
            "should_escalate": False,
            "message": build_human_intake_message(
                missing_fields=missing,
                org_name=org_name,
                case_type=dossier.get("case_type") if dossier else None,
            ),
        }

    if dossier and dossier.get("intake_status") == "COMPLETE":
        return {
            "reply_type": "WAITING_PACKAGE",
            "should_escalate": False,
            "message": (
                f"Parfait chef 🙏\n\n"
                f"Votre dossier est bien enregistré chez {org_name}.\n\n"
                "Nous attendons maintenant que le colis soit déposé au bureau "
                "ou reçu à notre entrepôt par votre fournisseur.\n\n"
                "Dès réception, l’équipe va confirmer le poids réel, le prix final "
                "et vous envoyer le suivi."
            ),
        }

    return {
        "reply_type": "CONFIRMED_COMPLETE",
        "should_escalate": False,
        "message": (
            f"Merci. Votre dossier est bien enregistré chez {org_name}. "
            "Nous allons procéder à la suite."
        ),
    }


def generate_reply(
    intent: str,
    org_name: str,
    org_id: str,
    understanding: dict | None = None,
    dossier: dict | None = None,
    text: str = "",
) -> dict:
    resolved_org_id = org_id
    fields = _merge_fields(
        dossier=dossier,
        understanding=understanding,
    )

    known_fields_text = _format_known_fields(fields)

    if is_multiple_shipments_question(text):
        client_phone = None

        if dossier and dossier.get("client"):
            client_phone = dossier["client"].get("phone")

        if not client_phone and dossier:
            client_phone = dossier.get("client_phone") or dossier.get("phone")

        if client_phone:
            return get_client_shipments_reply(
                org_id=resolved_org_id,
                org_name=org_name,
                phone=client_phone,
            )


    knowledge_result = route_knowledge_answer(
        org_id=resolved_org_id,
        org_name=org_name,
        intent=intent,
        text=text,
        understanding=understanding,
    )

    goods_result = find_goods_rule_answer(
        org_id=resolved_org_id,
        text=text,
    )

    if goods_result["found"]:
        return {
            "reply_type": "GOODS_RULE_RESPONSE",
            "should_escalate": bool(
                goods_result["rule"].get("requires_manual_validation")
            ),
            "message": build_goods_reply(
                org_name=org_name,
                answer=goods_result["answer"],
            ),
        }


    if knowledge_result["reply"] and knowledge_result["found"]:
        return knowledge_result["reply"]

    if knowledge_result["reply"] and knowledge_result["reply"].get("should_escalate"):
        return knowledge_result["reply"]


    if dossier and dossier.get("validation_status") == "CONFIRMED_BY_CLIENT":
        return _confirmed_client_reply(
            org_name=org_name,
            dossier=dossier,
        )

    if intent == "GREETING":
        return {
            "reply_type": "greeting",
            "should_escalate": False,
            "message": (
                f"Bonjour 👋, merci d’avoir contacté {org_name}.\n\n"
                "Comment pouvons-nous vous aider aujourd’hui ?\n"
                "Vous pouvez écrire par exemple :\n"
                "- Je veux envoyer un colis\n"
                "- Je veux connaître le prix\n"
                "- Je veux suivre mon colis\n"
                "- Je veux utiliser votre service transitaire"
            ),
        }

    if intent == "SEND_CARGO_REQUEST":
        missing = _missing_shipping_fields(fields)

        return {
            "reply_type": "guided_intake",
            "should_escalate": False,
            "message": (
                f"Merci d’avoir contacté {org_name}.\n\n"
                f"{known_fields_text}"
                f"{_format_missing_questions(missing)}"
            ),
        }

    if intent == "TRANSITAIRE_REQUEST":
        missing = _missing_shipping_fields(fields)

        if not fields.get("supplier_mentioned"):
            missing.append("si votre fournisseur a déjà préparé le colis")

        return {
            "reply_type": "guided_intake",
            "should_escalate": False,
            "message": (
                f"Merci d’avoir contacté {org_name}.\n\n"
                f"{known_fields_text}"
                "Pour préparer votre dossier transitaire, voici ce qu’il nous faut.\n\n"
                f"{_format_missing_questions(missing)}"
            ),
        }

    if intent in ["PRICE_REQUEST", "PRICING_REQUEST"]:
        return _pricing_reply(
            org_id=resolved_org_id,
            text=text,
            dossier=dossier,
        )

    if intent == "SUPPLIER_PAYMENT_REQUEST":
        return _supplier_payment_reply(
            org_name=org_name,
            fields=fields,
        )

    if intent == "TRACKING_REQUEST":
        return _tracking_reply(
            org_name=org_name,
            fields=fields,
        )

    if intent == "WAREHOUSE_ADDRESS_REQUEST":
        result = handle_address_request(
            org_id=resolved_org_id,
            text=text,
        )

        return {
            "reply_type": "ADDRESS_RESPONSE",
            "message": result["message"],
            "should_escalate": not result["found"],
        }

    if intent == "DEPARTURE_SCHEDULE_REQUEST":
        return {
            "reply_type": "needs_agency_knowledge",
            "should_escalate": False,
            "message": (
                f"Merci d’avoir contacté {org_name}.\n\n"
                "Nous devons vérifier le prochain départ disponible afin de vous "
                "donner une information correcte."
            ),
        }

    if intent == "HUMAN_HELP_REQUEST":
        return {
            "reply_type": "human_requested",
            "should_escalate": True,
            "message": (
                f"D’accord. {org_name} transmet votre demande à un membre de l’équipe."
            ),
        }

    if intent == "CONFIRMATION":
        return _confirmed_client_reply(
            org_name=org_name,
            dossier=dossier,
        )

    return {
        "reply_type": "unknown",
        "should_escalate": False,
        "message": (
            f"Merci d’avoir contacté {org_name}.\n\n"
            "Pouvez-vous préciser votre besoin ?\n"
            "Par exemple : envoyer un colis, connaître le prix, suivre un colis, "
            "ou utiliser le service transitaire."
        ),
    }
