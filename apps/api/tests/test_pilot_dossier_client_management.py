from pathlib import Path

import pytest
from pydantic import ValidationError

from app.api.dossiers import DossierClientProfilePatchPayload


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
        customer_type="individual",
        lifecycle_status="active",
    )
    assert payload.name == "Jérémie"

    with pytest.raises(ValidationError):
        DossierClientProfilePatchPayload(client_row_version=3, name="Jérémie")


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

