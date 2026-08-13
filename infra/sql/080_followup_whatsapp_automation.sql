-- Completion of Follow-up Engine, WhatsApp first.
alter table followup_attempts add column if not exists notification_id uuid;
alter table followup_attempts add column if not exists next_retry_at timestamptz;
alter table followup_tasks add column if not exists promise_due_at timestamptz;
alter table followup_tasks add column if not exists response_classification text;
alter table followup_tasks add column if not exists source_rule_id uuid references followup_rules(id);
alter table followup_tasks add column if not exists assigned_team text;
alter table followup_tasks add column if not exists archived_by text;
create table if not exists followup_notes(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),followup_id uuid not null references followup_tasks(id) on delete cascade,body text not null,author_id text not null,author_name text,created_at timestamptz not null default now());
create table if not exists followup_stop_list(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),client_id uuid references clients(id),channel text not null default 'WHATSAPP',reason text not null,created_by text not null,created_at timestamptz not null default now(),unique(org_id,client_id,channel));
create table if not exists followup_detection_runs(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),idempotency_key text not null,status text not null default 'RUNNING',candidates integer not null default 0,created integer not null default 0,started_at timestamptz not null default now(),completed_at timestamptz,unique(org_id,idempotency_key));
create index if not exists idx_followup_sequence_due on followup_tasks(org_id,status,due_at,current_step) where archived_at is null;
create index if not exists idx_followup_attempt_notification on followup_attempts(notification_id) where notification_id is not null;
revoke all on followup_notes,followup_stop_list,followup_detection_runs from public;
