from pathlib import Path

from app.api.organization_admin import NumberingSave


ROOT = Path(__file__).resolve().parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_agency_identifier_is_free_form_but_keeps_one_sequence():
    value = NumberingSave(prefix_format="OTIE/CLIENT/{YYYY}/{000001}", expected_version=1)
    assert value.prefix_format == "OTIE/CLIENT/{YYYY}/{000001}"


def test_agency_identifier_rejects_unknown_or_missing_placeholders():
    for invalid in ("OTIE-{CLIENT}", "OTIE-{YYYY}", "OTIE-{000001}-{SEQUENCE}"):
        try:
            NumberingSave(prefix_format=invalid, expected_version=1)
        except ValueError:
            continue
        raise AssertionError(f"invalid format accepted: {invalid}")


def test_dossier_numbering_is_applied_at_database_boundary():
    migration = read("infra/sql/103_pilot_identifiers_and_meta_onboarding.sql")
    repository = read("apps/api/app/db/dossier_repository.py")
    assert "create trigger trg_dossiers_assign_reference" in migration
    assert "next_organization_reference" in migration
    assert '"dossier_reference": None' in repository
    assert "uuid4" not in repository


def test_meta_embedded_signup_is_available_without_exposing_tokens_in_ui():
    backend = read("apps/api/app/api/meta_embedded_signup.py")
    frontend = read("apps/web/dashboard/services/meta-embedded-signup.ts")
    settings = read("apps/web/dashboard/components/settings/pilot-settings-page.tsx")
    assert '"/meta/embedded-signup/config"' in backend
    assert 'Depends(require_permission("pilot.settings.manage"))' in backend
    assert "meta_embedded_signup_config_id" in backend
    assert "WA_EMBEDDED_SIGNUP" in frontend
    assert "override_default_response_type" in frontend
    assert "Connecter WhatsApp" in settings
    assert "access_token" not in frontend


def test_meta_onboarding_subscribes_webhooks_and_returns_sanitized_connections():
    backend = read("apps/api/app/api/meta_embedded_signup.py")
    migration = read("infra/sql/103_pilot_identifiers_and_meta_onboarding.sql")
    assert "subscribe_app_to_waba_webhooks" in backend
    assert "_public_connection" in backend
    assert '"access_token"' in backend
    assert "pilot_meta_onboarding_events" in migration
    assert "STARTED','CONNECTED','FAILED" in migration


def test_connected_agency_token_is_used_for_inbound_media_and_voice_notes():
    media = read("apps/api/app/services/meta_media_service.py")
    voice = read("apps/api/app/services/voice_note_service.py")
    assert "find_number_by_phone_number_id" in media
    assert "get_default_number_for_org" in media
    assert "_access_token(phone_number_id=phone_number_id)" in media
    assert "download_meta_media_bytes(media_url, org_id=org_id)" in media
    assert "org_id=org_id" in voice


def test_meta_tokens_are_encrypted_at_rest_and_removed_from_public_responses():
    migration = read("infra/sql/103_pilot_identifiers_and_meta_onboarding.sql")
    credentials = read("apps/api/app/services/meta_credentials.py")
    accounts = read("apps/api/app/db/whatsapp_account_repository.py")
    numbers = read("apps/api/app/db/whatsapp_number_repository.py")
    backend = read("apps/api/app/api/meta_embedded_signup.py")
    assert migration.count("access_token_encrypted") >= 2
    assert "Fernet" in credentials
    assert "token_for_storage" in accounts and "token_for_storage" in numbers
    assert "reveal_access_token" in accounts and "reveal_access_token" in numbers
    assert '"access_token_encrypted"' in backend
