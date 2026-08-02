import tempfile

import requests

from app.core.config import settings


def retrieve_meta_media_url(
    media_id: str,
    phone_number_id: str | None = None,
) -> dict:
    if not settings.meta_wa_access_token:
        raise ValueError("META_WA_ACCESS_TOKEN is missing")

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
            "Authorization": f"Bearer {settings.meta_wa_access_token}",
        },
        params=params,
        timeout=30,
    )

    response.raise_for_status()

    return response.json()


def download_meta_media_bytes(
    media_url: str,
) -> bytes:
    response = requests.get(
        media_url,
        headers={
            "Authorization": f"Bearer {settings.meta_wa_access_token}",
        },
        timeout=30,
    )

    response.raise_for_status()

    return response.content


def download_meta_media_to_tempfile(
    media_url: str,
    content_type: str | None = None,
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

    content = download_meta_media_bytes(media_url)
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(content)
        return temp_file.name
