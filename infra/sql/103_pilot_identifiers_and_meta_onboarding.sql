-- SLAIVIO Pilot V1 - effective agency identifiers and Meta onboarding audit.
-- Safe to run after 102_pilot_readiness_reviews.sql.

-- Every new dossier receives the agency-configured reference, including
-- dossiers created by WhatsApp, the Inbox or the AI. Explicit imported
-- references remain untouched.
create or replace function assign_dossier_reference()
returns trigger
language plpgsql
as $$
begin
  if new.dossier_reference is null or btrim(new.dossier_reference) = '' then
    new.dossier_reference := next_organization_reference(
      new.org_id,
      'DOSSIER',
      'DOS-{YYYY}-{000001}'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dossiers_assign_reference on dossiers;
create trigger trg_dossiers_assign_reference
before insert on dossiers
for each row execute function assign_dossier_reference();

update dossiers
set dossier_reference = next_organization_reference(
  org_id,
  'DOSSIER',
  'DOS-{YYYY}-{000001}'
)
where dossier_reference is null or btrim(dossier_reference) = '';

alter table organization_whatsapp_accounts
  add column if not exists access_token_encrypted text;

alter table organization_whatsapp_numbers
  add column if not exists access_token_encrypted text;

create table if not exists pilot_meta_onboarding_events (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  status text not null,
  waba_id text,
  phone_number_id text,
  actor_id text not null,
  error_stage text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ck_pilot_meta_onboarding_status check (
    status in ('STARTED','CONNECTED','FAILED')
  )
);

create index if not exists idx_pilot_meta_onboarding_events_recent
  on pilot_meta_onboarding_events(org_id, created_at desc);

revoke all on pilot_meta_onboarding_events from public;

comment on table pilot_meta_onboarding_events is
  'Token-free audit of Meta Embedded Signup attempts for an agency.';
