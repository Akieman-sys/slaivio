def build_proposed_actions(
    workflow_type: str,
    entities: dict,
):
    if workflow_type == "CREATE_CLIENT":
        return [{"type":"CREATE_CLIENT","label":"Créer le client","payload":{
            "client_name":entities.get("client_name"),"client_phone":entities.get("client_phone")}}]

    if workflow_type == "CREATE_FOLLOWUP":
        return [{"type":"CREATE_FOLLOWUP","label":"Programmer la relance","payload":{
            "client_id":entities.get("client_id"),"client_name":entities.get("client_name"),
            "reason":entities.get("followup_reason"),"due_at":entities.get("due_at"),
            "message":entities.get("followup_message")}}]

    if workflow_type == "UPDATE_PACKAGE_STATUS":
        return [{"type":"UPDATE_PACKAGE_STATUS","label":"Changer le statut du colis","payload":{
            "package_id":entities.get("package_id"),"package_reference":entities.get("package_reference"),
            "current_status":entities.get("current_status"),"target_status":entities.get("target_status")}}]

    if workflow_type == "UPDATE_FOLLOWUP":
        return [{"type":"UPDATE_FOLLOWUP","label":entities.get("action_label") or "Modifier la relance","payload":{
            "followup_id":entities.get("followup_id"),"reference":entities.get("followup_reference"),
            "current_status":entities.get("current_status"),"mutation_action":entities.get("mutation_action"),
            "due_at":entities.get("due_at")}}]

    if workflow_type == "CREATE_DEPARTURE":
        return [{"type":"CREATE_DEPARTURE","label":"Créer le départ planifié","payload":{
            "route_id":entities.get("route_id"),"route_name":entities.get("route_name"),
            "shipping_service_id":entities.get("shipping_service_id"),"service_name":entities.get("service_name"),
            "scheduled_at":entities.get("scheduled_at"),"cutoff_at":entities.get("cutoff_at")}}]

    if workflow_type == "CREATE_SHIPMENT_DRAFT":
        package_request = entities.get("requested_operation") == "CREATE_PACKAGE"
        return [
            {
                "type": "CREATE_PACKAGE_DRAFT" if package_request else "CREATE_DOSSIER_DRAFT",
                "label": "Créer un colis" if package_request else "Créer un dossier client",
                "payload": {
                    "client_id": entities.get("client_id"),
                    "client_name": entities.get("client_name"),
                    "origin_country": entities.get("origin_country"),
                    "origin_city": entities.get("origin_city"),
                    "destination_country": entities.get("destination_country"),
                    "destination_city": entities.get("destination_city"),
                    "goods_type": entities.get("goods_type"),
                    "weight_kg": entities.get("weight_kg"),
                    "shipping_mode": entities.get("shipping_mode"),
                },
            },
            {
                "type": "ASK_MISSING_DETAILS",
                "label": "Demander les informations manquantes",
                "payload": {},
            },
        ]

    if workflow_type == "PRICING_ANSWER":
        return [
            {
                "type": "GENERATE_PRICING_RESPONSE",
                "label": "Répondre avec le tarif trouvé",
                "payload": entities,
            }
        ]

    if workflow_type == "TRACKING_LOOKUP":
        return [
            {
                "type": "LOOKUP_TRACKING",
                "label": "Chercher le colis par tracking",
                "payload": {
                    "tracking_id": entities.get("tracking_id"),
                },
            }
        ]

    if workflow_type == "SUPPLIER_DEPOSIT_DRAFT":
        return [
            {
                "type": "CREATE_SUPPLIER_DEPOSIT_NOTE",
                "label": "Préparer une note dépôt fournisseur",
                "payload": {
                    "supplier_name": entities.get("supplier_name"),
                    "origin_country": entities.get("origin_country"),
                },
            }
        ]

    if workflow_type == "PAYMENT_HELP":
        return [
            {
                "type": "GENERATE_PAYMENT_RESPONSE",
                "label": "Répondre sur les règles de paiement",
                "payload": entities,
            }
        ]

    if workflow_type == "ESCALATION_REQUIRED":
        return [
            {
                "type": "CREATE_ESCALATION",
                "label": "Créer une escalation manager",
                "payload": {
                    "reason": "AI detected sensitive conversation",
                    "entities": entities,
                },
            }
        ]

    return []

