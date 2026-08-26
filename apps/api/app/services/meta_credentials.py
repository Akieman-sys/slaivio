from cryptography.fernet import Fernet

from app.core.config import settings


def _cipher() -> Fernet | None:
    key = settings.meta_credentials_encryption_key
    return Fernet(key.encode("ascii")) if key else None


def token_for_storage(token: str | None) -> tuple[str | None, str | None]:
    """Return legacy plaintext and encrypted value; production always encrypts."""
    if not token:
        return None, None
    cipher = _cipher()
    if not cipher:
        return token, None
    encrypted = cipher.encrypt(token.encode("utf-8")).decode("ascii")
    return None, encrypted


def reveal_access_token(row: dict | None) -> dict | None:
    if not row:
        return row
    result = dict(row)
    if not result.get("access_token") and result.get("access_token_encrypted"):
        cipher = _cipher()
        if not cipher:
            raise ValueError("META_CREDENTIALS_ENCRYPTION_KEY is missing")
        result["access_token"] = cipher.decrypt(
            result["access_token_encrypted"].encode("ascii")
        ).decode("utf-8")
    result.pop("access_token_encrypted", None)
    return result
