create table if not exists analytics_saved_views(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) on delete cascade,
 owner_id text not null,name text not null,report_key text not null,filters jsonb not null default '{}',is_shared boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,owner_id,name)
);
create table if not exists report_export_audit(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) on delete cascade,
 actor_id text not null,report_key text not null,format text not null,filters jsonb not null default '{}',row_count integer not null,
 created_at timestamptz not null default now()
);
create index if not exists idx_report_export_audit_org on report_export_audit(org_id,created_at desc);
insert into permissions(permission_code,description) values
 ('analytics.read','Consulter les indicateurs et tendances'),('reports.read','Consulter les rapports opérationnels'),
 ('reports.export','Exporter les données des rapports'),('reports.manage','Gérer les vues de rapports')
on conflict(permission_code) do update set description=excluded.description;
insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r join permissions p on p.permission_code in ('analytics.read','reports.read')
where r.role_code in ('OWNER','MANAGER','FINANCE') on conflict do nothing;
insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r join permissions p on p.permission_code in ('reports.export','reports.manage')
where r.role_code in ('OWNER','MANAGER','FINANCE') on conflict do nothing;
