import json

from app.ai.repositories.dossier_draft_repository import (
    update_dossier_draft_status,
)
from app.ai.repositories.dossier_execution_repository import (
    create_dossier_event,
    create_real_dossier,
    create_real_shipment,
)


def execute_dossier_draft(draft: dict):
    dossier = create_real_dossier(
        org_id=draft["org_id"],
        client_phone=draft["client_phone"],
        client_name=draft.get("client_name"),
        origin_country=draft.get("origin_country"),
        origin_city=draft.get("origin_city"),
        destination_country=draft.get("destination_country"),
        destination_city=draft.get("destination_city"),
        goods_type=draft.get("goods_type"),
        estimated_weight_kg=draft.get("estimated_weight_kg"),
        estimated_volume_cbm=draft.get("estimated_volume_cbm"),
        shipping_mode=draft.get("shipping_mode"),
    )
    shipment = create_real_shipment(
        org_id=draft["org_id"],
        dossier=dossier,
    )

    create_dossier_event(
        org_id=draft["org_id"],
        dossier_id=str(dossier["id"]),
        event_type="AI_DRAFT_EXECUTED",
        payload=json.dumps(
            {
                "shipment_id": str(shipment["id"]),
                "draft_id": str(draft["id"]),
            }
        ),
    )

    updated = update_dossier_draft_status(
        org_id=str(draft["org_id"]),
        draft_id=str(draft["id"]),
        status="CREATED",
        created_dossier_id=str(dossier["id"]),
        created_shipment_id=str(shipment["id"]),
    )

    return {
        "status": "ok",
        "dossier": dossier,
        "shipment": shipment,
        "draft": updated,
    }
