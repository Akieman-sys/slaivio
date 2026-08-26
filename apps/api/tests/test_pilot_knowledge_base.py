from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pilot_knowledge_schema_preserves_the_live_answer_during_edits():
    sql = read("infra/sql/099_pilot_knowledge_base.sql")
    assert "create table if not exists pilot_knowledge_drafts" in sql
    assert "unique(org_id, knowledge_id)" in sql
    assert "uq_knowledge_entries_pilot_idempotency" in sql
    assert "pilot_client_visible" in sql
    assert "pilot.knowledge.publish" in sql
    assert "revoke all on pilot_knowledge_drafts from public" in sql


def test_pilot_knowledge_api_is_tenant_scoped_permissioned_and_idempotent():
    api = read("apps/api/app/api/knowledge.py")
    repository = read("apps/api/app/knowledge/pilot_repository.py")
    for route in ('"/pilot"', '"/pilot/stats"', '"/pilot/{entry_id}"', '"/pilot/{entry_id}/publish"'):
        assert route in api
    for permission in ("pilot.knowledge.read", "pilot.knowledge.manage", "pilot.knowledge.publish"):
        assert permission in api
    assert "entry.org_id=:org_id" in repository
    assert "on conflict(org_id,pilot_idempotency_key)" in repository
    assert "pilot_knowledge_version_conflict" in repository
    assert "pilot_knowledge_drafts" in repository


def test_whatsapp_ai_can_only_retrieve_current_published_safe_information():
    repository = read("apps/api/app/knowledge/repository.py")
    for guard in (
        "e.org_id=:o",
        "e.status='PUBLISHED'",
        "e.sensitive=false",
        "e.effective_at is null or e.effective_at<=now()",
        "e.expires_at is null or e.expires_at>now()",
        "e.review_due_at is null or e.review_due_at>now()",
    ):
        assert guard in repository


def test_pilot_ui_uses_agency_language_and_hides_technical_governance():
    page = read("apps/web/dashboard/components/knowledge/knowledge-page.tsx")
    route = read("apps/web/dashboard/app/app/knowledge/page.tsx")
    for label in (
        "Question ou sujet",
        "Information officielle",
        "Communicable aux clients",
        "Interne uniquement",
        "Date de prochaine vérification",
        "Modification en brouillon",
    ):
        assert label in page
    for hidden_term in ("AI_SCOPE", "CUSTOMS", "prompt injection", "Recherche vectorielle"):
        assert hidden_term not in page
    assert 'permission="pilot.knowledge.read"' in route


def test_publishing_maps_the_human_choice_to_the_existing_knowledge_engine():
    repository = read("apps/api/app/knowledge/pilot_repository.py")
    assert '["PUBLIC", "EMPLOYEES"] if visible else ["EMPLOYEES"]' in repository
    assert '"BOTH" if visible else "INTERNAL"' in repository
    assert "status='PUBLISHED'" in repository
    assert "delete from pilot_knowledge_drafts" in repository
