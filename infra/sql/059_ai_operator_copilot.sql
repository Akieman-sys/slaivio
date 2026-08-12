create table if not exists ai_operator_messages (
    id uuid primary key default gen_random_uuid(),
    org_id text not null,
    user_id text,
    role text not null check (role in ('USER', 'ASSISTANT', 'SYSTEM')),
    content text not null,
    workflow_id uuid references ai_workflow_runs(id) on delete set null,
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now()
);

create index if not exists idx_ai_operator_messages_org_created
on ai_operator_messages(org_id, created_at desc);

create index if not exists idx_ai_operator_workflows_queue
on ai_workflow_runs(org_id, workflow_status, created_at desc);

