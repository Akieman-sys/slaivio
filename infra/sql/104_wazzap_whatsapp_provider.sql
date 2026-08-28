-- Temporary Wazzap.ai transport for the Pilot WhatsApp channel.
-- Additive and idempotent so the Meta transport can be enabled later.
alter table organization_whatsapp_numbers
  add column if not exists provider_organization_id text;

alter table organization_whatsapp_numbers
  add column if not exists webhook_secret_encrypted text;

alter table organization_whatsapp_numbers
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists uq_active_wazzap_agent
  on organization_whatsapp_numbers(phone_number_id)
  where is_active=true and upper(provider)='WAZZAP';

create table if not exists wazzap_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  provider_event_id text,
  agent_id text not null,
  provider_organization_id text,
  org_id text references organizations(id),
  whatsapp_number_id uuid references organization_whatsapp_numbers(id),
  event_type text not null,
  payload jsonb not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_wazzap_webhook_events_work
  on wazzap_webhook_events(status, received_at)
  where status in ('PENDING', 'FAILED');

create index if not exists idx_wazzap_webhook_events_org
  on wazzap_webhook_events(org_id, received_at desc);
