from fastapi import APIRouter, HTTPException, Request
from svix.webhooks import Webhook

from app.organizations.repositories.organization_repository import (
    get_organization_by_clerk_org_id,
)
from app.organizations.services.membership_role_service import sync_membership_with_role
from app.organizations.services.provisioning_service import provision_organization
from app.core.config import settings


router = APIRouter()
SECRET = settings.clerk_webhook_secret


@router.post("/webhooks/clerk")
async def clerk_webhook(
    request: Request,
):
    payload = await request.body()

    if not SECRET:
        raise HTTPException(status_code=503, detail="clerk_webhook_not_configured")
    try:
        event = Webhook(SECRET).verify(payload, dict(request.headers))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid signature") from exc

    event_type = event["type"]
    data = event["data"]

    if event_type == "user.created":
        user_id = data["id"]
        email_addresses = data.get("email_addresses") or []
        email = email_addresses[0].get("email_address") if email_addresses else None
        display_name = " ".join(
            part for part in [data.get("first_name"), data.get("last_name")] if part
        ).strip() or email or "Nouvelle agence"
        personal_clerk_org_id = f"personal_{user_id}"
        org = provision_organization(
            clerk_org_id=personal_clerk_org_id,
            organization_name=f"Espace de {display_name}",
        )
        membership = sync_membership_with_role(
            clerk_membership_id=f"personal_membership_{user_id}",
            clerk_user_id=user_id,
            clerk_org_id=personal_clerk_org_id,
            org_id=str(org["id"]),
            user_email=email,
            user_display_name=display_name,
            default_role_code="OWNER",
        )
        return {
            "status": "ok",
            "organization": org,
            "membership": membership,
        }

    if event_type in {"organization.created", "organization.updated"}:
        org = provision_organization(
            clerk_org_id=data["id"],
            organization_name=data["name"],
        )

        return {
            "status": "ok",
            "organization": org,
        }

    if event_type in {
        "organizationMembership.created",
        "organizationMembership.updated",
    }:
        clerk_org_id = data["organization"]["id"]
        org = get_organization_by_clerk_org_id(clerk_org_id)

        if not org:
            return {
                "status": "ignored",
                "reason": "organization_not_found",
            }

        public_user_data = data.get("public_user_data") or {}
        member_name = " ".join(
            part for part in [public_user_data.get("first_name"), public_user_data.get("last_name")] if part
        ).strip() or public_user_data.get("identifier")
        result = sync_membership_with_role(
            clerk_membership_id=data["id"],
            clerk_user_id=public_user_data.get("user_id") or data.get("public_user_id"),
            clerk_org_id=clerk_org_id,
            org_id=str(org["id"]),
            user_email=public_user_data.get("identifier"),
            user_display_name=member_name,
        )

        return {
            "status": "ok",
            "membership": result,
        }

    return {
        "status": "ignored",
        "event_type": event_type,
    }

