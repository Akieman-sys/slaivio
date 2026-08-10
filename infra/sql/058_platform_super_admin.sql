alter table organizations add column if not exists suspended_at timestamptz;
alter table organizations add column if not exists suspension_reason text;
alter table agency_subscriptions add column if not exists row_version integer not null default 1;
alter table support_tickets add column if not exists platform_row_version integer not null default 1;
create table if not exists platform_admin_audit_log(
 id uuid primary key default gen_random_uuid(),actor_user_id text not null,action text not null,target_type text not null,target_id text,
 old_data jsonb,new_data jsonb,reason text,ip_address text,user_agent text,created_at timestamptz not null default now()
);
create index if not exists idx_platform_admin_audit_created on platform_admin_audit_log(created_at desc);
create table if not exists platform_agency_notes(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) on delete cascade,author_id text not null,
 note text not null,internal boolean not null default true,created_at timestamptz not null default now()
);
-- No automatic grants: bootstrap the first operator explicitly after deployment.
-- insert into platform_operator_permissions(user_id,permission_code,granted_by) values
-- ('user_CLERK_ID','platform.admin.read','bootstrap'),
-- ('user_CLERK_ID','platform.agencies.manage','bootstrap'),
-- ('user_CLERK_ID','platform.billing.manage','bootstrap'),
-- ('user_CLERK_ID','platform.support.manage','bootstrap'),
-- ('user_CLERK_ID','platform.audit.read','bootstrap'),
-- ('user_CLERK_ID','platform.permissions.manage','bootstrap') on conflict do nothing;
