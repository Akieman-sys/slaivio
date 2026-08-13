-- Complete physical parcel lifecycle; additive and idempotent.
alter table cargo_packages add column if not exists supplier_tracking text;
alter table cargo_packages add column if not exists shipping_mark text;
alter table cargo_packages add column if not exists order_number text;
alter table cargo_packages add column if not exists external_reference text;
alter table cargo_packages add column if not exists subcategory text;
alter table cargo_packages add column if not exists goods_classification text not null default 'ORDINARY_GOODS';
alter table cargo_packages add column if not exists declared_weight_kg numeric(14,3);
alter table cargo_packages add column if not exists chargeable_weight_kg numeric(14,3);
alter table cargo_packages add column if not exists receiving_mode text;
alter table cargo_packages add column if not exists received_by text;
alter table cargo_packages add column if not exists route_id uuid references shipping_routes(id);
alter table cargo_packages add column if not exists shipping_service_id uuid references shipping_services(id);
alter table cargo_packages add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb;
alter table cargo_packages add column if not exists expected_at timestamptz;
alter table cargo_packages add column if not exists expectation_status text;
alter table cargo_packages add column if not exists return_status text;
alter table cargo_packages add column if not exists return_reason text;
alter table cargo_packages add column if not exists delivered_to_name text;
alter table cargo_packages add column if not exists delivery_signature_path text;
alter table cargo_packages add column if not exists delivery_photo_path text;
alter table cargo_packages add column if not exists delivery_otp_verified boolean not null default false;

alter table cargo_packages drop constraint if exists cargo_packages_status_check;
-- Conserver une trace avant toute normalisation des anciens statuts. Cette table
-- rend la migration réexécutable et permet d'auditer/restaurer la valeur source.
create table if not exists package_status_migration_audit(
 id bigserial primary key,
 package_id uuid not null references cargo_packages(id) on delete cascade,
 org_id text not null references organizations(id),
 previous_status text,
 normalized_status text not null,
 migration_name text not null,
 migrated_at timestamptz not null default now(),
 unique(package_id,migration_name)
);

insert into package_status_migration_audit(package_id,org_id,previous_status,normalized_status,migration_name)
select id,org_id,status,
 case upper(trim(coalesce(status,'')))
  when '' then 'PENDING_VALIDATION'
  when 'PENDING' then 'PENDING_VALIDATION'
  when 'VALIDATED' then 'CONFIRMED'
  when 'APPROVED' then 'CONFIRMED'
  when 'IN_WAREHOUSE' then 'WAREHOUSED'
  when 'STORED' then 'WAREHOUSED'
  when 'READY' then 'READY_FOR_DISPATCH'
  when 'READY_TO_SHIP' then 'READY_FOR_DISPATCH'
  when 'READY_FOR_DEPARTURE' then 'READY_FOR_DISPATCH'
  when 'DISPATCHED' then 'SHIPPED'
  when 'ARRIVED_HUB' then 'ARRIVED'
  when 'CUSTOMS_CLEARANCE' then 'CUSTOMS'
  when 'AVAILABLE_FOR_PICKUP' then 'READY_FOR_PICKUP'
  when 'OUT_FOR_DELIVERY' then 'READY_FOR_PICKUP'
  when 'ARCHIVED' then 'CANCELLED'
  else 'ISSUE'
 end,
 '076_packages_physical_os'
from cargo_packages
where status is null or upper(trim(status)) not in('CREATED','PENDING_VALIDATION','CONFIRMED','RECEIVED','RECEIVED_AT_ORIGIN','WAREHOUSED','WAREHOUSE_PROCESSING','READY_FOR_BATCH','READY_FOR_DISPATCH','BATCHED','SHIPPED','IN_TRANSIT','CUSTOMS','ARRIVED','ARRIVED_DESTINATION','CLEARED','READY_FOR_PICKUP','DELIVERED','BLOCKED','ISSUE','CANCELLED','RETURNED')
on conflict(package_id,migration_name) do nothing;

update cargo_packages p set status=a.normalized_status,updated_at=now()
from package_status_migration_audit a
where a.package_id=p.id and a.migration_name='076_packages_physical_os'
  and (p.status is null or upper(trim(p.status)) not in('CREATED','PENDING_VALIDATION','CONFIRMED','RECEIVED','RECEIVED_AT_ORIGIN','WAREHOUSED','WAREHOUSE_PROCESSING','READY_FOR_BATCH','READY_FOR_DISPATCH','BATCHED','SHIPPED','IN_TRANSIT','CUSTOMS','ARRIVED','ARRIVED_DESTINATION','CLEARED','READY_FOR_PICKUP','DELIVERED','BLOCKED','ISSUE','CANCELLED','RETURNED'));

alter table cargo_packages add constraint cargo_packages_status_check check(status in('CREATED','PENDING_VALIDATION','CONFIRMED','RECEIVED','RECEIVED_AT_ORIGIN','WAREHOUSED','WAREHOUSE_PROCESSING','READY_FOR_BATCH','READY_FOR_DISPATCH','BATCHED','SHIPPED','IN_TRANSIT','CUSTOMS','ARRIVED','ARRIVED_DESTINATION','CLEARED','READY_FOR_PICKUP','DELIVERED','BLOCKED','ISSUE','CANCELLED','RETURNED'));

create table if not exists package_quality_controls(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),package_id uuid not null references cargo_packages(id) on delete cascade,
 packaging_intact boolean,label_readable boolean,product_compliant boolean,quantity_compliant boolean,no_damage boolean,no_moisture boolean,
 result text not null check(result in('COMPLIANT','REVIEW','NON_COMPLIANT')),notes text,checked_by text not null,checked_at timestamptz not null default now()
);
create table if not exists package_expectations(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),client_id uuid not null references clients(id),dossier_id uuid references dossiers(id),
 supplier_tracking text not null,shipping_mark text,order_number text,description text,expected_warehouse_id uuid references warehouses(id),expected_at timestamptz,
 status text not null default 'EXPECTED' check(status in('EXPECTED','MATCHED','CANCELLED','EXPIRED')),matched_package_id uuid references cargo_packages(id),created_by text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,supplier_tracking)
);
create table if not exists package_delivery_proofs(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),package_id uuid not null references cargo_packages(id),pickup_id uuid,
 recipient_name text not null,recipient_document text,signature_path text,photo_path text,otp_verified boolean not null default false,delivered_by text not null,delivered_at timestamptz not null default now()
);
create table if not exists package_saved_views(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),user_id text not null,name text not null,filters jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),unique(org_id,user_id,name));
create table if not exists package_operational_alerts(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),package_id uuid not null references cargo_packages(id),alert_type text not null,severity text not null default 'MEDIUM',status text not null default 'OPEN',message text not null,assigned_to text,resolution text,resolved_by text,resolved_at timestamptz,created_at timestamptz not null default now(),unique(package_id,alert_type,status));
alter table package_operational_alerts add column if not exists resolution text;
create table if not exists package_bulk_operations(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),idempotency_key text not null,operation_type text not null,package_ids uuid[] not null,payload jsonb not null default '{}'::jsonb,status text not null default 'PENDING',result jsonb not null default '{}'::jsonb,created_by text not null,created_at timestamptz not null default now(),completed_at timestamptz,unique(org_id,idempotency_key));

create index if not exists idx_packages_supplier_tracking on cargo_packages(org_id,supplier_tracking) where deleted_at is null;
create index if not exists idx_packages_shipping_mark on cargo_packages(org_id,shipping_mark) where deleted_at is null;
create index if not exists idx_package_expectations_match on package_expectations(org_id,supplier_tracking,status);
create index if not exists idx_package_alerts_org on package_operational_alerts(org_id,status,severity,created_at desc);
create index if not exists idx_package_qc on package_quality_controls(org_id,package_id,checked_at desc);

insert into permissions(permission_code,description) values
 ('packages.scan','Scanner et lire les étiquettes'),('packages.weigh','Peser un colis'),('packages.move','Déplacer un colis'),('packages.quality','Effectuer le contrôle qualité'),('packages.anomalies','Gérer les anomalies'),('packages.pricing','Calculer le prix d’un colis'),('packages.assign','Affecter à un départ ou une expédition'),('packages.bulk','Exécuter les opérations de masse'),('packages.delivery','Enregistrer une preuve de livraison'),('packages.finance','Voir les montants liés au colis')
on conflict(permission_code) do update set description=excluded.description;
insert into role_permissions(role_id,permission_id) select r.id,p.id from organization_roles r cross join permissions p where
 (r.role_code in('OWNER','MANAGER') and p.permission_code like 'packages.%') or
 (r.role_code in('OPERATOR','WAREHOUSE') and p.permission_code in('packages.scan','packages.weigh','packages.move','packages.quality','packages.anomalies','packages.assign','packages.delivery')) or
 (r.role_code='FINANCE' and p.permission_code in('packages.finance','packages.pricing'))
on conflict do nothing;
