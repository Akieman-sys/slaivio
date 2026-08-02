create table if not exists platform_inbound_event_envelopes (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    provider_event_id text not null,
    provider_account_id text,
    provider_phone_number_id text,
    event_type text not null,
    routing_status text not null default 'QUARANTINED',
    failure_reason text not null,
    payload_encrypted text not null,
    payload_hash text not null,
    signature_verified boolean not null,
    received_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    resolved_at timestamptz,
    resolved_org_id text references organizations(id),
    resolution_actor_id text,
    resolution_reason text,
    retry_count integer not null default 0,
    expires_at timestamptz not null default (now() + interval '30 days'),
    constraint platform_inbound_event_routing_status_check check (
        routing_status in (
            'QUARANTINED', 'MANUALLY_RESOLVED', 'ROUTED',
            'PROCESSED', 'REJECTED', 'EXPIRED'
        )
    ),
    unique (provider, provider_event_id)
);

create index if not exists idx_platform_inbound_quarantine_status
    on platform_inbound_event_envelopes (routing_status, received_at desc);

create index if not exists idx_platform_inbound_quarantine_phone
    on platform_inbound_event_envelopes (provider, provider_phone_number_id)
    where routing_status = 'QUARANTINED';

create table if not exists platform_operator_permissions (
    user_id text not null,
    permission_code text not null,
    status text not null default 'ACTIVE',
    granted_at timestamptz not null default now(),
    granted_by text,
    primary key (user_id, permission_code)
);

create table if not exists platform_quarantine_audit_log (
    id uuid primary key default gen_random_uuid(),
    envelope_id uuid not null references platform_inbound_event_envelopes(id),
    actor_user_id text not null,
    action text not null,
    previous_status text,
    new_status text not null,
    resolved_org_id text references organizations(id),
    reason text,
    created_at timestamptz not null default now()
);

revoke all on platform_inbound_event_envelopes from public;
revoke all on platform_operator_permissions from public;
revoke all on platform_quarantine_audit_log from public;
