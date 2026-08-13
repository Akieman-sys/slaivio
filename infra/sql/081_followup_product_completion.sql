-- Final product layer for Follow-up & Recovery.
alter table followup_templates add column if not exists variables text[] not null default '{}';
alter table followup_templates add column if not exists approved_at timestamptz;
alter table followup_templates add column if not exists approved_by text;
alter table followup_saved_views add column if not exists updated_at timestamptz not null default now();
alter table followup_settings add column if not exists fallback_enabled boolean not null default false;
alter table followup_settings add column if not exists promise_grace_hours integer not null default 12;
alter table followup_settings add column if not exists abandoned_conversation_minutes integer not null default 30;
alter table followup_settings add column if not exists inactive_client_days integer not null default 45;
alter table followup_settings add column if not exists quote_followup_hours integer not null default 48;
create index if not exists idx_messages_raw_abandoned on messages_raw(org_id,client_id,created_at desc);
