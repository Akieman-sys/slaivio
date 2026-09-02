import pytest
from cryptography.fernet import Fernet
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


def test_production_api_accepts_isolated_qr_gateway_contract():
    config = Settings(
        _env_file=None,
        app_env="production",
        app_runtime="api",
        database_url="postgresql+psycopg2://user:pass@db.example.test:5432/postgres",
        public_base_url="https://api.example.test",
        clerk_issuer_url="https://clerk.example.test",
        clerk_webhook_secret="whsec_test",
        platform_quarantine_encryption_key=Fernet.generate_key().decode(),
        meta_credentials_encryption_key=Fernet.generate_key().decode(),
        whatsapp_provider="qr_linked_device",
        whatsapp_qr_gateway_url="https://qr.example.test",
        whatsapp_qr_gateway_shared_secret="s" * 32,
        clamav_host="clamav",
    )
    assert config.whatsapp_provider == "qr_linked_device"


@pytest.mark.parametrize(
    "entrypoint",
    [
        "broadcast_campaigns.py",
        "departure_automation.py",
        "dossier_alerts.py",
        "followup_recovery.py",
        "knowledge_maintenance.py",
        "tracking_alerts.py",
        "wazzap_smoke_test.py",
        "wazzap_webhooks.py",
    ],
)
def test_cron_entrypoint_sets_runtime_before_application_imports(entrypoint: str):
    source = Path("app/jobs", entrypoint).read_text(encoding="utf-8")
    runtime_position = source.index('os.environ["APP_RUNTIME"] = "cron"')
    application_import_position = source.index("from app.")
    assert runtime_position < application_import_position
