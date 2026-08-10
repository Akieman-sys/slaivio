-- Unified in-app and delivery notification center.
create table if not exists manager_events (
 id uuid primary key default gen_random_uuid(), org_id text not null references organizations(id),
 event_type text not null, event_scope text not null default 'GENERAL', client_id uuid, dossier_id uuid,
 shipment_id uuid, notification_id uuid, escalation_id uuid, title text not null, message text not null,
 priority text not null default 'NORMAL', payload jsonb not null default '{}', is_read boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists idx_manager_events_org_created on manager_events(org_id,created_at desc);

create table if not exists notification_user_states (
 org_id text not null references organizations(id), user_id text not null, source text not null,
 notification_id uuid not null, read_at timestamptz, archived_at timestamptz, snoozed_until timestamptz,
 updated_at timestamptz not null default now(), primary key(org_id,user_id,source,notification_id)
);
create index if not exists idx_notification_state_user on notification_user_states(org_id,user_id,updated_at desc);

create table if not exists notification_preferences (
 id uuid primary key default gen_random_uuid(), org_id text not null references organizations(id), user_id text not null,
 category text not null, in_app boolean not null default true, email boolean not null default false,
 whatsapp boolean not null default false, quiet_hours_start time, quiet_hours_end time,
 digest_frequency text not null default 'IMMEDIATE', updated_at timestamptz not null default now(),
 unique(org_id,user_id,category), check(digest_frequency in ('IMMEDIATE','DAILY','WEEKLY','OFF'))
);

insert into permissions(permission_code,description) values
 ('notifications.read','Consulter son centre de notifications'),
 ('notifications.manage','Gérer ses notifications et préférences'),
 ('notifications.delivery.manage','Relancer et superviser les notifications clients')
on conflict(permission_code) do update set description=excluded.description;
insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r join permissions p on p.permission_code in ('notifications.read','notifications.manage')
where r.role_code in ('OWNER','MANAGER','OPERATOR','WAREHOUSE','FINANCE','SUPPORT') on conflict do nothing;
insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r join permissions p on p.permission_code='notifications.delivery.manage'
where r.role_code in ('OWNER','MANAGER','SUPPORT') on conflict do nothing;
