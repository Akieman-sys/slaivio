-- Dossier ownership, deadlines and internal notes. Safe to rerun.

alter table organization_memberships add column if not exists member_email text;
alter table organization_memberships add column if not exists member_display_name text;

alter table dossiers add column if not exists priority text not null default 'NORMAL';
alter table dossiers add column if not exists assigned_to text;
alter table dossiers add column if not exists assigned_at timestamptz;
alter table dossiers add column if not exists assigned_by text;
alter table dossiers add column if not exists due_at timestamptz;

do $$ begin
    if not exists (
        select 1 from pg_constraint where conname = 'dossiers_priority_check'
    ) then
        alter table dossiers add constraint dossiers_priority_check
        check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT'));
    end if;
end $$;

create index if not exists idx_dossiers_org_assignee_active
on dossiers(org_id, assigned_to, due_at) where archived_at is null;
create index if not exists idx_dossiers_org_due_active
on dossiers(org_id, due_at) where archived_at is null and due_at is not null;

create table if not exists dossier_internal_notes (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    dossier_id uuid not null references dossiers(id) on delete cascade,
    body text not null check (length(btrim(body)) between 1 and 4000),
    author_id text not null,
    edited_at timestamptz,
    deleted_at timestamptz,
    row_version integer not null default 1 check (row_version > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_dossier_notes_org_dossier
on dossier_internal_notes(org_id, dossier_id, created_at desc) where deleted_at is null;

drop trigger if exists trg_dossier_internal_notes_tenant on dossier_internal_notes;
create trigger trg_dossier_internal_notes_tenant before insert or update of org_id, dossier_id
on dossier_internal_notes for each row execute function enforce_dossier_child_tenant();

create or replace function enforce_dossier_assignee_membership()
returns trigger language plpgsql as $$
begin
    if new.assigned_to is not null and not exists (
        select 1 from organization_memberships m
        where m.org_id = new.org_id and m.clerk_user_id = new.assigned_to and m.status = 'ACTIVE'
    ) then
        raise exception 'invalid_dossier_assignee' using errcode = 'foreign_key_violation';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_dossiers_assignee_membership on dossiers;
create trigger trg_dossiers_assignee_membership before insert or update of org_id, assigned_to
on dossiers for each row execute function enforce_dossier_assignee_membership();

revoke all on dossier_internal_notes from public;
