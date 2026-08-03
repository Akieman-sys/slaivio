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
create unique index if not exists ux_cargo_expeditions_public_token on cargo_expeditions(public_tracking_token) where public_tracking_token is not null;

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
create index if not exists idx_tracking_public_access on tracking_public_access_logs(org_id,expedition_id,accessed_at desc);
revoke all on tracking_saved_views,tracking_public_access_logs from public;
