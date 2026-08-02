import hashlib
import hmac

from app.core.config import settings


def validate_meta_signature(raw_body: bytes, signature_header: str | None) -> bool:
    if not settings.meta_app_secret:
        return not settings.is_deployed
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(
        settings.meta_app_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(signature_header.removeprefix("sha256="), expected)
