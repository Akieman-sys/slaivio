from pathlib import Path


REPOSITORY = Path(__file__).parents[1] / "app" / "reports" / "repository.py"


def test_analytics_uses_the_operational_expedition_source_of_truth():
    source = REPOSITORY.read_text(encoding="utf-8")

    assert "cargo_expeditions" in source
    assert " from shipments " not in source
    assert "archived_at is null" in source
    assert "deleted_at is null" in source


def test_expedition_report_exports_transactional_totals():
    source = REPOSITORY.read_text(encoding="utf-8")

    assert "expedition_reference" in source
    assert "billed_total" in source
    assert "cost_total" in source
    assert "profit_total" in source
