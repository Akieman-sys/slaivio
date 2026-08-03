-- Expéditions: optimistic concurrency, audit and private document metadata. Safe to rerun.
alter table cargo_expeditions add column if not exists shipment_row_version integer not null default 1;
alter table expedition_documents add column if not exists size_bytes bigint;
alter table expedition_documents add column if not exists checksum_sha256 text;
alter table expedition_documents add column if not exists object_path text;

create table if not exists shipment_audit_log(
 id uuid primary key default gen_random_uuid(),
 org_id text not null references organizations(id) on delete cascade,
 expedition_id uuid not null references cargo_expeditions(id) on delete cascade,
 action text not null,actor_id text,payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists idx_shipment_audit_org_item on shipment_audit_log(org_id,expedition_id,created_at desc);
revoke all on shipment_audit_log from public;
