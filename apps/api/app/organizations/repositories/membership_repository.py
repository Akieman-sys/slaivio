from sqlalchemy import text

from app.db.database import engine


def upsert_membership(
    clerk_membership_id: str,
    clerk_user_id: str,
    clerk_org_id: str,
    org_id: str,
    role_code: str,
    member_email: str | None = None,
    member_display_name: str | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into organization_memberships (
                    clerk_membership_id,
                    clerk_user_id,
                    clerk_org_id,
                    org_id,
                    role_code,
                    member_email,
                    member_display_name
                )
                values (
                    :clerk_membership_id,
                    :clerk_user_id,
                    :clerk_org_id,
                    :org_id,
                    :role_code,
                    :member_email,
                    :member_display_name
                )
                on conflict (clerk_user_id, clerk_org_id)
                do update set
                    role_code = excluded.role_code,
                    member_email = coalesce(excluded.member_email, organization_memberships.member_email),
                    member_display_name = coalesce(excluded.member_display_name, organization_memberships.member_display_name),
                    status = 'ACTIVE',
                    updated_at = now()
                returning *
            """),
            {
                "clerk_membership_id": clerk_membership_id,
                "clerk_user_id": clerk_user_id,
                "clerk_org_id": clerk_org_id,
                "org_id": org_id,
                "role_code": role_code,
                "member_email": member_email,
                "member_display_name": member_display_name,
            },
        ).fetchone()

        conn.commit()

        return dict(row._mapping) if row else None

