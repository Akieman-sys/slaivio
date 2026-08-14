-- SLAIVIO Cargo Pricing Engine. Additive, tenant-scoped and transaction-safe.
create table if not exists pricing_grids(
 id uuid primary key default gen_random_uuid(), org_id text not null references organizations(id), workspace_id text,
 grid_code text not null, name text not null, description text, route_id uuid not null references shipping_routes(id), shipping_service_id uuid not null references shipping_services(id),
 currency_code text not null default 'USD', calculation_method text not null check(calculation_method in('PER_KG','PER_CBM','PER_PACKAGE','PER_UNIT','PERCENT_VALUE','FIXED','TIERED','CUSTOM')),
 visibility text not null default 'INTERNAL' check(visibility in('PUBLIC','INTERNAL','CONTRACTUAL')), status text not null default 'DRAFT' check(status in('DRAFT','SCHEDULED','ACTIVE','EXPIRED','SUSPENDED','ARCHIVED')),
 effective_from timestamptz not null default now(), effective_until timestamptz, volumetric_divisor numeric(12,3) not null default 6000,
 chargeable_weight_rule text not null default 'MAX' check(chargeable_weight_rule in('ACTUAL','VOLUMETRIC','MAX')),
 rounding_increment numeric(10,3) not null default 0.1, minimum_weight_kg numeric(14,3), minimum_cbm numeric(14,4), maximum_weight_kg numeric(14,3), maximum_cbm numeric(14,4), maximum_declared_value numeric(18,2),
 tax_inclusive boolean not null default false, tax_rate numeric(8,4) not null default 0, requires_approval boolean not null default true,
 version integer not null default 1, row_version integer not null default 1, approved_by text, approved_at timestamptz,
 created_by text not null, updated_by text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 unique(org_id,grid_code,version), check(effective_until is null or effective_until>effective_from), check(rounding_increment>0), check(volumetric_divisor>0)
);
create table if not exists pricing_categories(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),code text not null,name text not null,parent_id uuid references pricing_categories(id),description text,risk_class text not null default 'ORDINARY',active boolean not null default true,metadata jsonb not null default '{}',created_at timestamptz not null default now(),unique(org_id,code)
);
create table if not exists pricing_grid_rules(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),grid_id uuid not null references pricing_grids(id) on delete cascade,rule_code text not null,name text not null,
 category_id uuid references pricing_categories(id),client_id uuid references clients(id),client_segment text,warehouse_id uuid references warehouses(id),office_id uuid,
 min_weight_kg numeric(14,3),max_weight_kg numeric(14,3),min_cbm numeric(14,4),max_cbm numeric(14,4),min_value numeric(18,2),max_value numeric(18,2),min_units integer,max_units integer,
 conditions jsonb not null default '{}',action_type text not null check(action_type in('SET_PRICE','ADD_FEE','APPLY_DISCOUNT','SET_MINIMUM','MANUAL_QUOTE','PROHIBIT')),
 calculation_method text check(calculation_method is null or calculation_method in('PER_KG','PER_CBM','PER_PACKAGE','PER_UNIT','PERCENT_VALUE','FIXED','TIERED','CUSTOM')),
 amount numeric(18,4),percentage numeric(9,4),priority integer not null default 100,stackable boolean not null default false,active boolean not null default true,effective_from timestamptz not null default now(),effective_until timestamptz,created_at timestamptz not null default now(),unique(grid_id,rule_code)
);
create table if not exists pricing_tiers(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),grid_id uuid not null references pricing_grids(id) on delete cascade,rule_id uuid references pricing_grid_rules(id) on delete cascade,basis text not null check(basis in('WEIGHT','CBM','UNITS','VALUE','MONTHLY_VOLUME')),min_quantity numeric(18,4) not null,max_quantity numeric(18,4),unit_price numeric(18,4) not null,priority integer not null default 100,unique(grid_id,basis,min_quantity)
);
create table if not exists pricing_fees(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),grid_id uuid not null references pricing_grids(id) on delete cascade,fee_code text not null,name text not null,fee_type text not null check(fee_type in('HANDLING','WAREHOUSE','PACKAGING','CUSTOMS','INSURANCE','LAST_MILE','PICKUP','REMOTE_AREA','FUEL','DANGEROUS_GOODS','SENSITIVE_GOODS','DOCUMENTATION','INSPECTION','STORAGE','TAX','OTHER')),calculation_method text not null check(calculation_method in('FIXED','PER_KG','PER_CBM','PERCENT_SUBTOTAL','PERCENT_VALUE')),amount numeric(18,4) not null,conditions jsonb not null default '{}',taxable boolean not null default false,active boolean not null default true,priority integer not null default 100,unique(grid_id,fee_code)
);
create table if not exists pricing_promotions(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),workspace_id text,code text,name text not null,discount_type text not null check(discount_type in('PERCENTAGE','FIXED')),discount_value numeric(18,4) not null,route_ids uuid[] not null default '{}',service_ids uuid[] not null default '{}',client_ids uuid[] not null default '{}',client_segments text[] not null default '{}',conditions jsonb not null default '{}',stackable boolean not null default false,usage_limit integer,usage_count integer not null default 0,status text not null default 'DRAFT' check(status in('DRAFT','SCHEDULED','ACTIVE','EXPIRED','SUSPENDED','ARCHIVED')),effective_from timestamptz not null,effective_until timestamptz,created_by text not null,created_at timestamptz not null default now(),unique(org_id,code)
);
create table if not exists pricing_internal_costs(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),grid_id uuid not null references pricing_grids(id) on delete cascade,cost_code text not null,cost_type text not null,calculation_method text not null check(calculation_method in('FIXED','PER_KG','PER_CBM','PERCENTAGE')),amount numeric(18,4) not null,currency_code text not null,effective_from timestamptz not null default now(),effective_until timestamptz,created_by text not null,created_at timestamptz not null default now(),unique(grid_id,cost_code,effective_from)
);
create table if not exists pricing_approvals(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),grid_id uuid not null references pricing_grids(id),request_type text not null default 'ACTIVATION',status text not null default 'PENDING' check(status in('PENDING','APPROVED','REJECTED','CANCELLED')),reason text,requested_by text not null,decided_by text,decision_note text,created_at timestamptz not null default now(),decided_at timestamptz);
create table if not exists pricing_quote_snapshots(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),workspace_id text,grid_id uuid references pricing_grids(id),grid_version integer,client_id uuid references clients(id),dossier_id uuid references dossiers(id),finance_document_id uuid,
 input_payload jsonb not null,result_payload jsonb not null,currency_code text not null,exchange_rate numeric(20,8) not null default 1,fingerprint text not null,idempotency_key text,created_by text,created_at timestamptz not null default now(),unique(org_id,idempotency_key)
);
create table if not exists pricing_templates(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),name text not null,calculation_method text not null,configuration jsonb not null default '{}',active boolean not null default true,created_by text,created_at timestamptz not null default now(),unique(org_id,name));
create table if not exists pricing_saved_views(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),user_id text not null,name text not null,filters jsonb not null default '{}',created_at timestamptz not null default now(),unique(org_id,user_id,name));
create table if not exists pricing_settings(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) unique,default_currency text not null default 'USD',minimum_margin_percent numeric(8,4) not null default 15,max_agent_discount_percent numeric(8,4) not null default 3,approval_required boolean not null default true,allow_discount_stacking boolean not null default false,default_volumetric_divisor numeric(12,3) not null default 6000,updated_by text,updated_at timestamptz not null default now());
create table if not exists pricing_alerts(id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),grid_id uuid references pricing_grids(id),alert_type text not null,severity text not null default 'MEDIUM',message text not null,status text not null default 'OPEN',resolved_by text,resolved_at timestamptz,created_at timestamptz not null default now(),unique(org_id,grid_id,alert_type,status));
create table if not exists pricing_audit_events(id bigserial primary key,org_id text not null references organizations(id),grid_id uuid references pricing_grids(id),event_type text not null,old_values jsonb,new_values jsonb,reason text,actor_id text not null,actor_name text,created_at timestamptz not null default now());
create index if not exists idx_pricing_grids_scope on pricing_grids(org_id,workspace_id,status,effective_from,effective_until);
create index if not exists idx_pricing_grids_route_service on pricing_grids(org_id,route_id,shipping_service_id,status);
create index if not exists idx_pricing_rules_match on pricing_grid_rules(org_id,grid_id,active,priority desc);
create index if not exists idx_pricing_promotions_active on pricing_promotions(org_id,status,effective_from,effective_until);
create index if not exists idx_pricing_snapshots_org on pricing_quote_snapshots(org_id,created_at desc);
insert into pricing_settings(org_id) select id from organizations on conflict(org_id) do nothing;
insert into pricing_categories(org_id,code,name,risk_class) select o.id,x.code,x.name,x.risk from organizations o cross join(values('ORDINARY_GOODS','Ordinary Goods','ORDINARY'),('SENSITIVE_GOODS','Sensitive Goods','SENSITIVE'),('ELECTRONICS','Electronics','SENSITIVE'),('PHONES','Phones','SENSITIVE'),('COMPUTERS','Computers','SENSITIVE'),('COSMETICS','Cosmetics','SENSITIVE'),('FOOD','Food','CONDITIONAL'),('LIQUIDS','Liquids','CONDITIONAL'),('BATTERY','Battery','DANGEROUS'),('PHARMACEUTICAL','Pharmaceutical','CONDITIONAL'),('HIGH_VALUE','High Value','HIGH_VALUE'),('DANGEROUS_GOODS','Dangerous Goods','DANGEROUS')) x(code,name,risk) on conflict(org_id,code) do nothing;
insert into permissions(permission_code,description) values
 ('pricing.read','Consulter les grilles tarifaires'),('pricing.create','Créer grilles et règles'),('pricing.update','Modifier grilles et règles'),('pricing.approve','Approuver et activer les tarifs'),('pricing.costs','Voir et gérer coûts et marges'),('pricing.simulate','Simuler un prix explicable'),('pricing.discount','Appliquer des remises autorisées'),('pricing.export','Exporter les tarifs'),('pricing.analytics','Consulter les analytics tarifaires'),('pricing.settings','Gérer les paramètres du moteur')
on conflict(permission_code) do update set description=excluded.description;
insert into role_permissions(role_id,permission_id) select r.id,p.id from organization_roles r cross join permissions p where
 (r.role_code='OWNER' and p.permission_code like 'pricing.%') or
 (r.role_code='MANAGER' and p.permission_code in('pricing.read','pricing.create','pricing.update','pricing.approve','pricing.simulate','pricing.discount','pricing.export','pricing.analytics')) or
 (r.role_code='FINANCE' and p.permission_code in('pricing.read','pricing.approve','pricing.costs','pricing.simulate','pricing.analytics')) or
 (r.role_code in('OPERATOR','SUPPORT') and p.permission_code in('pricing.read','pricing.simulate')) on conflict do nothing;
