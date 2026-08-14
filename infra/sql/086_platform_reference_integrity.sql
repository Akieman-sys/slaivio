-- Platform-wide source-of-truth references. Legacy labels are retained only as
-- historical display snapshots; all new mutations use tenant-validated IDs.
alter table dossiers add column if not exists workspace_id text;
alter table dossiers add column if not exists route_id uuid references shipping_routes(id);
alter table dossiers add column if not exists shipping_service_id uuid references shipping_services(id);
alter table dossiers add column if not exists origin_warehouse_id uuid references warehouses(id);
alter table dossiers add column if not exists destination_office_id uuid references agency_offices(id);
alter table dossiers add column if not exists pricing_snapshot_id uuid references pricing_quote_snapshots(id);
alter table cargo_expeditions add column if not exists shipping_service_id uuid references shipping_services(id);
alter table cargo_expeditions add column if not exists origin_warehouse_id uuid references warehouses(id);
alter table cargo_expeditions add column if not exists destination_office_id uuid references agency_offices(id);
alter table cargo_expeditions add column if not exists departure_id uuid references cargo_departures(id);
alter table finance_documents add column if not exists route_id uuid references shipping_routes(id);
alter table finance_documents add column if not exists shipping_service_id uuid references shipping_services(id);
alter table finance_documents add column if not exists pricing_snapshot_id uuid references pricing_quote_snapshots(id);

-- Deterministic backfill only. Ambiguous historical labels are intentionally
-- left unresolved and surfaced by the integrity report for human review.
update dossiers d set route_id=x.id from (
 select min(r.id::text)::uuid id,r.org_id,lower(r.origin_country) oc,lower(coalesce(r.origin_city,'')) oci,lower(r.destination_country) dc,lower(coalesce(r.destination_city,'')) dci,upper(r.transport_mode) mode
 from shipping_routes r where r.status<>'ARCHIVED' group by r.org_id,lower(r.origin_country),lower(coalesce(r.origin_city,'')),lower(r.destination_country),lower(coalesce(r.destination_city,'')),upper(r.transport_mode) having count(*)=1
) x where d.route_id is null and d.org_id=x.org_id and lower(coalesce(d.origin_country,''))=x.oc and lower(coalesce(d.origin_city,''))=x.oci and lower(coalesce(d.destination_country,''))=x.dc and lower(coalesce(d.destination_city,''))=x.dci and upper(coalesce(d.shipping_mode,''))=x.mode;
update dossiers d set shipping_service_id=x.id from (
 select min(s.id::text)::uuid id,s.org_id,s.route_id,upper(s.shipping_mode) mode from shipping_services s where s.status<>'ARCHIVED' group by s.org_id,s.route_id,upper(s.shipping_mode) having count(*)=1
) x where d.shipping_service_id is null and d.org_id=x.org_id and d.route_id=x.route_id and upper(coalesce(d.shipping_mode,''))=x.mode;
update cargo_packages p set warehouse_id=x.id from (
 select min(w.id::text)::uuid id,w.org_id,lower(w.warehouse_name) label from warehouses w where w.active group by w.org_id,lower(w.warehouse_name) having count(*)=1
) x where p.warehouse_id is null and p.org_id=x.org_id and lower(coalesce(p.warehouse_name,''))=x.label;
update cargo_expeditions e set shipping_service_id=x.id from (
 select min(s.id::text)::uuid id,s.org_id,s.route_id,upper(s.shipping_mode) mode from shipping_services s where s.status<>'ARCHIVED' group by s.org_id,s.route_id,upper(s.shipping_mode) having count(*)=1
) x where e.shipping_service_id is null and e.org_id=x.org_id and e.route_id=x.route_id and upper(coalesce(e.mode,''))=x.mode;

-- Every FK below is checked against organization ownership at mutation time.
create or replace function enforce_slaivio_reference_tenant() returns trigger language plpgsql as $$
declare i integer; ref_value uuid; ref_org text;
begin
 i:=0;
 while i<tg_nargs loop
  ref_value:=nullif(to_jsonb(new)->>tg_argv[i],'')::uuid;
  if ref_value is not null then
   execute format('select org_id from %I where id=$1',tg_argv[i+1]) into ref_org using ref_value;
   if ref_org is null or ref_org<>new.org_id then raise exception 'cross_tenant_reference:%:%',tg_argv[i],ref_value using errcode='23514'; end if;
  end if;
  i:=i+2;
 end loop;
 return new;
end $$;
drop trigger if exists trg_dossiers_reference_tenant on dossiers;
create trigger trg_dossiers_reference_tenant before insert or update of client_id,route_id,shipping_service_id,origin_warehouse_id,destination_office_id,pricing_snapshot_id on dossiers for each row execute function enforce_slaivio_reference_tenant('client_id','clients','route_id','shipping_routes','shipping_service_id','shipping_services','origin_warehouse_id','warehouses','destination_office_id','agency_offices','pricing_snapshot_id','pricing_quote_snapshots');
drop trigger if exists trg_packages_reference_tenant on cargo_packages;
create trigger trg_packages_reference_tenant before insert or update of client_id,dossier_id,route_id,shipping_service_id,warehouse_id on cargo_packages for each row execute function enforce_slaivio_reference_tenant('client_id','clients','dossier_id','dossiers','route_id','shipping_routes','shipping_service_id','shipping_services','warehouse_id','warehouses');
drop trigger if exists trg_expeditions_reference_tenant on cargo_expeditions;
create trigger trg_expeditions_reference_tenant before insert or update of route_id,shipping_service_id,origin_warehouse_id,destination_office_id,departure_id on cargo_expeditions for each row execute function enforce_slaivio_reference_tenant('route_id','shipping_routes','shipping_service_id','shipping_services','origin_warehouse_id','warehouses','destination_office_id','agency_offices','departure_id','cargo_departures');
drop trigger if exists trg_finance_reference_tenant on finance_documents;
create trigger trg_finance_reference_tenant before insert or update of client_id,dossier_id,route_id,shipping_service_id,pricing_snapshot_id on finance_documents for each row execute function enforce_slaivio_reference_tenant('client_id','clients','dossier_id','dossiers','route_id','shipping_routes','shipping_service_id','shipping_services','pricing_snapshot_id','pricing_quote_snapshots');
drop trigger if exists trg_departures_reference_tenant on cargo_departures;
create trigger trg_departures_reference_tenant before insert or update of shipping_service_id on cargo_departures for each row execute function enforce_slaivio_reference_tenant('shipping_service_id','shipping_services');

create index if not exists idx_dossiers_relations on dossiers(org_id,route_id,shipping_service_id,origin_warehouse_id,destination_office_id);
create index if not exists idx_expeditions_relations on cargo_expeditions(org_id,route_id,shipping_service_id,departure_id);
create index if not exists idx_finance_relations on finance_documents(org_id,route_id,shipping_service_id,pricing_snapshot_id);

create or replace view platform_reference_integrity as
select d.org_id,'DOSSIER' entity_type,d.id entity_id,d.dossier_reference reference,
 array_remove(array[case when d.client_id is null then 'CLIENT' end,case when d.route_id is null then 'ROUTE' end,case when d.shipping_service_id is null then 'SERVICE' end],null) missing_relations
from dossiers d where d.archived_at is null
union all
select p.org_id,'PACKAGE',p.id,p.package_reference,array_remove(array[case when p.client_id is null then 'CLIENT' end,case when p.dossier_id is null then 'DOSSIER' end,case when p.route_id is null then 'ROUTE' end,case when p.shipping_service_id is null then 'SERVICE' end,case when p.warehouse_id is null then 'WAREHOUSE' end],null)
from cargo_packages p where p.deleted_at is null
union all
select e.org_id,'EXPEDITION',e.id,e.expedition_reference,array_remove(array[case when e.route_id is null then 'ROUTE' end,case when e.shipping_service_id is null then 'SERVICE' end],null)
from cargo_expeditions e where e.deleted_at is null;

insert into permissions(permission_code,description) values ('references.read','Consulter les références métier partagées'),('references.audit','Auditer les relations entre modules') on conflict(permission_code) do update set description=excluded.description;
insert into role_permissions(role_id,permission_id) select r.id,p.id from organization_roles r cross join permissions p where (r.role_code in('OWNER','MANAGER') and p.permission_code in('references.read','references.audit')) or (r.role_code in('OPERATOR','WAREHOUSE','FINANCE','SUPPORT') and p.permission_code='references.read') on conflict do nothing;
