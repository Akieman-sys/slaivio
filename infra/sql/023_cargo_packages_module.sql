create table if not exists cargo_packages (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  dossier_id uuid references dossiers(id) on delete set null,
  shipment_id uuid references shipments(id) on delete set null,
  package_reference text not null,
  tracking_id text,
  source text not null default 'manual',
  package_type text not null default 'carton',
  description text,
  category text,
  status text not null default 'CREATED',
  validation_status text not null default 'PENDING',
  payment_status text not null default 'UNKNOWN',
  package_condition text not null default 'UNKNOWN',
  inventory_status text not null default 'NOT_STORED',
  warehouse_id uuid,
  warehouse_name text,
  warehouse_zone text,
  warehouse_rack text,
  warehouse_location text,
  origin_country text,
  origin_city text,
  destination_country text,
  destination_city text,
  service_type text,
  shipment_reference text,
  shipment_batch_id uuid,
  manifest_id uuid,
  public_tracking_enabled boolean not null default true,
  eta_at timestamptz,
  received_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  weight_kg numeric(12, 3),
  volumetric_weight_kg numeric(12, 3),
  length_cm numeric(12, 2),
  width_cm numeric(12, 2),
  height_cm numeric(12, 2),
  volume_cbm numeric(12, 4),
  pieces_count integer not null default 1,
  declared_value numeric(14, 2),
  declared_currency text,
  is_fragile boolean not null default false,
  notes text,
  fees_total numeric(14, 2),
  fees_paid numeric(14, 2) not null default 0,
  currency text,
  barcode text,
  qr_code_value text,
  last_scan_location text,
  last_scan_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(org_id, package_reference)
);

create table if not exists package_events (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  package_id uuid not null references cargo_packages(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text,
  previous_status text,
  new_status text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id text,
  actor_name text,
  created_at timestamptz not null default now()
);

create table if not exists package_media (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  package_id uuid not null references cargo_packages(id) on delete cascade,
  media_url text not null,
  media_type text not null default 'IMAGE',
  caption text,
  uploaded_by_id text,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists package_anomalies (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  package_id uuid not null references cargo_packages(id) on delete cascade,
  anomaly_type text not null,
  severity text not null default 'MEDIUM',
  status text not null default 'OPEN',
  title text not null,
  description text,
  resolution_notes text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists package_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  package_id uuid not null references cargo_packages(id) on delete cascade,
  channel text not null,
  notification_type text not null,
  recipient text,
  message text not null,
  status text not null default 'PENDING',
  provider text,
  provider_message_id text,
  sent_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cargo_packages_org_status on cargo_packages(org_id, status);
create index if not exists idx_cargo_packages_org_client on cargo_packages(org_id, client_id);
create index if not exists idx_cargo_packages_org_dossier on cargo_packages(org_id, dossier_id);
create index if not exists idx_cargo_packages_org_updated on cargo_packages(org_id, updated_at desc);
create index if not exists idx_package_events_package on package_events(org_id, package_id, created_at desc);
create index if not exists idx_package_media_package on package_media(org_id, package_id, created_at desc);
create index if not exists idx_package_anomalies_package on package_anomalies(org_id, package_id, status);
create index if not exists idx_package_notifications_package on package_notifications(org_id, package_id, created_at desc);

insert into cargo_packages (
  org_id, client_id, dossier_id, shipment_id, package_reference, tracking_id, source,
  package_type, description, category, status, validation_status, payment_status,
  package_condition, inventory_status, origin_country, origin_city, destination_country,
  destination_city, service_type, public_tracking_enabled, eta_at, received_at,
  dispatched_at, delivered_at, weight_kg, volume_cbm, fees_total, fees_paid,
  currency, barcode, qr_code_value, last_scan_location, last_scan_at, created_at, updated_at
)
select
  s.org_id,
  s.client_id,
  s.dossier_id,
  s.id,
  coalesce(s.tracking_id, 'COL-' || upper(left(s.id::text, 8))),
  s.tracking_id,
  'legacy',
  'carton',
  s.goods_type,
  s.goods_type,
  coalesce(s.current_status, s.status, 'CREATED'),
  'PENDING',
  case coalesce(s.payment_clearance_status, 'UNKNOWN')
    when 'CLEARED' then 'PAID'
    else coalesce(s.payment_clearance_status, 'UNKNOWN')
  end,
  coalesce(s.package_condition, 'UNKNOWN'),
  coalesce(s.inventory_status, 'NOT_STORED'),
  s.origin_country,
  s.origin_city,
  s.destination_country,
  s.destination_city,
  s.shipping_mode,
  coalesce(s.public_tracking_enabled, true),
  s.eta_at,
  s.received_at_origin_at,
  s.dispatched_at,
  s.delivered_at,
  coalesce(s.actual_weight_kg, s.weight_kg),
  coalesce(s.actual_volume_cbm, s.volume_cbm),
  s.fees_total,
  coalesce(s.fees_paid, 0),
  s.currency,
  s.barcode,
  s.qr_code_value,
  s.last_scan_location,
  s.last_scan_at,
  s.created_at,
  s.updated_at
from shipments s
where not exists (
  select 1 from cargo_packages p where p.org_id = s.org_id and p.shipment_id = s.id
);
