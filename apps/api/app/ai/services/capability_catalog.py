"""User-facing catalogue of the operational assistant capabilities."""

from app.permissions.services.permission_service import list_permissions_for_user


READ_CAPABILITIES = (
    ("overview", "Pilotage de l’agence", "Résumer les volumes et faire remonter les relances, alertes et blocages prioritaires.", "analytics.read", "Que dois-je traiter aujourd’hui ?"),
    ("clients", "Clients", "Rechercher et identifier un client sans créer de doublon.", "clients.read", "Est-ce qu’un client nommé Bawaba existe ?"),
    ("dossiers", "Dossiers", "Consulter les dossiers d’un client et leur état réel.", "dossiers.read", "Montre les dossiers de ce client."),
    ("packages", "Colis", "Lister les colis et consulter leur situation opérationnelle.", "packages.read", "Montre les colis enregistrés de ce client."),
    ("tracking", "Tracking", "Lire le statut, la position et l’ETA depuis le suivi officiel.", "tracking.read", "Où se trouve COL-2026-008452 ?"),
    ("routes", "Routes", "Présenter uniquement les routes actives configurées par l’agence.", "routes.read", "Quelles routes vers Kinshasa sont actives ?"),
    ("services", "Services", "Présenter les services réellement disponibles dans l’agence.", "services.read", "Quels services proposons-nous ?"),
    ("recommendation", "Recommander Route + Service", "Vérifier destination, disponibilité, capacité et restrictions avec les moteurs officiels.", "services.read", "Quelle route et quel service pour 45 kg de Guangzhou vers Kinshasa ?"),
    ("pricing", "Tarification", "Calculer un prix avec le moteur tarifaire, jamais depuis un texte obsolète.", "pricing.simulate", "Calcule 45 kg Guangzhou vers Kinshasa en Air."),
    ("warehouses", "Entrepôts", "Retrouver les adresses et horaires configurés.", "warehouses.read", "Donne l’adresse de l’entrepôt de Guangzhou."),
    ("departures", "Départs", "Consulter le calendrier réel des prochains départs.", "departures.read", "Quels départs sont prévus cette semaine ?"),
    ("batches", "Batchs", "Consulter les groupages, leur capacité et leur état.", "batches.read", "Quels batchs sont prêts à expédier ?"),
    ("shipments", "Expéditions", "Consulter les expéditions et leur progression.", "shipments.read", "Montre les expéditions en transit."),
    ("pickups", "Retraits", "Consulter les retraits prêts ou en attente.", "pickups.read", "Quels retraits attendent aujourd’hui ?"),
    ("finance", "Finance", "Consulter factures, paiements et impayés selon les droits.", "finance.read", "Quelles factures sont en retard ?"),
    ("followups", "Relances", "Consulter les relances dues et en retard.", "followups.read", "Qui dois-je relancer aujourd’hui ?"),
    ("broadcasts", "Broadcasts", "Consulter les campagnes actives et programmées.", "broadcasts.read", "Quelles campagnes sont programmées ?"),
    ("knowledge", "Connaissances", "Répondre depuis les contenus publiés et autorisés.", "knowledge.read", "Quels documents faut-il demander pour Sea Cargo ?"),
)

ACTION_CAPABILITIES = (
    ("create_client", "Créer un client", "Collecte l’identité, vérifie les doublons puis demande confirmation.", "clients.create", "Crée un client."),
    ("create_dossier", "Créer un dossier", "Relie le client, la route et la marchandise avant création.", "dossiers.create", "Prépare un dossier pour ce client."),
    ("create_package", "Créer un colis", "Suit le parcours Client → Dossier → Colis avec validation métier.", "packages.create", "Crée un colis pour ce client."),
    ("package_status", "Mettre à jour un colis", "Prépare une transition autorisée ; la livraison exige une preuve dédiée.", "packages.update", "Passe COL-2026-008452 en entrepôt."),
    ("create_followup", "Programmer une relance", "Prépare une relance opérationnelle WhatsApp avec date et motif.", "followups.create", "Relance ce client demain pour son colis."),
    ("manage_followup", "Gérer une relance", "Reporter, mettre en pause, reprendre, terminer ou escalader une relance existante.", "followups.update", "Reporte FUP-2026-001284 à demain 16 h."),
    ("create_departure", "Planifier un départ", "Sélectionne une route et un service existants, puis prépare un départ à confirmer.", "departures.manage", "Planifie un départ Air Guangzhou vers Kinshasa vendredi à 18 h."),
    ("create_batch", "Créer un batch", "Utilise une route, un service et un entrepôt déjà configurés pour préparer un groupage contrôlé.", "batches.create", "Crée un batch Air Guangzhou vers Kinshasa."),
    ("convert_batch", "Créer une expédition depuis un batch", "Convertit uniquement un batch validé et prêt à expédier, sans dupliquer l’expédition.", "batches.convert", "Crée l’expédition depuis BAT-2026-00184."),
    ("shipment_status", "Faire progresser une expédition", "Applique uniquement une transition opérationnelle autorisée avec contrôle de version.", "shipments.update", "Passe EXP-2026-00458 en transit."),
)


def assistant_capabilities(org_id: str, user_id: str) -> dict:
    permissions = set(list_permissions_for_user(user_id=user_id, org_id=org_id))

    def expose(items):
        return [
            {"id": key, "title": title, "description": description, "example": example}
            for key, title, description, permission, example in items
            if permission in permissions
        ]

    reads = expose(READ_CAPABILITIES)
    actions = expose(ACTION_CAPABILITIES) if "ai.copilot.execute" in permissions else []
    return {
        "consultations": reads,
        "actions": actions,
        "safety": [
            "Les réponses utilisent uniquement les données de votre agence et de votre workspace.",
            "Les prix viennent du moteur Tarification et le suivi du module Tracking.",
            "Les créations et modifications sont récapitulées avant exécution.",
            "Les opérations sensibles restent soumises à une validation humaine.",
        ],
    }
