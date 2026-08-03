"""Railway cron entrypoint for deterministic Tracking alerts."""

import os

os.environ.setdefault("APP_RUNTIME", "cron")

from app.core.logger import logger
from app.tracking.repository import detect_all_tracking_alerts


def main() -> None:
    summary = detect_all_tracking_alerts()
    logger.info(
        "tracking_alert_detection_completed:organizations=%s:created=%s",
        summary["organizations"],
        summary["created"],
    )


if __name__ == "__main__":
    main()
