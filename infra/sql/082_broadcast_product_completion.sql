-- Final product layer for Broadcast; only provider approval/live tests remain.
alter table broadcasts add column if not exists approval_required boolean not null default false;
alter table broadcasts add column if not exists conversion_definition text;
alter table broadcasts add column if not exists utm_config jsonb not null default '{}'::jsonb;
alter table broadcasts add column if not exists test_sent_at timestamptz;
alter table broadcast_recipients add column if not exists reply_intent text;
alter table broadcast_recipients add column if not exists conversion_value numeric(16,2);
alter table broadcast_templates add column if not exists approved_at timestamptz;
alter table broadcast_templates add column if not exists approved_by text;
create table if not exists broadcast_saved_views(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),user_id text not null,name text not null,filters jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,user_id,name));
create table if not exists broadcast_test_sends(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),broadcast_id uuid not null references broadcasts(id),channel text not null,recipient text not null,status text not null default 'QUEUED',notification_id uuid,created_by text not null,created_at timestamptz not null default now());
create table if not exists broadcast_click_events(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),broadcast_id uuid not null references broadcasts(id),recipient_id uuid references broadcast_recipients(id),opaque_token text not null unique,url text not null,clicked_at timestamptz,created_at timestamptz not null default now());
create index if not exists idx_broadcast_tests on broadcast_test_sends(org_id,broadcast_id,created_at desc);
revoke all on broadcast_saved_views,broadcast_test_sends,broadcast_click_events from public;
