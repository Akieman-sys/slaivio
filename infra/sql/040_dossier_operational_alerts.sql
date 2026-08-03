-- Operational dossier alerts with deduplication and lifecycle. Safe to rerun.

create table if not exists dossier_operational_alerts (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organizations(id),
    dossier_id uuid not null references dossiers(id) on delete cascade,
    alert_type text not null check (alert_type in ('OVERDUE','URGENT','CHECKLIST_INCOMPLETE','STALE')),
    status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
    severity text not null check (severity in ('NORMAL','HIGH','CRITICAL')),
    title text not null,
    message text not null,
    fingerprint text not null,
    detected_at timestamptz not null default now(),
    acknowledged_at timestamptz,
    acknowledged_by text,
    resolved_at timestamptz,
    last_evaluated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (org_id, dossier_id, alert_type)
);

create index if not exists idx_dossier_alerts_org_status_severity
on dossier_operational_alerts(org_id, status, severity, detected_at desc);

create table if not exists dossier_alert_refresh_state (
    org_id text primary key references organizations(id),
    last_refreshed_at timestamptz not null default now(),
    last_active_count integer not null default 0,
    updated_at timestamptz not null default now()
);

drop trigger if exists trg_dossier_operational_alerts_tenant on dossier_operational_alerts;
create trigger trg_dossier_operational_alerts_tenant before insert or update of org_id, dossier_id
on dossier_operational_alerts for each row execute function enforce_dossier_child_tenant();

revoke all on dossier_operational_alerts, dossier_alert_refresh_state from public;
