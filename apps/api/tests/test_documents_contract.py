from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def test_documents_are_private_versioned_reviewed_and_tenant_safe():
 m=(ROOT/'infra/sql/053_documents_compliance.sql').read_text();a=(ROOT/'apps/api/app/api/documents.py').read_text();r=(ROOT/'apps/api/app/documents/repository.py').read_text()
 for p in('documents.read','documents.upload','documents.review','documents.manage','documents.export'):assert p in m
 assert "BUCKET='compliance-documents'"in a and'checksum_sha256'in a and'create_document_download_url'in a
 assert'SUPERSEDED'in r and"org_id=:o"in r and'rejection_reason_required'in a
