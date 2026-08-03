from sqlalchemy import text

from app.db.database import engine


def list_user_tenants(
    clerk_user_id: str,
):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select
                    m.org_id,
                    m.clerk_org_id,
                    m.role_code,
                    coalesce(o.organization_name, o.name, o.id) as organization_name,
                    coalesce(o.organization_code, o.id) as organization_code,
                    o.organization_type
                from organization_memberships m
                join organizations o
                    on o.id = m.org_id
                where m.clerk_user_id = :clerk_user_id
                  and m.status = 'ACTIVE'
                order by coalesce(o.organization_name, o.name, o.id)
            """),
            {
                "clerk_user_id": clerk_user_id,
            },
        ).fetchall()

        return [dict(row._mapping) for row in rows]


def set_active_tenant(
    clerk_user_id: str,
    org_id: str,
    clerk_org_id: str | None = None,
):
    with engine.connect() as conn:
        conn.execute(
            text("select pg_advisory_xact_lock(hashtextextended(:clerk_user_id, 0))"),
            {"clerk_user_id": clerk_user_id},
        )
        conn.execute(
            text("""
                update tenant_sessions
                set active = false
                where clerk_user_id = :clerk_user_id
            """),
            {
                "clerk_user_id": clerk_user_id,
            },
        )

        row = conn.execute(
            text("""
                insert into tenant_sessions (
                    clerk_user_id,
                    org_id,
                    clerk_org_id,
                    active,
                    last_used_at
                )
                values (
                    :clerk_user_id,
                    :org_id,
                    :clerk_org_id,
                    true,
                    now()
                )
                returning *
            """),
            {
                "clerk_user_id": clerk_user_id,
                "org_id": org_id,
                "clerk_org_id": clerk_org_id,
            },
        ).fetchone()

        conn.commit()

        return dict(row._mapping) if row else None


def get_active_tenant(
    clerk_user_id: str,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select
                    s.*,
                    m.role_code,
                    coalesce(o.organization_name, o.name, o.id) as organization_name,
                    coalesce(o.organization_code, o.id) as organization_code,
                    o.organization_type
                from tenant_sessions s
                join organizations o
                    on o.id = s.org_id
                join organization_memberships m
                    on m.org_id = s.org_id
                   and m.clerk_user_id = s.clerk_user_id
                   and m.status = 'ACTIVE'
                where s.clerk_user_id = :clerk_user_id
                  and s.active = true
                order by s.created_at desc
                limit 1
            """),
            {
                "clerk_user_id": clerk_user_id,
            },
        ).fetchone()

        return dict(row._mapping) if row else None

