-- =====================================================
-- CLIENT AUDIT HARDENING
-- Keeps tenant audit queries fast at scale and prevents direct public access.
-- Safe to run more than once.
-- =====================================================

create index if not exists idx_audit_logs_org_created
on audit_logs(org_id, created_at desc);

create index if not exists idx_audit_logs_org_entity_created
on audit_logs(org_id, entity_type, entity_id, created_at desc);

create index if not exists idx_audit_logs_org_action_created
on audit_logs(org_id, action, created_at desc);

revoke all on audit_logs from public;
