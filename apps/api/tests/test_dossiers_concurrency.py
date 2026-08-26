from pathlib import Path

import pytest
from pydantic import ValidationError

from app.api.dossiers import (
    DossierClientCreatePayload,
    DossierClientPatchPayload,
    DossierPatchPayload,
    DossierPayload,
)
from app.db.dossier_repository import (
    DOSSIER_STATUS_TRANSITIONS,
    validate_dossier_financials,
    validate_dossier_transition,
)


def _dossier(**changes):
    dossier = {
        "status_global": "DRAFT",
        "intake_status": "PARTIAL",
        "validation_status": "PENDING",
        "origin_country": None,
        "destination_country": None,
        "shipping_mode": None,
        "quoted_total": None,
        "quoted_currency": None,
        "final_total": None,
        "final_currency": None,
        "supplier_payment_amount": None,
        "supplier_payment_currency": None,
    }
    dossier.update(changes)
    return dossier


def test_dossier_patch_requires_concurrency_version():
    with pytest.raises(ValidationError):
        DossierPatchPayload(status_global="QUOTED")
    assert DossierPatchPayload(row_version=4, status_global="QUOTED").row_version == 4


def test_dossier_creation_starts_in_an_initial_state():
    assert DossierPayload(client_id="client-a", status_global="LEAD").status_global == "LEAD"
    with pytest.raises(ValidationError, match="invalid_initial_dossier_status"):
        DossierPayload(client_id="client-a", status_global="IN_TRANSIT")


def test_pilot_dossier_can_start_before_the_first_client_is_known():
    payload = DossierPayload(idempotency_key="pilot-dossier-0001")
    assert payload.client_id is None
    assert payload.idempotency_key == "pilot-dossier-0001"


def test_client_created_inside_a_dossier_requires_only_identity_and_phone():
    with pytest.raises(ValidationError):
        DossierClientCreatePayload(
            phone="+243900000000", idempotency_key="client-create-0001"
        )
    with pytest.raises(ValidationError):
        DossierClientCreatePayload(
            name="Jean", idempotency_key="client-create-0002"
        )
    with pytest.raises(ValidationError, match="extra_forbidden"):
        DossierClientCreatePayload(
            name="Jean", phone="+243900000000", attention_required=True,
            idempotency_key="client-create-0003",
        )
    client = DossierClientCreatePayload(
        name="Jean", phone="+243900000000", email=None,
        idempotency_key="client-create-0004",
    )
    assert client.name == "Jean"


def test_relation_update_is_versioned():
    with pytest.raises(ValidationError):
        DossierClientPatchPayload(situation="En attente de confirmation")
    assert DossierClientPatchPayload(
        row_version=3, situation="En attente de confirmation"
    ).row_version == 3


def test_dossier_status_machine_rejects_skips_and_terminal_reopens():
    validate_dossier_transition(_dossier(), _dossier(status_global="QUOTED"))
    with pytest.raises(ValueError, match="invalid_dossier_status_transition"):
        validate_dossier_transition(_dossier(), _dossier(status_global="IN_TRANSIT"))
    assert DOSSIER_STATUS_TRANSITIONS["CLOSED"] == set()
    assert DOSSIER_STATUS_TRANSITIONS["CANCELLED"] == set()


def test_ready_to_ship_requires_complete_validated_route():
    with pytest.raises(ValueError, match="dossier_intake_incomplete"):
        validate_dossier_transition(
            _dossier(status_global="IN_WAREHOUSE"),
            _dossier(status_global="READY_TO_SHIP"),
        )
    ready = _dossier(
        status_global="READY_TO_SHIP",
        intake_status="COMPLETE",
        validation_status="VALIDATED",
        origin_country="RDC",
        destination_country="France",
        shipping_mode="AIR",
    )
    validate_dossier_transition(_dossier(status_global="IN_WAREHOUSE"), ready)


def test_financial_amounts_require_their_currency():
    with pytest.raises(ValueError, match="quoted_currency_required"):
        validate_dossier_financials(_dossier(quoted_total=100))
    validate_dossier_financials(_dossier(quoted_total=100, quoted_currency="USD"))


def test_dossier_concurrency_migration_enforces_database_invariants():
    migration = Path(__file__).parents[3] / "infra/sql/034_dossiers_identity_state_and_concurrency.sql"
    sql = " ".join(migration.read_text(encoding="utf-8").lower().split())
    assert "dossier_reference text" in sql
    assert "row_version integer not null default 1" in sql
    assert "unique index if not exists uq_dossiers_org_reference" in sql
    assert "trigger trg_dossiers_bump_row_version" in sql
    assert "dossiers_non_negative_values" in sql


def test_secondary_dossier_writers_use_canonical_values():
    app_root = Path(__file__).parents[1] / "app"
    execution = (
        app_root / "ai" / "repositories" / "dossier_execution_repository.py"
    ).read_text(encoding="utf-8")
    commercial = (
        app_root / "commercial" / "repositories" / "commercial_repository.py"
    ).read_text(encoding="utf-8")

    assert "'COMMERCIAL_CARGO'" in execution
    assert "'PENDING_CONFIRMATION'" not in execution
    assert "_canonical_dossier_case_type(case_type)" in commercial
