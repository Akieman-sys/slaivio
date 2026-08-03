from __future__ import annotations

from sqlalchemy import text

from app.db.database import engine
from app.db.dossier_repository import _audit_dossier, _safe, get_dossier


def list_active_members(org_id: str) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            select clerk_user_id user_id, role_code,
                   coalesce(member_display_name, member_email, clerk_user_id) display_name,
                   member_email email
            from organization_memberships
            where org_id = :org_id and status = 'ACTIVE'
            order by role_code, clerk_user_id
        """), {"org_id": org_id}).fetchall()
    return [_safe(dict(row._mapping)) for row in rows]


def update_collaboration(org_id: str, dossier_id: str, actor_id: str, payload: dict) -> dict | None:
    if not get_dossier(org_id, dossier_id):
        return None
    assigned_to = payload.get("assigned_to") or None
    with engine.begin() as conn:
        if assigned_to and not conn.execute(text("""
            select 1 from organization_memberships
            where org_id = :org_id and clerk_user_id = :user_id and status = 'ACTIVE'
        """), {"org_id": org_id, "user_id": assigned_to}).scalar():
            raise ValueError("invalid_dossier_assignee")
        result = conn.execute(text("""
            update dossiers set
                priority = :priority,
                assigned_to = :assigned_to,
                assigned_at = case when assigned_to is distinct from :assigned_to then now() else assigned_at end,
                assigned_by = case when assigned_to is distinct from :assigned_to then :actor_id else assigned_by end,
                due_at = :due_at,
                updated_at = now(), row_version = row_version + 1
            where org_id = :org_id and id = :dossier_id
              and archived_at is null and row_version = :row_version
        """), {**payload, "assigned_to": assigned_to, "actor_id": actor_id,
                 "org_id": org_id, "dossier_id": dossier_id})
        if not result.rowcount:
            raise ValueError("stale_dossier_version")
        _audit_dossier(conn, org_id, dossier_id, actor_id, "dossier.collaboration_updated")
    return get_dossier(org_id, dossier_id)


def list_notes(org_id: str, dossier_id: str) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            select id::text, body, author_id, edited_at, row_version, created_at, updated_at
            from dossier_internal_notes
            where org_id = :org_id and dossier_id = :dossier_id and deleted_at is null
            order by created_at desc
        """), {"org_id": org_id, "dossier_id": dossier_id}).fetchall()
    return [_safe(dict(row._mapping)) for row in rows]


def create_note(org_id: str, dossier_id: str, author_id: str, body: str) -> dict | None:
    if not get_dossier(org_id, dossier_id):
        return None
    with engine.begin() as conn:
        row = conn.execute(text("""
            insert into dossier_internal_notes(org_id, dossier_id, body, author_id)
            values (:org_id, :dossier_id, :body, :author_id)
            returning id::text, body, author_id, edited_at, row_version, created_at, updated_at
        """), {"org_id": org_id, "dossier_id": dossier_id,
                 "body": body.strip(), "author_id": author_id}).fetchone()
        _audit_dossier(conn, org_id, dossier_id, author_id, "dossier.note_created")
    return _safe(dict(row._mapping))


def update_note(org_id: str, dossier_id: str, note_id: str, author_id: str, body: str, row_version: int) -> dict | None:
    with engine.begin() as conn:
        row = conn.execute(text("""
            update dossier_internal_notes set body = :body, edited_at = now(), updated_at = now(),
                row_version = row_version + 1
            where id = :note_id and org_id = :org_id and dossier_id = :dossier_id
              and author_id = :author_id and deleted_at is null and row_version = :row_version
              and exists (select 1 from dossiers d where d.id = :dossier_id and d.org_id = :org_id and d.archived_at is null)
            returning id::text, body, author_id, edited_at, row_version, created_at, updated_at
        """), {"note_id": note_id, "org_id": org_id, "dossier_id": dossier_id,
                 "author_id": author_id, "body": body.strip(), "row_version": row_version}).fetchone()
        if row:
            _audit_dossier(conn, org_id, dossier_id, author_id, "dossier.note_updated")
    return _safe(dict(row._mapping)) if row else None


def delete_note(org_id: str, dossier_id: str, note_id: str, author_id: str, row_version: int) -> bool:
    with engine.begin() as conn:
        result = conn.execute(text("""
            update dossier_internal_notes set deleted_at = now(), updated_at = now(),
                row_version = row_version + 1
            where id = :note_id and org_id = :org_id and dossier_id = :dossier_id
              and author_id = :author_id and deleted_at is null and row_version = :row_version
              and exists (select 1 from dossiers d where d.id = :dossier_id and d.org_id = :org_id and d.archived_at is null)
        """), {"note_id": note_id, "org_id": org_id, "dossier_id": dossier_id,
                 "author_id": author_id, "row_version": row_version})
        if result.rowcount:
            _audit_dossier(conn, org_id, dossier_id, author_id, "dossier.note_deleted")
    return bool(result.rowcount)
