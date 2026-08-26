-- SLAIVIO Pilot V1 - pre-production readiness reviews.
-- Safe to run after 101_pilot_offline_sync.sql.
-- Current readiness is calculated from source data. This table stores only
-- the snapshot explicitly recorded by the responsible person.

create table if not exists pilot_readiness_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  status text not null,
  score integer not null check (score between 0 and 100),
  ready_count integer not null check (ready_count >= 0),
  total_count integer not null check (total_count > 0),
  checks jsonb not null default '[]'::jsonb,
  reviewed_by text not null,
  created_at timestamptz not null default now(),
  constraint ck_pilot_readiness_review_status check (
    status in ('READY','ACTION_REQUIRED')
  )
);

create index if not exists idx_pilot_readiness_reviews_recent
  on pilot_readiness_reviews(org_id, created_at desc);

insert into permissions(permission_code, description)
values
  ('pilot.readiness.read', 'Consulter la préparation du Pilot avant sa mise en service'),
  ('pilot.readiness.review', 'Enregistrer une vérification de préparation du Pilot')
on conflict(permission_code) do update set description = excluded.description;

insert into role_permissions(role_id, permission_id)
select role.id, permission.id
from organization_roles role
join permissions permission
  on permission.permission_code in ('pilot.readiness.read', 'pilot.readiness.review')
where role.role_code in ('OWNER','MANAGER')
   or (role.role_code in ('OPERATOR','SUPPORT') and permission.permission_code = 'pilot.readiness.read')
on conflict do nothing;

revoke all on pilot_readiness_reviews from public;

comment on table pilot_readiness_reviews is
  'Human-triggered snapshots of the Pilot readiness control; current readiness is recalculated from source data.';
