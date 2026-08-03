from pathlib import Path


def test_permission_query_uses_active_membership_as_authority():
    root = Path(__file__).parents[1]
    source = (root / "app/permissions/repositories/permission_repository.py").read_text(encoding="utf-8")
    assert "organization_memberships" in source
    assert "m.status = 'ACTIVE'" in source
    assert "r.role_code = m.role_code" in source


def test_assignment_repair_is_idempotent():
    migration = Path(__file__).parents[3] / "infra/sql/037_repair_membership_role_assignments.sql"
    sql = " ".join(migration.read_text(encoding="utf-8").lower().split())
    assert "on conflict (user_id, org_id, role_id)" in sql
    assert "do update set assignment_status = 'active'" in sql
