-- Complete operational parcel workspace. Safe to run more than once.

insert into permissions (permission_code, description) values
 ('packages.read','Lire les colis'), ('packages.create','Creer des colis'),
 ('packages.update','Modifier et traiter les colis'), ('packages.import','Importer des colis'),
 ('packages.export','Exporter des colis'), ('packages.archive','Archiver et restaurer des colis')
on conflict (permission_code) do update set description = excluded.description;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from organization_roles r join permissions p on
 (r.role_code in ('OWNER','MANAGER') and p.permission_code like 'packages.%') or
 (r.role_code in ('OPERATOR','WAREHOUSE') and p.permission_code in ('packages.read','packages.create','packages.update','packages.import')) or
 (r.role_code in ('SUPPORT','FINANCE') and p.permission_code in ('packages.read','packages.export'))
on conflict do nothing;

alter table cargo_packages add column if not exists priority text not null default 'NORMAL';
alter table cargo_packages add column if not exists assigned_to text;
alter table cargo_packages add column if not exists warehouse_aisle text;
alter table cargo_packages add column if not exists warehouse_shelf text;
alter table cargo_packages add column if not exists warehouse_position text;
alter table cargo_packages add column if not exists supplier_name text;
alter table cargo_packages add column if not exists row_version integer not null default 1;

create table if not exists package_movements (
 id uuid primary key default gen_random_uuid(), org_id text not null references organizations(id),
 package_id uuid not null references cargo_packages(id) on delete cascade,
 from_warehouse text, from_zone text, from_aisle text, from_shelf text, from_position text,
 to_warehouse text, to_zone text, to_aisle text, to_shelf text, to_position text,
 reason text, moved_by text not null, created_at timestamptz not null default now()
);
create index if not exists idx_package_movements_tenant on package_movements(org_id,package_id,created_at desc);

create table if not exists package_weight_measurements (
 id uuid primary key default gen_random_uuid(), org_id text not null references organizations(id),
 package_id uuid not null references cargo_packages(id) on delete cascade,
 weight_kg numeric(14,3) not null check(weight_kg >= 0), source text not null default 'MANUAL',
 device_reference text, notes text, measured_by text not null, created_at timestamptz not null default now()
);
create index if not exists idx_package_weights_tenant on package_weight_measurements(org_id,package_id,created_at desc);

create table if not exists package_notes (
 id uuid primary key default gen_random_uuid(), org_id text not null references organizations(id),
 package_id uuid not null references cargo_packages(id) on delete cascade,
 body text not null check(length(trim(body)) between 1 and 4000), author_id text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_package_notes_tenant on package_notes(org_id,package_id,created_at desc);

create table if not exists package_documents (
 id uuid primary key default gen_random_uuid(), org_id text not null references organizations(id),
 package_id uuid not null references cargo_packages(id) on delete cascade, document_type text not null,
 file_name text not null, object_path text not null, mime_type text not null,
 size_bytes bigint not null check(size_bytes > 0 and size_bytes <= 10485760), checksum_sha256 text not null,
 notes text, uploaded_by text not null, deleted_at timestamptz, created_at timestamptz not null default now(),
 unique(org_id,object_path)
);
create index if not exists idx_package_documents_tenant on package_documents(org_id,package_id,created_at desc) where deleted_at is null;

create table if not exists package_checklist_items (
 id uuid primary key default gen_random_uuid(), org_id text not null references organizations(id),
 package_id uuid not null references cargo_packages(id) on delete cascade, code text not null, label text not null,
 status text not null default 'PENDING' check(status in ('PENDING','COMPLETED','NOT_APPLICABLE')),
 sort_order integer not null default 0, completed_at timestamptz, completed_by text,
 unique(org_id,package_id,code)
);

create or replace function seed_package_checklist(p_org_id text,p_package_id uuid) returns void language sql as $$
 insert into package_checklist_items(org_id,package_id,code,label,sort_order) values
 (p_org_id,p_package_id,'LABEL_VERIFIED','Etiquette verifiee',10),
 (p_org_id,p_package_id,'WEIGHT_VERIFIED','Poids verifie',20),
 (p_org_id,p_package_id,'PHOTOS_TAKEN','Photos prises',30),
 (p_org_id,p_package_id,'QUALITY_CONTROL','Controle qualite',40),
 (p_org_id,p_package_id,'SHIPMENT_ASSIGNED','Affecte a une expedition',50)
 on conflict(org_id,package_id,code) do nothing
$$;
create or replace function seed_new_package_checklist() returns trigger language plpgsql as $$ begin
 perform seed_package_checklist(new.org_id,new.id); return new; end $$;
drop trigger if exists trg_seed_package_checklist on cargo_packages;
create trigger trg_seed_package_checklist after insert on cargo_packages for each row execute function seed_new_package_checklist();
do $$ declare r record; begin for r in select org_id,id from cargo_packages loop perform seed_package_checklist(r.org_id,r.id); end loop; end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('package-documents','package-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

revoke all on package_movements,package_weight_measurements,package_notes,package_documents,package_checklist_items from public;
