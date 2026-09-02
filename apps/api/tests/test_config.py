import pytest
from pydantic import ValidationError
from typing import Any, cast

from app.core.config import Settings


settings_factory = cast(Any, Settings)


def test_database_configuration_is_required(monkeypatch) -> None:
    for variable in (
        "DATABASE_URL",
        "SUPABASE_DB_USER",
        "SUPABASE_DB_PASSWORD",
        "SUPABASE_DB_HOST",
        "SUPABASE_DB_NAME",
    ):
        monkeypatch.delenv(variable, raising=False)

    with pytest.raises(ValidationError, match="DATABASE_URL"):
        settings_factory(_env_file=None)


def test_test_environment_accepts_a_database_url() -> None:
    settings = settings_factory(
        _env_file=None,
        app_env="test",
        database_url="postgresql+psycopg2://user:pass@localhost:5432/test",
    )

    assert settings.app_env == "test"
    assert settings.database_url is not None


def test_production_rejects_development_defaults() -> None:
    with pytest.raises(ValidationError, match="Invalid deployed configuration"):
        settings_factory(
            _env_file=None,
            app_env="production",
            database_url="postgresql+psycopg2://user:pass@db:5432/slaivio",
        )


def test_production_accepts_a_complete_secure_contract() -> None:
    settings = settings_factory(
        _env_file=None,
        app_env="production",
        database_url="postgresql+psycopg2://user:pass@db:5432/slaivio",
        clerk_issuer_url="https://clerk.example.com",
        clerk_webhook_secret="whsec_test_secure",
        manager_api_key="m" * 32,
        meta_wa_verify_token="v" * 32,
        public_base_url="https://api.slaivio.example",
        platform_quarantine_encryption_key="MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=",
        meta_app_id="1234567890",
        meta_app_secret="meta-secret",
        meta_embedded_signup_config_id="9876543210",
        meta_credentials_encryption_key="MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=",
        clamav_host="clamav",
    )

    assert settings.is_deployed is True


def test_legacy_meta_configuration_id_remains_compatible() -> None:
    settings = settings_factory(
        _env_file=None,
        app_env="test",
        database_url="postgresql+psycopg2://user:pass@localhost:5432/test",
        **{"META_CONFIGURATION_ID": "legacy-render-config-id"},
    )

    assert settings.meta_embedded_signup_config_id == "legacy-render-config-id"


def test_production_rejects_an_invalid_quarantine_key() -> None:
    with pytest.raises(ValidationError, match="valid Fernet key"):
        settings_factory(
            _env_file=None,
            app_env="production",
            database_url="postgresql+psycopg2://user:pass@db:5432/slaivio",
            clerk_issuer_url="https://clerk.example.com",
            meta_wa_verify_token="v" * 32,
            public_base_url="https://api.slaivio.example",
            platform_quarantine_encryption_key="not-a-fernet-key",
            meta_app_secret="meta-secret",
        )
