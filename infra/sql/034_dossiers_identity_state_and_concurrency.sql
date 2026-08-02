-- =====================================================
-- DOSSIERS IDENTITY, STATE AND CONCURRENCY
-- Normalizes legacy values, persists stable references, and guarantees that
-- every writer increments row_version. Safe to run more than once.
-- =====================================================

alter table dossiers
    add column if not exists dossier_reference text,
    add column if not exists row_version integer not null default 1;

update dossiers
set dossier_reference = 'DOS-' || upper(left(replace(id::text, '-', ''), 12))
where dossier_reference is null or btrim(dossier_reference) = '';

update dossiers
set status_global = case upper(coalesce(status_global, 'LEAD'))
    when 'PARTIAL' then 'DRAFT'
    when 'ACTIVE' then 'DRAFT'
    when 'NEEDS_HUMAN' then 'DRAFT'
    when 'WAITING_FOR_PACKAGE' then 'WAITING_PACKAGES'
    when 'PACKAGE_RECEIVED' then 'IN_WAREHOUSE'
    when 'READY_FOR_DEPARTURE' then 'READY_TO_SHIP'
    when 'ARRIVED_DESTINATION' then 'ARRIVED'
    when 'READY_FOR_PICKUP' then 'READY_FOR_DELIVERY'
    when 'WAITING_PAYMENT' then 'QUOTED'
    when 'LEAD' then 'LEAD'
    when 'DRAFT' then 'DRAFT'
    when 'QUOTED' then 'QUOTED'
    when 'WAITING_PACKAGES' then 'WAITING_PACKAGES'
    when 'IN_WAREHOUSE' then 'IN_WAREHOUSE'
    when 'READY_TO_SHIP' then 'READY_TO_SHIP'
    when 'IN_TRANSIT' then 'IN_TRANSIT'
    when 'ARRIVED' then 'ARRIVED'
    when 'CUSTOMS' then 'CUSTOMS'
    when 'READY_FOR_DELIVERY' then 'READY_FOR_DELIVERY'
    when 'DELIVERED' then 'DELIVERED'
    when 'COMPLETED' then 'COMPLETED'
    when 'CLOSED' then 'CLOSED'
    when 'CANCELLED' then 'CANCELLED'
    else 'DRAFT'
end;

update dossiers
set case_type = case upper(coalesce(case_type, 'UNKNOWN'))
    when 'SEND_CARGO' then 'COMMERCIAL_CARGO'
    when 'TRANSITAIRE' then 'IMPORT'
    when 'PRICE_INQUIRY' then 'QUOTE'
    when 'SUPPLIER_PAYMENT' then 'PURCHASE'
    when 'IMPORT' then 'IMPORT'
    when 'EXPORT' then 'EXPORT'
    when 'PURCHASE' then 'PURCHASE'
    when 'QUOTE' then 'QUOTE'
    when 'PERSONAL_EFFECTS' then 'PERSONAL_EFFECTS'
    when 'COMMERCIAL_CARGO' then 'COMMERCIAL_CARGO'
    else 'UNKNOWN'
end;

update dossiers set intake_status = 'PARTIAL'
where intake_status is null or intake_status not in ('PARTIAL', 'COMPLETE', 'WAITING_CLIENT', 'WAITING_PACKAGE');

update dossiers set validation_status = 'PENDING'
where validation_status is null or validation_status not in ('PENDING', 'VALIDATED', 'REJECTED', 'NEEDS_REVIEW');

update dossiers set payment_status = 'PENDING'
where payment_status is null or payment_status not in ('PENDING', 'WAITING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');

do $$
declare
    invalid_count bigint;
begin
    select count(*) into invalid_count
    from dossiers
    where coalesce(estimated_weight_kg, 0) < 0
       or coalesce(estimated_volume_cbm, 0) < 0
       or coalesce(quoted_total, 0) < 0
       or coalesce(final_total, 0) < 0
       or coalesce(supplier_payment_amount, 0) < 0;
    if invalid_count > 0 then
        raise exception 'dossier invariant violation: % row(s) contain negative operational or financial values', invalid_count;
    end if;
end $$;

alter table dossiers alter column dossier_reference set not null;
alter table dossiers alter column row_version set default 1;

create unique index if not exists uq_dossiers_org_reference
on dossiers(org_id, dossier_reference);

alter table dossiers drop constraint if exists dossiers_row_version_positive;
alter table dossiers add constraint dossiers_row_version_positive check (row_version > 0);

alter table dossiers drop constraint if exists dossiers_non_negative_values;
alter table dossiers add constraint dossiers_non_negative_values check (
    coalesce(estimated_weight_kg, 0) >= 0
    and coalesce(estimated_volume_cbm, 0) >= 0
    and coalesce(quoted_total, 0) >= 0
    and coalesce(final_total, 0) >= 0
    and coalesce(supplier_payment_amount, 0) >= 0
);

alter table dossiers drop constraint if exists dossiers_status_valid;
alter table dossiers add constraint dossiers_status_valid check (status_global in (
    'LEAD', 'DRAFT', 'QUOTED', 'WAITING_PACKAGES', 'IN_WAREHOUSE',
    'READY_TO_SHIP', 'IN_TRANSIT', 'ARRIVED', 'CUSTOMS',
    'READY_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CLOSED', 'CANCELLED'
));

alter table dossiers drop constraint if exists dossiers_case_type_valid;
alter table dossiers add constraint dossiers_case_type_valid check (case_type in (
    'UNKNOWN', 'IMPORT', 'EXPORT', 'PURCHASE', 'QUOTE',
    'PERSONAL_EFFECTS', 'COMMERCIAL_CARGO'
));

create or replace function bump_dossier_row_version()
returns trigger
language plpgsql
as $$
begin
    if new.row_version = old.row_version then
        new.row_version := old.row_version + 1;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_dossiers_bump_row_version on dossiers;
create trigger trg_dossiers_bump_row_version
before update on dossiers
for each row execute function bump_dossier_row_version();
