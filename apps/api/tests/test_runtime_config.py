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


def test_dossier_alert_entrypoint_sets_runtime_before_repository_imports():
    source = Path("app/jobs/dossier_alerts.py").read_text(encoding="utf-8")
    runtime_position = source.index('os.environ.setdefault("APP_RUNTIME", "cron")')
    repository_position = source.index("from app.db.dossier_alert_repository import")
    assert runtime_position < repository_position
