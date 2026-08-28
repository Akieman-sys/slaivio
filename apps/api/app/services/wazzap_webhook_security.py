import hashlib
import hmac
import re


_SIGNATURE_PATTERN = re.compile(r"^sha256=([0-9a-fA-F]{64})$")


def validate_wazzap_signature(
    raw_body: bytes,
    signature_header: str | None,
    webhook_secret: str | None,
) -> bool:
    if not signature_header or not webhook_secret:
        return False

    match = _SIGNATURE_PATTERN.fullmatch(signature_header.strip())
    if not match:
        return False

    expected = hmac.new(
        webhook_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, match.group(1).lower())
