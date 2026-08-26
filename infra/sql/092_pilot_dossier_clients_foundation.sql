-- SLAIVIO Pilot V1 - Dossier to multiple clients foundation.
--
-- This migration is additive and safe to rerun. The legacy dossiers.client_id
-- remains the primary-client compatibility pointer while every relationship is
-- also represented in dossier_clients. No client or dossier is deleted.

alter table clients
  add column if not exists client_reference text;

update clients
set client_reference = 'CLI-' || upper(left(replace(id::text, '-', ''), 12))
where client_reference is null or btrim(client_reference) = '';

alter table clients
  alter column client_reference set not null;

create unique index if not exists uq_clients_org_reference
  on clients(org_id, client_reference);

create or replace function assign_client_reference()
returns trigger
language plpgsql
as $$
begin
  if new.client_reference is null or btrim(new.client_reference) = '' then
    new.client_reference := 'CLI-' || upper(left(replace(new.id::text, '-', ''), 12));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_assign_reference on clients;
create trigger trg_clients_assign_reference
before insert on clients
for each row execute function assign_client_reference();

-- A Pilot dossier may exist before its first client is known. The legacy
-- pointer becomes nullable but remains available to every older reader.
alter table dossiers
  alter column client_id drop not null;

create or replace function enforce_dossier_client_tenant()
returns trigger
language plpgsql
as $$
begin
  if new.client_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from clients client
    where client.id = new.client_id
      and client.org_id = new.org_id
  ) then
    raise exception 'dossier_client_tenant_mismatch'
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

-- Composite uniqueness is used by the relation foreign keys to guarantee that
-- a dossier and a client always belong to the same organization.
create unique index if not exists uq_dossiers_org_id
  on dossiers(org_id, id);

create unique index if not exists uq_clients_org_id
  on clients(org_id, id);

create table if not exists dossier_clients (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  dossier_id uuid not null,
  client_id uuid not null,
  relationship_role text,
  dossier_client_reference text,
  situation text,
  status_in_dossier text,
  attention_required boolean not null default false,
  attention_reason text,
  last_updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by text,
  row_version integer not null default 1 check (row_version > 0),
  sync_version bigint not null default 1 check (sync_version > 0),
  idempotency_key text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_dossier_clients_org_dossier
    foreign key (org_id, dossier_id)
    references dossiers(org_id, id) on delete cascade,
  constraint fk_dossier_clients_org_client
    foreign key (org_id, client_id)
    references clients(org_id, id)
);

-- Historical duplicates are preserved by archiving all but the oldest active
-- relationship before the unique active-relation index is introduced.
with ranked as (
  select id,
         row_number() over (
           partition by org_id, dossier_id, client_id
           order by created_at, id
         ) as duplicate_rank
  from dossier_clients
  where archived_at is null
)
update dossier_clients relation
set archived_at = now(),
    updated_at = now()
from ranked
where relation.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists uq_dossier_clients_active_relation
  on dossier_clients(org_id, dossier_id, client_id)
  where archived_at is null;

create unique index if not exists uq_dossier_clients_active_primary
  on dossier_clients(org_id, dossier_id)
  where archived_at is null and relationship_role = 'PRIMARY';

create unique index if not exists uq_dossier_clients_idempotency
  on dossier_clients(org_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_dossier_clients_dossier_active
  on dossier_clients(org_id, dossier_id, last_updated_at desc)
  where archived_at is null;

create index if not exists idx_dossier_clients_client_active
  on dossier_clients(org_id, client_id, last_updated_at desc)
  where archived_at is null;

create index if not exists idx_dossier_clients_attention
  on dossier_clients(org_id, dossier_id, last_updated_at desc)
  where archived_at is null and attention_required;

-- Transfer the legacy primary relationship without changing the source rows.
insert into dossier_clients (
  org_id,
  dossier_id,
  client_id,
  relationship_role,
  dossier_client_reference,
  idempotency_key,
  created_at,
  updated_at,
  last_updated_at
)
select
  dossier.org_id,
  dossier.id,
  dossier.client_id,
  'PRIMARY',
  client.client_reference,
  'legacy-primary:' || dossier.id::text || ':' || dossier.client_id::text,
  coalesce(dossier.created_at, now()),
  coalesce(dossier.updated_at, now()),
  coalesce(dossier.updated_at, dossier.created_at, now())
from dossiers dossier
join clients client
  on client.org_id = dossier.org_id
 and client.id = dossier.client_id
where dossier.client_id is not null
on conflict (org_id, idempotency_key)
  where idempotency_key is not null
do nothing;

create or replace function maintain_dossier_client_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.row_version = old.row_version then
      new.row_version := old.row_version + 1;
    end if;
    if new.sync_version = old.sync_version then
      new.sync_version := old.sync_version + 1;
    end if;
  end if;
  new.updated_at := now();
  new.last_updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_dossier_clients_version on dossier_clients;
create trigger trg_dossier_clients_version
before update on dossier_clients
for each row execute function maintain_dossier_client_version();

-- Old writers still setting dossiers.client_id remain compatible. The trigger
-- creates or restores the matching primary relationship without removing any
-- other client already attached to the dossier.
create or replace function sync_legacy_dossier_primary_client()
returns trigger
language plpgsql
as $$
begin
  if new.client_id is null then
    return new;
  end if;

  update dossier_clients
  set relationship_role = case
        when client_id = new.client_id then 'PRIMARY'
        when relationship_role = 'PRIMARY' then null
        else relationship_role
      end,
      archived_at = case when client_id = new.client_id then null else archived_at end,
      archived_by = case when client_id = new.client_id then null else archived_by end
  where org_id = new.org_id
    and dossier_id = new.id
    and (
      archived_at is null
      or id = (
        select candidate.id
        from dossier_clients candidate
        where candidate.org_id = new.org_id
          and candidate.dossier_id = new.id
          and candidate.client_id = new.client_id
        order by candidate.created_at, candidate.id
        limit 1
      )
    );

  insert into dossier_clients (
    org_id,
    dossier_id,
    client_id,
    relationship_role,
    dossier_client_reference,
    idempotency_key
  )
  select
    new.org_id,
    new.id,
    new.client_id,
    'PRIMARY',
    client.client_reference,
    'legacy-primary:' || new.id::text || ':' || new.client_id::text
  from clients client
  where client.org_id = new.org_id
    and client.id = new.client_id
  on conflict (org_id, dossier_id, client_id)
    where archived_at is null
  do update set
    relationship_role = 'PRIMARY',
    archived_at = null,
    archived_by = null;

  return new;
end;
$$;

drop trigger if exists trg_dossiers_sync_primary_client on dossiers;
create trigger trg_dossiers_sync_primary_client
after insert or update of client_id on dossiers
for each row execute function sync_legacy_dossier_primary_client();

create table if not exists dossier_client_events (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  dossier_client_id uuid not null references dossier_clients(id) on delete cascade,
  dossier_id uuid not null,
  client_id uuid not null,
  event_type text not null,
  actor_id text,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint fk_dossier_client_events_org_dossier
    foreign key (org_id, dossier_id)
    references dossiers(org_id, id) on delete cascade,
  constraint fk_dossier_client_events_org_client
    foreign key (org_id, client_id)
    references clients(org_id, id)
);

create index if not exists idx_dossier_client_events_relation
  on dossier_client_events(org_id, dossier_client_id, created_at desc);

create index if not exists idx_dossier_client_events_dossier
  on dossier_client_events(org_id, dossier_id, created_at desc);

create unique index if not exists uq_dossier_client_initial_event
  on dossier_client_events(dossier_client_id, event_type)
  where event_type = 'CLIENT_ATTACHED';

insert into dossier_client_events (
  org_id,
  dossier_client_id,
  dossier_id,
  client_id,
  event_type,
  actor_id,
  new_data,
  created_at
)
select
  relation.org_id,
  relation.id,
  relation.dossier_id,
  relation.client_id,
  'CLIENT_ATTACHED',
  relation.created_by,
  to_jsonb(relation),
  relation.created_at
from dossier_clients relation
on conflict (dossier_client_id, event_type)
  where event_type = 'CLIENT_ATTACHED'
do nothing;

create or replace function audit_dossier_client_change()
returns trigger
language plpgsql
as $$
begin
  insert into dossier_client_events (
    org_id,
    dossier_client_id,
    dossier_id,
    client_id,
    event_type,
    actor_id,
    old_data,
    new_data
  ) values (
    new.org_id,
    new.id,
    new.dossier_id,
    new.client_id,
    case
      when tg_op = 'INSERT' then 'CLIENT_ATTACHED'
      when old.archived_at is null and new.archived_at is not null then 'CLIENT_REMOVED'
      when old.archived_at is not null and new.archived_at is null then 'CLIENT_RESTORED'
      else 'CLIENT_RELATION_UPDATED'
    end,
    coalesce(new.updated_by, new.created_by),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists trg_dossier_clients_audit on dossier_clients;
create trigger trg_dossier_clients_audit
after insert or update on dossier_clients
for each row execute function audit_dossier_client_change();

create or replace function prevent_dossier_client_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'dossier_client_history_is_immutable'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_dossier_client_events_immutable on dossier_client_events;
create trigger trg_dossier_client_events_immutable
before update or delete on dossier_client_events
for each row execute function prevent_dossier_client_event_mutation();

create or replace function prevent_dossier_client_hard_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'archive_dossier_client_instead'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_dossier_clients_no_hard_delete on dossier_clients;
create trigger trg_dossier_clients_no_hard_delete
before delete on dossier_clients
for each row execute function prevent_dossier_client_hard_delete();

revoke all on dossier_clients from public;
revoke all on dossier_client_events from public;

comment on table dossier_clients is
  'Pilot V1 relationship allowing several agency clients to belong to one dossier.';

comment on column dossiers.client_id is
  'Nullable legacy primary-client compatibility pointer. All dossier membership is stored in dossier_clients.';

comment on column dossier_clients.situation is
  'Agency-defined client situation in this dossier; no product vocabulary is imposed.';

comment on column dossier_clients.status_in_dossier is
  'Agency-defined status in this dossier; official values are configured after field validation.';
