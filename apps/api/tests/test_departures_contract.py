from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def test_departures_are_capacity_safe_audited_and_tenant_scoped():
 m=(ROOT/'infra/sql/052_departure_calendar.sql').read_text();r=(ROOT/'apps/api/app/departures/repository.py').read_text();a=(ROOT/'apps/api/app/api/departures.py').read_text()
 for p in ('departures.read','departures.manage','departures.allocate','departures.dispatch','departures.cancel'):assert p in m
 assert 'for update' in r and 'idempotency_key' in r and 'departure_capacity_exceeded' in r and 'departure_events' in m
 assert "org_id=:o" in r and 'require_permission' in a
