from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def test_routes_services_are_versioned_tenant_safe_and_audited():
 m=(ROOT/'infra/sql/050_routes_services_pricing.sql').read_text();a=(ROOT/'apps/api/app/api/routes_services.py').read_text();r=(ROOT/'apps/api/app/routes_services/repository.py').read_text()
 for p in ('routes.read','routes.manage','services.manage','pricing.manage','pricing.simulate'):assert p in a and p in m
 assert 'version_number' in m and 'effective_until' in m and 'route_service_events' in m
 assert 'org_id=:o' in r and 'PRICE_VERSION_CREATED' in r and 'chargeable_weight_kg' in r
def test_routes_router_is_registered():assert 'routes_services_router' in (ROOT/'apps/api/app/main.py').read_text()
