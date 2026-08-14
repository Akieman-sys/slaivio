-- SLAIVIO Service Catalog & Service Operations Center.
-- Routes, Pricing, Departures, Documents and Warehouses remain sources of truth.
alter table shipping_services add column if not exists description text;
alter table shipping_services add column if not exists workspace_id text;
alter table shipping_services add column if not exists category text not null default 'TRANSPORT';
alter table shipping_services add column if not exists status text not null default 'ACTIVE';
alter table shipping_services add column if not exists availability text not null default 'AVAILABLE';
alter table shipping_services add column if not exists owner_id text;
alter table shipping_services add column if not exists owner_name text;
alter table shipping_services add column if not exists public_visible boolean not null default false;
alter table shipping_services add column if not exists quote_only boolean not null default false;
alter table shipping_services add column if not exists seasonal_from date;
alter table shipping_services add column if not exists seasonal_until date;
alter table shipping_services add column if not exists minimum_weight_kg numeric(18,3);
alter table shipping_services add column if not exists minimum_cbm numeric(18,4);
alter table shipping_services add column if not exists minimum_value numeric(18,2);
alter table shipping_services add column if not exists maximum_dimensions_cm jsonb not null default '{}';
alter table shipping_services add column if not exists maximum_declared_value numeric(18,2);
alter table shipping_services add column if not exists cutoff_hours integer;
alter table shipping_services add column if not exists sla_target_percent numeric(6,2) not null default 90;
alter table shipping_services add column if not exists workflow jsonb not null default '["REQUESTED","ACCEPTED","IN_PROGRESS","COMPLETED","CANCELLED"]';
alter table shipping_services add column if not exists public_description text;
alter table shipping_services add column if not exists archived_at timestamptz;
alter table shipping_services drop constraint if exists shipping_services_status_check;
alter table shipping_services add constraint shipping_services_status_check check(status in('DRAFT','ACTIVE','LIMITED','SUSPENDED','INACTIVE','ARCHIVED'));
alter table shipping_services drop constraint if exists shipping_services_availability_check;
alter table shipping_services add constraint shipping_services_availability_check check(availability in('AVAILABLE','LIMITED','TEMPORARILY_UNAVAILABLE','SUSPENDED','QUOTE_ONLY'));

create table if not exists service_route_offerings(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),service_id uuid not null references shipping_services(id) on delete cascade,route_id uuid not null references shipping_routes(id),workspace_id text not null default 'ORGANIZATION',
 origin_warehouse_id uuid references warehouses(id),destination_office_id uuid references agency_offices(id),availability text not null default 'AVAILABLE' check(availability in('AVAILABLE','LIMITED','TEMPORARILY_UNAVAILABLE','SUSPENDED','QUOTE_ONLY')),
 eta_min_days integer,eta_max_days integer,cutoff_hours integer,capacity_weight_kg numeric(18,3),capacity_cbm numeric(18,4),effective_from timestamptz not null default now(),effective_until timestamptz,
 public_visible boolean not null default false,metadata jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(service_id,route_id,workspace_id)
);
create table if not exists service_options(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),service_id uuid not null references shipping_services(id) on delete cascade,option_service_id uuid references shipping_services(id),option_code text not null,name text not null,description text,mandatory boolean not null default false,dependency_stage text,active boolean not null default true,configuration jsonb not null default '{}',unique(service_id,option_code)
);
create table if not exists service_bundles(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),workspace_id text,bundle_code text not null,name text not null,description text,status text not null default 'DRAFT' check(status in('DRAFT','ACTIVE','SUSPENDED','ARCHIVED')),public_visible boolean not null default false,created_by text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,bundle_code)
);
create table if not exists service_bundle_items(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),bundle_id uuid not null references service_bundles(id) on delete cascade,service_id uuid not null references shipping_services(id),mandatory boolean not null default true,position integer not null default 1,configuration jsonb not null default '{}',unique(bundle_id,service_id));
create table if not exists service_documents(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),service_id uuid not null references shipping_services(id) on delete cascade,route_id uuid references shipping_routes(id),document_type text not null,mandatory boolean not null default true,conditions jsonb not null default '{}',active boolean not null default true,unique(service_id,route_id,document_type)
);
create table if not exists service_local_zones(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),service_id uuid not null references shipping_services(id) on delete cascade,country text not null,city text not null,zone_name text not null,max_distance_km numeric(12,2),promised_hours integer,active boolean not null default true,unique(service_id,country,city,zone_name)
);
create table if not exists service_templates(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),template_code text not null,name text not null,category text not null,configuration jsonb not null default '{}',active boolean not null default true,created_by text,created_at timestamptz not null default now(),unique(org_id,template_code));
create table if not exists service_saved_views(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),user_id text not null,name text not null,filters jsonb not null default '{}',created_at timestamptz not null default now(),unique(org_id,user_id,name));
create table if not exists service_alerts(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),service_id uuid not null references shipping_services(id),route_id uuid references shipping_routes(id),alert_type text not null,severity text not null default 'MEDIUM',message text not null,status text not null default 'OPEN',resolved_by text,resolved_at timestamptz,created_at timestamptz not null default now(),unique(service_id,alert_type,status));
create table if not exists service_audit_events(id bigserial primary key,org_id text not null references organizations(id),service_id uuid references shipping_services(id),event_type text not null,old_values jsonb,new_values jsonb,reason text,actor_id text not null,actor_name text,created_at timestamptz not null default now());
create table if not exists service_settings(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) unique,default_sla_percent numeric(6,2) not null default 90,performance_alert_percent numeric(6,2) not null default 80,inactivity_alert_days integer not null default 90,allow_public_catalog boolean not null default false,updated_by text,updated_at timestamptz not null default now());
create index if not exists idx_services_catalog on shipping_services(org_id,workspace_id,status,category,shipping_mode);
create index if not exists idx_service_offerings_scope on service_route_offerings(org_id,workspace_id,service_id,route_id,availability);
create index if not exists idx_service_options on service_options(org_id,service_id,active);
create index if not exists idx_service_alerts_open on service_alerts(org_id,status,severity);
insert into service_route_offerings(org_id,service_id,route_id,workspace_id,availability,eta_min_days,eta_max_days,public_visible)
select org_id,id,route_id,coalesce(workspace_id,'ORGANIZATION'),availability,eta_min_days,eta_max_days,public_visible from shipping_services where route_id is not null
on conflict(service_id,route_id,workspace_id) do nothing;
insert into service_settings(org_id) select id from organizations on conflict(org_id) do nothing;
insert into permissions(permission_code,description) values
 ('services.read','Consulter le catalogue de services'),('services.create','Créer un service'),('services.update','Modifier conditions et disponibilité'),('services.suspend','Suspendre et réactiver un service'),('services.routes','Gérer les routes proposées'),('services.conditions','Gérer restrictions et documents'),('services.bundles','Gérer bundles et options'),('services.performance','Consulter les performances'),('services.finance','Consulter revenus, coûts et marges'),('services.analytics','Consulter les analytics Services'),('services.export','Exporter le catalogue'),('services.settings','Gérer les paramètres Services')
on conflict(permission_code) do update set description=excluded.description;
insert into role_permissions(role_id,permission_id) select r.id,p.id from organization_roles r cross join permissions p where
 (r.role_code='OWNER' and p.permission_code like 'services.%') or
 (r.role_code='MANAGER' and p.permission_code in('services.read','services.create','services.update','services.suspend','services.routes','services.conditions','services.bundles','services.performance','services.analytics','services.export','services.settings')) or
 (r.role_code in('OPERATOR','WAREHOUSE','SUPPORT') and p.permission_code in('services.read','services.performance')) or
 (r.role_code='FINANCE' and p.permission_code in('services.read','services.performance','services.finance','services.analytics'))
on conflict do nothing;
