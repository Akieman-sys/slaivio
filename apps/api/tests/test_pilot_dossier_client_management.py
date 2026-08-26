from pathlib import Path

import pytest
from pydantic import ValidationError

from app.api.dossiers import DossierClientCreatePayload, DossierClientProfilePatchPayload


ROOT = Path(__file__).parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_client_numbering_uses_the_agency_identifier_configuration():
    sql = " ".join(read("infra/sql/095_pilot_client_identity_numbering.sql").lower().split())

    assert "'client', 'cli-{yyyy}-{000001}'" in sql
    assert "next_organization_reference" in sql
    assert "for each row execute function assign_client_reference()" in sql
    assert "existing client references are preserved" in sql
    assert "delete from" not in sql
    assert "drop column" not in sql


def test_profile_update_requires_human_identity_and_contact():
    payload = DossierClientProfilePatchPayload(
        client_row_version=3,
        name="Jérémie",
        phone="+243970000000",
        customer_type="partner",
    )
    assert payload.name == "Jérémie"

    with pytest.raises(ValidationError):
        DossierClientProfilePatchPayload(client_row_version=3, name="Jérémie")


def test_client_creation_rejects_the_old_unconfirmed_profile_fields():
    payload = DossierClientCreatePayload(
        name="Jérémie Bawaba",
        phone="+243970000000",
        email=None,
        customer_type="business",
        idempotency_key="client-create-0001",
    )
    assert payload.phone == "+243970000000"
    assert payload.customer_type == "business"

    for legacy_field in ("whatsapp_phone", "company_name", "preferred_language", "situation", "lifecycle_status"):
        with pytest.raises(ValidationError):
            DossierClientCreatePayload.model_validate({
                "name": "Jérémie Bawaba",
                "phone": "+243970000000",
                "idempotency_key": "client-create-0001",
                legacy_field: "ancienne-valeur",
            })
    with pytest.raises(ValidationError, match="invalid_customer_type"):
        DossierClientCreatePayload(
            name="Jérémie Bawaba", phone="+243970000000",
            customer_type="agent", idempotency_key="client-create-0002",
        )


def test_client_management_stays_inside_the_pilot_dossier():
    api = read("apps/api/app/api/dossiers.py")
    repository = read("apps/api/app/db/dossier_client_repository.py")
    page = read("apps/web/dashboard/components/dossiers/dossier-detail-page.tsx")

    assert '"/dossiers/{dossier_id}/clients/{client_id}/profile"' in api
    assert '"/dossiers/{dossier_id}/clients/{client_id}/move"' in api
    assert '"/dossiers/{dossier_id}/clients/{client_id}/history"' in api
    assert "update_client(org_id, client_id, user_id, payload)" in repository
    assert "Ces coordonnées appartiennent à la fiche unique du client" in page
    assert "Déplacer vers un autre dossier" in page
    assert "UUID" not in page


def test_client_creation_uses_only_the_fields_confirmed_by_the_dg():
    page = read("apps/web/dashboard/components/dossiers/dossier-detail-page.tsx")
    form = page.split("function NewClientForm", 1)[1].split("function EditClientForm", 1)[0]

    for field in ('name="name"', 'name="phone"', 'name="email"', 'name="customer_type"'):
        assert field in form
    for unconfirmed_field in ('name="company_name"', 'name="whatsapp_phone"', 'name="preferred_language"', 'name="situation"', 'name="lifecycle_status"'):
        assert unconfirmed_field not in form
    assert "Email — facultatif" in form
    assert 'label="Téléphone"' in form
    assert "Téléphone et WhatsApp" not in form
    assert all(label in form for label in ("Particulier", "Entreprise", "Partenaire"))
    assert "Intermédiaire" not in form
    assert "identifiant SLAIVIO" not in form
    assert "identifiant client" in form


def test_client_record_displays_the_agency_identifier_and_one_phone():
    page = read("apps/web/dashboard/components/dossiers/dossier-detail-page.tsx")
    record = page.split("function ClientRecord", 1)[1].split("function ClientSituation", 1)[0]

    assert "Identifiant client" in record
    assert 'label="Téléphone"' in record
    assert "Téléphone et WhatsApp" not in record
    assert "Type de client" in record
    for hidden_label in ("Langue", "Statut"):
        assert hidden_label not in record


def test_client_search_is_in_the_clients_page_not_the_creation_drawer():
    page = read("apps/web/dashboard/components/dossiers/dossier-detail-page.tsx")
    clients_page = page.split("function Clients", 1)[1].split("function Activity", 1)[0]
    new_form = page.split("function NewClientForm", 1)[1].split("function ClientProfileForm", 1)[0]

    assert "Rechercher et rattacher un client existant" in clients_page
    assert "Rattacher" in clients_page
    assert "Rechercher" not in new_form
    assert "window.confirm" not in page
    assert "OperationConfirmDialog" in page
