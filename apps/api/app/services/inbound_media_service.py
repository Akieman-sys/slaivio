from app.db.media_repository import create_shipment_media
from app.db.message_repository import create_dossier_event
from app.services.meta_media_service import retrieve_meta_media_url


def store_inbound_meta_media(
    org_id: str,
    client_id: str,
    dossier_id: str,
    shipment_id: str | None,
    media_items: list[dict],
    raw_payload: dict,
    phone_number_id: str | None = None,
):
    stored = []
    for item in media_items:
        try:
            media_info = retrieve_meta_media_url(
                media_id=item["provider_media_id"],
                phone_number_id=phone_number_id,
            )
            media_url = media_info.get("url")
        except Exception:
            media_url = f"meta-media-id:{item['provider_media_id']}"

        media = create_shipment_media(
            org_id=org_id,
            shipment_id=shipment_id,
            dossier_id=dossier_id,
            client_id=client_id,
            media_url=media_url,
            media_type=item["media_type"],
            caption=item.get("caption") or "Média reçu via WhatsApp",
            is_private=True,
            provider="meta",
            provider_media_url=media_url,
            provider_message_id=item.get("provider_message_id"),
            content_type=item.get("content_type"),
            direction="INBOUND",
            source_channel="whatsapp",
            raw_payload=item.get("raw") or raw_payload,
        )
        if media:
            stored.append(media)

    if stored:
        create_dossier_event(
            org_id=org_id,
            dossier_id=dossier_id,
            event_type="META_INBOUND_MEDIA_STORED",
            payload={
                "count": len(stored),
                "media_ids": [str(media["id"]) for media in stored],
            },
        )
    return stored
