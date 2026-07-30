create table if not exists cargo_expeditions (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  expedition_reference text not null,
  title text,
  status text not null default 'DRAFT',
  mode text not null default 'AIR',
  service_type text,
  route_id uuid,
  origin_country text,
  origin_city text,
  origin_hub text,
  origin_warehouse text,
  destination_country text,
  destination_city text,
  destination_hub text,
  destination_office text,
  carrier_name text,
  transport_reference text,
  flight_number text,
  vessel_name text,
  container_number text,
  seal_number text,
  awb_number text,
  bl_number text,
  batch_reference text,
  manifest_reference text,
  departure_planned_at timestamptz,
  departure_actual_at timestamptz,
  eta_at timestamptz,
  arrived_at timestamptz,
  delivered_at timestamptz,
  last_location text,
  progress_percent integer not null default 0,
  risk_level text not null default 'LOW',
  is_delayed boolean not null default false,
  delay_hours integer not null default 0,
  delay_reason text,
  sla_target_at timestamptz,
  owner_user_id text,
  origin_manager_id text,
  destination_manager_id text,
  packages_count integer not null default 0,
  clients_count integer not null default 0,
  total_weight_kg numeric(14, 3) not null default 0,
  total_volume_cbm numeric(14, 4) not null default 0,
  declared_value_total numeric(14, 2) not null default 0,
  cost_total numeric(14, 2) not null default 0,
  billed_total numeric(14, 2) not null default 0,
  profit_total numeric(14, 2) not null default 0,
  currency text,
  financial_status text not null default 'NOT_CALCULATED',
  notes text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  cancelled_at timestamptz,
  deleted_at timestamptz,
  unique(org_id, expedition_reference)
);

create table if not exists expedition_packages (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
  package_id uuid not null references cargo_packages(id) on delete cascade,
  dossier_id uuid references dossiers(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  added_by text,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  remove_reason text,
  unique(org_id, expedition_id, package_id)
);

create table if not exists expedition_checkpoints (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
  checkpoint_key text not null,
  label text not null,
  status text not null default 'PENDING',
  planned_at timestamptz,
  completed_at timestamptz,
  location text,
  notes text,
  proof_document_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, expedition_id, checkpoint_key)
);

create table if not exists expedition_events (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text,
  previous_status text,
  new_status text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id text,
  actor_name text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists expedition_documents (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
  document_type text not null,
  file_name text,
  file_url text not null,
  mime_type text,
  visibility text not null default 'INTERNAL',
  notes text,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create table if not exists expedition_financial_lines (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
  line_type text not null,
  category text,
  description text,
  amount numeric(14, 2) not null default 0,
  currency text,
  direction text not null default 'COST',
  client_id uuid references clients(id) on delete set null,
  dossier_id uuid references dossiers(id) on delete set null,
  package_id uuid references cargo_packages(id) on delete set null,
  status text not null default 'PENDING',
  created_at timestamptz not null default now()
);

create table if not exists expedition_anomalies (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
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

create table if not exists expedition_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
  channel text not null,
  audience text not null default 'ALL_CLIENTS',
  recipient text,
  notification_type text not null,
  message text not null,
  status text not null default 'PENDING',
  provider text,
  provider_message_id text,
  sent_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists expedition_notes (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
  note text not null,
  priority text not null default 'NORMAL',
  visibility text not null default 'PRIVATE',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table cargo_expeditions add column if not exists route_label text;
alter table cargo_expeditions add column if not exists destination_warehouse text;
alter table cargo_expeditions add column if not exists owner_id text;
alter table cargo_expeditions add column if not exists owner_name text;
alter table cargo_expeditions add column if not exists planned_departure_at timestamptz;
alter table cargo_expeditions add column if not exists departed_at timestamptz;
alter table cargo_expeditions add column if not exists financial_status text not null default 'NOT_CALCULATED';
alter table cargo_expeditions add column if not exists currency text not null default 'USD';
alter table cargo_expeditions add column if not exists risk_level text not null default 'LOW';
alter table cargo_expeditions add column if not exists is_delayed boolean not null default false;
alter table cargo_expeditions add column if not exists delay_reason text;
alter table cargo_expeditions add column if not exists profit_total numeric(14,2) not null default 0;

alter table expedition_packages add column if not exists removal_reason text;

alter table expedition_checkpoints add column if not exists label text;
alter table expedition_checkpoints add column if not exists sort_order integer;
alter table expedition_checkpoints add column if not exists title text;
alter table expedition_checkpoints add column if not exists position integer;
alter table expedition_checkpoints add column if not exists updated_by text;
update expedition_checkpoints set title = coalesce(title, label, checkpoint_key) where title is null;
update expedition_checkpoints set position = coalesce(position, sort_order, 0) where position is null;
alter table expedition_checkpoints alter column title set not null;
alter table expedition_checkpoints alter column position set not null;

alter table expedition_events add column if not exists occurred_at timestamptz not null default now();

alter table expedition_financial_lines add column if not exists due_at timestamptz;
alter table expedition_financial_lines add column if not exists paid_at timestamptz;
alter table expedition_financial_lines add column if not exists created_by text;
alter table expedition_financial_lines alter column currency set default 'USD';
update expedition_financial_lines set currency = 'USD' where currency is null;
alter table expedition_financial_lines alter column currency set not null;

alter table expedition_notifications add column if not exists created_by text;
alter table expedition_notifications alter column channel set default 'whatsapp';
alter table expedition_notifications alter column notification_type set default 'EXPEDITION_UPDATE';

create index if not exists idx_cargo_expeditions_org_status on cargo_expeditions(org_id, status);
create index if not exists idx_cargo_expeditions_org_updated on cargo_expeditions(org_id, updated_at desc);
create index if not exists idx_expedition_packages_expedition on expedition_packages(org_id, expedition_id, removed_at);
create index if not exists idx_expedition_packages_package on expedition_packages(org_id, package_id);
create index if not exists idx_expedition_events_expedition on expedition_events(org_id, expedition_id, created_at desc);
create index if not exists idx_expedition_events_exp on expedition_events(org_id, expedition_id, occurred_at desc);
