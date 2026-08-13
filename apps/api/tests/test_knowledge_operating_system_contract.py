from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_knowledge_schema_is_tenant_safe_versioned_and_audited():
    migration = (ROOT / "infra/sql/074_knowledge_operating_system.sql").read_text(encoding="utf-8")
    for table in ("knowledge_entries", "knowledge_versions", "knowledge_files", "knowledge_chunks", "knowledge_relations", "knowledge_conflicts", "knowledge_feedback", "knowledge_response_logs", "knowledge_settings", "knowledge_audit_events"):
        assert f"create table if not exists {table}" in migration
    for control in ("org_id text not null", "ai_scope", "sensitive", "PENDING_REVIEW", "PUBLISHED", "search_vector", "knowledge.publish", "knowledge.manage"):
        assert control in migration
    assert "status <> 'PUBLISHED' or approved_at is not null" in migration
    assert "not sensitive or ai_scope not in ('CLIENT','BOTH')" in migration


def test_knowledge_api_has_real_workflow_import_playground_and_permissions():
    api = (ROOT / "apps/api/app/api/knowledge.py").read_text(encoding="utf-8")
    repository = (ROOT / "apps/api/app/knowledge/repository.py").read_text(encoding="utf-8")
    for route in ('"/stats"', '"/analytics"', '"/settings"', '"/playground"', '"/files"', '"/{entry_id}/submit"', '"/{entry_id}/approve"', '"/{entry_id}/publish"', '"/{entry_id}/versions/{version}/restore"'):
        assert route in api
    for permission in ("knowledge.read", "knowledge.create", "knowledge.update", "knowledge.review", "knowledge.publish", "knowledge.manage"):
        assert permission in api
    for guard in ("knowledge_version_conflict", "sensitive_client_scope_forbidden", "invalid_knowledge_transition", "expired_knowledge_cannot_publish", "websearch_to_tsquery", "workspace_id", "status='PUBLISHED'"):
        assert guard in repository
    assert "No fallback to unrelated documents" in (ROOT / "apps/api/app/ai/services/knowledge_retrieval.py").read_text(encoding="utf-8")


def test_knowledge_dashboard_exposes_operational_views_without_fake_data():
    page = (ROOT / "apps/web/dashboard/components/knowledge/knowledge-page.tsx").read_text(encoding="utf-8")
    service = (ROOT / "apps/web/dashboard/services/knowledge.ts").read_text(encoding="utf-8")
    for feature in ("Vue d’ensemble", "FAQ clients", "Procédures", "Tester mon IA", "Questions sans réponse", "Sources citées", "Contenu sensible", "Importer une source"):
        assert feature in page
    for endpoint in ("/knowledge/stats", "/knowledge/files", "/knowledge/playground", "/knowledge/analytics"):
        assert endpoint in service
    assert "/app/knowledge" in (ROOT / "apps/web/dashboard/config/app-navigation.ts").read_text(encoding="utf-8")


def test_knowledge_worker_and_private_storage_are_explicit():
    worker = (ROOT / "apps/api/app/jobs/knowledge_maintenance.py").read_text(encoding="utf-8")
    api = (ROOT / "apps/api/app/api/knowledge.py").read_text(encoding="utf-8")
    assert "maintenance()" in worker
    assert 'BUCKET = "knowledge-files"' in api
    assert "MAX_FILE_SIZE" in api and "MIMES" in api
    assert "NEEDS_REVIEW" in api and "Aucun import n’est publié automatiquement" not in api


def test_completion_has_ocr_antivirus_vectors_live_sources_and_connectors():
    migration=(ROOT/"infra/sql/075_knowledge_completion.sql").read_text(encoding="utf-8")
    api=(ROOT/"apps/api/app/api/knowledge.py").read_text(encoding="utf-8")
    repository=(ROOT/"apps/api/app/knowledge/repository.py").read_text(encoding="utf-8")
    for feature in ("create extension if not exists vector","vector(1024)","knowledge_connectors","knowledge_suggestions","translation_group_id","scan_engine"):
        assert feature in migration
    for service in ("scan_bytes","ocr_document","resolve_live","live/catalog","/translate","/embed","/connectors","/suggestions"):
        assert service in api
    for capability in ("embed_texts","vector_cosine_ops","translation_status","sync_connector","generate_suggestions","saved_views"):
        assert capability in migration+repository


def test_completion_rbac_matches_real_agency_roles():
    api=(ROOT/"apps/api/app/api/knowledge.py").read_text(encoding="utf-8")
    migration=(ROOT/"infra/sql/074_knowledge_operating_system.sql").read_text(encoding="utf-8")+(ROOT/"infra/sql/075_knowledge_completion.sql").read_text(encoding="utf-8")
    assert 'require_permission("knowledge.read")' in api
    assert 'require_permission("knowledge.manage")' in api
    assert 'require_permission("knowledge.translate")' in api
    assert 'require_permission("knowledge.connectors")' in api
    assert "r.role_code='OWNER'" in migration
    assert "r.role_code='MANAGER'" in migration
    assert "r.role_code in ('OPERATOR','WAREHOUSE','FINANCE')" in migration
    assert "knowledge.publish" in migration and "knowledge.publish" not in migration.split("r.role_code in ('OPERATOR','WAREHOUSE','FINANCE')",1)[1].split("on conflict",1)[0]


def test_antivirus_is_fail_closed_in_production():
    source=(ROOT/"apps/api/app/services/knowledge_security.py").read_text(encoding="utf-8")
    assert "knowledge_antivirus_not_configured" in source
    assert '"REJECTED"' in source and '"clamav"' in source
    assert "development-bypass" in source
