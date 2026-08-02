from pathlib import Path

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
