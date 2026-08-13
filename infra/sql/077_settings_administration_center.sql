-- SLAIVIO administration center. Additive, tenant-safe and safe to rerun.
alter table organizations add column if not exists organization_type text default 'CARGO';
alter table organizations add column if not exists whatsapp text;
alter table organizations add column if not exists province text;
alter table organizations add column if not exists postal_code text;
alter table organizations add column if not exists registration_country text;
alter table organizations add column if not exists legal_address text;
alter table organizations add column if not exists logo_dark_url text;
alter table organizations add column if not exists primary_color text default '#16855f';
alter table organizations add column if not exists secondary_color text default '#1f2937';
alter table organizations add column if not exists document_display_name text;
alter table organizations add column if not exists signature_url text;
alter table organizations add column if not exists stamp_url text;

alter table organization_settings add column if not exists time_format text default '24H';
alter table organization_settings add column if not exists week_starts_on integer default 1;
alter table organization_settings add column if not exists dimension_unit text default 'cm';
alter table organization_settings add column if not exists distance_unit text default 'km';
alter table organization_settings add column if not exists data_retention_days integer default 1095;
alter table organization_settings add column if not exists privacy jsonb not null default '{}'::jsonb;

create table if not exists organization_workspaces(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),name text not null,code text not null,
 country_code text,currency_code text not null default 'USD',timezone text not null default 'UTC',language_code text not null default 'fr',
 manager_membership_id uuid references organization_memberships(id),status text not null default 'ACTIVE' check(status in('ACTIVE','ARCHIVED')),
 settings jsonb not null default '{}'::jsonb,row_version integer not null default 1,created_by text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,code)
);
create table if not exists organization_locations(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),workspace_id uuid references organization_workspaces(id),name text not null,code text not null,
 location_type text not null check(location_type in('OFFICE','WAREHOUSE','HUB','PICKUP_POINT')),country text not null,city text not null,address text,
 phone text,whatsapp text,email text,manager_name text,opening_hours jsonb not null default '{}'::jsonb,timezone text not null default 'UTC',services text[] not null default '{}',
 status text not null default 'ACTIVE' check(status in('ACTIVE','INACTIVE')),row_version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,code)
);
alter table organization_memberships add column if not exists workspace_id uuid references organization_workspaces(id);
alter table organization_memberships add column if not exists location_id uuid references organization_locations(id);

create table if not exists organization_integrations(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),provider text not null,account_label text,status text not null default 'DISCONNECTED' check(status in('DISCONNECTED','CONNECTING','CONNECTED','ERROR')),
 granted_permissions text[] not null default '{}',configuration jsonb not null default '{}'::jsonb,last_sync_at timestamptz,connected_at timestamptz,updated_by text,updated_at timestamptz not null default now(),unique(org_id,provider,account_label)
);
create table if not exists document_numbering_settings(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),document_type text not null,prefix_format text not null,next_number bigint not null default 1,
 header_text text,footer_text text,terms_text text,logo_url text,signature_url text,stamp_url text,row_version integer not null default 1,updated_at timestamptz not null default now(),unique(org_id,document_type)
);
create table if not exists organization_billing_profiles(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) unique,plan_code text not null default 'TRIAL',status text not null default 'TRIAL',billing_currency text not null default 'USD',
 monthly_amount numeric(14,2) not null default 0,next_billing_at timestamptz,provider_customer_id text,provider_subscription_id text,payment_method_label text,
 limits jsonb not null default '{}'::jsonb,usage jsonb not null default '{}'::jsonb,row_version integer not null default 1,updated_at timestamptz not null default now()
);
create table if not exists organization_data_requests(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),request_type text not null check(request_type in('EXPORT','ARCHIVE_WORKSPACE','DELETE_WORKSPACE','DELETE_ORGANIZATION')),
 scope jsonb not null default '{}'::jsonb,status text not null default 'PENDING' check(status in('PENDING','PROCESSING','COMPLETED','REJECTED','CANCELLED')),requested_by text not null,approved_by text,
 result_path text,created_at timestamptz not null default now(),completed_at timestamptz
);
create table if not exists developer_api_keys(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),name text not null,key_prefix text not null,key_hash text not null,scopes text[] not null default '{}',
 status text not null default 'ACTIVE' check(status in('ACTIVE','REVOKED')),last_used_at timestamptz,expires_at timestamptz,created_by text not null,created_at timestamptz not null default now(),revoked_at timestamptz,unique(org_id,key_hash)
);

insert into permissions(permission_code,description) values
 ('workspaces.manage','Gérer les workspaces'),('locations.manage','Gérer bureaux et établissements'),('integrations.manage','Gérer les intégrations'),
 ('documents.settings','Configurer documents et numérotation'),('billing.manage','Gérer l abonnement Slaivio'),('data.manage','Gérer exports et confidentialité'),('developers.manage','Gérer API et webhooks')
on conflict(permission_code) do update set description=excluded.description;
insert into role_permissions(role_id,permission_id) select r.id,p.id from organization_roles r cross join permissions p
where r.role_code='OWNER' and p.permission_code in('workspaces.manage','locations.manage','integrations.manage','documents.settings','billing.manage','data.manage','developers.manage') on conflict do nothing;
insert into role_permissions(role_id,permission_id) select r.id,p.id from organization_roles r cross join permissions p
where r.role_code='MANAGER' and p.permission_code in('workspaces.manage','locations.manage','integrations.manage','documents.settings') on conflict do nothing;

insert into organization_billing_profiles(org_id) select id from organizations on conflict(org_id) do nothing;
insert into document_numbering_settings(org_id,document_type,prefix_format) select o.id,x.type,x.format from organizations o cross join(values
 ('INVOICE','INV-{YYYY}-{000001}'),('QUOTE','DEV-{YYYY}-{000001}'),('RECEIPT','REC-{YYYY}-{000001}'),('DOSSIER','DOS-{YYYY}-{000001}'),('PACKAGE','COL-{YYYY}-{000001}'),('SHIPMENT','EXP-{YYYY}-{000001}'),('PAYMENT','PAY-{YYYY}-{000001}'),('MANIFEST','MAN-{YYYY}-{000001}')
)x(type,format) on conflict(org_id,document_type) do nothing;

create index if not exists idx_settings_workspaces_org on organization_workspaces(org_id,status);
create index if not exists idx_settings_locations_org on organization_locations(org_id,status,location_type);
create index if not exists idx_settings_integrations_org on organization_integrations(org_id,status);
create index if not exists idx_settings_data_requests_org on organization_data_requests(org_id,created_at desc);
revoke all on organization_workspaces,organization_locations,organization_integrations,document_numbering_settings,organization_billing_profiles,organization_data_requests,developer_api_keys from public;
