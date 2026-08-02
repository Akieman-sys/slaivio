-- =====================================================
-- CLIENT DATABASE TENANT ISOLATION
-- Prevents any tenant-owned row from referencing a client owned by another
-- organization. Existing rows are audited before constraints are installed.
-- Safe to run more than once.
-- =====================================================

create unique index if not exists uq_clients_org_id_id on clients(org_id, id);

do $$
declare
    relation record;
    invalid_rows bigint;
    constraint_name text;
begin
    for relation in
        select c.table_schema, c.table_name
        from information_schema.columns c
        join information_schema.columns tenant_column
          on tenant_column.table_schema = c.table_schema
         and tenant_column.table_name = c.table_name
         and tenant_column.column_name = 'org_id'
        join information_schema.tables table_info
          on table_info.table_schema = c.table_schema
         and table_info.table_name = c.table_name
         and table_info.table_type = 'BASE TABLE'
        where c.table_schema = 'public'
          and c.column_name = 'client_id'
          and c.table_name <> 'clients'
    loop
        execute format(
            'select count(*) from %I.%I child join clients parent on parent.id = child.client_id where child.client_id is not null and child.org_id is distinct from parent.org_id',
            relation.table_schema,
            relation.table_name
        ) into invalid_rows;

        if invalid_rows > 0 then
            raise exception 'tenant isolation violation: %.% contains % cross-organization client reference(s)',
                relation.table_schema, relation.table_name, invalid_rows;
        end if;

        constraint_name := left('fk_' || relation.table_name || '_org_client', 63);
        if not exists (
            select 1
            from pg_constraint
            where conname = constraint_name
              and conrelid = format('%I.%I', relation.table_schema, relation.table_name)::regclass
        ) then
            execute format(
                'alter table %I.%I add constraint %I foreign key (org_id, client_id) references clients(org_id, id) not valid',
                relation.table_schema,
                relation.table_name,
                constraint_name
            );
            execute format(
                'alter table %I.%I validate constraint %I',
                relation.table_schema,
                relation.table_name,
                constraint_name
            );
        end if;
    end loop;
end $$;

do $$
declare
    client_reference_column text;
    constraint_name text;
    invalid_rows bigint;
begin
    foreach client_reference_column in array array['source_client_id', 'target_client_id']
    loop
        if exists (
            select 1 from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = 'client_merge_operations'
              and c.column_name = client_reference_column
        ) then
            execute format(
                'select count(*) from client_merge_operations operation join clients client on client.id = operation.%I where operation.org_id is distinct from client.org_id',
                client_reference_column
            ) into invalid_rows;
            if invalid_rows > 0 then
                raise exception 'tenant isolation violation: client_merge_operations.% contains % cross-organization reference(s)',
                    client_reference_column, invalid_rows;
            end if;

            constraint_name := 'fk_client_merge_operations_org_' || client_reference_column;
            if not exists (select 1 from pg_constraint where conname = constraint_name) then
                execute format(
                    'alter table client_merge_operations add constraint %I foreign key (org_id, %I) references clients(org_id, id) not valid',
                    constraint_name,
                    client_reference_column
                );
                execute format(
                    'alter table client_merge_operations validate constraint %I',
                    constraint_name
                );
            end if;
        end if;
    end loop;
end $$;
