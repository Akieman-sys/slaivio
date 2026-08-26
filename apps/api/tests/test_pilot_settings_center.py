from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pilot_settings_migration_is_additive_and_role_scoped():
    sql = read("infra/sql/100_pilot_settings_center.sql")
    assert "alter table knowledge_settings" in sql
    assert "pilot_default_review_days" in sql
    assert "pilot_row_version" in sql
    assert "between 7 and 730" in sql
    assert "('CLIENT', 'CLI-{YYYY}-{000001}')" in sql
    assert "('DOSSIER', 'DOS-{YYYY}-{000001}')" in sql
    assert "pilot.settings.read" in sql
    assert "pilot.settings.manage" in sql
    assert "role.role_code = 'OWNER'" in sql


def test_pilot_settings_api_returns_only_the_agency_facing_context():
    api = read("apps/api/app/api/organization_admin.py")
    repository = read("apps/api/app/organization_admin/pilot_repository.py")
    for route in ("'/pilot'", "'/pilot/whatsapp-number'", "'/pilot/knowledge'"):
        assert route in api
    assert "pilot.settings.read" in api
    assert "pilot.settings.manage" in api
    for dataset in ("organization", "responsible", "numbering", "whatsapp_numbers", "ai", "knowledge"):
        assert f'"{dataset}"' in repository
    assert "access_token" not in repository
    assert "where org_id=:org_id" in repository


def test_whatsapp_selection_uses_connected_portfolio_numbers_and_is_audited():
    repository = read("apps/api/app/organization_admin/pilot_repository.py")
    assert "connection_status" in repository
    assert '!= "CONNECTED"' in repository
    assert "is_default=false" in repository
    assert "number_role='SUPPORT'" in repository
    assert "PILOT_WHATSAPP_NUMBER_SELECTED" in repository
    assert "pilot_whatsapp_number_not_connected" in repository


def test_pilot_settings_ui_uses_five_clear_business_sections():
    page = read("apps/web/dashboard/components/settings/pilot-settings-page.tsx")
    for label in ("Entreprise", "Responsable", "Identifiants", "WhatsApp & IA", "Connaissances"):
        assert label in page
    for mode in ("Suggestion uniquement", "Automatique contrôlé", "IA en pause"):
        assert mode in page
    for hidden_term in ("Workspaces", "Rôles & permissions", "Clé API", "Journal d’audit", "meta_phone_number_id", "UUID"):
        assert hidden_term not in page
    assert "Les numéros proviennent directement du portefeuille WhatsApp Business connecté" in page


def test_pilot_route_is_reversible_and_knowledge_defaults_are_effective():
    route = read("apps/web/dashboard/app/app/settings/page.tsx")
    navigation = read("apps/web/dashboard/config/app-navigation.ts")
    knowledge_page = read("apps/web/dashboard/components/knowledge/knowledge-page.tsx")
    knowledge_repository = read("apps/api/app/knowledge/pilot_repository.py")
    assert "isPilotV1" in route
    assert "PilotSettingsPage" in route and "OrganizationAdminPage" in route
    assert 'permission: "pilot.settings.read"' in navigation
    assert 'permission: "pilot.knowledge.read"' in navigation
    assert "pilot_default_review_days" in knowledge_page
    assert "default_language" in knowledge_page
    assert "select default_language,pilot_default_review_days" in knowledge_repository
