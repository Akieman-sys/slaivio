-- =====================================================
-- DOSSIERS RBAC
-- Grants least-privilege dossier access to existing standard roles.
-- Future organizations receive the same matrix during provisioning.
-- Safe to run more than once.
-- =====================================================

insert into permissions (permission_code, description)
values
    ('dossiers.read', 'Lire les dossiers'),
    ('dossiers.create', 'Creer des dossiers'),
    ('dossiers.update', 'Modifier des dossiers'),
    ('dossiers.export', 'Exporter des dossiers')
on conflict (permission_code) do update
set description = excluded.description;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from organization_roles r
join permissions p on
    (r.role_code in ('OWNER', 'MANAGER') and p.permission_code in (
        'dossiers.read', 'dossiers.create', 'dossiers.update', 'dossiers.export'
    ))
    or (r.role_code = 'OPERATOR' and p.permission_code in (
        'dossiers.read', 'dossiers.create', 'dossiers.update'
    ))
    or (r.role_code = 'SUPPORT' and p.permission_code in (
        'dossiers.read', 'dossiers.export'
    ))
    or (r.role_code in ('WAREHOUSE', 'FINANCE') and p.permission_code = 'dossiers.read')
on conflict do nothing;
