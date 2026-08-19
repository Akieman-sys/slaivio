from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def text(path):return (ROOT/path).read_text(encoding='utf-8')
def test_followup_migration_has_reliable_queue_and_rbac():
 sql=text('infra/sql/078_followup_recovery_engine.sql')
 for token in ('followup_rules','followup_sequences','followup_attempts','followup_responses','followup_templates','idempotency_key','followups.execute','revoke all') : assert token in sql
def test_followup_api_is_permissioned_and_mutations_versioned():
 api=text('apps/api/app/api/followups.py');repo=text('apps/api/app/db/followup_repository.py')
 for permission in ('followups.read','followups.create','followups.update','followups.execute','followups.rules'):assert permission in api
 assert 'row_version=:v' in repo and 'for update of f' in repo and 'business_condition_resolved' in repo and 'skip locked' in repo
 assert "followup_type ilike" in repo and "record_response" in repo and "followup_analytics" in repo
 assert 'detect_candidates' in repo and 'link_whatsapp_response' in repo and 'advance_sequences' in repo and 'followup_stop_list' in repo
 for feature in ('record_promise','save_template','save_view','bulk_action','export_all','QUOTE_FOLLOWUP','DOCUMENT_MISSING','CLIENT_INACTIVE','CONVERSATION_ABANDONED'):assert feature in repo
def test_followup_workspace_is_real():
 ui=text('apps/web/dashboard/components/followups/followups-page.tsx');service=text('apps/web/dashboard/services/followups.ts')
 for label in ('Aujourd’hui','En retard','Règles & séquences','Envoyer maintenant','Escalader'):assert label in ui
 for endpoint in ("'/followups'","`/followups/${id}/execute`",'/followups/rules'):assert endpoint in service

def test_followup_cron_matches_the_partial_idempotency_index():
 repo=text('apps/api/app/db/followup_repository.py').lower()
 repair=text('infra/sql/088_followup_cron_idempotency_repair.sql').lower()
 predicate='on conflict(org_id,idempotency_key) where idempotency_key is not null'
 assert predicate in repo
 assert 'create unique index idx_followup_idempotency' in repair
 assert 'where idempotency_key is not null' in repair
 assert 'row_number() over' in repair
