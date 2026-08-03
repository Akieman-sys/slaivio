from sqlalchemy import text

from app.db.database import engine
from app.organizations.repositories.invitation_repository import mark_invitation_accepted
from app.organizations.repositories.membership_repository import upsert_membership
from app.permissions.repositories.permission_repository import assign_role_to_user


def get_role_by_code(
    org_id: str,
    role_code: str,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select *
                from organization_roles
                where org_id = :org_id
                  and role_code = :role_code
                limit 1
            """),
            {
                "org_id": org_id,
                "role_code": role_code,
            },
        ).fetchone()

        return dict(row._mapping) if row else None


def sync_membership_with_role(
    clerk_membership_id: str,
    clerk_user_id: str,
    clerk_org_id: str,
    org_id: str,
    user_email: str | None = None,
    user_display_name: str | None = None,
    default_role_code: str = "SUPPORT",
):
    invitation = None

    if user_email:
        invitation = mark_invitation_accepted(
            email=user_email,
        )

    role_code = invitation["role_code"] if invitation else default_role_code

    membership = upsert_membership(
        clerk_membership_id=clerk_membership_id,
        clerk_user_id=clerk_user_id,
        clerk_org_id=clerk_org_id,
        org_id=org_id,
        role_code=role_code,
        member_email=user_email,
        member_display_name=user_display_name,
    )

    role = get_role_by_code(
        org_id=org_id,
        role_code=role_code,
    )

    assignment = None

    if role:
        assignment = assign_role_to_user(
            user_id=clerk_user_id,
            org_id=org_id,
            role_id=str(role["id"]),
        )

    return {
        "membership": membership,
        "role_code": role_code,
        "role": role,
        "assignment": assignment,
    }

