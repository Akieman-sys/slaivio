from pathlib import Path

from app.api.dossiers import DossierPayload


ROOT = Path(__file__).parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pilot_dossier_identity_migration_is_additive():
    sql = " ".join(read("infra/sql/094_pilot_dossier_identity.sql").lower().split())

    assert "add column if not exists title text" in sql
    assert "add column if not exists description text" in sql
    assert "idx_dossiers_pilot_title" in sql
    assert "drop column" not in sql
    assert "delete from" not in sql


def test_dossier_creation_accepts_several_clients_and_human_fields():
    payload = DossierPayload(
        title="Commandes boutique Mardoche",
        description="Suivi partagé",
        assigned_to="responsable-1",
        client_ids=["client-a", "client-b", "client-a"],
        idempotency_key="pilot-dossier-detail-001",
    )

    assert payload.title == "Commandes boutique Mardoche"
    assert payload.client_ids == ["client-a", "client-b"]
    assert payload.client_id is None


def test_detail_page_uses_only_the_new_pilot_structure():
    page = read("apps/web/dashboard/components/dossiers/dossier-detail-page.tsx")
    route = read("apps/web/dashboard/app/app/dossiers/[id]/page.tsx")

    for label in (
        "Vue d’ensemble",
        "Clients",
        "Communications et suivi",
        "Nouveau client",
        "Type de client",
    ):
        assert label in page

    assert "DossierDetailPage" in route
    assert "UUID" not in page
    assert "validation_status" not in page
    assert "payment_status" not in page
    assert "shipping_mode" not in page
    assert "Situation dans ce dossier" not in page
    assert "Ajouter un client" not in page
    assert 'name="assigned_to"' not in page
    assert 'label="Responsable"' not in page


def test_repository_creates_all_client_relations_in_the_same_transaction():
    repository = read("apps/api/app/db/dossier_repository.py")

    assert "client_ids = list(dict.fromkeys" in repository
    assert "for attached_client_id in client_ids[1:]" in repository
    assert "insert into dossier_clients" in repository
    assert "dossier-create:{dossier_id}:{attached_client_id}" in repository
