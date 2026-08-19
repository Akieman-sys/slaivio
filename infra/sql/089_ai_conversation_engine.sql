-- Unified, tenant-safe conversation state for the SLAIVIO operator copilot
-- and the future WhatsApp rollout. Business records remain owned by their
-- respective modules; these tables only retain dialogue and execution facts.

create table if not exists ai_conversation_sessions (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    workspace_id text,
    channel text not null check (channel in ('INTERNAL','WHATSAPP')),
    actor_id text,
    client_id uuid references clients(id),
    client_phone text,
    status text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED','COMPLETED','CANCELLED')),
    current_workflow_id uuid references ai_workflow_runs(id) on delete set null,
    context jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_ai_conversation_active_internal
on ai_conversation_sessions(org_id, actor_id, channel)
where status='ACTIVE' and channel='INTERNAL';

create unique index if not exists idx_ai_conversation_active_whatsapp
on ai_conversation_sessions(org_id, client_phone, channel)
where status='ACTIVE' and channel='WHATSAPP';

create table if not exists ai_workflow_field_validations (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    workspace_id text,
    workflow_id uuid not null references ai_workflow_runs(id) on delete cascade,
    field_name text not null,
    raw_value text,
    normalized_value jsonb,
    validation_status text not null check (validation_status in ('VALID','INVALID','UNKNOWN','AMBIGUOUS','CONFLICT')),
    reason text,
    choices jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    unique(workflow_id, field_name)
);

create table if not exists ai_tool_executions (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    workspace_id text,
    workflow_id uuid references ai_workflow_runs(id) on delete set null,
    tool_name text not null,
    risk_level text not null check (risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
    input_payload jsonb not null default '{}'::jsonb,
    output_payload jsonb not null default '{}'::jsonb,
    status text not null check (status in ('PROPOSED','RUNNING','SUCCEEDED','FAILED','BLOCKED')),
    idempotency_key text not null,
    actor_id text,
    error_code text,
    created_at timestamptz not null default now(),
    completed_at timestamptz,
    unique(org_id, idempotency_key)
);

alter table ai_workflow_runs add column if not exists workspace_id text;
alter table ai_workflow_runs add column if not exists channel text not null default 'INTERNAL';
alter table ai_workflow_runs add column if not exists dialogue_state text not null default 'COLLECTING';
alter table ai_workflow_runs add column if not exists risk_level text not null default 'MEDIUM';
alter table ai_workflow_runs add column if not exists idempotency_key text;
alter table ai_workflow_runs add column if not exists client_id uuid references clients(id);
alter table ai_workflow_runs add column if not exists dossier_id uuid references dossiers(id);
alter table ai_workflow_runs add column if not exists package_id uuid references cargo_packages(id);

create unique index if not exists idx_ai_workflow_idempotency
on ai_workflow_runs(org_id,idempotency_key)
where idempotency_key is not null;

create index if not exists idx_ai_conversation_tenant
on ai_conversation_sessions(org_id,workspace_id,channel,status,updated_at desc);
create index if not exists idx_ai_tool_execution_workflow
on ai_tool_executions(org_id,workflow_id,created_at desc);

insert into permissions(permission_code,description) values
 ('ai.copilot.read','Utiliser l’assistant opérationnel'),
 ('ai.copilot.execute','Exécuter les actions cargo sûres préparées par l’assistant'),
 ('ai.copilot.manage','Configurer les capacités et règles de l’assistant')
on conflict(permission_code) do update set description=excluded.description;

insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r cross join permissions p
where (r.role_code in ('OWNER','MANAGER') and p.permission_code like 'ai.copilot.%')
   or (r.role_code in ('OPERATOR','WAREHOUSE') and p.permission_code in ('ai.copilot.read','ai.copilot.execute'))
on conflict do nothing;
