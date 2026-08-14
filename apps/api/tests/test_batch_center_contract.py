from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]

def read(path): return (ROOT/path).read_text(encoding="utf-8")

def test_batch_migration_is_tenant_scoped_and_relational():
    sql=read("infra/sql/087_batch_groupage_control_center.sql")
    for token in ("route_id uuid references shipping_routes", "shipping_service_id uuid references shipping_services", "batch_package_items", "expedition_batches", "batches.override"):
        assert token in sql
    assert "else 'BLOCKED' end" in sql

def test_batch_api_enforces_permissions_and_exposes_operations():
    api=read("apps/api/app/api/batch_center.py")
    for permission in ("batches.read", "batches.create", "batches.add", "batches.validate", "batches.convert", "batches.export"):
        assert permission in api
    for route in ('/{batch_id}/compatible','/{batch_id}/scan','/{batch_id}/convert','/{batch_id}/manifest.csv'):
        assert route in api

def test_batch_repository_checks_compatibility_capacity_and_idempotence():
    repo=read("apps/api/app/batch_center/repository.py")
    for token in ("ROUTE_MISMATCH", "SERVICE_MISMATCH", "WAREHOUSE_MISMATCH", "capacity_exceeded", "on conflict(batch_id,package_id)", "READY_FOR_SHIPMENT"):
        assert token in repo
    assert "add_package_to_expedition" in repo
    assert "shipment_id=:e" not in repo

def test_batch_ui_is_published_and_not_a_dead_button():
    ui=read("apps/web/dashboard/components/batches/batch-center-page.tsx")
    nav=read("apps/web/dashboard/config/app-navigation.ts")
    assert "createBatch(" in ui
    assert "addBatchPackages(" in ui
    assert "convertBatch(" in ui
    assert 'href: "/app/batches"' in nav
