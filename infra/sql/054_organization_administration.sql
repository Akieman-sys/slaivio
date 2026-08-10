-- Slaivio organization administration center
alter table organizations add column if not exists legal_name text;
alter table organizations add column if not exists registration_number text;
alter table organizations add column if not exists tax_number text;
alter table organizations add column if not exists website text;
alter table organizations add column if not exists logo_url text;
alter table organizations add column if not exists row_version integer not null default 1;

alter table organization_settings add column if not exists date_format text default 'DD/MM/YYYY';
alter table organization_settings add column if not exists weight_unit text default 'kg';
alter table organization_settings add column if not exists volume_unit text default 'cbm';
alter table organization_settings add column if not exists notification_email text;
alter table organization_settings add column if not exists security jsonb not null default '{"require_mfa":false,"session_timeout_minutes":480}'::jsonb;
alter table organization_settings add column if not exists row_version integer not null default 1;

alter table organization_memberships add column if not exists job_title text;
alter table organization_memberships add column if not exists phone text;
alter table organization_memberships add column if not exists last_seen_at timestamptz;
alter table organization_memberships add column if not exists suspended_at timestamptz;
alter table organization_memberships add column if not exists row_version integer not null default 1;

alter table organization_invitations add column if not exists expires_at timestamptz default (now() + interval '7 days');
alter table organization_invitations add column if not exists revoked_at timestamptz;

insert into permissions(permission_code,description) values
 ('organization.read','Consulter le profil et les paramètres de l organisation'),
 ('organization.manage','Modifier le profil de l organisation'),
 ('team.manage','Gérer membres, invitations et rôles'),
 ('roles.manage','Créer et configurer les rôles'),
 ('security.manage','Gérer la politique de sécurité')
on conflict(permission_code) do update set description=excluded.description;

-- Every organization receives a stable baseline of roles. Existing custom roles are preserved.
insert into organization_roles(org_id,role_code,role_name,description,system_role)
select o.id,r.code,r.name,r.description,true from organizations o cross join (values
 ('OWNER','Propriétaire','Accès administratif complet'),
 ('MANAGER','Manager','Supervision opérationnelle'),
 ('OPERATOR','Opérateur','Exécution des opérations cargo'),
 ('WAREHOUSE','Entrepôt','Réception et opérations WMS'),
 ('FINANCE','Finance','Facturation et paiements'),
 ('SUPPORT','Support','Relation et assistance client')
) r(code,name,description)
on conflict(org_id,role_code) do nothing;

-- Owners must never lose access to the administration center.
insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r cross join permissions p
where r.role_code='OWNER'
on conflict do nothing;

insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r join permissions p on p.permission_code in
 ('organization.read','settings.read','team.read','team.write','team.manage','audit.read')
where r.role_code='MANAGER'
on conflict do nothing;

create index if not exists idx_memberships_org_status on organization_memberships(org_id,status);
create index if not exists idx_invitations_org_status on organization_invitations(org_id,status);
create index if not exists idx_roles_org on organization_roles(org_id,role_code);
