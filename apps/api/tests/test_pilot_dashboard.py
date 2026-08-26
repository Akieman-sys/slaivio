from pathlib import Path

from app.dashboard import home_repository


ROOT = Path(__file__).parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pilot_home_is_built_from_the_dg_scope(monkeypatch):
    def one(_conn, module, _statement, _params):
        return {
            "pilot_stats": {
                "active_dossiers": 12,
                "active_clients": 48,
                "attention_dossiers": 3,
                "attention_clients": 5,
            },
            "pilot_waiting_conversations": {"waiting_conversations": 4},
            "pilot_pending_followups": {"pending_followups": 2},
        }.get(module, {})

    monkeypatch.setattr(home_repository, "_optional_row", one)
    monkeypatch.setattr(home_repository, "_optional_rows", lambda *_args, **_kwargs: [])

    result = home_repository._pilot_home(
        object(),
        "agency-1",
        {"dossiers", "dossier_clients", "clients", "conversation_assignments", "followup_tasks"},
    )

    assert result["stats"] == {
        "active_dossiers": 12,
        "active_clients": 48,
        "attention_dossiers": 3,
        "attention_clients": 5,
        "waiting_conversations": 4,
        "pending_followups": 2,
    }


def test_pilot_dashboard_shows_only_daily_dossier_and_communication_work():
    page = read("apps/web/dashboard/components/dashboard/dashboard-overview.tsx")
    pilot = page.split("function PilotDashboard", 1)[1].split("function DashboardSection", 1)[0]

    for label in (
        "Dossiers actifs",
        "Clients actifs",
        "Conversations en attente",
        "Dossiers nécessitant une attention",
        "Relances en attente",
        "Dernières activités",
        "Clients récemment ajoutés",
        "Nouveau dossier",
        "Boîte de réception",
    ):
        assert label in pilot

    for hidden_cargo_metric in ("Facturation", "Paiements", "Entrepôts", "Expéditions"):
        assert hidden_cargo_metric not in pilot


def test_pilot_dashboard_links_rows_to_real_dossier_pages():
    repository = read("apps/api/app/dashboard/home_repository.py")
    dashboard = read("apps/web/dashboard/components/dashboard/dashboard-overview.tsx")
    dossiers = read("apps/web/dashboard/components/dossiers/dossiers-page.tsx")

    assert "'/app/dossiers/' || d.id::text href" in repository
    assert "count(distinct client.id)" in repository
    assert "relation.attention_required" in repository
    assert "conversation_assignments" in repository
    assert "followup_tasks" in repository
    assert 'href="/app/dossiers?create=1"' in dashboard
    assert 'href="/app/dossiers?view=attention"' in dashboard
    assert 'searchParams.get("create") === "1"' in dossiers
    assert 'searchParams.get("view")' in dossiers
