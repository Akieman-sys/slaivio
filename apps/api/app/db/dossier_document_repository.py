from sqlalchemy import text

from app.db.database import engine


def list_documents(org_id: str, dossier_id: str) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            select id::text, dossier_id::text, document_type, file_name, mime_type,
                   size_bytes, checksum_sha256, verification_status, notes,
                   uploaded_by, created_at
            from dossier_documents
            where org_id = :org_id and dossier_id = :dossier_id and deleted_at is null
            order by created_at desc
        """), {"org_id": org_id, "dossier_id": dossier_id}).fetchall()
    return [dict(row._mapping) for row in rows]


def create_document(org_id: str, dossier_id: str, user_id: str, payload: dict) -> dict:
    with engine.begin() as conn:
        row = conn.execute(text("""
            insert into dossier_documents (
                org_id, dossier_id, document_type, file_name, object_path, mime_type,
                size_bytes, checksum_sha256, notes, uploaded_by
            ) values (
                :org_id, :dossier_id, :document_type, :file_name, :object_path, :mime_type,
                :size_bytes, :checksum_sha256, :notes, :uploaded_by
            ) returning id::text
        """), dict(payload, org_id=org_id, dossier_id=dossier_id, uploaded_by=user_id)).scalar_one()
        conn.execute(text("""
            insert into dossier_events (org_id, dossier_id, event_type, payload)
            values (:org_id, :dossier_id, 'DOCUMENT_UPLOADED', jsonb_build_object('document_id', :document_id, 'user_id', :user_id))
        """), {"org_id": org_id, "dossier_id": dossier_id, "document_id": row, "user_id": user_id})
    return get_document(org_id, row) or {}


def get_document(org_id: str, document_id: str) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(text("""
            select id::text, dossier_id::text, document_type, file_name, object_path,
                   mime_type, size_bytes, checksum_sha256, verification_status, notes,
                   uploaded_by, created_at
            from dossier_documents where org_id = :org_id and id = :document_id and deleted_at is null
        """), {"org_id": org_id, "document_id": document_id}).fetchone()
    return dict(row._mapping) if row else None


def list_checklist(org_id: str, dossier_id: str) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            select id::text, code, label, required, status, completed_at, completed_by, row_version
            from dossier_checklist_items where org_id = :org_id and dossier_id = :dossier_id
            order by sort_order, created_at
        """), {"org_id": org_id, "dossier_id": dossier_id}).fetchall()
    return [dict(row._mapping) for row in rows]


def update_checklist_item(org_id: str, dossier_id: str, item_id: str, user_id: str, status: str, row_version: int) -> dict | None:
    with engine.begin() as conn:
        row = conn.execute(text("""
            update dossier_checklist_items set status = :status,
                completed_at = case when :status = 'COMPLETED' then now() else null end,
                completed_by = case when :status = 'COMPLETED' then :user_id else null end,
                row_version = row_version + 1, updated_at = now()
            where org_id = :org_id and dossier_id = :dossier_id and id = :item_id
              and row_version = :row_version returning *
        """), {"org_id": org_id, "dossier_id": dossier_id, "item_id": item_id,
                 "user_id": user_id, "status": status, "row_version": row_version}).fetchone()
    return dict(row._mapping) if row else None
