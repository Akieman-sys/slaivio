alter table platform_inbound_event_envelopes
    drop constraint if exists platform_inbound_event_routing_status_check;

alter table platform_inbound_event_envelopes
    add column if not exists replay_attempts integer not null default 0,
    add column if not exists next_replay_at timestamptz,
    add column if not exists processing_started_at timestamptz,
    add column if not exists processing_lease_id uuid,
    add column if not exists processing_lease_expires_at timestamptz,
    add column if not exists processed_at timestamptz,
    add column if not exists last_replay_error text;

update platform_inbound_event_envelopes
set routing_status = 'PENDING_REPLAY',
    next_replay_at = coalesce(next_replay_at, now())
where routing_status in ('MANUALLY_RESOLVED', 'ROUTED');

alter table platform_inbound_event_envelopes
    add constraint platform_inbound_event_routing_status_check check (
        routing_status in (
            'QUARANTINED', 'PENDING_REPLAY', 'PROCESSING',
            'PROCESSED', 'REPLAY_FAILED', 'DEAD_LETTER',
            'REJECTED', 'EXPIRED'
        )
    );

create index if not exists idx_platform_inbound_replay_due
    on platform_inbound_event_envelopes (next_replay_at, received_at)
    where routing_status in ('PENDING_REPLAY', 'REPLAY_FAILED');

create index if not exists idx_platform_inbound_replay_lease
    on platform_inbound_event_envelopes (processing_lease_expires_at)
    where routing_status = 'PROCESSING';
