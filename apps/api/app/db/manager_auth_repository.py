from sqlalchemy import text
from sqlalchemy.exc import DataError

from app.db.database import engine


def get_manager_by_id(manager_id: str):
    with engine.connect() as conn:
        try:
            row = conn.execute(
                text("""
                    select *
                    from manager_users
                    where id = :manager_id
                    limit 1
                """),
                {
                    "manager_id": manager_id,
                },
            ).fetchone()
        except DataError:
            conn.rollback()
            return None

        if not row:
            return None

        manager = dict(row._mapping)
        manager.setdefault("user_id", manager.get("id"))
        manager.setdefault("org_code", manager.get("org_id"))
        manager.setdefault("tenant_org_id", manager.get("org_id"))

        return manager
