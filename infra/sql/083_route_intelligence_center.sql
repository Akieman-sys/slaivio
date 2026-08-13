-- SLAIVIO Route Management & Route Intelligence Center.
-- Additive: Services, Pricing, Departures, Shipments and Tracking remain sources of truth.
alter table shipping_routes add column if not exists description text;
alter table shipping_routes add column if not exists workspace_id text;
alter table shipping_routes add column if not exists owner_id text;
alter table shipping_routes add column if not exists owner_name text;
alter table shipping_routes add column if not exists status text not null default 'ACTIVE';
alter table shipping_routes add column if not exists direction text not null default 'ONE_WAY';
alter table shipping_routes add column if not exists origin_warehouse_id uuid references warehouses(id);
alter table shipping_routes add column if not exists origin_hub text;
alter table shipping_routes add column if not exists destination_office_id uuid references agency_offices(id);
alter table shipping_routes add column if not exists destination_hub text;
alter table shipping_routes add column if not exists announced_eta_days numeric(8,2);
alter table shipping_routes add column if not exists processing_days numeric(8,2) not null default 0;
alter table shipping_routes add column if not exists customs_days numeric(8,2) not null default 0;
alter table shipping_routes add column if not exists final_delivery_days numeric(8,2) not null default 0;
alter table shipping_routes add column if not exists weekly_capacity_kg numeric(18,3);
alter table shipping_routes add column if not exists weekly_capacity_cbm numeric(18,4);
alter table shipping_routes add column if not exists departure_capacity_kg numeric(18,3);
alter table shipping_routes add column if not exists departure_capacity_cbm numeric(18,4);
alter table shipping_routes add column if not exists availability text not null default 'AVAILABLE';
alter table shipping_routes add column if not exists public_visible boolean not null default false;
alter table shipping_routes add column if not exists default_route boolean not null default false;
alter table shipping_routes add column if not exists alternative_route_id uuid references shipping_routes(id);
alter table shipping_routes add column if not exists suspended_at timestamptz;
alter table shipping_routes add column if not exists suspension_reason text;
alter table shipping_routes add column if not exists suspension_ends_at timestamptz;
alter table shipping_routes add column if not exists minimum_weight_kg numeric(18,3);
alter table shipping_routes add column if not exists maximum_weight_kg numeric(18,3);
alter table shipping_routes add column if not exists minimum_cbm numeric(18,4);
alter table shipping_routes add column if not exists maximum_declared_value numeric(18,2);
alter table shipping_routes drop constraint if exists shipping_routes_status_check;
alter table shipping_routes add constraint shipping_routes_status_check check(status in('DRAFT','ACTIVE','LIMITED','SUSPENDED','MAINTENANCE','INACTIVE','ARCHIVED'));
alter table shipping_routes drop constraint if exists shipping_routes_direction_check;
alter table shipping_routes add constraint shipping_routes_direction_check check(direction in('ONE_WAY','BIDIRECTIONAL'));
alter table shipping_routes drop constraint if exists shipping_routes_availability_check;
alter table shipping_routes add constraint shipping_routes_availability_check check(availability in('AVAILABLE','LIMITED','FULL','SUSPENDED','UNAVAILABLE'));
update shipping_routes set status=case when archived_at is not null then 'ARCHIVED' when active then 'ACTIVE' else 'INACTIVE' end where status is null or status='ACTIVE';

create table if not exists route_legs(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),route_id uuid not null references shipping_routes(id) on delete cascade,
 position integer not null check(position>0),origin_country text,origin_city text,origin_hub text,destination_country text,destination_city text,destination_hub text,
 transport_mode text not null,planned_duration_hours integer not null default 0,carrier_id uuid,carrier_name text,metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(route_id,position)
);
create table if not exists route_carriers(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),route_id uuid not null references shipping_routes(id) on delete cascade,
 carrier_name text not null,carrier_type text not null,priority integer not null default 100,airline_code text,shipping_line text,flight_number text,vessel text,voyage text,
 truck_type text,border_crossings text[],awb_rules text,bl_settings text,active boolean not null default true,created_at timestamptz not null default now(),unique(route_id,carrier_name)
);
create table if not exists route_restrictions(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),route_id uuid not null references shipping_routes(id) on delete cascade,
 goods_category text not null,decision text not null check(decision in('ALLOWED','CONDITIONAL','PROHIBITED')),conditions text,required_documents text[] not null default '{}',
 max_weight_kg numeric(18,3),max_volume_cbm numeric(18,4),max_declared_value numeric(18,2),active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(route_id,goods_category)
);
create table if not exists route_suspensions(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),route_id uuid not null references shipping_routes(id),reason_code text not null,
 reason text not null,starts_at timestamptz not null default now(),estimated_end_at timestamptz,impact_snapshot jsonb not null default '{}'::jsonb,status text not null default 'ACTIVE' check(status in('ACTIVE','ENDED')),
 created_by text not null,ended_by text,ended_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists route_saved_views(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),user_id text not null,name text not null,filters jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),unique(org_id,user_id,name));
create table if not exists route_alerts(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),route_id uuid not null references shipping_routes(id),alert_type text not null,severity text not null default 'MEDIUM',message text not null,status text not null default 'OPEN',resolved_by text,resolved_at timestamptz,created_at timestamptz not null default now(),unique(route_id,alert_type,status));
create table if not exists route_settings(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) unique,route_code_pattern text not null default 'RT-{ORIGIN}-{DESTINATION}-{MODE}',low_ontime_threshold numeric(5,2) not null default 80,high_capacity_threshold numeric(5,2) not null default 95,low_capacity_threshold numeric(5,2) not null default 30,updated_by text,updated_at timestamptz not null default now());

create index if not exists idx_routes_intelligence_scope on shipping_routes(org_id,workspace_id,status,transport_mode);
create index if not exists idx_route_legs_org on route_legs(org_id,route_id,position);
create index if not exists idx_route_restrictions_org on route_restrictions(org_id,route_id,decision);
create index if not exists idx_route_suspensions_active on route_suspensions(org_id,route_id,status);
create index if not exists idx_route_alerts_open on route_alerts(org_id,status,severity);

insert into permissions(permission_code,description) values
 ('routes.create','Créer une route'),('routes.update','Modifier une route'),('routes.suspend','Suspendre et réactiver une route'),('routes.carriers','Gérer les transporteurs de route'),
 ('routes.restrictions','Gérer les restrictions et documents'),('routes.performance','Consulter les performances'),('routes.finance','Consulter coûts et rentabilité'),
 ('routes.analytics','Consulter les analytics Routes'),('routes.export','Exporter les routes'),('routes.settings','Gérer les paramètres Routes')
on conflict(permission_code) do update set description=excluded.description;
insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r cross join permissions p where
 (r.role_code='OWNER' and p.permission_code like 'routes.%') or
 (r.role_code='MANAGER' and p.permission_code in('routes.read','routes.manage','routes.create','routes.update','routes.suspend','routes.carriers','routes.restrictions','routes.performance','routes.analytics','routes.export','routes.settings')) or
 (r.role_code in('OPERATOR','WAREHOUSE') and p.permission_code in('routes.read','routes.performance')) or
 (r.role_code='FINANCE' and p.permission_code in('routes.read','routes.performance','routes.finance','routes.analytics'))
on conflict do nothing;
insert into route_settings(org_id) select id from organizations on conflict(org_id) do nothing;
