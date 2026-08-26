-- SLAIVIO Pilot V1 - offline synchronization ledger.
-- Safe to run after 100_pilot_settings_center.sql.
--
-- The browser keeps its protected local cache on the agency device and clears
-- it on logout. The server stores no duplicate business data here: it only records
-- an idempotent operation, its target and the resulting business reference.

create table if not exists pilot_sync_devices (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  device_key text not null,
  label text,
  last_user_id text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(org_id, device_key)
);

create table if not exists pilot_sync_operations (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  device_id uuid references pilot_sync_devices(id),
  operation_key text not null,
  operation_type text not null,
  local_entity_id text,
  entity_type text not null,
  entity_id uuid,
  expected_version integer,
  server_version integer,
  payload_hash text not null,
  status text not null default 'PROCESSING',
  result jsonb not null default '{}'::jsonb,
  conflict jsonb,
  error_code text,
  actor_id text not null,
  processing_started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ck_pilot_sync_operation_type check (
    operation_type in ('DOSSIER_CREATE','DOSSIER_UPDATE','FOLLOWUP_DRAFT_SAVE')
  ),
  constraint ck_pilot_sync_entity_type check (
    entity_type in ('DOSSIER','FOLLOWUP_DRAFT')
  ),
  constraint ck_pilot_sync_status check (
    status in ('PROCESSING','APPLIED','CONFLICT','REJECTED')
  ),
  unique(org_id, operation_key)
);

create index if not exists idx_pilot_sync_operations_recent
  on pilot_sync_operations(org_id, created_at desc);

create index if not exists idx_pilot_sync_operations_pending_review
  on pilot_sync_operations(org_id, status, created_at desc)
  where status in ('CONFLICT','REJECTED');

insert into permissions(permission_code, description)
values ('pilot.offline.use', 'Synchroniser le travail Pilot préparé hors connexion')
on conflict(permission_code) do update set description = excluded.description;

insert into role_permissions(role_id, permission_id)
select role.id, permission.id
from organization_roles role
join permissions permission on permission.permission_code = 'pilot.offline.use'
where role.role_code in ('OWNER','MANAGER','OPERATOR','SUPPORT')
on conflict do nothing;

revoke all on pilot_sync_devices, pilot_sync_operations from public;

comment on table pilot_sync_operations is
  'Idempotent server receipt for Pilot operations prepared while a device was offline.';
comment on column pilot_sync_operations.conflict is
  'Human-resolvable version conflict; business records are never overwritten silently.';
