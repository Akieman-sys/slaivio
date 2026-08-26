from pathlib import Path

import pytest
from fastapi import HTTPException

from app.ai.services.pilot_inbox_ai_service import _classify, _grounding_check
from app.api import ai_drafts


ROOT = Path(__file__).parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_migration_defines_three_explicit_modes_and_tenant_audit():
    sql = read("infra/sql/097_pilot_inbox_ai.sql")
    for mode in ("SUGGESTION_ONLY", "CONTROLLED_AUTO", "PAUSED"):
        assert mode in sql
    assert "pilot_inbox_ai_runs" in sql
    assert "unique(org_id, event_key)" in sql
    assert "foreign key (org_id, client_id) references clients(org_id, id)" in sql
    assert "foreign key (org_id, dossier_id) references dossiers(org_id, id)" in sql
    assert "inbox.ai.use" in sql
    assert "inbox.ai.manage" in sql


def test_sensitive_and_business_actions_can_never_be_classified_safe():
    assert _classify("Je conteste ce paiement et je veux un remboursement")["risk"] == "SENSITIVE"
    assert _classify("Pouvez-vous modifier mon dossier ?")["risk"] == "REVIEW"
    assert _classify("Bonjour")["risk"] == "SAFE"


def test_automatic_reply_rejects_unsupported_numbers_and_promises():
    knowledge = [{"content": "Le délai annoncé est de 8 à 12 jours.", "updated_at": None}]
    assert _grounding_check("Le délai est de 8 à 12 jours.", knowledge)[0] is True
    assert _grounding_check("Le délai est de 5 jours.", knowledge) == (False, "information_chiffree_non_sourcee")
    assert _grounding_check("La livraison est garantie.", knowledge) == (False, "promesse_non_autorisee")


def test_pilot_ai_uses_only_published_client_knowledge_and_provider_abstraction():
    service = read("apps/api/app/ai/services/pilot_inbox_ai_service.py")
    knowledge = read("apps/api/app/knowledge/repository.py")
    assert 'search_knowledge(org_id, message, "WHATSAPP"' in service
    assert "get_provider(settings[\"provider\"])" in service
    assert "e.status='PUBLISHED'" in knowledge
    assert "e.sensitive=false" in knowledge
    assert "PUBLIC" in knowledge
    assert "eligible_for_auto" in service
    assert "pilot-ai:{org_id}:{event_key}" in service


def test_settings_endpoint_uses_active_tenant_and_validated_mode(monkeypatch):
    captured = {}

    def fake_update(org_id, mode, actor_id):
        captured.update(org_id=org_id, mode=mode, actor_id=actor_id)
        return {"pilot_response_mode": mode}

    monkeypatch.setattr(ai_drafts, "update_pilot_ai_settings", fake_update)
    result = ai_drafts.change_pilot_ai_settings(
        ai_drafts.UpdatePilotAIMode(mode="CONTROLLED_AUTO"),
        tenant={"org_id": "agency-a", "user_id": "owner-a"},
    )
    assert captured == {"org_id": "agency-a", "mode": "CONTROLLED_AUTO", "actor_id": "owner-a"}
    assert result["settings"]["pilot_response_mode"] == "CONTROLLED_AUTO"


def test_paused_mode_is_returned_as_a_clear_conflict(monkeypatch):
    monkeypatch.setattr(
        ai_drafts,
        "prepare_pilot_suggestion",
        lambda **_: {"status": "skipped", "reason": "ai_paused"},
    )
    with pytest.raises(HTTPException) as error:
        ai_drafts.create_draft(
            "+243900000001",
            ai_drafts.GenerateDraftRequest(),
            tenant={"org_id": "agency-a", "user_id": "owner-a"},
        )
    assert error.value.status_code == 409
    assert error.value.detail == "ai_paused"


def test_inbox_exposes_human_labels_and_controlled_ai_actions():
    page = read("apps/web/dashboard/components/inbox/pilot-inbox-page.tsx")
    service = read("apps/web/dashboard/services/inbox.ts")
    for label in ("Suggestion uniquement", "Automatique contrôlé", "IA en pause", "Suggérer une réponse", "Résumé pour le responsable"):
        assert label in page
    assert "generateInboxAISuggestion" in service
    assert "summarizeInboxConversation" in service
    assert "updateInboxAIMode" in service
    assert "MISTRAL" not in page
    assert "UUID" not in page


def test_legacy_cargo_mutations_stop_before_pilot_ai_policy():
    webhook = read("apps/api/app/api/webhook.py")
    meta = read("apps/api/app/api/meta_webhook.py")
    stop = webhook.index("# Pilot V1 stops here")
    legacy = webhook.index("understanding = understand_message")
    assert stop < legacy
    assert 'f"whatsapp:{normalized_message.dedupe_key}"' in meta
    assert "background_tasks.add_task" in meta
