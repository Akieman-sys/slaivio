-- =====================================================
-- REPAIR CLIENT ROLE PERMISSIONS
-- Backfills permissions for standard role codes, including roles created
-- before system_role was introduced or whose flag is not set.
-- Safe to run more than once.
-- =====================================================

insert into permissions (permission_code, description)
values
    ('clients.read', 'Lire les clients de l organisation'),
    ('clients.create', 'Creer des clients'),
    ('clients.update', 'Modifier des clients'),
    ('clients.archive', 'Archiver et restaurer des clients'),
    ('clients.import', 'Importer des clients'),
    ('clients.export', 'Exporter des clients'),
    ('clients.merge', 'Fusionner des fiches clients')
on conflict (permission_code) do update
set description = excluded.description;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from organization_roles r
join permissions p on
    (r.role_code in ('OWNER', 'MANAGER') and p.permission_code in (
        'clients.read', 'clients.create', 'clients.update', 'clients.archive',
        'clients.import', 'clients.export', 'clients.merge'
    ))
    or (r.role_code = 'OPERATOR' and p.permission_code in (
        'clients.read', 'clients.create', 'clients.update'
    ))
    or (r.role_code = 'SUPPORT' and p.permission_code in (
        'clients.read', 'clients.create', 'clients.update', 'clients.export'
    ))
    or (r.role_code = 'WAREHOUSE' and p.permission_code = 'clients.read')
on conflict do nothing;
