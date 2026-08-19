from app.ai.services import capability_catalog


def test_capability_catalog_only_exposes_authorized_features(monkeypatch):
    monkeypatch.setattr(
        capability_catalog,
        "list_permissions_for_user",
        lambda **_: ["clients.read", "pricing.simulate", "packages.create", "ai.copilot.execute"],
    )

    result = capability_catalog.assistant_capabilities("agency-a", "operator-a")

    assert [item["id"] for item in result["consultations"]] == ["clients", "pricing"]
    assert [item["id"] for item in result["actions"]] == ["create_package"]
    assert len(result["safety"]) == 4


def test_capability_catalog_hides_actions_without_execution_permission(monkeypatch):
    monkeypatch.setattr(
        capability_catalog,
        "list_permissions_for_user",
        lambda **_: ["clients.read", "clients.create"],
    )

    result = capability_catalog.assistant_capabilities("agency-a", "viewer-a")

    assert [item["id"] for item in result["consultations"]] == ["clients"]
    assert result["actions"] == []
