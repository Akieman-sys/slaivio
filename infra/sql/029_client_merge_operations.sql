create table if not exists client_merge_operations (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    source_client_id uuid not null references clients(id),
    target_client_id uuid not null references clients(id),
    actor_id text not null,
    idempotency_key text not null,
    moved_relations jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    check (source_client_id <> target_client_id),
    unique (org_id, idempotency_key)
);

create index if not exists idx_client_merge_operations_clients
on client_merge_operations(org_id, target_client_id, created_at desc);

revoke all on client_merge_operations from public;
