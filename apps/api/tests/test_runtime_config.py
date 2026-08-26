import pytest
from pydantic import ValidationError
from pathlib import Path

from app.core.config import Settings


def test_production_cron_only_requires_database_contract():
    config = Settings(
        _env_file=None,
        app_env="production",
        app_runtime="cron",
        database_url="postgresql+psycopg2://user:pass@db.example.test:5432/postgres",
    )
    assert config.app_runtime == "cron"


def test_production_api_keeps_full_security_contract():
    with pytest.raises(ValidationError) as exc:
        Settings(
            _env_file=None,
            app_env="production",
            app_runtime="api",
            database_url="postgresql+psycopg2://user:pass@db.example.test:5432/postgres",
            public_base_url="http://not-secure.example.test",
        )
    message = str(exc.value)
    assert "PUBLIC_BASE_URL must be an HTTPS URL" in message


@pytest.mark.parametrize(
    "entrypoint",
    [
        "broadcast_campaigns.py",
        "departure_automation.py",
        "dossier_alerts.py",
        "followup_recovery.py",
        "knowledge_maintenance.py",
        "tracking_alerts.py",
    ],
)
def test_cron_entrypoint_sets_runtime_before_application_imports(entrypoint: str):
    source = Path("app/jobs", entrypoint).read_text(encoding="utf-8")
    runtime_position = source.index('os.environ["APP_RUNTIME"] = "cron"')
    application_import_position = source.index("from app.")
    assert runtime_position < application_import_position
