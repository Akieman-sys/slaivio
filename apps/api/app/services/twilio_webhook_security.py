from fastapi import Request

from twilio.request_validator import RequestValidator

from app.core.config import settings


async def validate_twilio_request(request: Request, form_data: dict) -> bool:
    if settings.is_deployed and not settings.twilio_validate_signature:
        return False
    if not settings.twilio_validate_signature:
        return True

    if not settings.twilio_auth_token:
        return False

    signature = request.headers.get("X-Twilio-Signature")

    if not signature:
        return False

    validator = RequestValidator(settings.twilio_auth_token)

    url = str(request.url)

    if settings.public_base_url:
        path = request.url.path
        url = settings.public_base_url.rstrip("/") + path

    return validator.validate(
        uri=url,
        params=form_data,
        signature=signature,
    )
