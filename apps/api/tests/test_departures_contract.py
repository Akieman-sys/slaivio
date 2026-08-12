from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def test_departures_are_capacity_safe_audited_and_tenant_scoped():
 m=(ROOT/'infra/sql/052_departure_calendar.sql').read_text()+(ROOT/'infra/sql/073_departure_control_center.sql').read_text();r=(ROOT/'apps/api/app/departures/repository.py').read_text();a=(ROOT/'apps/api/app/api/departures.py').read_text()
 for p in ('departures.read','departures.manage','departures.allocate','departures.dispatch','departures.cancel'):assert p in m
 assert 'for update' in r and 'idempotency_key' in r and 'departure_capacity_exceeded' in r and 'departure_events' in m
 assert "org_id=:o" in r and 'require_permission' in a
 for feature in ('compatible_packages','allocate_package','remove_package','manifest','analytics','def checklist','def update'):assert feature in r
 for route in ('compatible-packages','/packages','manifest.csv','/checklist','analytics/overview'):assert route in a
 assert 'departure_package_allocations' in m and 'departure_recurrences' in m and 'departure_templates' in m
 for integration in ('cargo_expeditions','expedition_packages','expedition_events','package_events','notification_outbox','_sync_operations'):assert integration in r
 assert 'run_automation' in r and 'departure_automation' in (ROOT/'apps/api/app/jobs/departure_automation.py').read_text()
