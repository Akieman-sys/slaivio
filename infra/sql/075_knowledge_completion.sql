-- Knowledge OS completion: hybrid search, translations, connectors, suggestions
create extension if not exists vector;

alter table knowledge_entries add column if not exists translation_group_id uuid;
alter table knowledge_entries add column if not exists translated_from_id uuid references knowledge_entries(id);
alter table knowledge_entries add column if not exists translation_status text not null default 'ORIGINAL' check(translation_status in ('ORIGINAL','SUGGESTED','PENDING_REVIEW','VALIDATED'));
alter table knowledge_entries add column if not exists embedding vector(1024);
alter table knowledge_entries add column if not exists embedding_model text;
alter table knowledge_entries add column if not exists embedded_at timestamptz;
alter table knowledge_chunks add column if not exists embedding vector(1024);
alter table knowledge_chunks add column if not exists embedding_model text;
alter table knowledge_files add column if not exists scan_engine text;
alter table knowledge_files add column if not exists scan_signature text;
alter table knowledge_files add column if not exists scanned_at timestamptz;

create table if not exists knowledge_connectors(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),workspace_id text,
 provider text not null check(provider in('GOOGLE_DRIVE','NOTION','SHAREPOINT')),display_name text not null,
 encrypted_credentials text,configuration jsonb not null default '{}'::jsonb,status text not null default 'DISCONNECTED' check(status in('DISCONNECTED','CONNECTED','SYNCING','ERROR','REAUTH_REQUIRED')),
 last_sync_at timestamptz,last_sync_status text,last_error text,sync_cursor text,created_by text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,provider,display_name)
);
create table if not exists knowledge_connector_documents(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),connector_id uuid not null references knowledge_connectors(id) on delete cascade,
 external_id text not null,external_url text,title text not null,mime_type text,external_modified_at timestamptz,content_hash text,
 sync_status text not null default 'DISCOVERED' check(sync_status in('DISCOVERED','IMPORTED','UPDATED','CONFLICT','DELETED','ERROR')),
 knowledge_id uuid references knowledge_entries(id),last_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(connector_id,external_id)
);
create table if not exists knowledge_suggestions(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id),workspace_id text,
 suggestion_type text not null check(suggestion_type in('UNANSWERED_QUESTION','STALE_CONTENT','MISSING_TRANSLATION','DUPLICATE','LIVE_REFERENCE')),
 title text not null,description text not null,evidence jsonb not null default '{}'::jsonb,priority text not null default 'MEDIUM' check(priority in('LOW','MEDIUM','HIGH')),
 status text not null default 'OPEN' check(status in('OPEN','ACCEPTED','DISMISSED','COMPLETED')),knowledge_id uuid references knowledge_entries(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists idx_knowledge_embedding on knowledge_entries using hnsw(embedding vector_cosine_ops) where embedding is not null;
create index if not exists idx_knowledge_chunk_embedding on knowledge_chunks using hnsw(embedding vector_cosine_ops) where embedding is not null;
create index if not exists idx_knowledge_translation_group on knowledge_entries(org_id,translation_group_id,language);
create index if not exists idx_knowledge_connectors_org on knowledge_connectors(org_id,status);
create index if not exists idx_knowledge_suggestions_org on knowledge_suggestions(org_id,status,priority);

insert into permissions(permission_code,description) values
 ('knowledge.translate','Proposer et valider les traductions'),('knowledge.connectors','Gérer les sources connectées')
on conflict(permission_code) do update set description=excluded.description;
insert into role_permissions(role_id,permission_id) select r.id,p.id from organization_roles r cross join permissions p where r.role_code in('OWNER','MANAGER') and p.permission_code in('knowledge.translate','knowledge.connectors') on conflict do nothing;
