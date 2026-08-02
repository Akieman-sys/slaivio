from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


Environment = Literal["development", "test", "staging", "production"]
WhatsAppProvider = Literal["meta", "twilio", "infobip"]


class Settings(BaseSettings):
    app_env: Environment = "development"
    public_base_url: str | None = None
    platform_quarantine_encryption_key: str | None = None

    database_url: str | None = None
    database_sslmode: str = "require"
    supabase_db_user: str | None = None
    supabase_db_password: str | None = None
    supabase_db_host: str | None = None
    supabase_db_port: int = 5432
    supabase_db_name: str | None = None

    clerk_issuer_url: str | None = None
    clerk_jwks_url: str | None = None

    mistral_api_key: str | None = None
    voice_transcription_provider: str = "mistral"

    manager_api_key: str = "change-me-dev-key"

    meta_wa_access_token: str | None = None
    meta_wa_verify_token: str = "slaivo_verify_token_secret"
    meta_wa_api_version: str = "v22.0"
    meta_app_id: str | None = None
    meta_app_secret: str | None = None
    meta_redirect_uri: str | None = None
    meta_oauth_frontend_redirect_uri: str | None = None

    whatsapp_provider: WhatsAppProvider = "meta"
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_whatsapp_from: str | None = None
    twilio_validate_signature: bool = False
    twilio_status_callback_path: str = "/webhook/twilio/status"
    twilio_messaging_service_sid: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def is_deployed(self) -> bool:
        return self.app_env in {"staging", "production"}

    @model_validator(mode="after")
    def validate_runtime_contract(self) -> Self:
        if not self.database_url:
            missing_database_fields = [
                name
                for name in (
                    "supabase_db_user",
                    "supabase_db_password",
                    "supabase_db_host",
                    "supabase_db_name",
                )
                if not getattr(self, name)
            ]
            if missing_database_fields:
                fields = ", ".join(missing_database_fields)
                raise ValueError(
                    "DATABASE_URL or all Supabase database fields are required; "
                    f"missing: {fields}"
                )

        if not self.is_deployed:
            return self

        errors: list[str] = []
        if not self.platform_quarantine_encryption_key:
            errors.append("PLATFORM_QUARANTINE_ENCRYPTION_KEY is required")
        if self.manager_api_key == "change-me-dev-key" or len(self.manager_api_key) < 32:
            errors.append("MANAGER_API_KEY must be a generated secret of at least 32 characters")
        if self.meta_wa_verify_token == "slaivo_verify_token_secret" or len(
            self.meta_wa_verify_token
        ) < 24:
            errors.append("META_WA_VERIFY_TOKEN must be a generated secret")
        if not (self.clerk_issuer_url or self.clerk_jwks_url):
            errors.append("CLERK_ISSUER_URL or CLERK_JWKS_URL is required")
        if not self.public_base_url or not self.public_base_url.startswith("https://"):
            errors.append("PUBLIC_BASE_URL must be an HTTPS URL")
        if self.whatsapp_provider == "meta" and not self.meta_app_secret:
            errors.append("META_APP_SECRET is required when Meta is active")
        if self.whatsapp_provider == "twilio" and not self.twilio_validate_signature:
            errors.append("TWILIO_VALIDATE_SIGNATURE must be true when Twilio is active")

        if errors:
            raise ValueError("Invalid deployed configuration: " + "; ".join(errors))

        return self


settings = Settings()
