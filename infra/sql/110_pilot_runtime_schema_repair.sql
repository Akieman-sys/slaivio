-- Pilot runtime schema repair.
-- Safe and idempotent after 109_pilot_whatsapp_dossier_groups.sql.
-- This migration closes the deployment gap that can make the Inbox query fail
-- while the API and database are briefly on different revisions.

alter table conversation_assignments
  add column if not exists client_id uuid,
  add column if not exists dossier_id uuid,
  add column if not exists last_read_at timestamptz,
  add column if not exists row_version integer not null default 1,
  add column if not exists updated_by text,
  add column if not exists ai_mode_override text;

alter table ai_settings
  add column if not exists pilot_response_mode text not null default 'SUGGESTION_ONLY',
  add column if not exists system_prompt text not null default '',
  add column if not exists user_prompt_template text not null default '',
  add column if not exists communication_style text not null default 'PROFESSIONAL',
  add column if not exists prompt_row_version integer not null default 1;

alter table organization_whatsapp_numbers
  add column if not exists auto_mark_read boolean not null default false,
  add column if not exists group_replies_enabled boolean not null default false;

alter table organizations
  add column if not exists whatsapp_group_on_dossier_create boolean not null default false;

alter table dossiers
  add column if not exists whatsapp_group_jid text,
  add column if not exists whatsapp_group_status text not null default 'DISABLED',
  add column if not exists whatsapp_group_created_at timestamptz,
  add column if not exists whatsapp_group_last_error text;

alter table conversation_assignments drop constraint if exists ck_conversation_assignment_ai_mode;
alter table conversation_assignments add constraint ck_conversation_assignment_ai_mode check (
  ai_mode_override is null or ai_mode_override in ('CONTROLLED_AUTO','PAUSED')
);

alter table ai_settings drop constraint if exists ck_ai_settings_pilot_response_mode;
alter table ai_settings add constraint ck_ai_settings_pilot_response_mode check (
  pilot_response_mode in ('SUGGESTION_ONLY','CONTROLLED_AUTO','PAUSED')
);

alter table ai_settings drop constraint if exists ck_ai_communication_style;
alter table ai_settings add constraint ck_ai_communication_style check (
  communication_style in ('PROFESSIONAL','CONCISE','FORMAL','WARM')
);

alter table dossiers drop constraint if exists ck_dossiers_whatsapp_group_status;
alter table dossiers add constraint ck_dossiers_whatsapp_group_status check (
  whatsapp_group_status in ('DISABLED','WAITING_FOR_PARTICIPANT','CREATING','CONNECTED','FAILED')
);

create index if not exists idx_conversation_assignments_ai_mode
  on conversation_assignments(org_id, ai_mode_override, updated_at desc)
  where ai_mode_override is not null;

create unique index if not exists uq_dossiers_whatsapp_group_jid
  on dossiers(org_id, whatsapp_group_jid)
  where whatsapp_group_jid is not null;
