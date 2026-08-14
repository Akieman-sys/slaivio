from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_platform_reference_migration_guards_tenant_and_backfills():
    sql = read("infra/sql/086_platform_reference_integrity.sql")
    assert "enforce_slaivio_reference_tenant" in sql
    assert "cross_tenant_reference" in sql
    assert "platform_reference_integrity" in sql
    assert "update dossiers d set route_id" in sql


def test_reference_catalog_is_tenant_scoped():
    source = read("apps/api/app/api/references.py")
    assert 'prefix="/references"' in source
    assert 'tenant["org_id"]' in source
    assert source.count("org_id=:org_id") >= 7
    assert 'require_permission("references.read")' in source
    assert 'require_permission("references.audit")' in source


def test_dossier_relations_drive_legacy_snapshots():
    source = read("apps/api/app/db/dossier_repository.py")
    assert "def _hydrate_references" in source
    assert 'raise ValueError("service_route_mismatch")' in source
    assert '"origin_country": route["origin_country"]' in source
    assert '"shipping_mode": data.get("shipping_mode") or route["transport_mode"]' in source


def test_dossier_ui_uses_shared_relations():
    source = read("apps/web/dashboard/components/dossiers/dossiers-page.tsx")
    assert 'name="route_id"' in source
    assert 'name="shipping_service_id"' in source
    assert 'name="origin_warehouse_id"' in source
    assert 'name="destination_office_id"' in source
    assert 'name="origin_country"' not in source
    assert 'name="destination_country"' not in source


def test_expedition_creation_uses_route_and_service_sources():
    source = read("apps/api/app/expeditions/repository.py")
    assert "def _hydrate_expedition_references" in source
    assert '"route_label": route["route_name"]' in source
    assert "shipping_service_id, origin_warehouse_id, destination_office_id, departure_id" in source
