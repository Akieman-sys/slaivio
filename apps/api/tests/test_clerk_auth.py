import pytest
from fastapi import HTTPException
import jwt

from app.core.clerk_auth import verify_clerk_token


def test_malformed_clerk_token_returns_unauthorized(monkeypatch) -> None:
    monkeypatch.setattr("app.core.clerk_auth.get_jwks", lambda: {"keys": []})

    with pytest.raises(HTTPException) as error:
        verify_clerk_token("not-a-jwt")

    assert error.value.status_code == 401
    assert error.value.detail == "invalid_clerk_token"


def test_unknown_clerk_key_returns_unauthorized(monkeypatch) -> None:
    monkeypatch.setattr("app.core.clerk_auth.get_jwks", lambda: {"keys": []})
    token_with_unknown_key = jwt.encode(
        {"sub": "user_123"},
        "test-only-secret-with-32-bytes-minimum",
        algorithm="HS256",
        headers={"kid": "unknown"},
    )

    with pytest.raises(HTTPException) as error:
        verify_clerk_token(token_with_unknown_key)

    assert error.value.status_code == 401
    assert error.value.detail == "clerk_key_not_found"
