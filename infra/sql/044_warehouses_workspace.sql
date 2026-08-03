-- Slaivio warehouse workspace: tenant-safe capacity, locations, transfers,
-- cycle counts, anomalies and immutable mutation audit.
alter table warehouses drop constraint if exists warehouses_warehouse_code_key;
create unique index if not exists uq_warehouses_org_code on warehouses(org_id, warehouse_code);

alter table warehouses add column if not exists capacity_packages integer check (capacity_packages is null or capacity_packages >= 0);
alter table warehouses add column if not exists capacity_weight_kg numeric(14,3) check (capacity_weight_kg is null or capacity_weight_kg >= 0);
alter table warehouses add column if not exists capacity_volume_cbm numeric(14,4) check (capacity_volume_cbm is null or capacity_volume_cbm >= 0);
alter table warehouses add column if not exists manager_id text;
alter table warehouses add column if not exists manager_name text;
alter table warehouses add column if not exists timezone text not null default 'UTC';
alter table warehouses add column if not exists row_version integer not null default 1;
alter table warehouses add column if not exists archived_at timestamptz;

create table if not exists warehouse_slots (
 id uuid primary key default gen_random_uuid(), org_id text not null references organizations(id),
 warehouse_id uuid not null references warehouses(id) on delete cascade, code text not null,
 zone text, aisle text, rack text, shelf text, position text,
 capacity_packages integer check (capacity_packages is null or capacity_packages >= 0),
 capacity_weight_kg numeric(14,3), capacity_volume_cbm numeric(14,4),
 status text not null default 'AVAILABLE' check(status in ('AVAILABLE','FULL','BLOCKED','MAINTENANCE')),
 row_version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(org_id,warehouse_id,code)
);
create index if not exists idx_warehouse_slots_tenant on warehouse_slots(org_id,warehouse_id,status);

create table if not exists warehouse_transfers (
 id uuid primary key default gen_random_uuid(), org_id text not null references organizations(id), reference text not null,
 source_warehouse_id uuid not null references warehouses(id), destination_warehouse_id uuid not null references warehouses(id),
 status text not null default 'DRAFT' check(status in ('DRAFT','IN_TRANSIT','RECEIVED','CANCELLED')),
 notes text, created_by text not null, dispatched_by text, received_by text, dispatched_at timestamptz, received_at timestamptz,
 row_version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(org_id,reference), check(source_warehouse_id <> destination_warehouse_id)
);
create table if not exists warehouse_transfer_items (
 id uuid primary key default gen_random_uuid(), org_id text not null references organizations(id),
 transfer_id uuid not null references warehouse_transfers(id) on delete cascade,
 package_id uuid not null references cargo_packages(id), created_at timestamptz not null default now(), unique(transfer_id,package_id)
);

create table if not exists warehouse_stock_counts (
 id uuid primary key default gen_random_uuid(), org_id text not null references organizations(id), warehouse_id uuid not null references warehouses(id),
 slot_id uuid references warehouse_slots(id), reference text not null, status text not null default 'DRAFT' check(status in ('DRAFT','IN_PROGRESS','COMPLETED','CANCELLED')),
 expected_packages integer not null default 0, actual_packages integer, variance integer,
 assigned_id text, assigned_name text, notes text, created_by text not null, completed_by text, completed_at timestamptz,
 row_version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(org_id,reference)
);

create table if not exists warehouse_anomalies (
 id uuid primary key default gen_random_uuid(), org_id text not null references organizations(id), warehouse_id uuid not null references warehouses(id),
 package_id uuid references cargo_packages(id), slot_id uuid references warehouse_slots(id),
 anomaly_type text not null, severity text not null default 'MEDIUM' check(severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
 status text not null default 'OPEN' check(status in ('OPEN','IN_REVIEW','RESOLVED','DISMISSED')),
 title text not null, description text, assigned_id text, assigned_name text, resolution text,
 created_by text not null, resolved_by text, resolved_at timestamptz, row_version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_warehouse_anomalies_tenant on warehouse_anomalies(org_id,warehouse_id,status,severity);

create table if not exists warehouse_audit_log (
 id bigserial primary key, org_id text not null, warehouse_id uuid, entity_type text not null, entity_id text not null,
 action text not null, actor_id text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists idx_warehouse_audit_tenant on warehouse_audit_log(org_id,warehouse_id,created_at desc);

insert into permissions(permission_code,description) values
 ('warehouses.read','Lire stock, emplacements et alertes'),
 ('warehouses.create','Créer et configurer un entrepôt'),
 ('warehouses.update','Modifier configuration et capacité'),
 ('warehouses.move','Déplacer ou transférer des colis'),
 ('warehouses.count','Réaliser un inventaire physique'),
 ('warehouses.alerts','Créer, assigner et résoudre les anomalies'),
 ('warehouses.export','Exporter l’inventaire complet')
on conflict(permission_code) do update set description=excluded.description;

insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r join permissions p on
 (r.role_code in ('OWNER','MANAGER') and p.permission_code like 'warehouses.%') or
 (r.role_code='WAREHOUSE' and p.permission_code in ('warehouses.read','warehouses.create','warehouses.update','warehouses.move','warehouses.count','warehouses.alerts','warehouses.export')) or
 (r.role_code='OPERATOR' and p.permission_code in ('warehouses.read','warehouses.move','warehouses.count')) or
 (r.role_code in ('SUPPORT','FINANCE') and p.permission_code in ('warehouses.read','warehouses.export'))
on conflict do nothing;

revoke all on warehouse_slots,warehouse_transfers,warehouse_transfer_items,warehouse_stock_counts,warehouse_anomalies,warehouse_audit_log from public;
