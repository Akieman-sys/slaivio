-- Facturation opérationnelle des clients cargo. Ne pas confondre avec billing_invoices (abonnement SaaS).
create table if not exists finance_document_sequences (
  org_id text not null references organizations(id) on delete cascade,
  document_type text not null check (document_type in ('QUOTE','INVOICE','CREDIT_NOTE','RECEIPT')),
  year integer not null,
  last_value bigint not null default 0,
  primary key (org_id, document_type, year)
);

create table if not exists finance_documents (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  document_type text not null check (document_type in ('QUOTE','INVOICE','CREDIT_NOTE')),
  document_number text not null,
  client_id uuid references clients(id),
  dossier_id uuid references dossiers(id),
  source_document_id uuid references finance_documents(id),
  status text not null default 'DRAFT' check (status in ('DRAFT','ISSUED','ACCEPTED','PARTIALLY_PAID','PAID','OVERDUE','VOID')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(18,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(18,2) not null default 0 check (discount_total >= 0),
  tax_total numeric(18,2) not null default 0 check (tax_total >= 0),
  total numeric(18,2) not null default 0 check (total >= 0),
  amount_paid numeric(18,2) not null default 0 check (amount_paid >= 0),
  balance_due numeric(18,2) not null default 0 check (balance_due >= 0),
  issue_date date,
  due_date date,
  notes text,
  terms text,
  row_version integer not null default 1,
  created_by text,
  created_by_name text,
  issued_by text,
  issued_at timestamptz,
  voided_by text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, document_number)
);
create index if not exists idx_finance_documents_org_status on finance_documents(org_id,status,created_at desc);
create index if not exists idx_finance_documents_client on finance_documents(org_id,client_id);

create table if not exists finance_document_lines (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  document_id uuid not null references finance_documents(id) on delete cascade,
  position integer not null,
  description text not null,
  quantity numeric(18,3) not null check(quantity > 0),
  unit_price numeric(18,2) not null check(unit_price >= 0),
  discount_rate numeric(7,4) not null default 0 check(discount_rate between 0 and 100),
  tax_rate numeric(7,4) not null default 0 check(tax_rate between 0 and 100),
  line_subtotal numeric(18,2) not null,
  line_discount numeric(18,2) not null,
  line_tax numeric(18,2) not null,
  line_total numeric(18,2) not null,
  metadata jsonb not null default '{}',
  unique(document_id,position)
);

create table if not exists finance_payments (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id) on delete cascade,
  document_id uuid not null references finance_documents(id),
  receipt_number text not null,
  amount numeric(18,2) not null check(amount > 0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  method text not null,
  reference text,
  paid_at timestamptz not null,
  idempotency_key text not null,
  status text not null default 'CONFIRMED' check(status in ('CONFIRMED','REVERSED')),
  recorded_by text,
  recorded_by_name text,
  created_at timestamptz not null default now(),
  unique(org_id,idempotency_key), unique(org_id,receipt_number)
);

create table if not exists finance_events (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  document_id uuid references finance_documents(id),
  payment_id uuid references finance_payments(id),
  event_type text not null,
  actor_id text,
  actor_name text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_finance_events_document on finance_events(org_id,document_id,created_at desc);

insert into permissions(permission_code,description) values
 ('finance.read','Consulter la facturation opérationnelle'),('finance.create','Créer devis, factures et avoirs'),
 ('finance.issue','Émettre les documents financiers'),('finance.payments','Enregistrer les paiements'),
 ('finance.void','Annuler un document financier'),('finance.export','Exporter la facturation')
on conflict(permission_code) do update set description=excluded.description;

insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r cross join permissions p
where (r.role_code in ('OWNER','ADMIN','MANAGER') and p.permission_code like 'finance.%')
   or (r.role_code='FINANCE' and p.permission_code in ('finance.read','finance.create','finance.issue','finance.payments','finance.export'))
   or (r.role_code in ('OPERATOR','SUPPORT') and p.permission_code='finance.read')
on conflict do nothing;
