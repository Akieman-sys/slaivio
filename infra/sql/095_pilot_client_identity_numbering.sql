-- SLAIVIO Pilot V1 - agency-configured client identifiers.
-- Safe to run after 094_pilot_dossier_identity.sql.
--
-- Existing client references are preserved. Only future clients receive the
-- format selected in Settings -> Identifiers.

insert into document_numbering_settings(org_id, document_type, prefix_format)
select organization.id, 'CLIENT', 'CLI-{YYYY}-{000001}'
from organizations organization
on conflict(org_id, document_type) do nothing;

create or replace function next_organization_reference(
  requested_org_id text,
  requested_document_type text,
  fallback_format text
)
returns text
language plpgsql
as $$
declare
  selected_format text;
  selected_number bigint;
  rendered_reference text;
begin
  insert into document_numbering_settings(
    org_id, document_type, prefix_format, next_number
  ) values (
    requested_org_id, upper(requested_document_type), fallback_format, 2
  )
  on conflict(org_id, document_type) do update
    set next_number = document_numbering_settings.next_number + 1,
        updated_at = now()
  returning prefix_format, next_number - 1
  into selected_format, selected_number;

  rendered_reference := replace(selected_format, '{YYYY}', to_char(current_date, 'YYYY'));
  rendered_reference := replace(rendered_reference, '{YEAR}', to_char(current_date, 'YYYY'));
  rendered_reference := replace(rendered_reference, '{000001}', lpad(selected_number::text, 6, '0'));
  rendered_reference := replace(rendered_reference, '{SEQUENCE}', selected_number::text);

  return rendered_reference;
end;
$$;

create or replace function assign_client_reference()
returns trigger
language plpgsql
as $$
begin
  if new.client_reference is null or btrim(new.client_reference) = '' then
    new.client_reference := next_organization_reference(
      new.org_id,
      'CLIENT',
      'CLI-{YYYY}-{000001}'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_assign_reference on clients;
create trigger trg_clients_assign_reference
before insert on clients
for each row execute function assign_client_reference();

comment on function next_organization_reference(text, text, text) is
  'Atomically renders the next agency-configured human identifier.';

