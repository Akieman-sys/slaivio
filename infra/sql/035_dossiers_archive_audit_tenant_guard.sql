-- =====================================================
-- DOSSIERS: ARCHIVE, AUDIT AND TENANT GUARDS
-- Safe to run more than once.
-- =====================================================

alter table dossiers add column if not exists archived_at timestamptz;
alter table dossiers add column if not exists archived_by text;

create index if not exists idx_dossiers_org_active_updated
on dossiers(org_id, updated_at desc) where archived_at is null;

create index if not exists idx_dossiers_org_archived
on dossiers(org_id, archived_at desc) where archived_at is not null;

insert into permissions (permission_code, description)
values ('dossiers.archive', 'Archiver et restaurer des dossiers')
on conflict (permission_code) do update set description = excluded.description;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from organization_roles r
join permissions p on p.permission_code = 'dossiers.archive'
where r.role_code in ('OWNER', 'MANAGER')
on conflict do nothing;

create or replace function prevent_archived_dossier_mutation()
returns trigger language plpgsql as $$
begin
    if old.archived_at is not null and new.archived_at is not null then
        raise exception 'archived_dossier_is_immutable' using errcode = 'check_violation';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_dossiers_archived_immutable on dossiers;
create trigger trg_dossiers_archived_immutable
before update on dossiers
for each row execute function prevent_archived_dossier_mutation();

create or replace function enforce_dossier_child_tenant()
returns trigger language plpgsql as $$
begin
    if new.dossier_id is not null and not exists (
        select 1 from dossiers d where d.id = new.dossier_id and d.org_id = new.org_id
    ) then
        raise exception 'dossier_tenant_mismatch' using errcode = 'foreign_key_violation';
    end if;
    return new;
end;
$$;

create or replace function enforce_dossier_client_tenant()
returns trigger language plpgsql as $$
begin
    if not exists (
        select 1 from clients c where c.id = new.client_id and c.org_id = new.org_id
    ) then
        raise exception 'dossier_client_tenant_mismatch' using errcode = 'foreign_key_violation';
    end if;
    return new;
end;
$$;

do $$
declare invalid_count bigint;
begin
    select count(*) into invalid_count
    from dossiers d join clients c on c.id = d.client_id
    where c.org_id <> d.org_id;
    if invalid_count > 0 then
        raise exception 'dossier tenant invariant violation: % dossier/client mismatch(es)', invalid_count;
    end if;
end $$;

drop trigger if exists trg_dossiers_client_tenant on dossiers;
create trigger trg_dossiers_client_tenant
before insert or update of org_id, client_id on dossiers
for each row execute function enforce_dossier_client_tenant();

do $$
declare
    child_table text;
    trigger_name text;
begin
    foreach child_table in array array['dossier_events', 'messages_raw', 'notification_outbox', 'shipments']
    loop
        if to_regclass('public.' || child_table) is not null then
            trigger_name := 'trg_' || child_table || '_dossier_tenant';
            execute format('drop trigger if exists %I on %I', trigger_name, child_table);
            execute format(
                'create trigger %I before insert or update of org_id, dossier_id on %I '
                'for each row execute function enforce_dossier_child_tenant()',
                trigger_name, child_table
            );
        end if;
    end loop;
end $$;

revoke all on audit_logs from public;
