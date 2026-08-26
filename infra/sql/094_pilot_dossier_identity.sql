-- SLAIVIO Pilot V1 - human dossier identity.
-- Safe to run after 093_pilot_dossier_api_foundation.sql.

alter table dossiers
  add column if not exists title text,
  add column if not exists description text;

create index if not exists idx_dossiers_pilot_title
  on dossiers(org_id, lower(title))
  where archived_at is null and title is not null;

comment on column dossiers.title is
  'Human-readable Pilot dossier title chosen by the agency.';

comment on column dossiers.description is
  'Optional common purpose or context shared by the clients attached to the dossier.';
