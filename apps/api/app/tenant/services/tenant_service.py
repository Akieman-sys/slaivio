from app.tenant.repositories.tenant_repository import (
    get_active_tenant,
    list_user_tenants,
    set_active_tenant,
)
from app.organizations.services.membership_role_service import sync_membership_with_role
from app.organizations.services.provisioning_service import provision_organization
from uuid import uuid4


def get_tenant_context(
    clerk_user_id: str,
):
    active = get_active_tenant(clerk_user_id)
    tenants = list_user_tenants(clerk_user_id)

    if not active and tenants:
        first = tenants[0]
        active = set_active_tenant(
            clerk_user_id=clerk_user_id,
            org_id=str(first["org_id"]),
            clerk_org_id=first.get("clerk_org_id"),
        )
        active = get_active_tenant(clerk_user_id) or active

    return {
        "active_tenant": active,
        "tenants": tenants,
    }


def ensure_personal_tenant(manager: dict):
    user_id = str(manager.get("user_id") or manager.get("id") or "")
    if not user_id:
        raise ValueError("authenticated_user_id_required")
    existing = get_tenant_context(user_id)
    if existing.get("active_tenant"):
        return existing

    email = manager.get("email")
    display_name = (
        manager.get("full_name") or manager.get("name") or email or "Nouvelle agence"
    )
    clerk_org_id = f"personal_{user_id}"
    org = provision_organization(
        clerk_org_id=clerk_org_id,
        organization_name=f"Espace de {display_name}",
    )
    if not org:
        raise RuntimeError("personal_organization_provisioning_failed")
    sync_membership_with_role(
        clerk_membership_id=f"personal_membership_{user_id}",
        clerk_user_id=user_id,
        clerk_org_id=clerk_org_id,
        org_id=str(org["id"]),
        user_email=email,
        user_display_name=display_name,
        default_role_code="OWNER",
    )
    return get_tenant_context(user_id)


def switch_tenant(
    clerk_user_id: str,
    org_id: str,
):
    tenants = list_user_tenants(clerk_user_id)
    selected = next(
        (
            tenant
            for tenant in tenants
            if str(tenant["org_id"]) == str(org_id)
        ),
        None,
    )

    if not selected:
        raise PermissionError("User does not belong to this organization")

    return set_active_tenant(
        clerk_user_id=clerk_user_id,
        org_id=org_id,
        clerk_org_id=selected.get("clerk_org_id"),
    )


def create_tenant(manager: dict, organization_name: str):
    """Create an additional organization owned by the authenticated user."""
    user_id = str(manager.get("user_id") or manager.get("id") or "")
    if not user_id:
        raise ValueError("authenticated_user_id_required")

    name = organization_name.strip()
    if len(name) < 2:
        raise ValueError("organization_name_required")

    organization_key = f"org_{uuid4().hex}"
    organization = provision_organization(
        clerk_org_id=organization_key,
        organization_name=name,
    )
    if not organization:
        raise RuntimeError("organization_provisioning_failed")

    sync_membership_with_role(
        clerk_membership_id=f"membership_{uuid4().hex}",
        clerk_user_id=user_id,
        clerk_org_id=organization_key,
        org_id=str(organization["id"]),
        user_email=manager.get("email"),
        user_display_name=(manager.get("full_name") or manager.get("name") or manager.get("email")),
        default_role_code="OWNER",
    )
    active = set_active_tenant(
        clerk_user_id=user_id,
        org_id=str(organization["id"]),
        clerk_org_id=organization_key,
    )
    return {
        "organization": organization,
        "active_tenant": get_active_tenant(user_id) or active,
    }

