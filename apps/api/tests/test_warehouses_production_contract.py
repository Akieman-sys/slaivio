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
