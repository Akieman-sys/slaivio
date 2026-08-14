-- Batch / Groupage Control Center. Additive and idempotent.
alter table shipment_batches add column if not exists workspace_id text;
alter table shipment_batches add column if not exists route_id uuid references shipping_routes(id);
alter table shipment_batches add column if not exists shipping_service_id uuid references shipping_services(id);
alter table shipment_batches add column if not exists departure_id uuid references cargo_departures(id);
alter table shipment_batches add column if not exists destination_office_id uuid references agency_offices(id);
alter table shipment_batches add column if not exists responsible_id text;
alter table shipment_batches add column if not exists responsible_name text;
alter table shipment_batches add column if not exists cutoff_at timestamptz;
alter table shipment_batches add column if not exists planned_departure_at timestamptz;
alter table shipment_batches add column if not exists capacity_weight_kg numeric(18,3);
alter table shipment_batches add column if not exists capacity_cbm numeric(18,4);
alter table shipment_batches add column if not exists capacity_packages integer;
alter table shipment_batches add column if not exists capacity_value numeric(18,2);
alter table shipment_batches add column if not exists near_capacity_percent numeric(5,2) not null default 85;
alter table shipment_batches add column if not exists override_capacity boolean not null default false;
alter table shipment_batches add column if not exists block_reason text;
alter table shipment_batches add column if not exists converted_expedition_id uuid references cargo_expeditions(id);
alter table shipment_batches add column if not exists row_version integer not null default 1;
alter table shipment_batches add column if not exists archived_at timestamptz;

update shipment_batches set status=case status
 when 'CREATED' then 'DRAFT' when 'READY' then 'READY_FOR_SHIPMENT'
 when 'DISPATCHED' then 'CONVERTED_TO_SHIPMENT' when 'DELAYED' then 'BLOCKED'
 when 'ARRIVED' then 'CONVERTED_TO_SHIPMENT'
 when 'READY_FOR_DEPARTURE' then 'READY_FOR_SHIPMENT'
 when 'DEPARTED' then 'CONVERTED_TO_SHIPMENT'
 when 'IN_TRANSIT' then 'CONVERTED_TO_SHIPMENT'
 when 'ARRIVED_HUB' then 'CONVERTED_TO_SHIPMENT'
 when 'ARRIVED_DESTINATION' then 'CONVERTED_TO_SHIPMENT'
 when 'COMPLETED' then 'CONVERTED_TO_SHIPMENT'
 else 'BLOCKED' end
where status not in('DRAFT','OPEN','PREPARING','NEAR_CAPACITY','FULL','PENDING_VALIDATION','READY_FOR_SHIPMENT','CONVERTED_TO_SHIPMENT','BLOCKED','CANCELLED','ARCHIVED');
alter table shipment_batches drop constraint if exists shipment_batches_status_check;
alter table shipment_batches add constraint shipment_batches_status_check check(status in('DRAFT','OPEN','PREPARING','NEAR_CAPACITY','FULL','PENDING_VALIDATION','READY_FOR_SHIPMENT','CONVERTED_TO_SHIPMENT','BLOCKED','CANCELLED','ARCHIVED'));
alter table shipment_batches drop constraint if exists shipment_batches_capacity_check;
alter table shipment_batches add constraint shipment_batches_capacity_check check(
 (capacity_weight_kg is null or capacity_weight_kg>0) and (capacity_cbm is null or capacity_cbm>0)
 and (capacity_packages is null or capacity_packages>0) and near_capacity_percent between 1 and 100);

create table if not exists batch_package_items(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),
 batch_id uuid not null references shipment_batches(id) on delete cascade,
 package_id uuid not null references cargo_packages(id),load_order integer,scan_status text not null default 'PLANNED' check(scan_status in('PLANNED','SCANNED','MISSING','REMOVED')),
 added_by text not null,added_by_name text,added_at timestamptz not null default now(),removed_by text,removed_at timestamptz,removal_reason text,
 unique(batch_id,package_id)
);
create unique index if not exists uq_active_package_batch on batch_package_items(package_id) where removed_at is null;
create table if not exists batch_checklist(batch_id uuid primary key references shipment_batches(id) on delete cascade,org_id text not null references organizations(id),compatibility boolean not null default false,weight_verified boolean not null default false,cbm_verified boolean not null default false,no_blocked_packages boolean not null default false,documents_ready boolean not null default false,payments_compliant boolean not null default false,capacity_compliant boolean not null default false,manager_approved boolean not null default false,updated_by text,updated_at timestamptz not null default now());
create table if not exists batch_alerts(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),batch_id uuid references shipment_batches(id) on delete cascade,package_id uuid references cargo_packages(id),alert_type text not null,severity text not null default 'MEDIUM',message text not null,status text not null default 'OPEN' check(status in('OPEN','ACKNOWLEDGED','RESOLVED')),assigned_to text,resolution text,resolved_by text,resolved_at timestamptz,created_at timestamptz not null default now(),unique(batch_id,package_id,alert_type,status));
create table if not exists batch_notes(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),batch_id uuid not null references shipment_batches(id) on delete cascade,body text not null,author_id text not null,author_name text,created_at timestamptz not null default now());
create table if not exists batch_templates(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),name text not null,workspace_id text,route_id uuid references shipping_routes(id),shipping_service_id uuid references shipping_services(id),origin_warehouse_id uuid references warehouses(id),batch_type text not null,capacity_weight_kg numeric,capacity_cbm numeric,capacity_packages integer,cutoff_hours integer,active boolean not null default true,created_at timestamptz not null default now(),unique(org_id,name));
create table if not exists batch_recurrences(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),template_id uuid not null references batch_templates(id),frequency text not null,weekdays integer[] not null default '{}',next_run_at timestamptz not null,active boolean not null default true,created_at timestamptz not null default now());
create table if not exists batch_saved_views(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),user_id text not null,name text not null,filters jsonb not null default '{}',created_at timestamptz not null default now(),unique(org_id,user_id,name));
create table if not exists batch_audit_events(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),batch_id uuid references shipment_batches(id),event_type text not null,old_values jsonb,new_values jsonb,reason text,actor_id text not null,actor_name text,created_at timestamptz not null default now());
create table if not exists expedition_batches(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),expedition_id uuid not null references cargo_expeditions(id),batch_id uuid not null references shipment_batches(id),created_at timestamptz not null default now(),unique(expedition_id,batch_id));

create index if not exists idx_batch_center_list on shipment_batches(org_id,status,cutoff_at,created_at desc) where archived_at is null;
create index if not exists idx_batch_packages on batch_package_items(org_id,batch_id,scan_status) where removed_at is null;
create index if not exists idx_batch_alerts on batch_alerts(org_id,status,severity,created_at desc);

insert into permissions(permission_code,description) values
 ('batches.read','Consulter les batchs et colis compatibles'),('batches.create','Créer les batchs'),('batches.add','Ajouter et scanner des colis'),('batches.remove','Retirer des colis'),('batches.validate','Valider ou rouvrir un batch'),('batches.override','Dépasser une capacité'),('batches.convert','Créer une expédition depuis un batch'),('batches.manage','Gérer modèles, récurrences et paramètres'),('batches.analytics','Consulter les analytics'),('batches.export','Exporter les batchs')
on conflict(permission_code) do update set description=excluded.description;
insert into role_permissions(role_id,permission_id) select r.id,p.id from organization_roles r cross join permissions p where
 (r.role_code in('OWNER','MANAGER') and p.permission_code like 'batches.%') or
 (r.role_code in('OPERATOR','WAREHOUSE') and p.permission_code in('batches.read','batches.create','batches.add','batches.remove','batches.validate','batches.export')) or
 (r.role_code='FINANCE' and p.permission_code='batches.read') on conflict do nothing;
