import asyncio
import hashlib
import json
from uuid import uuid4

from cryptography.fernet import Fernet

from app.platform import quarantine_replay_service as replay


def _envelope(payload: dict, **overrides) -> dict:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    key = replay.settings.platform_quarantine_encryption_key
    assert key is not None
    envelope = {
        "id": str(uuid4()),
        "processing_lease_id": str(uuid4()),
        "provider": "meta",
        "event_type": "inbound_message",
        "resolved_org_id": "org-1",
        "signature_verified": True,
        "provider_phone_number_id": "phone-1",
        "payload_encrypted": Fernet(key.encode()).encrypt(raw).decode(),
        "payload_hash": hashlib.sha256(raw).hexdigest(),
    }
    envelope.update(overrides)
    return envelope


def test_replay_success_completes_owned_lease(monkeypatch):
    envelope = _envelope({"entry": []})
    completed_calls = []

    monkeypatch.setattr(replay, "claim_replay_envelope", lambda **_kwargs: envelope)
    monkeypatch.setattr(replay, "_decrypt_payload", lambda _envelope: {"safe": True})

    async def dispatch(_envelope, _payload):
        return {"stored": True}

    monkeypatch.setattr(replay, "_dispatch", dispatch)
    monkeypatch.setattr(
        replay,
        "complete_replay",
        lambda envelope_id, lease_id: completed_calls.append(
            (envelope_id, lease_id)
        ) or {"id": envelope_id, "routing_status": "PROCESSED"},
    )

    result = asyncio.run(replay.replay_one(envelope["id"]))

    assert result["status"] == "processed"
    assert completed_calls == [(envelope["id"], envelope["processing_lease_id"])]


def test_temporary_failure_is_scheduled_for_retry(monkeypatch):
    envelope = _envelope({"entry": []})
    failed_calls = []
    monkeypatch.setattr(replay, "claim_replay_envelope", lambda **_kwargs: envelope)
    monkeypatch.setattr(replay, "_decrypt_payload", lambda _envelope: {})

    async def dispatch(_envelope, _payload):
        raise RuntimeError("database_temporarily_unavailable")

    monkeypatch.setattr(replay, "_dispatch", dispatch)
    monkeypatch.setattr(
        replay,
        "fail_replay",
        lambda **kwargs: failed_calls.append(kwargs) or {
            "routing_status": "REPLAY_FAILED"
        },
    )

    result = asyncio.run(replay.replay_one(envelope["id"]))

    assert result["status"] == "REPLAY_FAILED"
    assert failed_calls[0]["max_attempts"] == replay.settings.quarantine_replay_max_attempts


def test_integrity_failure_goes_directly_to_dead_letter(monkeypatch):
    envelope = _envelope({"entry": []}, payload_hash="invalid")
    failed_calls = []
    monkeypatch.setattr(replay, "claim_replay_envelope", lambda **_kwargs: envelope)
    monkeypatch.setattr(
        replay,
        "fail_replay",
        lambda **kwargs: failed_calls.append(kwargs) or {
            "routing_status": "DEAD_LETTER"
        },
    )

    result = asyncio.run(replay.replay_one(envelope["id"]))

    assert result["status"] == "DEAD_LETTER"
    assert failed_calls[0]["max_attempts"] == 1
    assert "integrity" in failed_calls[0]["error"]


def test_due_worker_stops_when_no_claim_is_available(monkeypatch):
    calls = 0

    async def replay_one(_envelope_id=None):
        nonlocal calls
        calls += 1
        if calls == 1:
            return {"status": "processed"}
        return {"status": "not_due_or_already_claimed"}

    monkeypatch.setattr(replay, "replay_one", replay_one)

    result = asyncio.run(replay.replay_due(limit=100))

    assert result["claimed"] == 1
    assert calls == 2
