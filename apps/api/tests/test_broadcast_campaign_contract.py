from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def read(p):return (ROOT/p).read_text(encoding='utf-8')
def test_campaign_engine_contract():
 sql=read('infra/sql/079_broadcast_campaign_engine.sql');repo=read('apps/api/app/db/broadcast_repository.py');api=read('apps/api/app/api/broadcasts.py')
 for token in ('broadcast_audiences','broadcast_consents','broadcast_suppressions','idempotency_key','broadcasts.approve','revoke all'):assert token in sql
 for token in ('MARKETING_CONSENT_REQUIRED','for update of r skip locked','rendered_message','process_queue'):assert token in repo
 for permission in ('broadcasts.read','broadcasts.create','broadcasts.audiences','broadcasts.send','broadcasts.analytics'):assert permission in api
def test_broadcast_frontend_exists():
 ui=read('apps/web/dashboard/components/broadcasts/broadcasts-page.tsx')
 for label in ('Nouvelle campagne','Créer une audience','Calculer & figer audience','Approuver','Taux lecture'):assert label in ui
