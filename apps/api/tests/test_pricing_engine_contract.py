from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

def test_pricing_schema_is_tenant_scoped_versioned_and_audited():
    sql = read("infra/sql/084_pricing_engine_center.sql")
    for table in (
        "pricing_grids", "pricing_grid_rules", "pricing_tiers", "pricing_fees",
        "pricing_promotions", "pricing_internal_costs", "pricing_quote_snapshots",
        "pricing_approvals", "pricing_alerts", "pricing_audit_events",
    ):
        assert f"create table if not exists {table}" in sql
    assert "org_id text not null references organizations(id)" in sql
    assert "unique(org_id,grid_code,version)" in sql
    assert "pricing.approve" in sql and "pricing.costs" in sql

def test_pricing_api_exposes_governed_mutations_and_quote():
    api = read("apps/api/app/api/pricing.py")
    for route in (
        '"/pricing/grids"', '"/pricing/grids/{grid_id}/approve"',
        '"/pricing/grids/{grid_id}/transition"', '"/pricing/quote"',
        '"/pricing/analytics"', '"/pricing/export.csv"',
    ):
        assert route in api
    assert 'require_permission("pricing.approve")' in api
    assert 'require_permission("pricing.simulate")' in api

def test_quote_engine_has_chargeable_weight_priority_snapshot_and_margin():
    repo = read("apps/api/app/pricing_engine/repository.py")
    assert "chargeable_weight_rule" in repo
    assert "pricing_quote_snapshots" in repo
    assert "margin_percent" in repo
    assert "client_id is not null" in repo
    assert "idempotency_key" in repo

def test_dashboard_has_real_pricing_module():
    page = read("apps/web/dashboard/components/pricing/pricing-engine-page.tsx")
    assert "Simuler un tarif explicable" in page
    assert "Tarifs clients" in page
    assert "Coûts & marges" in page
    assert "Explication du calcul" in page
