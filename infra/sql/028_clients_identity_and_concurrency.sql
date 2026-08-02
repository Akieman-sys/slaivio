-- =====================================================
-- CLIENT IDENTITY + OPTIMISTIC CONCURRENCY
-- Préserve les doublons historiques et verrouille les nouvelles écritures.
-- =====================================================

alter table clients
    add column if not exists normalized_phone text,
    add column if not exists normalized_email text,
    add column if not exists row_version integer not null default 1,
    add column if not exists archived_by text;

create table if not exists client_identity_conflicts (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    client_id uuid not null references clients(id),
    identity_type text not null check (identity_type in ('phone', 'email')),
    normalized_value text not null,
    canonical_client_id uuid not null references clients(id),
    detected_at timestamptz not null default now(),
    resolved_at timestamptz,
    resolved_by text,
    unique (org_id, client_id, identity_type, normalized_value)
);

update clients
set normalized_phone = nullif(case
        when coalesce(nullif(phone, ''), nullif(whatsapp_phone, '')) is null then null
        when left(regexp_replace(coalesce(nullif(phone, ''), whatsapp_phone), '[^0-9+]', '', 'g'), 2) = '00'
            then '+' || substring(regexp_replace(coalesce(nullif(phone, ''), whatsapp_phone), '[^0-9+]', '', 'g') from 3)
        else regexp_replace(coalesce(nullif(phone, ''), whatsapp_phone), '[^0-9+]', '', 'g')
    end, ''),
    normalized_email = nullif(lower(trim(email)), '')
where normalized_phone is null or normalized_email is null;

with ranked as (
    select id, org_id, normalized_phone,
           first_value(id) over (partition by org_id, normalized_phone order by created_at, id) canonical_id,
           row_number() over (partition by org_id, normalized_phone order by created_at, id) position
    from clients
    where deleted_at is null and normalized_phone is not null
)
insert into client_identity_conflicts (org_id, client_id, identity_type, normalized_value, canonical_client_id)
select org_id, id, 'phone', normalized_phone, canonical_id
from ranked where position > 1
on conflict do nothing;

with ranked as (
    select id, org_id, normalized_email,
           first_value(id) over (partition by org_id, normalized_email order by created_at, id) canonical_id,
           row_number() over (partition by org_id, normalized_email order by created_at, id) position
    from clients
    where deleted_at is null and normalized_email is not null
)
insert into client_identity_conflicts (org_id, client_id, identity_type, normalized_value, canonical_client_id)
select org_id, id, 'email', normalized_email, canonical_id
from ranked where position > 1
on conflict do nothing;

update clients c set normalized_phone = null
where exists (
    select 1 from client_identity_conflicts x
    where x.client_id = c.id and x.identity_type = 'phone' and x.resolved_at is null
);

update clients c set normalized_email = null
where exists (
    select 1 from client_identity_conflicts x
    where x.client_id = c.id and x.identity_type = 'email' and x.resolved_at is null
);

create unique index if not exists uq_clients_org_normalized_phone
on clients(org_id, normalized_phone)
where deleted_at is null and normalized_phone is not null;

create unique index if not exists uq_clients_org_normalized_email
on clients(org_id, normalized_email)
where deleted_at is null and normalized_email is not null;

create index if not exists idx_client_identity_conflicts_org
on client_identity_conflicts(org_id, detected_at desc)
where resolved_at is null;

alter table clients drop constraint if exists clients_row_version_positive;
alter table clients add constraint clients_row_version_positive check (row_version > 0);
