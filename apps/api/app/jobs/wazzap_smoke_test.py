import json
import os
from datetime import UTC, datetime

# Kept injectable for tests while avoiding application setup during module import.
WazzapWhatsAppProvider = None


def _result_line(**values: object) -> str:
    return json.dumps(values, ensure_ascii=True, sort_keys=True)


def _provider_class():
    previous_runtime = os.environ.get("APP_RUNTIME")
    os.environ["APP_RUNTIME"] = "cron"
    try:
        provider_class = WazzapWhatsAppProvider
        if provider_class is None:
            from app.services.wazzap_whatsapp_provider import (
                WazzapWhatsAppProvider as provider_class,
            )
        return provider_class
    finally:
        if previous_runtime is None:
            os.environ.pop("APP_RUNTIME", None)
        else:
            os.environ["APP_RUNTIME"] = previous_runtime


def main() -> int:
    recipient = os.getenv("WAZZAP_SMOKE_RECIPIENT", "").strip()
    confirmation = os.getenv("WAZZAP_SMOKE_CONFIRM", "").strip()

    if confirmation != "SEND":
        print(
            _result_line(
                success=False,
                error="confirmation_required",
                hint="Set WAZZAP_SMOKE_CONFIRM=SEND to authorize one real message.",
            )
        )
        return 2
    if not recipient:
        print(
            _result_line(
                success=False,
                error="recipient_required",
                hint="Set WAZZAP_SMOKE_RECIPIENT in international format.",
            )
        )
        return 2

    message = os.getenv("WAZZAP_SMOKE_MESSAGE", "").strip()
    if not message:
        timestamp = datetime.now(UTC).replace(microsecond=0).isoformat()
        message = (
            "Test technique SLAIVIO. Aucun traitement n'est requis. "
            f"Reference: {timestamp}"
        )

    provider_class = _provider_class()

    try:
        result = provider_class().send_message(recipient, message)
    except Exception as exc:
        # Never print configuration or provider response bodies from a smoke test.
        print(
            _result_line(
                success=False,
                error="send_failed",
                error_type=type(exc).__name__,
            )
        )
        return 1

    success = bool(result.get("success"))
    print(
        _result_line(
            success=success,
            provider=result.get("provider"),
            status=result.get("status"),
            provider_message_id=result.get("provider_message_id"),
        )
    )
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
