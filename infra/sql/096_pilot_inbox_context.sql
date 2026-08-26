-- SLAIVIO Pilot V1 - central WhatsApp inbox context.
-- Safe to run after 095_pilot_client_identity_numbering.sql.
--
-- A conversation keeps only references to the unique Client and Dossier
-- records. Names, phone numbers and dossier data are never duplicated here.

alter table conversation_assignments
  add column if not exists client_id uuid,
  add column if not exists dossier_id uuid,
  add column if not exists last_read_at timestamptz,
  add column if not exists row_version integer not null default 1,
  add column if not exists updated_by text;

update conversation_assignments assignment
set client_id = (
  select client.id
  from clients client
  where client.org_id = assignment.org_id
    and regexp_replace(coalesce(client.phone, client.whatsapp_phone, ''), '[^0-9]', '', 'g') =
        regexp_replace(assignment.client_phone, '[^0-9]', '', 'g')
  order by client.updated_at desc nulls last, client.created_at desc, client.id
  limit 1
)
where assignment.client_id is null
  and exists (
    select 1 from clients client
    where client.org_id = assignment.org_id
      and regexp_replace(coalesce(client.phone, client.whatsapp_phone, ''), '[^0-9]', '', 'g') =
          regexp_replace(assignment.client_phone, '[^0-9]', '', 'g')
  );

update conversation_assignments assignment
set dossier_id = (
  select relation.dossier_id
  from dossier_clients relation
  join dossiers dossier
    on dossier.org_id = relation.org_id
   and dossier.id = relation.dossier_id
  where relation.org_id = assignment.org_id
    and relation.client_id = assignment.client_id
    and relation.archived_at is null
    and dossier.archived_at is null
  order by relation.last_updated_at desc, relation.created_at desc
  limit 1
)
where assignment.dossier_id is null
  and assignment.client_id is not null
  and exists (
    select 1 from dossier_clients relation
    join dossiers dossier on dossier.org_id = relation.org_id and dossier.id = relation.dossier_id
    where relation.org_id = assignment.org_id
      and relation.client_id = assignment.client_id
      and relation.archived_at is null
      and dossier.archived_at is null
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_conversation_assignment_client'
      and conrelid = 'conversation_assignments'::regclass
  ) then
    alter table conversation_assignments
      add constraint fk_conversation_assignment_client
      foreign key (org_id, client_id) references clients(org_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_conversation_assignment_dossier'
      and conrelid = 'conversation_assignments'::regclass
  ) then
    alter table conversation_assignments
      add constraint fk_conversation_assignment_dossier
      foreign key (org_id, dossier_id) references dossiers(org_id, id);
  end if;
end;
$$;

create index if not exists idx_conversation_assignments_client
  on conversation_assignments(org_id, client_id, updated_at desc)
  where client_id is not null;

create index if not exists idx_conversation_assignments_dossier
  on conversation_assignments(org_id, dossier_id, updated_at desc)
  where dossier_id is not null;

create or replace function validate_pilot_conversation_context()
returns trigger
language plpgsql
as $$
begin
  if new.dossier_id is not null and new.client_id is null then
    raise exception 'conversation_dossier_requires_client'
      using errcode = 'check_violation';
  end if;

  if new.dossier_id is not null and not exists (
    select 1
    from dossier_clients relation
    where relation.org_id = new.org_id
      and relation.dossier_id = new.dossier_id
      and relation.client_id = new.client_id
      and relation.archived_at is null
  ) then
    raise exception 'conversation_client_not_in_dossier'
      using errcode = 'foreign_key_violation';
  end if;

  if tg_op = 'UPDATE' then
    new.row_version := old.row_version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pilot_conversation_context on conversation_assignments;
create trigger trg_pilot_conversation_context
before insert or update on conversation_assignments
for each row execute function validate_pilot_conversation_context();

insert into permissions(permission_code, description)
values ('inbox.manage', 'Associer et organiser les conversations de la boîte de réception')
on conflict(permission_code) do update set description = excluded.description;

insert into role_permissions(role_id, permission_id)
select role.id, permission.id
from organization_roles role
join permissions permission on permission.permission_code = 'inbox.manage'
where role.role_code in ('OWNER', 'MANAGER', 'OPERATOR', 'SUPPORT')
on conflict do nothing;

comment on column conversation_assignments.client_id is
  'Unique agency client identified for this WhatsApp conversation.';
comment on column conversation_assignments.dossier_id is
  'Pilot dossier selected for this conversation; the client must belong to it.';
