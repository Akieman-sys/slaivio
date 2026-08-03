from pathlib import Path
ROOT=Path(__file__).parents[1]
def test_pickup_routes_have_explicit_permissions():
 source=(ROOT/"app/api/pickups.py").read_text(encoding="utf-8")
 for p in ("pickups.read","pickups.create","pickups.notify","pickups.verify","pickups.release","pickups.override","pickups.export","pickups.settings"):assert f'require_permission("{p}")' in source
def test_release_is_locked_tenant_scoped_and_audited():
 source=(ROOT/"app/pickups/repository.py").read_text(encoding="utf-8")
 assert source.count("org_id=:o")>=15
 assert "for update" in source.lower()
 assert "row_version" in source
 assert "PACKAGES_RELEASED" in source
 assert "inventory_status='RELEASED'" in source
def test_otp_is_hmac_hashed_and_rate_limited():
 source=(ROOT/"app/pickups/repository.py").read_text(encoding="utf-8")
 assert "hmac.new" in source and "compare_digest" in source
 assert "max_otp_attempts" in source and "LOCKED" in source
def test_migration_blocks_duplicate_active_package_pickups():
 sql=(ROOT.parent.parent/"infra/sql/046_agency_pickups.sql").read_text(encoding="utf-8")
 assert "uq_active_pickup_package" in sql
 assert "where released_at is null" in sql
 assert "revoke all" in sql.lower()
 assert "references agency_offices(id)" in sql
 assert "references offices(id)" not in sql
