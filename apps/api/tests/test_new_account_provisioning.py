from pathlib import Path


def test_tenant_context_bootstraps_authenticated_user_without_membership():
    root = Path(__file__).parents[1] / "app"
    context = (root / "core/tenant_context.py").read_text(encoding="utf-8")
    service = (root / "tenant/services/tenant_service.py").read_text(encoding="utf-8")
    repository = (root / "tenant/repositories/tenant_repository.py").read_text(encoding="utf-8")
    assert "ensure_personal_tenant(manager)" in context
    assert 'default_role_code="OWNER"' in service
    assert 'clerk_org_id = f"personal_{user_id}"' in service
    assert "pg_advisory_xact_lock" in repository


def test_onboarding_uses_verified_tenant_context():
    root = Path(__file__).parents[1] / "app/api"
    onboarding = (root / "onboarding.py").read_text(encoding="utf-8")
    experience = (root / "onboarding_experience.py").read_text(encoding="utf-8")
    assert "Depends(get_current_tenant)" in onboarding
    assert "Depends(get_current_tenant)" in experience
    assert "_require_org" not in onboarding
    assert "_require_org" not in experience
