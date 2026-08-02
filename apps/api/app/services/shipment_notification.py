from app.core.config import settings
from app.db.notification_repository import create_notification_outbox
from app.db.office_repository import find_office


def format_office_block(office: dict | None) -> str:
    if not office:
        return (
            "L’adresse exacte de retrait sera confirmée par l’agence."
        )

    lines = []

    if office.get("address"):
        lines.append(f"📍 Adresse : {office.get('address')}")

    if office.get("phone"):
        lines.append(f"📞 Téléphone : {office.get('phone')}")

    if office.get("whatsapp"):
        lines.append(f"💬 WhatsApp : {office.get('whatsapp')}")

    if office.get("opening_hours"):
        lines.append(f"🕒 Horaires : {office.get('opening_hours')}")

    if office.get("pickup_instructions"):
        lines.append(
            f"ℹ️ Instructions : {office.get('pickup_instructions')}"
        )

    return "\n".join(lines)


def get_shipment_status_message(
    status: str,
    shipment: dict,
    org_id: str,
) -> str | None:
    tracking_id = shipment.get("tracking_id") or "N/A"

    destination_city = shipment.get("destination_city")
    destination_country = shipment.get("destination_country")

    destination_office = None

    if destination_city or destination_country:
        destination_office = find_office(
            org_id=org_id,
            country=destination_country,
            city=destination_city,
        )

    office_block = format_office_block(destination_office)

    final_total = shipment.get("final_total")
    final_currency = shipment.get("final_currency") or "USD"

    messages = {
        "RECEIVED_AT_ORIGIN": (
            f"📦 Votre colis ({tracking_id}) a été reçu à notre entrepôt."
        ),

        "SCHEDULED_FOR_DEPARTURE": (
            f"✈️ Votre colis ({tracking_id}) est programmé pour expédition."
        ),

        "DEPARTED": (
            f"🚚 Votre colis ({tracking_id}) a quitté le pays d’origine."
        ),

        "IN_TRANSIT": (
            f"🌍 Votre colis ({tracking_id}) est actuellement en transit."
        ),

        "ARRIVED_HUB": (
            f"📍 Votre colis ({tracking_id}) est arrivé dans un hub logistique."
        ),

        "ARRIVED_DESTINATION": (
            f"✅ Votre colis ({tracking_id}) est arrivé à destination.\n\n"
            f"{office_block}"
        ),

        "READY_FOR_PICKUP": (
            f"📦 Votre colis ({tracking_id}) est prêt pour retrait.\n\n"
            f"{office_block}"
        ),

        "DELIVERED": (
            f"🎉 Votre colis ({tracking_id}) a bien été livré."
        ),

        "BLOCKED": (
            f"⚠️ Votre colis ({tracking_id}) est temporairement bloqué.\n\n"
            "Merci de contacter l’agence pour assistance."
        ),

        "ISSUE": (
            f"⚠️ Un problème est survenu avec votre colis ({tracking_id}).\n\n"
            "Merci de contacter l’agence."
        ),

        "WAITING_PAYMENT": (
            f"💰 Votre colis ({tracking_id}) a été reçu.\n\n"
            f"Montant total : {final_total} {final_currency}\n\n"
            "Merci de procéder au paiement afin de lancer l’expédition."
        ),

        "READY_FOR_DEPARTURE": (
            f"✅ Paiement confirmé pour votre colis ({tracking_id}).\n\n"
            "Le départ est prévu prochainement."
        ),
    }

    return messages.get(status)


def create_shipment_notification(
    org_id: str,
    shipment: dict,
    client_phone: str,
):
    message = get_shipment_status_message(
        status=shipment["status"],
        shipment=shipment,
        org_id=org_id,
    )

    if not message:
        return None

    return create_notification_outbox(
        org_id=org_id,
        client_id=shipment["client_id"],
        dossier_id=shipment["dossier_id"],
        recipient_phone=client_phone,
        notification_type=f"SHIPMENT_STATUS:{shipment['status']}",
        message=message,
    )


def get_payment_reminder_message(
    shipment: dict,
) -> str | None:
    total = shipment.get("fees_total") or 0
    paid = shipment.get("fees_paid") or 0

    try:
        balance_due = float(total) - float(paid)
    except (TypeError, ValueError):
        return None

    if balance_due <= 0:
        return None

    currency = shipment.get("currency") or "USD"
    tracking_id = shipment.get("tracking_id") or "N/A"

    return (
        f"💰 Votre colis ({tracking_id}) est prêt pour retrait.\n\n"
        f"Montant restant : {balance_due} {currency}\n\n"
        "Merci de régler le solde avant retrait."
    )


def create_payment_reminder_notification(
    org_id: str,
    shipment: dict,
    client_phone: str,
):
    message = get_payment_reminder_message(shipment)

    if not message:
        return None

    return create_notification_outbox(
        org_id=org_id,
        client_id=shipment["client_id"],
        dossier_id=shipment["dossier_id"],
        recipient_phone=client_phone,
        notification_type="PAYMENT_REMINDER",
        message=message,
    )
