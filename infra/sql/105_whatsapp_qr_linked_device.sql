-- SLAIVIO Pilot V1 - temporary WhatsApp linked-device connector.
-- Safe to run after 104_wazzap_whatsapp_provider.sql.
--
-- This connector is deliberately isolated from the official Meta connector.
-- It is intended for a small, explicitly consenting pilot and can be replaced
-- by Meta without changing clients, dossiers, messages or the Inbox.

create table if not exists whatsapp_qr_connections (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  whatsapp_number_id uuid references organization_whatsapp_numbers(id),
  status text not null default 'CREATED',
  linked_jid text,
  display_phone_number text,
  verified_name text,
  qr_generation integer not null default 0,
  qr_expires_at timestamptz,
  last_connected_at timestamptz,
  last_disconnected_at timestamptz,
  last_error text,
  terms_accepted_at timestamptz not null,
  terms_accepted_by text not null,
  created_by text not null,
  updated_by text,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_whatsapp_qr_connection_status check (
    status in ('CREATED','QR_READY','CONNECTING','CONNECTED','DISCONNECTED','LOGGED_OUT','FAILED','REVOKED')
  )
);

create unique index if not exists uq_whatsapp_qr_active_org
  on whatsapp_qr_connections(org_id)
  where status not in ('LOGGED_OUT','REVOKED');

create unique index if not exists uq_whatsapp_qr_linked_jid
  on whatsapp_qr_connections(linked_jid)
  where linked_jid is not null and status not in ('LOGGED_OUT','REVOKED');

create index if not exists idx_whatsapp_qr_connections_recent
  on whatsapp_qr_connections(org_id, updated_at desc);

-- Baileys AuthenticationState is stored as encrypted opaque records. The
-- gateway encrypts every value with AES-256-GCM before PostgreSQL sees it.
create table if not exists whatsapp_qr_auth_state (
  connection_id uuid not null references whatsapp_qr_connections(id) on delete cascade,
  key_type text not null,
  key_id text not null,
  encrypted_payload bytea not null,
  nonce bytea not null,
  auth_tag bytea not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(connection_id, key_type, key_id)
);

-- Durable inbox for callbacks emitted by the isolated Node gateway. The
-- unique event key makes retries safe and prevents duplicate messages.
create table if not exists whatsapp_qr_events (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  connection_id uuid not null references whatsapp_qr_connections(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'RECEIVED',
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint ck_whatsapp_qr_event_status check (
    status in ('RECEIVED','PROCESSING','PROCESSED','IGNORED','FAILED')
  ),
  unique(org_id, event_key)
);

create index if not exists idx_whatsapp_qr_events_recovery
  on whatsapp_qr_events(status, received_at)
  where status in ('RECEIVED','FAILED');

insert into permissions(permission_code, description)
values
  ('pilot.whatsapp_qr.connect', 'Connecter temporairement WhatsApp par appareil lié'),
  ('pilot.whatsapp_qr.disconnect', 'Déconnecter et révoquer une session WhatsApp liée')
on conflict(permission_code) do update set description=excluded.description;

insert into role_permissions(role_id, permission_id)
select role.id, permission.id
from organization_roles role
join permissions permission on permission.permission_code like 'pilot.whatsapp_qr.%'
where role.role_code in ('OWNER','MANAGER')
on conflict do nothing;

revoke all on whatsapp_qr_connections, whatsapp_qr_auth_state, whatsapp_qr_events from public;

comment on table whatsapp_qr_connections is
  'Explicitly consented temporary linked-device sessions, isolated from official Meta onboarding.';
comment on table whatsapp_qr_auth_state is
  'AES-256-GCM encrypted Baileys credentials and Signal keys; plaintext is never stored.';
comment on table whatsapp_qr_events is
  'Idempotent signed callbacks from the isolated WhatsApp QR gateway.';
