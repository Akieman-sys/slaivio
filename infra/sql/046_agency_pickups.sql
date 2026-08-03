-- Agency pickup counter. Safe to rerun.
insert into permissions(permission_code,description) values
 ('pickups.read','Lire la file des retraits'),('pickups.create','Préparer un retrait'),('pickups.notify','Notifier le client et générer son OTP'),
 ('pickups.verify','Vérifier paiement, OTP et identité'),('pickups.release','Remettre physiquement les colis'),
 ('pickups.override','Autoriser exceptionnellement une remise bloquée'),('pickups.export','Exporter les retraits'),('pickups.settings','Configurer les frais de garde')
on conflict(permission_code) do update set description=excluded.description;

insert into organization_roles(org_id,role_code,role_name,description,system_role)
select o.id,v.code,v.name,v.description,true from organizations o cross join(values
 ('COUNTER_AGENT','Agent guichet','Accueil, vérification et remise des colis'),
 ('CASHIER','Caissier','Validation des paiements avant remise')
) v(code,name,description) on conflict(org_id,role_code) do nothing;

insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r join permissions p on
 (r.role_code in ('OWNER','MANAGER') and p.permission_code like 'pickups.%') or
 (r.role_code='COUNTER_AGENT' and p.permission_code in ('pickups.read','pickups.create','pickups.notify','pickups.verify','pickups.release','pickups.export')) or
 (r.role_code='CASHIER' and p.permission_code in ('pickups.read','pickups.verify','pickups.export')) or
 (r.role_code in ('WAREHOUSE','WAREHOUSE_SUPERVISOR') and p.permission_code in ('pickups.read','pickups.create','pickups.release')) or
 (r.role_code='SUPPORT' and p.permission_code in ('pickups.read','pickups.notify'))
on conflict do nothing;

create table if not exists pickup_settings(
 org_id text primary key references organizations(id),grace_days integer not null default 3 check(grace_days>=0),
 daily_storage_fee numeric(14,2) not null default 0 check(daily_storage_fee>=0),currency text not null default 'USD',
 otp_ttl_minutes integer not null default 15 check(otp_ttl_minutes between 2 and 120),max_otp_attempts integer not null default 5 check(max_otp_attempts between 1 and 20),
 require_payment boolean not null default true,require_identity boolean not null default true,require_signature boolean not null default true,
 updated_by text,updated_at timestamptz not null default now()
);

create table if not exists pickup_orders(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),pickup_reference text not null,
 client_id uuid references clients(id),office_id uuid references agency_offices(id),warehouse_id uuid references warehouses(id),
 status text not null default 'READY' check(status in ('READY','NOTIFIED','CHECKED_IN','VERIFIED','RELEASED','REFUSED','CANCELLED')),
 recipient_type text not null default 'CLIENT' check(recipient_type in ('CLIENT','AUTHORIZED_PERSON')),
 recipient_name text,recipient_phone text,authorized_person_name text,authorized_person_phone text,identity_type text,identity_reference_masked text,
 payment_status text not null default 'UNKNOWN',required_amount numeric(14,2) not null default 0,paid_amount numeric(14,2) not null default 0,
 storage_fee numeric(14,2) not null default 0,currency text not null default 'USD',release_blocked_reason text,
 ready_at timestamptz not null default now(),notified_at timestamptz,checked_in_at timestamptz,verified_at timestamptz,released_at timestamptz,refused_at timestamptz,
 assigned_to text,assigned_name text,notes text,row_version integer not null default 1,created_by text not null,created_by_name text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,pickup_reference)
);
create index if not exists idx_pickup_orders_queue on pickup_orders(org_id,status,ready_at);

create table if not exists pickup_order_items(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),pickup_id uuid not null references pickup_orders(id) on delete cascade,
 package_id uuid not null references cargo_packages(id),released_at timestamptz,created_at timestamptz not null default now(),unique(pickup_id,package_id)
);
create unique index if not exists uq_active_pickup_package on pickup_order_items(org_id,package_id)
 where released_at is null;

create table if not exists pickup_otps(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),pickup_id uuid not null references pickup_orders(id) on delete cascade,
 code_hash text not null,status text not null default 'PENDING' check(status in ('PENDING','VERIFIED','EXPIRED','LOCKED','REVOKED')),
 attempts integer not null default 0,expires_at timestamptz not null,verified_at timestamptz,created_by text not null,created_at timestamptz not null default now()
);
create unique index if not exists uq_active_pickup_otp on pickup_otps(pickup_id) where status='PENDING';

create table if not exists pickup_verifications(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),pickup_id uuid not null references pickup_orders(id) on delete cascade,
 verification_type text not null,verification_status text not null check(verification_status in ('PASSED','FAILED','OVERRIDDEN')),
 checked_value text,reason text,verified_by text not null,verified_by_name text,created_at timestamptz not null default now()
);
create table if not exists pickup_proofs(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),pickup_id uuid not null references pickup_orders(id) on delete cascade,
 signed_by text not null,signature_text text,identity_type text,identity_reference_masked text,object_path text,file_name text,mime_type text,size_bytes bigint,
 captured_by text not null,captured_by_name text,created_at timestamptz not null default now()
);
create table if not exists pickup_events(
 id bigserial primary key,org_id text not null,pickup_id uuid not null references pickup_orders(id) on delete cascade,
 event_type text not null,actor_id text not null,actor_name text,payload jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);
create index if not exists idx_pickup_events_tenant on pickup_events(org_id,pickup_id,created_at desc);

revoke all on pickup_settings,pickup_orders,pickup_order_items,pickup_otps,pickup_verifications,pickup_proofs,pickup_events from public;
