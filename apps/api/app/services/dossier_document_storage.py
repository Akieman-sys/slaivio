from urllib.parse import quote

import httpx

from app.core.config import settings


def _configuration() -> tuple[str, str, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("document_storage_not_configured")
    return (
        settings.supabase_url.rstrip("/"),
        settings.supabase_service_role_key,
        settings.dossier_documents_bucket,
    )


def upload_private_document(object_path: str, content: bytes, content_type: str) -> None:
    base_url, key, bucket = _configuration()
    response = httpx.post(
        f"{base_url}/storage/v1/object/{quote(bucket)}/{quote(object_path, safe='/')}",
        headers={"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": content_type, "x-upsert": "false"},
        content=content,
        timeout=30,
    )
    if response.status_code >= 300:
        raise RuntimeError("document_storage_upload_failed")


def create_document_download_url(object_path: str, expires_in: int = 300) -> str:
    base_url, key, bucket = _configuration()
    response = httpx.post(
        f"{base_url}/storage/v1/object/sign/{quote(bucket)}/{quote(object_path, safe='/')}",
        headers={"Authorization": f"Bearer {key}", "apikey": key},
        json={"expiresIn": expires_in},
        timeout=15,
    )
    if response.status_code >= 300:
        raise RuntimeError("document_storage_sign_failed")
    signed = response.json().get("signedURL") or response.json().get("signedUrl")
    if not signed:
        raise RuntimeError("document_storage_sign_failed")
    return signed if signed.startswith("http") else f"{base_url}/storage/v1{signed}"
