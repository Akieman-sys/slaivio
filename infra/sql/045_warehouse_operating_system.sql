-- Warehouse Operating System completion. Safe to rerun.
alter table warehouses add column if not exists latitude numeric(10,7);
alter table warehouses add column if not exists longitude numeric(10,7);
alter table warehouses add column if not exists contact_email text;
alter table warehouses add column if not exists opening_hours jsonb not null default '{}'::jsonb;

alter table warehouse_slots add column if not exists zone_type text not null default 'GENERAL';
alter table warehouse_slots add column if not exists responsible_id text;
alter table warehouse_slots add column if not exists responsible_name text;

create table if not exists warehouse_intakes(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),warehouse_id uuid not null references warehouses(id),
 intake_reference text not null,package_id uuid references cargo_packages(id),status text not null default 'PENDING_IDENTIFICATION'
  check(status in ('PENDING_IDENTIFICATION','IDENTIFIED','QC_PENDING','QC_APPROVED','QC_BLOCKED','STORED','CANCELLED')),
 supplier_name text,supplier_phone text,shipping_mark text,supplier_tracking text,order_reference text,
 recipient_name text,recipient_phone text,destination_country text,destination_city text,description text,
 declared_weight_kg numeric(12,3),measured_weight_kg numeric(12,3),length_cm numeric(12,2),width_cm numeric(12,2),height_cm numeric(12,2),
 volume_cbm numeric(14,6),volumetric_weight_kg numeric(12,3),condition text not null default 'UNKNOWN',notes text,
 source text not null default 'MANUAL',idempotency_key text,received_by text not null,received_by_name text,received_at timestamptz not null default now(),
 row_version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(org_id,intake_reference),unique(org_id,idempotency_key)
);
create index if not exists idx_warehouse_intakes_queue on warehouse_intakes(org_id,warehouse_id,status,received_at desc);

create table if not exists warehouse_quality_checks(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),warehouse_id uuid not null references warehouses(id),
 intake_id uuid references warehouse_intakes(id),package_id uuid references cargo_packages(id),status text not null default 'DRAFT'
  check(status in ('DRAFT','APPROVED','BLOCKED')),
 damaged boolean not null default false,torn boolean not null default false,wet boolean not null default false,broken boolean not null default false,
 missing_items boolean not null default false,packaging_ok boolean not null default true,weight_verified boolean not null default false,
 dimensions_verified boolean not null default false,label_verified boolean not null default false,photos_taken boolean not null default false,
 comments text,checked_by text not null,checked_by_name text,checked_at timestamptz not null default now(),row_version integer not null default 1,
 unique(org_id,intake_id)
);

create table if not exists warehouse_scan_sessions(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),warehouse_id uuid not null references warehouses(id),
 session_reference text not null,status text not null default 'OPEN' check(status in ('OPEN','COMPLETED','CANCELLED')),
 scan_type text not null default 'RECEIPT',scanned_count integer not null default 0,duplicate_count integer not null default 0,error_count integer not null default 0,
 created_by text not null,created_by_name text,completed_at timestamptz,created_at timestamptz not null default now(),unique(org_id,session_reference)
);
create table if not exists warehouse_scan_items(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),session_id uuid not null references warehouse_scan_sessions(id) on delete cascade,
 scan_value text not null,package_id uuid references cargo_packages(id),result text not null check(result in ('FOUND','DUPLICATE','UNKNOWN','ERROR')),
 location_label text,scanned_by text not null,created_at timestamptz not null default now(),unique(session_id,scan_value)
);

create table if not exists warehouse_groups(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),warehouse_id uuid not null references warehouses(id),
 group_reference text not null,group_type text not null check(group_type in ('AIR','SEA','EXPRESS','LOCAL')),
 status text not null default 'DRAFT' check(status in ('DRAFT','READY','LOADING','LOADED','DISPATCHED','CANCELLED')),
 destination_country text,destination_city text,expedition_id uuid references cargo_expeditions(id),container_number text,
 notes text,created_by text not null,created_by_name text,row_version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,group_reference)
);
create table if not exists warehouse_group_items(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),group_id uuid not null references warehouse_groups(id) on delete cascade,
 package_id uuid not null references cargo_packages(id),loaded_at timestamptz,loaded_by text,created_at timestamptz not null default now(),unique(group_id,package_id)
);

create table if not exists warehouse_alert_rules(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),warehouse_id uuid references warehouses(id),
 rule_type text not null,threshold numeric,enabled boolean not null default true,severity text not null default 'HIGH',created_at timestamptz not null default now(),
 unique(org_id,warehouse_id,rule_type)
);
alter table warehouse_anomalies add column if not exists detection_key text;
create unique index if not exists uq_warehouse_detected_alert on warehouse_anomalies(org_id,detection_key) where detection_key is not null and status in ('OPEN','IN_REVIEW');

insert into permissions(permission_code,description) values
 ('warehouses.receive','Réceptionner et identifier les colis'),('warehouses.weigh','Peser et mesurer les colis'),
 ('warehouses.quality','Effectuer le contrôle qualité'),('warehouses.group','Créer les groupages et chargements'),
 ('warehouses.print','Imprimer étiquettes, listes et manifestes')
on conflict(permission_code) do update set description=excluded.description;

insert into organization_roles(org_id,role_code,role_name,description,system_role)
select o.id,v.code,v.name,v.description,true from organizations o cross join(values
 ('RECEIVER','Réceptionnaire','Réception, scan et identification des colis'),
 ('WEIGHER','Peseur','Pesage et mesure des colis'),
 ('QUALITY_CONTROLLER','Contrôleur qualité','Contrôle qualité et anomalies'),
 ('WAREHOUSE_SUPERVISOR','Superviseur entrepôt','Supervision complète des opérations WMS')
) as v(code,name,description) on conflict(org_id,role_code) do nothing;

insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r join permissions p on
 (r.role_code in ('OWNER','MANAGER','WAREHOUSE') and p.permission_code like 'warehouses.%') or
 (r.role_code='WAREHOUSE_SUPERVISOR' and p.permission_code like 'warehouses.%') or
 (r.role_code='RECEIVER' and p.permission_code in ('warehouses.read','warehouses.receive','warehouses.move','warehouses.print')) or
 (r.role_code='WEIGHER' and p.permission_code in ('warehouses.read','warehouses.weigh')) or
 (r.role_code='QUALITY_CONTROLLER' and p.permission_code in ('warehouses.read','warehouses.quality','warehouses.alerts')) or
 (r.role_code='OPERATOR' and p.permission_code in ('warehouses.read','warehouses.receive','warehouses.weigh','warehouses.quality','warehouses.move','warehouses.group','warehouses.print'))
on conflict do nothing;

revoke all on warehouse_intakes,warehouse_quality_checks,warehouse_scan_sessions,warehouse_scan_items,warehouse_groups,warehouse_group_items,warehouse_alert_rules from public;
