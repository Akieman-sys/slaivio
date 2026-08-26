-- SLAIVIO Pilot V1 - simple, confirmed WhatsApp follow-ups.
-- Safe to run after 097_pilot_inbox_ai.sql.
--
-- The advanced recovery engine remains available in the backend. Pilot batches
-- provide the agency-facing workflow: choose real clients/dossiers, preview a
-- deduplicated audience, confirm it, then queue one traceable task per phone.

create table if not exists pilot_followup_batches (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  title text not null,
  message text not null,
  selected_client_ids uuid[] not null default '{}',
  selected_dossier_ids uuid[] not null default '{}',
  excluded_client_ids uuid[] not null default '{}',
  status text not null default 'DRAFT',
  idempotency_key text,
  row_version integer not null default 1,
  confirmed_at timestamptz,
  queued_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by text not null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_pilot_followup_batch_status check (
    status in ('DRAFT','CONFIRMED','QUEUED','COMPLETED','PARTIAL_FAILED','CANCELLED')
  )
);

create unique index if not exists uq_pilot_followup_batch_idempotency
  on pilot_followup_batches(org_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_pilot_followup_batches_recent
  on pilot_followup_batches(org_id, updated_at desc);

create table if not exists pilot_followup_recipients (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  batch_id uuid not null references pilot_followup_batches(id) on delete cascade,
  client_id uuid not null,
  dossier_id uuid,
  normalized_phone text not null,
  phone_snapshot text not null,
  client_name_snapshot text not null,
  client_reference_snapshot text,
  dossier_reference_snapshot text,
  rendered_message text not null,
  status text not null default 'PENDING',
  followup_task_id uuid references followup_tasks(id),
  error_message text,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_pilot_followup_recipient_client
    foreign key (org_id, client_id) references clients(org_id, id),
  constraint fk_pilot_followup_recipient_dossier
    foreign key (org_id, dossier_id) references dossiers(org_id, id),
  constraint ck_pilot_followup_recipient_status check (
    status in ('PENDING','QUEUED','SENT','DELIVERED','READ','RESPONDED','FAILED','SKIPPED')
  ),
  unique(batch_id, normalized_phone)
);

create index if not exists idx_pilot_followup_recipients_batch
  on pilot_followup_recipients(org_id, batch_id, status);

create index if not exists idx_pilot_followup_recipients_client
  on pilot_followup_recipients(org_id, client_id, created_at desc);

create table if not exists pilot_followup_saved_messages (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  name text not null,
  body text not null,
  active boolean not null default true,
  created_by text not null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, name)
);

create table if not exists pilot_followup_events (
  id bigserial primary key,
  org_id text not null references organizations(id),
  batch_id uuid not null references pilot_followup_batches(id) on delete cascade,
  event_type text not null,
  actor_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_pilot_followup_events_batch
  on pilot_followup_events(org_id, batch_id, created_at desc);

alter table followup_tasks
  add column if not exists pilot_batch_id uuid references pilot_followup_batches(id),
  add column if not exists pilot_recipient_id uuid references pilot_followup_recipients(id);

create index if not exists idx_followup_tasks_pilot_batch
  on followup_tasks(org_id, pilot_batch_id)
  where pilot_batch_id is not null;

insert into permissions(permission_code, description)
values
  ('pilot.followups.read', 'Consulter les relances simples du Pilot'),
  ('pilot.followups.manage', 'Préparer et confirmer les relances simples du Pilot'),
  ('pilot.followups.send', 'Mettre en file les relances WhatsApp confirmées du Pilot')
on conflict(permission_code) do update set description = excluded.description;

insert into role_permissions(role_id, permission_id)
select role.id, permission.id
from organization_roles role
join permissions permission on permission.permission_code like 'pilot.followups.%'
where role.role_code in ('OWNER', 'MANAGER')
   or (role.role_code in ('OPERATOR', 'SUPPORT') and permission.permission_code in ('pilot.followups.read','pilot.followups.manage','pilot.followups.send'))
on conflict do nothing;

revoke all on pilot_followup_batches, pilot_followup_recipients,
  pilot_followup_saved_messages, pilot_followup_events from public;

comment on table pilot_followup_batches is
  'Agency-facing Pilot follow-up with an audience that must be confirmed before queueing.';
comment on table pilot_followup_recipients is
  'Frozen, phone-deduplicated recipient preview used for an auditable Pilot follow-up send.';
