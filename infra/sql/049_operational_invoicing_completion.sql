alter table finance_documents drop constraint if exists finance_documents_status_check;
alter table finance_documents add constraint finance_documents_status_check check(status in ('DRAFT','ISSUED','ACCEPTED','REJECTED','PARTIALLY_PAID','PAID','OVERDUE','VOID'));
alter table finance_documents add column if not exists accepted_at timestamptz;
alter table finance_documents add column if not exists rejected_at timestamptz;
alter table finance_documents add column if not exists rejection_reason text;
alter table finance_documents add column if not exists credit_applied numeric(18,2) not null default 0 check(credit_applied>=0);
alter table finance_documents add column if not exists converted_document_id uuid references finance_documents(id);

alter table finance_payments add column if not exists reversed_at timestamptz;
alter table finance_payments add column if not exists reversed_by text;
alter table finance_payments add column if not exists reversal_reason text;

create table if not exists finance_settings(
 org_id text primary key references organizations(id) on delete cascade,
 legal_name text,
 tax_identifier text,
 billing_address text,
 default_currency text not null default 'USD' check(default_currency ~ '^[A-Z]{3}$'),
 default_tax_rate numeric(7,4) not null default 0 check(default_tax_rate between 0 and 100),
 default_payment_terms_days integer not null default 7 check(default_payment_terms_days between 0 and 365),
 document_footer text,
 updated_by text,
 updated_at timestamptz not null default now()
);

insert into permissions(permission_code,description) values
 ('finance.settings','Configurer les règles de facturation'),('finance.reverse_payment','Annuler un encaissement confirmé')
on conflict(permission_code) do update set description=excluded.description;
insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r cross join permissions p
where r.role_code in ('OWNER','ADMIN','MANAGER') and p.permission_code in ('finance.settings','finance.reverse_payment')
   or r.role_code='FINANCE' and p.permission_code='finance.reverse_payment'
on conflict do nothing;
