-- SLAIVIO Knowledge Operating System
-- Source contrôlée des explications, FAQ, procédures et règles. Les données
-- transactionnelles restent dans Routes, Services, Pricing, Tracking et WMS.

create table if not exists knowledge_entries (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    workspace_id text,
    reference text not null,
    title text not null,
    knowledge_type text not null check (knowledge_type in ('TEXT','FAQ','RULE','PROCEDURE','POLICY','DOCUMENT','LIVE_REFERENCE')),
    category text not null,
    content text not null default '',
    structured_data jsonb not null default '{}'::jsonb,
    question_variants text[] not null default '{}',
    tags text[] not null default '{}',
    language text not null default 'FR',
    audiences text[] not null default '{EMPLOYEES}',
    ai_scope text not null default 'NONE' check (ai_scope in ('NONE','CLIENT','INTERNAL','BOTH')),
    source_type text not null default 'MANUAL' check (source_type in ('MANUAL','ROUTE','SERVICE','PRICING','WAREHOUSE','OFFICE','DOCUMENT','API','IMPORT')),
    source_entity_type text,
    source_entity_id text,
    source_file_id uuid,
    status text not null default 'DRAFT' check (status in ('DRAFT','PENDING_REVIEW','APPROVED','PUBLISHED','NEEDS_REVIEW','EXPIRED','ARCHIVED')),
    confidence numeric(5,4) not null default 1 check (confidence between 0 and 1),
    sensitive boolean not null default false,
    effective_at timestamptz,
    expires_at timestamptz,
    review_due_at timestamptz,
    review_interval_days integer check (review_interval_days is null or review_interval_days > 0),
    owner_id text,
    owner_name text,
    approved_by text,
    approved_at timestamptz,
    published_by text,
    published_at timestamptz,
    archived_by text,
    archived_at timestamptz,
    version integer not null default 1,
    created_by text not null,
    created_by_name text,
    updated_by text not null,
    updated_by_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(org_id, reference),
    check (not sensitive or ai_scope not in ('CLIENT','BOTH')),
    check (status <> 'PUBLISHED' or approved_at is not null)
);

create table if not exists knowledge_versions (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    knowledge_id uuid not null references knowledge_entries(id) on delete cascade,
    version integer not null,
    snapshot jsonb not null,
    change_reason text,
    created_by text not null,
    created_by_name text,
    created_at timestamptz not null default now(),
    unique(knowledge_id, version)
);

create table if not exists knowledge_files (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    workspace_id text,
    file_name text not null,
    object_path text not null,
    mime_type text not null,
    size_bytes bigint not null check(size_bytes > 0),
    checksum_sha256 text not null,
    scan_status text not null default 'PENDING' check(scan_status in ('PENDING','CLEAN','REJECTED','ERROR')),
    extraction_status text not null default 'PENDING' check(extraction_status in ('PENDING','EXTRACTED','NEEDS_REVIEW','FAILED')),
    extracted_text text,
    detected_data jsonb not null default '{}'::jsonb,
    confidence numeric(5,4),
    prompt_injection_detected boolean not null default false,
    import_status text not null default 'UPLOADED' check(import_status in ('UPLOADED','MAPPED','VALIDATED','IMPORTED','REJECTED')),
    created_by text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(org_id, checksum_sha256)
);

alter table knowledge_entries drop constraint if exists knowledge_entries_source_file_id_fkey;
alter table knowledge_entries add constraint knowledge_entries_source_file_id_fkey foreign key(source_file_id) references knowledge_files(id);

create table if not exists knowledge_chunks (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    knowledge_id uuid references knowledge_entries(id) on delete cascade,
    file_id uuid references knowledge_files(id) on delete cascade,
    chunk_index integer not null,
    content text not null,
    metadata jsonb not null default '{}'::jsonb,
    search_vector tsvector generated always as (to_tsvector('simple', coalesce(content,''))) stored,
    created_at timestamptz not null default now(),
    check(knowledge_id is not null or file_id is not null),
    unique(knowledge_id, chunk_index),
    unique(file_id, chunk_index)
);

create table if not exists knowledge_relations (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    knowledge_id uuid not null references knowledge_entries(id) on delete cascade,
    entity_type text not null,
    entity_id text not null,
    relation_type text not null default 'APPLIES_TO',
    created_at timestamptz not null default now(),
    unique(knowledge_id, entity_type, entity_id, relation_type)
);

create table if not exists knowledge_conflicts (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    left_knowledge_id uuid not null references knowledge_entries(id),
    right_knowledge_id uuid not null references knowledge_entries(id),
    conflict_type text not null check(conflict_type in ('DUPLICATE','CONTRADICTION','SOURCE_DIVERGENCE')),
    explanation text not null,
    status text not null default 'OPEN' check(status in ('OPEN','IGNORED','RESOLVED')),
    resolution text,
    resolved_by text,
    resolved_at timestamptz,
    created_at timestamptz not null default now(),
    unique(org_id,left_knowledge_id,right_knowledge_id,conflict_type),
    check(left_knowledge_id <> right_knowledge_id)
);

create table if not exists knowledge_feedback (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    knowledge_id uuid references knowledge_entries(id),
    response_log_id uuid,
    rating text not null check(rating in ('CORRECT','INCORRECT','IMPROVE')),
    comment text,
    status text not null default 'OPEN' check(status in ('OPEN','IN_REVIEW','RESOLVED')),
    created_by text not null,
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);

create table if not exists knowledge_response_logs (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    workspace_id text,
    channel text not null check(channel in ('CLIENT','INTERNAL','PLAYGROUND','WHATSAPP')),
    language text not null default 'FR',
    question text not null,
    answer text,
    decision text not null check(decision in ('ANSWERED','ESCALATED','NO_RESULT','BLOCKED')),
    source_ids uuid[] not null default '{}',
    structured_sources jsonb not null default '[]'::jsonb,
    model_name text,
    latency_ms integer,
    actor_id text,
    client_id text,
    created_at timestamptz not null default now()
);

alter table knowledge_feedback drop constraint if exists knowledge_feedback_response_log_id_fkey;
alter table knowledge_feedback add constraint knowledge_feedback_response_log_id_fkey foreign key(response_log_id) references knowledge_response_logs(id);

create table if not exists knowledge_saved_views (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    user_id text not null,
    name text not null,
    filters jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique(org_id,user_id,name)
);

create table if not exists knowledge_settings (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id) unique,
    client_ai_enabled boolean not null default false,
    internal_ai_enabled boolean not null default true,
    default_language text not null default 'FR',
    response_tone text not null default 'PROFESSIONAL',
    escalation_topics text[] not null default array['CUSTOMS','DISPUTE','NEGOTIATED_PRICE','PROHIBITED_GOODS'],
    client_fallback_message text not null default 'Je n’ai pas encore cette information dans les données de l’agence. Souhaitez-vous être mis en relation avec un agent ?',
    system_rules text[] not null default array['USE_AGENCY_NAME','NEVER_INVENT_PRICE','NEVER_PROMISE_UNCONFIRMED_DATE','ASK_MISSING_INFORMATION'],
    retention_days integer not null default 365 check(retention_days between 30 and 3650),
    updated_by text,
    updated_at timestamptz not null default now()
);

create table if not exists knowledge_audit_events (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    knowledge_id uuid references knowledge_entries(id),
    event_type text not null,
    old_values jsonb,
    new_values jsonb,
    actor_id text not null,
    actor_name text,
    created_at timestamptz not null default now()
);

create index if not exists idx_knowledge_entries_scope on knowledge_entries(org_id,workspace_id,status,ai_scope,language);
create index if not exists idx_knowledge_entries_review on knowledge_entries(org_id,review_due_at,expires_at) where status not in ('ARCHIVED','EXPIRED');
create index if not exists idx_knowledge_entries_source on knowledge_entries(org_id,source_type,source_entity_type,source_entity_id);
-- `array_to_string` n'est pas IMMUTABLE dans PostgreSQL et ne peut donc pas
-- apparaître dans une expression d'index. Le texte et les tableaux utilisent
-- des index séparés, chacun avec son opérateur natif.
create index if not exists idx_knowledge_entries_search
on knowledge_entries
using gin(to_tsvector('simple'::regconfig,coalesce(title,'')||' '||coalesce(content,'')));
create index if not exists idx_knowledge_entries_tags
on knowledge_entries using gin(tags);
create index if not exists idx_knowledge_entries_question_variants
on knowledge_entries using gin(question_variants);
create index if not exists idx_knowledge_chunks_search on knowledge_chunks using gin(search_vector);
create index if not exists idx_knowledge_files_org on knowledge_files(org_id,created_at desc);
create index if not exists idx_knowledge_logs_org on knowledge_response_logs(org_id,created_at desc);
create index if not exists idx_knowledge_conflicts_org on knowledge_conflicts(org_id,status,created_at desc);

insert into permissions(permission_code,description) values
 ('knowledge.read','Consulter les connaissances autorisées'),
 ('knowledge.create','Créer et importer des connaissances'),
 ('knowledge.update','Modifier les connaissances'),
 ('knowledge.review','Valider ou demander une révision'),
 ('knowledge.publish','Publier pour les équipes et l’IA'),
 ('knowledge.archive','Archiver et restaurer une connaissance'),
 ('knowledge.manage','Gérer les règles IA, conflits et sources'),
 ('knowledge.analytics','Consulter les analytics Knowledge')
on conflict(permission_code) do update set description=excluded.description;

insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r cross join permissions p
where (r.role_code='OWNER' and p.permission_code like 'knowledge.%')
   or (r.role_code='MANAGER' and p.permission_code in ('knowledge.read','knowledge.create','knowledge.update','knowledge.review','knowledge.publish','knowledge.archive','knowledge.manage','knowledge.analytics'))
   or (r.role_code in ('OPERATOR','WAREHOUSE','FINANCE') and p.permission_code in ('knowledge.read','knowledge.create'))
on conflict do nothing;

-- Reprise contrôlée des anciennes connaissances : elles restent en brouillon,
-- donc aucune donnée historique ne devient visible par l’IA client par défaut.
insert into knowledge_entries(org_id,reference,title,knowledge_type,category,content,tags,source_type,status,created_by,updated_by)
select d.org_id,'LEGACY-'||upper(substr(d.id::text,1,8)),d.title,'TEXT',coalesce(upper(d.category),'GENERAL'),d.content,coalesce(d.tags,'{}'),'IMPORT','DRAFT','migration','migration'
from ai_knowledge_documents d
where d.is_active=true
on conflict(org_id,reference) do nothing;

insert into knowledge_settings(org_id)
select id from organizations
on conflict(org_id) do nothing;
