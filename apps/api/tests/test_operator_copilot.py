from pathlib import Path

import pytest
from fastapi import HTTPException

from app.ai.services import operator_copilot_service as service


def _message(role: str, content: str):
    return {"id": f"message-{role}", "role": role, "content": content}


def _workflow(**overrides):
    value = {
        "id": "workflow-1",
        "org_id": "org-1",
        "manager_id": "user-1",
        "client_phone": "internal:user-1",
        "source_message": "Prépare un dossier client",
        "intent": "SHIPMENT_CREATION",
        "confidence": 0.9,
        "workflow_type": "CREATE_SHIPMENT_DRAFT",
        "workflow_status": "PREPARED",
        "entities": {},
        "proposed_actions": [],
    }
    value.update(overrides)
    return value


def test_copilot_starts_a_dossier_with_one_question(monkeypatch):
    stored_messages = []
    monkeypatch.setattr(service, "get_active_operator_workflow", lambda *_: None)
    monkeypatch.setattr(
        service,
        "detect_intent",
        lambda **_: {"intent": "SHIPMENT_CREATION", "confidence": 0.9, "entities": {}},
    )
    monkeypatch.setattr(service, "create_workflow_run", lambda **_: _workflow())

    def store(_org, _user, role, content, **_kwargs):
        stored_messages.append((role, content))
        return _message(role, content)

    monkeypatch.setattr(service, "create_operator_message", store)

    result = service.prepare_operator_message(
        "org-1", "user-1", "Agent", "Prépare un dossier client", None
    )

    assert result["missing_fields"] == [
        "client_phone",
        "origin_country",
        "destination_city",
        "goods_type",
    ]
    assert stored_messages[-1] == ("ASSISTANT", "Quel est le numéro WhatsApp du client ?")


def test_copilot_continues_the_same_workflow(monkeypatch):
    active = _workflow()
    updated = _workflow(client_phone="+243999000111")
    monkeypatch.setattr(service, "get_active_operator_workflow", lambda *_: active)
    monkeypatch.setattr(service, "update_workflow_details", lambda **_: updated)
    monkeypatch.setattr(
        service,
        "create_operator_message",
        lambda _org, _user, role, content, **_kwargs: _message(role, content),
    )

    result = service.prepare_operator_message(
        "org-1", "user-1", "Agent", "+243 999 000 111", None
    )

    assert result["workflow"]["id"] == active["id"]
    assert result["workflow"]["client_phone"] == "+243999000111"
    assert result["message"]["content"] == "De quel pays le colis part-il ?"


def test_incomplete_dossier_cannot_be_approved(monkeypatch):
    monkeypatch.setattr(service, "get_workflow_run", lambda *_: _workflow())
    created = []
    monkeypatch.setattr(service, "create_dossier_draft", lambda **kwargs: created.append(kwargs))

    with pytest.raises(HTTPException) as error:
        service.approve_operator_workflow("org-1", "workflow-1")

    assert error.value.status_code == 422
    assert error.value.detail["code"] == "workflow_incomplete"
    assert created == []


def test_copilot_schema_and_repositories_are_tenant_scoped():
    root = Path(__file__).parents[3]
    migration = (root / "infra/sql/059_ai_operator_copilot.sql").read_text(encoding="utf-8")
    workflow_repository = (
        root / "apps/api/app/ai/repositories/workflow_repository.py"
    ).read_text(encoding="utf-8")
    message_repository = (
        root / "apps/api/app/ai/repositories/operator_message_repository.py"
    ).read_text(encoding="utf-8")

    assert "create table if not exists ai_operator_messages" in migration.lower()
    assert "on ai_operator_messages(org_id" in migration
    assert "and org_id = :org_id" in workflow_repository
    assert "where org_id = :org_id" in message_repository
