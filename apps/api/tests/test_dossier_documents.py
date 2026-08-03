from pathlib import Path

import pytest

from app.core.config import settings
from app.services.dossier_document_storage import _configuration

from app.api.dossiers import ChecklistPatchPayload


def test_checklist_status_contract():
    assert ChecklistPatchPayload(status="COMPLETED", row_version=1).status == "COMPLETED"


def test_private_document_migration_contract():
    migration = Path(__file__).parents[3] / "infra/sql/036_dossier_documents_and_checklist.sql"
    sql = " ".join(migration.read_text(encoding="utf-8").lower().split())
    assert "'dossier-documents', false" in sql
    assert "checksum_sha256" in sql
    assert "seed_dossier_checklist" in sql
    assert "enforce_dossier_child_tenant" in sql
    assert "revoke all on dossier_documents" in sql


def test_document_storage_rejects_database_urls(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "postgresql://db.example.test/postgres")
    monkeypatch.setattr(settings, "supabase_service_role_key", "test-service-key")

    with pytest.raises(RuntimeError, match="document_storage_url_invalid"):
        _configuration()


def test_document_storage_accepts_supabase_http_url(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://project-ref.supabase.co/")
    monkeypatch.setattr(settings, "supabase_service_role_key", "test-service-key")

    base_url, _, bucket = _configuration()
    assert base_url == "https://project-ref.supabase.co"
    assert bucket == "dossier-documents"
