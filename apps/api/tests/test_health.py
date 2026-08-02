from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.main import app


client = TestClient(app)


def test_root_identifies_the_api() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "Slaivio API"}


def test_liveness_does_not_depend_on_the_database() -> None:
    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_does_not_expose_tenant_configuration() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "slaivio-api"}


def test_readiness_checks_the_database(monkeypatch) -> None:
    monkeypatch.setattr("app.api.health.test_db_connection", lambda: True)

    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "ok"}

    compatibility_response = client.get("/ready")
    assert compatibility_response.status_code == 200


def test_readiness_returns_sanitized_503_when_database_is_unavailable(
    monkeypatch,
) -> None:
    def fail_connection():
        raise OperationalError("select 1", {}, Exception("secret database detail"))

    monkeypatch.setattr("app.api.health.test_db_connection", fail_connection)
    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "database": "unavailable",
    }
    assert "secret" not in response.text
