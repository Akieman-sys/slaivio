-- Private dossier documents and operational checklist. Safe to rerun.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dossier-documents', 'dossier-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists dossier_documents (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    dossier_id uuid not null references dossiers(id) on delete cascade,
    document_type text not null,
    file_name text not null,
    object_path text not null,
    mime_type text not null,
    size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
    checksum_sha256 text not null check (length(checksum_sha256) = 64),
    verification_status text not null default 'PENDING' check (verification_status in ('PENDING','VERIFIED','REJECTED')),
    notes text,
    uploaded_by text not null,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    unique (org_id, object_path)
);

create index if not exists idx_dossier_documents_org_dossier
on dossier_documents(org_id, dossier_id, created_at desc) where deleted_at is null;

create table if not exists dossier_checklist_items (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    dossier_id uuid not null references dossiers(id) on delete cascade,
    code text not null,
    label text not null,
    required boolean not null default true,
    status text not null default 'PENDING' check (status in ('PENDING','COMPLETED','NOT_APPLICABLE')),
    sort_order integer not null default 0,
    completed_at timestamptz,
    completed_by text,
    row_version integer not null default 1 check (row_version > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (org_id, dossier_id, code)
);

create index if not exists idx_dossier_checklist_org_dossier
on dossier_checklist_items(org_id, dossier_id, sort_order);

create or replace function seed_dossier_checklist(p_org_id text, p_dossier_id uuid)
returns void language sql as $$
    insert into dossier_checklist_items (org_id, dossier_id, code, label, sort_order)
    values
      (p_org_id, p_dossier_id, 'CLIENT_IDENTITY', 'Identité client vérifiée', 10),
      (p_org_id, p_dossier_id, 'ROUTE_CONFIRMED', 'Route et mode de transport confirmés', 20),
      (p_org_id, p_dossier_id, 'GOODS_DECLARATION', 'Description de marchandise complète', 30),
      (p_org_id, p_dossier_id, 'REQUIRED_DOCUMENTS', 'Pièces justificatives reçues', 40),
      (p_org_id, p_dossier_id, 'PRICING_APPROVED', 'Tarification approuvée', 50),
      (p_org_id, p_dossier_id, 'OPERATIONS_VALIDATION', 'Validation opérationnelle finale', 60)
    on conflict (org_id, dossier_id, code) do nothing;
$$;

create or replace function seed_new_dossier_checklist()
returns trigger language plpgsql as $$ begin
    perform seed_dossier_checklist(new.org_id, new.id); return new;
end $$;

drop trigger if exists trg_seed_dossier_checklist on dossiers;
create trigger trg_seed_dossier_checklist after insert on dossiers
for each row execute function seed_new_dossier_checklist();

do $$ declare r record; begin
    for r in select org_id, id from dossiers loop perform seed_dossier_checklist(r.org_id, r.id); end loop;
end $$;

drop trigger if exists trg_dossier_documents_tenant on dossier_documents;
create trigger trg_dossier_documents_tenant before insert or update of org_id, dossier_id
on dossier_documents for each row execute function enforce_dossier_child_tenant();
drop trigger if exists trg_dossier_checklist_tenant on dossier_checklist_items;
create trigger trg_dossier_checklist_tenant before insert or update of org_id, dossier_id
on dossier_checklist_items for each row execute function enforce_dossier_child_tenant();

revoke all on dossier_documents, dossier_checklist_items from public;
