import json

from sqlalchemy import text

from app.db.database import engine


def create_operator_message(
    org_id: str,
    user_id: str | None,
    role: str,
    content: str,
    workflow_id: str | None = None,
    metadata: dict | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into ai_operator_messages (
                    org_id, user_id, role, content, workflow_id, metadata
                ) values (
                    :org_id, :user_id, :role, :content, :workflow_id,
                    cast(:metadata as jsonb)
                )
                returning *
            """),
            {
                "org_id": org_id,
                "user_id": user_id,
                "role": role,
                "content": content,
                "workflow_id": workflow_id,
                "metadata": json.dumps(metadata or {}),
            },
        ).fetchone()
        conn.commit()
        return dict(row._mapping)


def list_operator_messages(org_id: str, limit: int = 50):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select * from (
                    select *
                    from ai_operator_messages
                    where org_id = :org_id
                    order by created_at desc
                    limit :limit
                ) recent
                order by created_at asc
            """),
            {"org_id": org_id, "limit": min(max(limit, 1), 100)},
        ).fetchall()
        return [dict(row._mapping) for row in rows]

