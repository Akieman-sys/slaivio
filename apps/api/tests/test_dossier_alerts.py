from pathlib import Path

from app.db.dossier_alert_repository import RULES


def test_dossier_alert_rules_are_complete_and_prioritized():
    assert set(RULES) == {"OVERDUE", "URGENT", "CHECKLIST_INCOMPLETE", "STALE"}
    assert RULES["OVERDUE"][0] == "CRITICAL"
    assert RULES["URGENT"][0] == "CRITICAL"


def test_dossier_alert_migration_has_lifecycle_deduplication_and_tenant_guard():
    migration = Path(__file__).parents[3] / "infra/sql/040_dossier_operational_alerts.sql"
    sql = " ".join(migration.read_text(encoding="utf-8").lower().split())
    assert "unique (org_id, dossier_id, alert_type)" in sql
    assert "'open','acknowledged','resolved'" in sql
    assert "enforce_dossier_child_tenant" in sql
    assert "dossier_alert_refresh_state" in sql
    assert "revoke all on dossier_operational_alerts, dossier_alert_refresh_state from public" in sql
