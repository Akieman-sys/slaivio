-- SLAIVIO Pilot V1 - controlled AI inside the WhatsApp inbox.
-- Safe to run after 096_pilot_inbox_context.sql.

alter table ai_settings
  add column if not exists pilot_response_mode text not null default 'SUGGESTION_ONLY',
  add column if not exists pilot_require_published_knowledge boolean not null default true,
  add column if not exists pilot_updated_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_ai_settings_pilot_response_mode'
      and conrelid = 'ai_settings'::regclass
  ) then
    alter table ai_settings
      add constraint ck_ai_settings_pilot_response_mode
      check (pilot_response_mode in ('SUGGESTION_ONLY', 'CONTROLLED_AUTO', 'PAUSED'));
  end if;
end;
$$;

alter table ai_draft_responses
  add column if not exists source_message_id uuid references messages(id),
  add column if not exists source_ids uuid[] not null default '{}',
  add column if not exists confidence numeric,
  add column if not exists risk_level text not null default 'REVIEW',
  add column if not exists review_reason text,
  add column if not exists context_snapshot jsonb not null default '{}'::jsonb;

create index if not exists idx_ai_drafts_pilot_pending
  on ai_draft_responses(org_id, client_phone, created_at desc)
  where status = 'DRAFT';

create table if not exists pilot_inbox_ai_runs (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  client_phone text not null,
  client_id uuid,
  dossier_id uuid,
  source_message_id uuid references messages(id),
  event_key text not null,
  response_mode text not null,
  outcome text not null,
  intent text,
  confidence numeric,
  risk_level text not null default 'REVIEW',
  reason text,
  source_ids uuid[] not null default '{}',
  draft_id uuid references ai_draft_responses(id),
  outbound_message_id uuid references messages(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint fk_pilot_inbox_ai_client
    foreign key (org_id, client_id) references clients(org_id, id),
  constraint fk_pilot_inbox_ai_dossier
    foreign key (org_id, dossier_id) references dossiers(org_id, id),
  constraint ck_pilot_inbox_ai_mode
    check (response_mode in ('SUGGESTION_ONLY', 'CONTROLLED_AUTO', 'PAUSED')),
  constraint ck_pilot_inbox_ai_risk
    check (risk_level in ('SAFE', 'REVIEW', 'SENSITIVE')),
  unique(org_id, event_key)
);

create index if not exists idx_pilot_inbox_ai_runs_conversation
  on pilot_inbox_ai_runs(org_id, client_phone, created_at desc);

create table if not exists pilot_inbox_ai_setting_events (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  previous_mode text,
  new_mode text not null,
  actor_id text not null,
  created_at timestamptz not null default now(),
  constraint ck_pilot_inbox_ai_setting_mode
    check (new_mode in ('SUGGESTION_ONLY', 'CONTROLLED_AUTO', 'PAUSED'))
);

create index if not exists idx_pilot_inbox_ai_setting_events_org
  on pilot_inbox_ai_setting_events(org_id, created_at desc);

insert into permissions(permission_code, description)
values
  ('inbox.ai.use', 'Préparer des réponses avec l’IA dans la boîte de réception'),
  ('inbox.ai.manage', 'Choisir le mode de réponse de l’IA WhatsApp')
on conflict(permission_code) do update set description = excluded.description;

insert into role_permissions(role_id, permission_id)
select role.id, permission.id
from organization_roles role
join permissions permission
  on permission.permission_code in ('inbox.ai.use', 'inbox.ai.manage')
where role.role_code in ('OWNER', 'MANAGER')
   or (role.role_code in ('OPERATOR', 'SUPPORT') and permission.permission_code = 'inbox.ai.use')
on conflict do nothing;

comment on column ai_settings.pilot_response_mode is
  'Pilot WhatsApp AI mode: suggestion only, controlled automatic reply, or paused.';
comment on table pilot_inbox_ai_runs is
  'Tenant-isolated audit of every Pilot Inbox AI decision and delivery result.';
comment on table pilot_inbox_ai_setting_events is
  'Immutable history of Pilot WhatsApp AI mode changes.';
