from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_protected_endpoint_rejects_a_missing_token() -> None:
    response = client.get("/auth/me")

    assert response.status_code == 401


def test_protected_endpoint_rejects_an_invalid_token(monkeypatch) -> None:
    def reject_token(_: str):
        raise HTTPException(status_code=401, detail="invalid_token")

    monkeypatch.setattr("app.core.auth.verify_clerk_token", reject_token)

    response = client.get(
        "/auth/me",
        headers={"Authorization": "Bearer invalid"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_token"
