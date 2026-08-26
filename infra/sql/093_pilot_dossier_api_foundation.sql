-- SLAIVIO Pilot V1 - API persistence and idempotency foundation.
-- Safe to run after 092_pilot_dossier_clients_foundation.sql.

alter table dossiers
  add column if not exists idempotency_key text,
  add column if not exists created_by text,
  add column if not exists updated_by text;

create unique index if not exists uq_dossiers_idempotency
  on dossiers(org_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_dossiers_pilot_recent
  on dossiers(org_id, updated_at desc)
  where archived_at is null;

insert into permissions(permission_code, description)
values
  ('dossiers.clients.read', 'Consulter les clients rattachés aux dossiers'),
  ('dossiers.clients.manage', 'Ajouter, mettre à jour, déplacer et retirer les clients des dossiers')
on conflict(permission_code) do update
set description = excluded.description;

insert into role_permissions(role_id, permission_id)
select role.id, permission.id
from organization_roles role
join permissions permission
  on permission.permission_code in ('dossiers.clients.read', 'dossiers.clients.manage')
where role.role_code in ('OWNER', 'MANAGER')
   or (
     role.role_code in ('OPERATOR', 'SUPPORT', 'WAREHOUSE', 'FINANCE')
     and permission.permission_code = 'dossiers.clients.read'
   )
   or (
     role.role_code = 'OPERATOR'
     and permission.permission_code = 'dossiers.clients.manage'
   )
on conflict do nothing;

revoke all on dossier_clients from public;
revoke all on dossier_client_events from public;

comment on column dossiers.idempotency_key is
  'Caller supplied key preventing duplicate Pilot dossier creation.';
