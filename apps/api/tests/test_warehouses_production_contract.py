from pathlib import Path

ROOT=Path(__file__).parents[1]

def test_every_warehouse_endpoint_is_permission_protected():
    source=(ROOT/"app/api/warehouses.py").read_text(encoding="utf-8")
    for permission in ("warehouses.read","warehouses.create","warehouses.update","warehouses.move","warehouses.count","warehouses.alerts","warehouses.export"):
        assert f'require_permission("{permission}")' in source

def test_repository_scopes_operational_queries_to_tenant():
    source=(ROOT/"app/warehouses/repository.py").read_text(encoding="utf-8")
    assert source.count("org_id=:o") >= 15
    assert "for update" in source.lower()
    assert "row_version" in source

def test_warehouse_inventory_derives_client_and_dossier_display_fields():
    source=(ROOT/"app/warehouses/repository.py").read_text(encoding="utf-8")
    assert "left join clients c on c.id=p.client_id and c.org_id=p.org_id" in source
    assert "left join dossiers d on d.id=p.dossier_id and d.org_id=p.org_id" in source
    assert "p.client_name" not in source

def test_transfer_workflow_is_strict_and_audited():
    source=(ROOT/"app/warehouses/repository.py").read_text(encoding="utf-8")
    assert '"dispatch":("DRAFT","IN_TRANSIT")' in source
    assert '"receive":("IN_TRANSIT","RECEIVED")' in source
    assert "warehouse_audit_log" in source

def test_migration_is_rerunnable_and_does_not_publish_stock():
    source=(ROOT.parent.parent/"infra/sql/044_warehouses_workspace.sql").read_text(encoding="utf-8")
    assert "if not exists" in source.lower()
    assert "on conflict" in source.lower()
    assert "revoke all" in source.lower()
    assert "uq_warehouses_org_code" in source

def test_wms_completion_covers_daily_warehouse_workflows():
    api=(ROOT/"app/api/warehouses.py").read_text(encoding="utf-8")
    operations=(ROOT/"app/warehouses/operations.py").read_text(encoding="utf-8")
    migration=(ROOT.parent.parent/"infra/sql/045_warehouse_operating_system.sql").read_text(encoding="utf-8")
    for permission in ("warehouses.receive","warehouses.weigh","warehouses.quality","warehouses.group","warehouses.print"):
        assert f'require_permission("{permission}")' in api
        assert permission in migration
    for workflow in ("warehouse_intakes","warehouse_quality_checks","warehouse_scan_sessions","warehouse_groups"):
        assert workflow in migration
        assert workflow in operations
    assert "idempotency_key" in operations
    assert "for update" in operations.lower()
    assert '"dispatch":("LOADED","DISPATCHED")' in operations

def test_detected_alerts_are_idempotent_and_tenant_scoped():
    source=(ROOT/"app/warehouses/operations.py").read_text(encoding="utf-8")
    assert "on conflict do nothing" in source.lower()
    assert "STALE_PACKAGE" in source
    assert "PAYMENT_MISSING" in source
    assert "DIMENSION_INCONSISTENCY" in source
