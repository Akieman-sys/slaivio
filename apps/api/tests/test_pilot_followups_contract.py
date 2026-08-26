from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def source(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pilot_followup_schema_freezes_and_deduplicates_the_audience():
    sql = source("infra/sql/098_pilot_followups.sql")
    for token in (
        "pilot_followup_batches",
        "pilot_followup_recipients",
        "unique(batch_id, normalized_phone)",
        "selected_client_ids",
        "selected_dossier_ids",
        "excluded_client_ids",
        "pilot.followups.send",
        "revoke all",
    ):
        assert token in sql


def test_pilot_followup_api_requires_preview_confirmation_and_permissions():
    api = source("apps/api/app/api/followups.py")
    repository = source("apps/api/app/db/pilot_followup_repository.py")
    for endpoint in ("/pilot/preview", "/pilot/drafts", "/pilot/{batch_id}/confirm", "/pilot/{batch_id}/send"):
        assert endpoint in api
    for permission in ("pilot.followups.read", "pilot.followups.manage", "pilot.followups.send"):
        assert permission in api
    assert "status='DRAFT' and row_version=:version" in repository
    assert "no_reachable_recipient" in repository
    assert "pilot:{batch_id}:{recipient['normalized_phone']}" in repository


def test_pilot_followup_ui_uses_business_choices_and_no_technical_ids():
    ui = source("apps/web/dashboard/components/followups/followups-page.tsx")
    for label in (
        "Qui souhaitez-vous contacter ?",
        "Confirmer les destinataires",
        "Enregistrer en brouillon",
        "Envoyer sur WhatsApp",
        "Exclure",
    ):
        assert label in ui
    assert "ID client" not in ui
    assert "Règles et séquences" not in ui


def test_whatsapp_reply_updates_the_pilot_recipient():
    repository = source("apps/api/app/db/followup_repository.py")
    assert "pilot_recipient_id" in repository
    assert "update pilot_followup_recipients" in repository
    assert "status='RESPONDED'" in repository
