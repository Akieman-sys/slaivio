from pathlib import Path


ROOT = Path(__file__).parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pilot_dossiers_page_uses_the_multi_client_model():
    page = read("apps/web/dashboard/components/dossiers/dossiers-page.tsx")
    service = read("apps/web/dashboard/services/dossiers.ts")

    for label in (
        "Dossiers actifs",
        "À traiter",
        "Modifiés récemment",
        "Clients rattachés",
        "Rechercher un dossier ou un client",
    ):
        assert label in page

    assert "searchDossierClients" in page
    assert "client_ids: selectedClients.map" in page
    assert "client_count" in service
    assert "attention_count" in service
    assert "clients?: DossierClientRelation[]" in service


def test_pilot_dossiers_page_does_not_expose_the_old_cargo_workflow():
    page = read("apps/web/dashboard/components/dossiers/dossiers-page.tsx")

    for obsolete_label in (
        "Dossiers cargo",
        "Devis envoy",
        "Attente colis",
        "En transit",
        "Paiements à suivre",
        "validation_status",
        "payment_status",
        "supplier_payment_amount",
    ):
        assert obsolete_label not in page


def test_pilot_dossier_queries_support_attention_and_recent_views():
    repository = read("apps/api/app/db/dossier_repository.py")
    api = read("apps/api/app/api/dossiers.py")

    assert "attention_required: bool = False" in repository
    assert "updated_since_hours: int | None = None" in repository
    assert "relation.attention_required" in repository
    assert "interval '1 hour'" in repository
    assert "updated_since_hours: int | None = Query" in api
