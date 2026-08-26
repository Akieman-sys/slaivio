from app.organizations.repositories.organization_repository import upsert_organization
from sqlalchemy import text

from app.db.database import engine


DEFAULT_ORGANIZATION_ROLES = (
    ("OWNER", "Owner", "Accès total"),
    ("MANAGER", "Manager", "Gestion opérationnelle"),
    ("OPERATOR", "Operator", "Opérations dossiers et expéditions"),
    ("WAREHOUSE", "Warehouse", "Opérations entrepôt"),
    ("SUPPORT", "Support", "Support client"),
    ("FINANCE", "Finance", "Finance et comptabilité"),
)

CLIENT_ROLE_PERMISSIONS = {
    "OWNER": ("clients.read", "clients.create", "clients.update", "clients.archive", "clients.import", "clients.export", "clients.merge"),
    "MANAGER": ("clients.read", "clients.create", "clients.update", "clients.archive", "clients.import", "clients.export", "clients.merge"),
    "OPERATOR": ("clients.read", "clients.create", "clients.update"),
    "SUPPORT": ("clients.read", "clients.create", "clients.update", "clients.export"),
    "WAREHOUSE": ("clients.read",),
}

DOSSIER_ROLE_PERMISSIONS = {
    "OWNER": ("dossiers.read", "dossiers.create", "dossiers.update", "dossiers.archive", "dossiers.export", "dossiers.clients.read", "dossiers.clients.manage"),
    "MANAGER": ("dossiers.read", "dossiers.create", "dossiers.update", "dossiers.archive", "dossiers.export", "dossiers.clients.read", "dossiers.clients.manage"),
    "OPERATOR": ("dossiers.read", "dossiers.create", "dossiers.update", "dossiers.clients.read", "dossiers.clients.manage"),
    "SUPPORT": ("dossiers.read", "dossiers.export", "dossiers.clients.read"),
    "WAREHOUSE": ("dossiers.read", "dossiers.clients.read"),
    "FINANCE": ("dossiers.read", "dossiers.clients.read"),
}

SHIPMENT_ROLE_PERMISSIONS = {
    "OWNER": ("shipments.read", "shipments.create", "shipments.update", "shipments.confirm_arrival"),
    "MANAGER": ("shipments.read", "shipments.create", "shipments.update", "shipments.confirm_arrival"),
    "OPERATOR": ("shipments.read", "shipments.create", "shipments.update"),
    "SUPPORT": ("shipments.read",),
    "WAREHOUSE": ("shipments.read", "shipments.update", "shipments.confirm_arrival"),
    "FINANCE": ("shipments.read",),
}

TRACKING_ROLE_PERMISSIONS = {
    "OWNER": ("tracking.read", "tracking.update", "tracking.alerts", "tracking.notify", "tracking.export", "tracking.public"),
    "MANAGER": ("tracking.read", "tracking.update", "tracking.alerts", "tracking.notify", "tracking.export", "tracking.public"),
    "OPERATOR": ("tracking.read", "tracking.update", "tracking.alerts", "tracking.notify"),
    "WAREHOUSE": ("tracking.read", "tracking.update", "tracking.alerts", "tracking.notify"),
    "SUPPORT": ("tracking.read", "tracking.export"),
    "FINANCE": ("tracking.read", "tracking.export"),
}

CLIENT_ROLE_PERMISSION_INSERT_SQL = """
    insert into role_permissions (role_id, permission_id)
    select r.id, p.id
    from organization_roles r
    join permissions p on p.permission_code = any(:permission_codes)
    where r.org_id = :org_id
      and r.role_code = :role_code
    on conflict do nothing
"""


def ensure_default_roles(org_id: str):
    with engine.connect() as conn:
        for role_code, role_name, description in DEFAULT_ORGANIZATION_ROLES:
            conn.execute(
                text("""
                    insert into organization_roles (
                        org_id,
                        role_code,
                        role_name,
                        description
                    )
                    values (
                        :org_id,
                        :role_code,
                        :role_name,
                        :description
                    )
                    on conflict (org_id, role_code) do nothing
                """),
                {
                    "org_id": org_id,
                    "role_code": role_code,
                    "role_name": role_name,
                    "description": description,
                },
            )
        conn.commit()


def ensure_client_role_permissions(org_id: str):
    with engine.connect() as conn:
        for role_code, permission_codes in CLIENT_ROLE_PERMISSIONS.items():
            conn.execute(
                text(CLIENT_ROLE_PERMISSION_INSERT_SQL),
                {
                    "org_id": org_id,
                    "role_code": role_code,
                    "permission_codes": list(permission_codes),
                },
            )
        conn.commit()


def ensure_dossier_role_permissions(org_id: str):
    with engine.connect() as conn:
        for role_code, permission_codes in DOSSIER_ROLE_PERMISSIONS.items():
            conn.execute(
                text(CLIENT_ROLE_PERMISSION_INSERT_SQL),
                {
                    "org_id": org_id,
                    "role_code": role_code,
                    "permission_codes": list(permission_codes),
                },
            )
        conn.commit()


def ensure_shipment_role_permissions(org_id: str):
    with engine.connect() as conn:
        for role_code, permission_codes in SHIPMENT_ROLE_PERMISSIONS.items():
            conn.execute(
                text(CLIENT_ROLE_PERMISSION_INSERT_SQL),
                {"org_id": org_id, "role_code": role_code, "permission_codes": list(permission_codes)},
            )
        conn.commit()


def ensure_tracking_role_permissions(org_id: str):
    with engine.connect() as conn:
        for role_code, permission_codes in TRACKING_ROLE_PERMISSIONS.items():
            conn.execute(
                text(CLIENT_ROLE_PERMISSION_INSERT_SQL),
                {"org_id": org_id, "role_code": role_code, "permission_codes": list(permission_codes)},
            )
        conn.commit()


def provision_organization(
    clerk_org_id: str,
    organization_name: str,
):
    org = upsert_organization(
        clerk_org_id=clerk_org_id,
        organization_name=organization_name,
    )
    if org:
        org_id = str(org["id"])
        ensure_default_roles(org_id)
        ensure_client_role_permissions(org_id)
        ensure_dossier_role_permissions(org_id)
        ensure_shipment_role_permissions(org_id)
        ensure_tracking_role_permissions(org_id)
    return org
