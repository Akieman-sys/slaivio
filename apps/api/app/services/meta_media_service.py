import tempfile

import requests

from app.core.config import settings
from app.db.whatsapp_routing_repository import find_number_by_phone_number_id, get_default_number_for_org


def _access_token(phone_number_id: str | None = None, org_id: str | None = None) -> str:
    number = None
    if phone_number_id:
        number = find_number_by_phone_number_id(phone_number_id)
    elif org_id:
        number = get_default_number_for_org(org_id)
    token = (number or {}).get("access_token") or settings.meta_wa_access_token
    if not token:
        raise ValueError("Meta access token is missing for this WhatsApp number")
    return token


def retrieve_meta_media_url(
    media_id: str,
    phone_number_id: str | None = None,
) -> dict:
    access_token = _access_token(phone_number_id=phone_number_id)

    url = (
        f"https://graph.facebook.com/"
        f"{settings.meta_wa_api_version}/"
        f"{media_id}"
    )

    params = {}

    if phone_number_id:
        params["phone_number_id"] = phone_number_id

    response = requests.get(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
        },
        params=params,
        timeout=30,
    )

    response.raise_for_status()

    return response.json()


def download_meta_media_bytes(
    media_url: str,
    org_id: str | None = None,
) -> bytes:
    access_token = _access_token(org_id=org_id)
    response = requests.get(
        media_url,
        headers={
            "Authorization": f"Bearer {access_token}",
        },
        timeout=30,
    )

    response.raise_for_status()

    return response.content


def download_meta_media_to_tempfile(
    media_url: str,
    content_type: str | None = None,
    org_id: str | None = None,
) -> str:
    suffix = ".audio"
    normalized_type = (content_type or "").lower()
    if "ogg" in normalized_type:
        suffix = ".ogg"
    elif "mpeg" in normalized_type or "mp3" in normalized_type:
        suffix = ".mp3"
    elif "wav" in normalized_type:
        suffix = ".wav"
    elif "mp4" in normalized_type:
        suffix = ".mp4"

    content = download_meta_media_bytes(media_url, org_id=org_id)
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(content)
        return temp_file.name
