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
    assert stored_messages[-1] == ("ASSISTANT", "Quel est le numéro WhatsApp du client, avec l’indicatif du pays ?")


def test_copilot_continues_the_same_workflow(monkeypatch):
    active = _workflow()
    updated = _workflow(client_phone="+243999000111")
    monkeypatch.setattr(service, "get_active_operator_workflow", lambda *_: active)
    monkeypatch.setattr(service, "update_workflow_details", lambda **_: updated)
    monkeypatch.setattr(service,"find_client_by_phone",lambda *_:{"id":"685cba84-31f0-4aef-9f33-33294d8795ee","display_name":"Jean"})
    monkeypatch.setattr(service,"client_dossier_choices",lambda *_:[])
    monkeypatch.setattr(service,"location_choices",lambda *_:[])
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
    assert result["message"]["content"] == "Depuis quel pays le colis sera-t-il envoyé ?"


def test_greeting_is_natural_and_does_not_create_workflow(monkeypatch):
    monkeypatch.setattr(service, "get_active_operator_workflow", lambda *_: None)
    monkeypatch.setattr(service, "create_operator_message", lambda _o,_u,role,content,**_: _message(role,content))
    monkeypatch.setattr(service, "create_workflow_run", lambda **_: pytest.fail("no workflow expected"))
    result=service.prepare_operator_message("org-1","user-1","Agent","Tu es là ?",None)
    assert result["workflow"] is None
    assert "je suis là" in result["message"]["content"].lower()


def test_unknown_origin_is_not_stored(monkeypatch):
    active=_workflow(client_phone="+243999000111")
    monkeypatch.setattr(service,"get_active_operator_workflow",lambda *_:active)
    monkeypatch.setattr(service,"location_choices",lambda *_: [{"value":"Chine","label":"Chine"}])
    monkeypatch.setattr(service,"create_operator_message",lambda _o,_u,role,content,**_:_message(role,content))
    monkeypatch.setattr(service,"update_workflow_details",lambda **_:pytest.fail("invalid answer must not update workflow"))
    result=service.prepare_operator_message("org-1","user-1","Agent","je sais pas",None)
    assert result["validation"]["status"] == "UNKNOWN"
    assert result["missing_fields"][0] == "origin_country"


def test_off_topic_goods_is_rejected(monkeypatch):
    active=_workflow(client_phone="+243999000111",entities={"origin_country":"Chine","destination_city":"Kinshasa"})
    monkeypatch.setattr(service,"get_active_operator_workflow",lambda *_:active)
    monkeypatch.setattr(service,"create_operator_message",lambda _o,_u,role,content,**_:_message(role,content))
    monkeypatch.setattr(service,"update_workflow_details",lambda **_:pytest.fail("invalid answer must not update workflow"))
    result=service.prepare_operator_message("org-1","user-1","Agent","je cherche à vendre ma maison",None)
    assert result["validation"]["status"] == "INVALID"
    assert result["missing_fields"] == ["goods_type"]


def test_creation_status_explains_that_nothing_was_created(monkeypatch):
    active=_workflow(client_phone="+243999000111",entities={"origin_country":"Chine"})
    monkeypatch.setattr(service,"get_active_operator_workflow",lambda *_:active)
    monkeypatch.setattr(service,"create_operator_message",lambda _o,_u,role,content,**_:_message(role,content))
    result=service.prepare_operator_message("org-1","user-1","Agent","le colis n'est pas créé",None)
    assert "n’est pas encore créé" in result["message"]["content"]


def test_incomplete_dossier_cannot_be_approved(monkeypatch):
    monkeypatch.setattr(service, "get_workflow_run", lambda *_: _workflow())
    created = []
    monkeypatch.setattr(service, "create_dossier", lambda *args, **kwargs: created.append((args,kwargs)))

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
