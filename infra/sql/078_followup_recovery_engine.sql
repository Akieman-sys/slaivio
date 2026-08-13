-- Follow-up & Recovery Engine. Additive, backward-compatible and idempotent.
alter table followup_tasks add column if not exists workspace_id uuid references organization_workspaces(id);
alter table followup_tasks add column if not exists reference text;
alter table followup_tasks add column if not exists subject_type text default 'DOSSIER';
alter table followup_tasks add column if not exists subject_id uuid;
alter table followup_tasks add column if not exists subject_reference text;
alter table followup_tasks add column if not exists reason text;
alter table followup_tasks add column if not exists channel text default 'WHATSAPP';
alter table followup_tasks add column if not exists priority text default 'NORMAL';
alter table followup_tasks add column if not exists responsible_id text;
alter table followup_tasks add column if not exists responsible_name text;
alter table followup_tasks add column if not exists sequence_id uuid;
alter table followup_tasks add column if not exists current_step integer not null default 1;
alter table followup_tasks add column if not exists max_steps integer not null default 1;
alter table followup_tasks add column if not exists attempt_count integer not null default 0;
alter table followup_tasks add column if not exists amount_context numeric(16,2);
alter table followup_tasks add column if not exists currency text;
alter table followup_tasks add column if not exists consent_type text not null default 'OPERATIONAL';
alter table followup_tasks add column if not exists idempotency_key text;
alter table followup_tasks add column if not exists condition_snapshot jsonb not null default '{}'::jsonb;
alter table followup_tasks add column if not exists pause_reason text;
alter table followup_tasks add column if not exists responded_at timestamptz;
alter table followup_tasks add column if not exists completed_at timestamptz;
alter table followup_tasks add column if not exists escalated_at timestamptz;
alter table followup_tasks add column if not exists archived_at timestamptz;
alter table followup_tasks add column if not exists row_version integer not null default 1;
alter table followup_tasks add column if not exists updated_at timestamptz not null default now();
update followup_tasks set reference='FUP-'||upper(substr(id::text,1,8)) where reference is null;
update followup_tasks set status=case status when 'PENDING' then case when due_at<=now() then 'DUE' else 'SCHEDULED' end when 'EXECUTED' then 'SENT' else status end;
alter table followup_tasks alter column reference set not null;
create unique index if not exists idx_followup_reference on followup_tasks(org_id,reference);
create unique index if not exists idx_followup_idempotency on followup_tasks(org_id,idempotency_key) where idempotency_key is not null;
create index if not exists idx_followup_queue on followup_tasks(org_id,status,due_at) where archived_at is null;

create table if not exists followup_rules(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),workspace_id uuid references organization_workspaces(id),name text not null,followup_type text not null,
 trigger_type text not null,trigger_config jsonb not null default '{}'::jsonb,condition_config jsonb not null default '{}'::jsonb,sequence_id uuid,priority text not null default 'NORMAL',responsible_team text,
 active boolean not null default true,row_version integer not null default 1,created_by text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,name)
);
create table if not exists followup_sequences(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),name text not null,followup_type text not null,exit_conditions jsonb not null default '[]'::jsonb,
 active boolean not null default true,row_version integer not null default 1,created_by text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,name)
);
alter table followup_tasks drop constraint if exists followup_tasks_sequence_id_fkey;
alter table followup_tasks add constraint followup_tasks_sequence_id_fkey foreign key(sequence_id) references followup_sequences(id);
alter table followup_rules drop constraint if exists followup_rules_sequence_id_fkey;
alter table followup_rules add constraint followup_rules_sequence_id_fkey foreign key(sequence_id) references followup_sequences(id);
create table if not exists followup_sequence_steps(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),sequence_id uuid not null references followup_sequences(id) on delete cascade,step_number integer not null,delay_minutes integer not null default 0,
 channel text not null,message_template text not null,condition_config jsonb not null default '{}'::jsonb,action_type text not null default 'SEND',unique(sequence_id,step_number)
);
create table if not exists followup_attempts(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),followup_id uuid not null references followup_tasks(id),step_number integer not null,channel text not null,
 idempotency_key text not null,status text not null default 'QUEUED',recipient text,message text not null,provider_message_id text,error_code text,error_message text,retry_count integer not null default 0,
 queued_at timestamptz not null default now(),sent_at timestamptz,delivered_at timestamptz,read_at timestamptz,failed_at timestamptz,unique(org_id,idempotency_key)
);
create table if not exists followup_responses(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),followup_id uuid not null references followup_tasks(id),channel text not null,message_id text,body text not null,
 classification text,confidence numeric(5,4),requires_review boolean not null default false,received_at timestamptz not null default now(),unique(org_id,message_id)
);
create table if not exists followup_templates(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),name text not null,category text not null,channel text not null,language text not null default 'fr',body text not null,
 meta_template_name text,meta_status text,consent_type text not null default 'OPERATIONAL',active boolean not null default true,row_version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,name,language)
);
create table if not exists followup_saved_views(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),user_id text not null,name text not null,filters jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),unique(org_id,user_id,name));
create table if not exists followup_settings(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) unique,quiet_hours_start time default '21:00',quiet_hours_end time default '08:00',excluded_weekdays integer[] not null default '{0}',max_automatic_attempts integer not null default 4,min_interval_minutes integer not null default 1440,default_tone text not null default 'PROFESSIONAL',channel_fallback jsonb not null default '{"WHATSAPP":"EMAIL"}'::jsonb,updated_at timestamptz not null default now());
create table if not exists followup_events(id bigserial primary key,org_id text not null references organizations(id),followup_id uuid references followup_tasks(id),event_type text not null,payload jsonb not null default '{}'::jsonb,actor_id text,created_at timestamptz not null default now());

insert into followup_settings(org_id) select id from organizations on conflict(org_id) do nothing;
insert into permissions(permission_code,description) values
 ('followups.read','Consulter les relances autorisées'),('followups.create','Créer une relance manuelle'),('followups.update','Reporter, suspendre et terminer une relance'),
 ('followups.execute','Envoyer une relance'),('followups.rules','Gérer règles, séquences et modèles'),('followups.escalate','Escalader une relance'),('followups.bulk','Lancer des relances groupées'),('followups.analytics','Consulter les analytics Relances')
on conflict(permission_code) do update set description=excluded.description;
insert into role_permissions(role_id,permission_id) select r.id,p.id from organization_roles r cross join permissions p where
 (r.role_code='OWNER' and p.permission_code like 'followups.%') or
 (r.role_code='MANAGER' and p.permission_code in('followups.read','followups.create','followups.update','followups.execute','followups.rules','followups.escalate','followups.bulk','followups.analytics')) or
 (r.role_code in('OPERATOR','SUPPORT') and p.permission_code in('followups.read','followups.create','followups.update','followups.execute')) or
 (r.role_code='FINANCE' and p.permission_code in('followups.read','followups.create','followups.update','followups.execute','followups.escalate','followups.analytics')) on conflict do nothing;
create index if not exists idx_followup_attempts_queue on followup_attempts(org_id,status,queued_at);
create index if not exists idx_followup_events_item on followup_events(org_id,followup_id,created_at desc);
revoke all on followup_rules,followup_sequences,followup_sequence_steps,followup_attempts,followup_responses,followup_templates,followup_saved_views,followup_settings,followup_events from public;
