import asyncio
import os

async def main() -> None:
    previous_runtime = os.environ.get("APP_RUNTIME")
    os.environ["APP_RUNTIME"] = "cron"
    try:
        from app.core.logger import logger
        from app.services.wazzap_webhook_processor import recover_wazzap_events

        result = await recover_wazzap_events(limit=250)
        logger.info("wazzap_webhook_recovery:%s", result)
    finally:
        if previous_runtime is None:
            os.environ.pop("APP_RUNTIME", None)
        else:
            os.environ["APP_RUNTIME"] = previous_runtime


if __name__ == "__main__":
    asyncio.run(main())
