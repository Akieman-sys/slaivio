-- Tracking Control Tower over canonical cargo domains. Safe to rerun.
insert into permissions(permission_code,description) values
 ('tracking.read','Lire la tour de controle tracking'),('tracking.update','Mettre a jour le tracking'),
 ('tracking.alerts','Gerer les alertes tracking'),('tracking.notify','Notifier les clients depuis tracking'),
 ('tracking.export','Exporter le tracking'),('tracking.public','Gerer les liens publics tracking')
on conflict(permission_code) do update set description=excluded.description;

insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r join permissions p on
 (r.role_code in ('OWNER','MANAGER') and p.permission_code like 'tracking.%') or
 (r.role_code in ('OPERATOR','WAREHOUSE') and p.permission_code in ('tracking.read','tracking.update','tracking.alerts','tracking.notify')) or
 (r.role_code in ('SUPPORT','FINANCE') and p.permission_code in ('tracking.read','tracking.export'))
on conflict do nothing;

alter table cargo_expeditions add column if not exists public_tracking_token text;
alter table cargo_expeditions add column if not exists public_tracking_enabled boolean not null default false;
alter table cargo_expeditions add column if not exists public_tracking_expires_at timestamptz;
alter table cargo_expeditions add column if not exists last_signal_at timestamptz;
alter table cargo_expeditions add column if not exists last_signal_source text;
alter table cargo_expeditions add column if not exists tracking_row_version integer not null default 1;
alter table expedition_events add column if not exists idempotency_key text;
alter table expedition_anomalies add column if not exists assigned_to text;
alter table expedition_anomalies add column if not exists assigned_name text;
alter table expedition_anomalies add column if not exists detection_key text;
create unique index if not exists ux_cargo_expeditions_public_token on cargo_expeditions(public_tracking_token) where public_tracking_token is not null;
create unique index if not exists ux_tracking_event_idempotency on expedition_events(org_id,expedition_id,idempotency_key) where idempotency_key is not null;
create unique index if not exists ux_tracking_alert_detection on expedition_anomalies(org_id,expedition_id,detection_key) where detection_key is not null and status in ('OPEN','IN_REVIEW');

create table if not exists tracking_saved_views(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) on delete cascade,
 user_id text not null,name text not null,filters jsonb not null default '{}'::jsonb,is_default boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,user_id,name)
);
create table if not exists tracking_public_access_logs(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) on delete cascade,
 expedition_id uuid not null references cargo_expeditions(id) on delete cascade,ip_address text,user_agent text,
 accessed_at timestamptz not null default now()
);
create table if not exists tracking_alert_history(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) on delete cascade,
 expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
 alert_id uuid not null references expedition_anomalies(id) on delete cascade,
 action text not null,previous_status text,new_status text,comment text,actor_id text,
 created_at timestamptz not null default now()
);
create table if not exists tracking_audit_log(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) on delete cascade,
 expedition_id uuid references cargo_expeditions(id) on delete cascade,action text not null,
 actor_id text,request_id text,payload jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);
create index if not exists idx_tracking_public_access on tracking_public_access_logs(org_id,expedition_id,accessed_at desc);
create index if not exists idx_tracking_alert_history on tracking_alert_history(org_id,expedition_id,created_at desc);
create index if not exists idx_tracking_audit on tracking_audit_log(org_id,expedition_id,created_at desc);
revoke all on tracking_saved_views,tracking_public_access_logs,tracking_alert_history,tracking_audit_log from public;
