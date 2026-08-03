-- Backfill shipment permissions for every existing organization role.
-- Safe to run more than once.

insert into permissions (permission_code, description)
values
    ('shipments.read', 'Lire les expéditions'),
    ('shipments.create', 'Créer des expéditions'),
    ('shipments.update', 'Modifier des expéditions'),
    ('shipments.confirm_arrival', 'Confirmer l arrivée des expéditions')
on conflict (permission_code) do update set description = excluded.description;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from organization_roles r
join permissions p on
    (r.role_code in ('OWNER', 'MANAGER') and p.permission_code in (
        'shipments.read', 'shipments.create', 'shipments.update', 'shipments.confirm_arrival'
    ))
    or (r.role_code = 'OPERATOR' and p.permission_code in (
        'shipments.read', 'shipments.create', 'shipments.update'
    ))
    or (r.role_code = 'WAREHOUSE' and p.permission_code in (
        'shipments.read', 'shipments.update', 'shipments.confirm_arrival'
    ))
    or (r.role_code in ('SUPPORT', 'FINANCE') and p.permission_code = 'shipments.read')
on conflict do nothing;
