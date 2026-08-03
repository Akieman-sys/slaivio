"""Railway cron entrypoint for dossier operational alerts."""

import os

# This entrypoint owns its runtime identity. It must be set before importing
# repositories because they instantiate application settings through the DB.
os.environ.setdefault("APP_RUNTIME", "cron")

from app.core.logger import logger
from app.db.dossier_alert_repository import refresh_all_dossier_alerts


def main() -> None:
    summary = refresh_all_dossier_alerts()
    logger.info(
        "dossier_alert_refresh_completed:organizations=%s:created=%s:resolved=%s:active=%s",
        summary["organizations"], summary["created"], summary["resolved"], summary["active"],
    )


if __name__ == "__main__":
    main()
