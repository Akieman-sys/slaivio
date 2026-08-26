-- SLAIVIO Pilot V1 - agency-facing settings center.
-- Safe to run after 099_pilot_knowledge_base.sql.
--
-- The Cargo OS administration tables remain intact. This migration adds only
-- the small set of settings that the Pilot responsible person must understand
-- and manage directly.

alter table knowledge_settings
  add column if not exists pilot_default_review_days integer not null default 180,
  add column if not exists pilot_row_version integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_knowledge_settings_pilot_review_days'
      and conrelid = 'knowledge_settings'::regclass
  ) then
    alter table knowledge_settings
      add constraint ck_knowledge_settings_pilot_review_days
      check (pilot_default_review_days between 7 and 730);
  end if;
end;
$$;

insert into knowledge_settings(org_id)
select organization.id
from organizations organization
on conflict(org_id) do nothing;

-- Only identifiers visible in the Pilot are initialized here. Older document
-- formats remain available to Cargo OS without appearing in the Pilot UI.
insert into document_numbering_settings(org_id, document_type, prefix_format)
select organization.id, value.document_type, value.prefix_format
from organizations organization
cross join (values
  ('CLIENT', 'CLI-{YYYY}-{000001}'),
  ('DOSSIER', 'DOS-{YYYY}-{000001}')
) value(document_type, prefix_format)
on conflict(org_id, document_type) do nothing;

insert into permissions(permission_code, description)
values
  ('pilot.settings.read', 'Consulter les paramètres simples du Pilot'),
  ('pilot.settings.manage', 'Modifier les paramètres simples du Pilot')
on conflict(permission_code) do update set description = excluded.description;

insert into role_permissions(role_id, permission_id)
select role.id, permission.id
from organization_roles role
join permissions permission
  on permission.permission_code in ('pilot.settings.read', 'pilot.settings.manage')
where role.role_code = 'OWNER'
   or (
     role.role_code = 'MANAGER'
     and permission.permission_code = 'pilot.settings.read'
   )
on conflict do nothing;

comment on column knowledge_settings.pilot_default_review_days is
  'Default review reminder proposed by the Pilot knowledge form; it does not publish or expire content automatically.';
