from urllib.parse import quote
from urllib.parse import urlparse

import httpx

from app.core.config import settings


def _configuration(bucket_name: str | None = None) -> tuple[str, str, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("document_storage_not_configured")
    parsed = urlparse(settings.supabase_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise RuntimeError("document_storage_url_invalid")
    return (
        settings.supabase_url.rstrip("/"),
        settings.supabase_service_role_key,
        bucket_name or settings.dossier_documents_bucket,
    )


def upload_private_document(object_path: str, content: bytes, content_type: str, bucket_name: str | None = None) -> None:
    base_url, key, bucket = _configuration(bucket_name)
    try:
        response = httpx.post(
            f"{base_url}/storage/v1/object/{quote(bucket)}/{quote(object_path, safe='/')}",
            headers={"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": content_type, "x-upsert": "false"},
            content=content,
            timeout=30,
        )
    except httpx.RequestError as exc:
        raise RuntimeError("document_storage_unavailable") from exc
    if response.status_code >= 300:
        raise RuntimeError("document_storage_upload_failed")


def create_document_download_url(object_path: str, expires_in: int = 300, bucket_name: str | None = None) -> str:
    base_url, key, bucket = _configuration(bucket_name)
    try:
        response = httpx.post(
            f"{base_url}/storage/v1/object/sign/{quote(bucket)}/{quote(object_path, safe='/')}",
            headers={"Authorization": f"Bearer {key}", "apikey": key},
            json={"expiresIn": expires_in},
            timeout=15,
        )
    except httpx.RequestError as exc:
        raise RuntimeError("document_storage_unavailable") from exc
    if response.status_code >= 300:
        raise RuntimeError("document_storage_sign_failed")
    signed = response.json().get("signedURL") or response.json().get("signedUrl")
    if not signed:
        raise RuntimeError("document_storage_sign_failed")
    return signed if signed.startswith("http") else f"{base_url}/storage/v1{signed}"
