from typing import Literal, Self

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from cryptography.fernet import Fernet


Environment = Literal["development", "test", "staging", "production"]
RuntimeRole = Literal["api", "cron", "worker"]
WhatsAppProvider = Literal["meta", "wazzap", "qr_linked_device", "mock"]


class Settings(BaseSettings):
    app_env: Environment = "development"
    app_runtime: RuntimeRole = "api"
    public_base_url: str | None = None
    platform_quarantine_encryption_key: str | None = None
    quarantine_replay_max_attempts: int = Field(default=5, ge=1, le=20)
    quarantine_replay_lease_seconds: int = Field(default=900, ge=60, le=3600)

    database_url: str | None = None
    database_sslmode: str = "require"
    supabase_db_user: str | None = None
    supabase_db_password: str | None = None
    supabase_db_host: str | None = None
    supabase_db_port: int = 5432
    supabase_db_name: str | None = None
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    dossier_documents_bucket: str = "dossier-documents"
    dossier_document_max_bytes: int = Field(default=10_485_760, ge=1_048_576, le=52_428_800)
    clamav_host: str | None = None
    clamav_port: int = 3310
    knowledge_antivirus_required: bool = True
    knowledge_embedding_model: str = "mistral-embed"
    knowledge_ocr_model: str = "mistral-ocr-latest"
    knowledge_connector_encryption_key: str | None = None

    clerk_issuer_url: str | None = None
    clerk_jwks_url: str | None = None
    clerk_webhook_secret: str | None = None

    mistral_api_key: str | None = None
    voice_transcription_provider: str = "mistral"

    manager_api_key: str = "change-me-dev-key"

    whatsapp_provider: WhatsAppProvider = "meta"
    meta_wa_access_token: str | None = None
    meta_wa_verify_token: str = "slaivo_verify_token_secret"
    meta_wa_api_version: str = "v22.0"
    meta_app_id: str | None = None
    meta_app_secret: str | None = None
    meta_embedded_signup_config_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "meta_embedded_signup_config_id",
            "META_EMBEDDED_SIGNUP_CONFIG_ID",
            "META_CONFIGURATION_ID",
        ),
    )
    meta_credentials_encryption_key: str | None = None
    meta_redirect_uri: str | None = None
    meta_oauth_frontend_redirect_uri: str | None = None
    wazzap_api_base_url: str = "https://api21.wazzap.ai/api/wazzap"
    wazzap_api_key: str | None = None
    wazzap_agent_id: str | None = None
    wazzap_organization_id: str | None = None
    wazzap_webhook_secret: str | None = None
    wazzap_webhook_skip_signature_check: bool = False
    wazzap_phone_number: str | None = None
    wazzap_verified_name: str | None = None
    whatsapp_qr_gateway_url: str | None = None
    whatsapp_qr_gateway_shared_secret: str | None = None
    whatsapp_qr_pilot_max_organizations: int = Field(default=10, ge=1, le=100)

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

        # Background jobs deliberately have a smaller attack surface and do not
        # expose Clerk, Meta or public HTTP endpoints. Database validation above
        # remains mandatory for every runtime.
        if self.app_runtime in {"cron", "worker"}:
            return self

        errors: list[str] = []
        if not self.platform_quarantine_encryption_key:
            errors.append("PLATFORM_QUARANTINE_ENCRYPTION_KEY is required")
        else:
            try:
                Fernet(self.platform_quarantine_encryption_key.encode("ascii"))
            except (ValueError, UnicodeEncodeError):
                errors.append("PLATFORM_QUARANTINE_ENCRYPTION_KEY must be a valid Fernet key")
        if not (self.clerk_issuer_url or self.clerk_jwks_url):
            errors.append("CLERK_ISSUER_URL or CLERK_JWKS_URL is required")
        if not self.clerk_webhook_secret:
            errors.append("CLERK_WEBHOOK_SECRET is required")
        if not self.public_base_url or not self.public_base_url.startswith("https://"):
            errors.append("PUBLIC_BASE_URL must be an HTTPS URL")
        if self.whatsapp_provider == "meta":
            if self.meta_wa_verify_token == "slaivo_verify_token_secret" or len(
                self.meta_wa_verify_token
            ) < 24:
                errors.append("META_WA_VERIFY_TOKEN must be a generated secret")
            if not self.meta_app_secret:
                errors.append("META_APP_SECRET is required")
            if not self.meta_app_id:
                errors.append("META_APP_ID is required")
            if not self.meta_embedded_signup_config_id:
                errors.append("META_EMBEDDED_SIGNUP_CONFIG_ID is required")
        elif self.whatsapp_provider == "wazzap":
            if not self.wazzap_api_key:
                errors.append("WAZZAP_API_KEY is required")
            if not self.wazzap_agent_id:
                errors.append("WAZZAP_AGENT_ID is required")
            if not self.wazzap_webhook_secret:
                errors.append("WAZZAP_WEBHOOK_SECRET is required")
            if not self.wazzap_phone_number:
                errors.append("WAZZAP_PHONE_NUMBER is required")
        elif self.whatsapp_provider == "qr_linked_device":
            if not self.whatsapp_qr_gateway_url:
                errors.append("WHATSAPP_QR_GATEWAY_URL is required")
            if not self.whatsapp_qr_gateway_shared_secret or len(
                self.whatsapp_qr_gateway_shared_secret
            ) < 32:
                errors.append("WHATSAPP_QR_GATEWAY_SHARED_SECRET must contain at least 32 characters")
        else:
            errors.append("WHATSAPP_PROVIDER=mock is forbidden in deployed environments")
        if not self.meta_credentials_encryption_key:
            errors.append("META_CREDENTIALS_ENCRYPTION_KEY is required")
        else:
            try:
                Fernet(self.meta_credentials_encryption_key.encode("ascii"))
            except (ValueError, UnicodeEncodeError):
                errors.append("META_CREDENTIALS_ENCRYPTION_KEY must be a valid Fernet key")

        if errors:
            raise ValueError("Invalid deployed configuration: " + "; ".join(errors))

        return self


settings = Settings()
