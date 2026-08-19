from app.ai.services import capability_catalog
from app.ai.services import platform_query_service


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


def test_operational_overview_uses_real_reporting_data(monkeypatch):
    monkeypatch.setattr(platform_query_service, "_require", lambda *args: None)
    monkeypatch.setattr(
        platform_query_service,
        "reports_dashboard",
        lambda _org_id: {
            "period": {"start": "2026-07-21", "end": "2026-08-19"},
            "kpis": {"clients": 4, "dossiers": 7, "packages": 12, "weight_kg": 825.5, "shipments": 3, "pickups": 2},
            "finance": [{"currency": "USD", "outstanding": 640}],
        },
    )

    result = platform_query_service.answer_platform_query(
        "agency-a", "Donne-moi une vue d’ensemble de l’agence", actor_id="owner-a"
    )

    assert result["tool"] == "operations.overview"
    assert "12 colis" in result["content"]
    assert "640 USD" in result["content"]
    assert result["cards"][0]["href"] == "/app/reports"


def test_daily_priorities_merge_operational_sources(monkeypatch):
    monkeypatch.setattr(platform_query_service, "_require", lambda *args: None)
    monkeypatch.setattr(platform_query_service, "followup_dashboard", lambda *args, **kwargs: {
        "pagination": {"total": 2}, "items": [{"id": "f-1", "reference": "FUP-1", "reason": "Paiement"}]
    })
    monkeypatch.setattr(platform_query_service, "package_alerts", lambda *args, **kwargs: [
        {"id": "a-1", "package_id": "p-1", "package_reference": "COL-1", "message": "Poids manquant"}
    ])
    monkeypatch.setattr(platform_query_service, "list_dossier_alerts", lambda *args, **kwargs: [])
    monkeypatch.setattr(platform_query_service, "list_tracking_alerts", lambda *args, **kwargs: [])
    monkeypatch.setattr(platform_query_service, "pickup_queue", lambda *args, **kwargs: {
        "pagination": {"total": 1}, "items": []
    })

    result = platform_query_service.answer_platform_query(
        "agency-a", "Que dois-je traiter aujourd’hui ?", actor_id="manager-a"
    )

    assert "2 relance(s)" in result["content"]
    assert "1 alerte(s) colis" in result["content"]
    assert [card["title"] for card in result["cards"]] == ["FUP-1", "COL-1"]


def test_route_service_recommendation_uses_configured_engine(monkeypatch):
    monkeypatch.setattr(platform_query_service,"route_listing",lambda *args,**kwargs:{"items":[{
        "id":"route-1","status":"ACTIVE","route_name":"Guangzhou → Kinshasa",
        "origin_country":"Chine","origin_city":"Guangzhou","destination_country":"RDC","destination_city":"Kinshasa",
    }]})
    monkeypatch.setattr(platform_query_service,"pricing_catalog",lambda _org:{"categories":[{"code":"ELECTRONICS","name":"Electronics"}]})
    captured={}
    monkeypatch.setattr(platform_query_service,"recommend_services",lambda _org,payload: captured.update(payload) or {"items":[{
        "id":"service-1","route_id":"route-1","service_name":"Air Cargo","route_name":"Guangzhou → Kinshasa",
        "eta_min_days":8,"eta_max_days":12,"availability":"AVAILABLE","pricing_grid_id":"grid-1",
    }]})

    result=platform_query_service._route_service_recommendation(
        "agency-a","Quelle route pour 45 kg Electronics de Guangzhou vers Kinshasa en Air ?",None
    )

    assert captured["weight_kg"]==45
    assert captured["goods_category"]=="ELECTRONICS"
    assert captured["shipping_mode"]=="AIR"
    assert result["tool"]=="services.recommend"
    assert result["cards"][0]["title"]=="Air Cargo"
