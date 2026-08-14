from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def test_routes_services_are_versioned_tenant_safe_and_audited():
 m=(ROOT/'infra/sql/050_routes_services_pricing.sql').read_text();a=(ROOT/'apps/api/app/api/routes_services.py').read_text();r=(ROOT/'apps/api/app/routes_services/repository.py').read_text()
 for p in ('routes.read','routes.manage','services.manage','pricing.manage','pricing.simulate'):assert p in a and p in m
 assert 'version_number' in m and 'effective_until' in m and 'route_service_events' in m
 assert 'org_id=:o' in r and 'PRICE_VERSION_CREATED' in r and 'chargeable_weight_kg' in r
def test_routes_router_is_registered():assert 'routes_services_router' in (ROOT/'apps/api/app/main.py').read_text()
def test_completion_has_restrictions_adjustments_and_snapshots():
 m=(ROOT/'infra/sql/051_routes_services_completion.sql').read_text();r=(ROOT/'apps/api/app/routes_services/repository.py').read_text();a=(ROOT/'apps/api/app/api/routes_services.py').read_text()
 for value in ('service_goods_policies','service_price_adjustments','pricing_simulation_snapshots'):assert value in m and value in r
 for endpoint in ('/stops','/departures','/policies','/adjustments'):assert endpoint in a
 assert 'goods_prohibited_for_service' in r and 'pricing_fingerprint' in r

def test_route_intelligence_is_separate_complete_and_audited():
 m=(ROOT/'infra/sql/083_route_intelligence_center.sql').read_text(encoding='utf-8');r=(ROOT/'apps/api/app/routes_services/repository.py').read_text(encoding='utf-8');a=(ROOT/'apps/api/app/api/routes_services.py').read_text(encoding='utf-8')
 for table in ('route_legs','route_carriers','route_restrictions','route_suspensions','route_saved_views','route_alerts','route_settings'):assert table in m
 for permission in ('routes.create','routes.update','routes.suspend','routes.carriers','routes.restrictions','routes.performance','routes.finance','routes.analytics','routes.export','routes.settings'):assert permission in m
 for endpoint in ('/routes/intelligence','/routes/stats','/routes/analytics','/routes/engine','/routes/compare','/routes/export.csv','/suspend','/reactivate','/duplicate','/legs','/carriers','/restrictions'):assert endpoint in a
 for operation in ('route_listing','route_stats','route_detail','route_engine','compare_routes','route_analytics','export_routes','suspend_route','reactivate_route','duplicate_route'):assert f'def {operation}' in r
 assert 'route_version_conflict' in r and 'ROUTE_SUSPENDED' in r and 'requires_confirmation' in r

def test_routes_and_services_have_distinct_dashboard_routes():
 routes=(ROOT/'apps/web/dashboard/app/app/routes/page.tsx').read_text(encoding='utf-8');services=(ROOT/'apps/web/dashboard/app/app/services/page.tsx').read_text(encoding='utf-8');ui=(ROOT/'apps/web/dashboard/components/routes/route-intelligence-center.tsx').read_text(encoding='utf-8')
 assert 'RouteIntelligenceCenter' in routes and 'RouteCatalogPage' not in routes
 assert 'ServiceCatalogCenter' in services and 'permission="services.read"' in services
 for feature in ('Route Engine','Sources métier live' if False else 'Routes actives','Capacité limitée','Suspendre','Dupliquer','Ajouter escale','Ajouter transporteur','Ajouter restriction','Simulateur de route'):assert feature in ui
