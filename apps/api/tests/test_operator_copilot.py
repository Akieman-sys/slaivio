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


def test_followup_mutation_checks_permission_and_row_version(monkeypatch):
    workflow=_workflow(
        workflow_type="UPDATE_FOLLOWUP",
        intent="FOLLOWUP_STATUS_UPDATE",
        entities={"followup_id":"f-1","followup_reference":"FUP-1","mutation_action":"COMPLETE","row_version":4,"current_status":"DUE"},
    )
    calls={}
    monkeypatch.setattr(service,"get_workflow_run",lambda *_:workflow)
    monkeypatch.setattr(service,"assert_permission",lambda user,org,permission:calls.update(permission=permission))
    monkeypatch.setattr(service,"claim_workflow_execution",lambda *_:workflow)
    monkeypatch.setattr(service,"mutate_followup",lambda org,item,actor,action,version,due,reason: calls.update(
        org=org,item=item,actor=actor,action=action,version=version,due=due,reason=reason
    ) or {"id":"f-1","reference":"FUP-1","status":"COMPLETED","row_version":5})
    monkeypatch.setattr(service,"update_workflow_status",lambda *_args,**_kwargs: {**workflow,"workflow_status":"APPROVED"})

    result=service.approve_operator_workflow("org-1","workflow-1","manager-1")

    assert calls["permission"]=="followups.update"
    assert calls["action"]=="COMPLETE"
    assert calls["version"]==4
    assert result["result"]["followup"]["status"]=="COMPLETED"


def test_departure_creation_is_permissioned_and_idempotent(monkeypatch):
    workflow=_workflow(
        workflow_type="CREATE_DEPARTURE",intent="DEPARTURE_CREATION",manager_name="Grace",
        entities={"route_id":"route-1","route_name":"Guangzhou → Kinshasa","shipping_service_id":"service-1",
                  "service_name":"Air Cargo","scheduled_at":"2026-08-28T18:00:00+00:00","timezone":"UTC"},
    )
    calls={}
    monkeypatch.setattr(service,"get_workflow_run",lambda *_:workflow)
    monkeypatch.setattr(service,"assert_permission",lambda user,org,permission:calls.update(permission=permission))
    monkeypatch.setattr(service,"claim_workflow_execution",lambda *_:workflow)
    monkeypatch.setattr(service,"create_departure",lambda org,actor,name,payload: calls.update(payload=payload) or {
        "id":"departure-1","departure_code":payload["departure_code"],"status":"PLANNED"
    })
    monkeypatch.setattr(service,"update_workflow_status",lambda *_args,**_kwargs:{**workflow,"workflow_status":"APPROVED"})

    result=service.approve_operator_workflow("org-1","workflow-1","manager-1")

    assert calls["permission"]=="departures.manage"
    assert calls["payload"]["departure_code"]=="DEP-AI-WORKFLOW"
    assert calls["payload"]["published"] is False
    assert result["result"]["departure"]["status"]=="PLANNED"


def test_batch_creation_uses_configured_relations_and_idempotent_reference(monkeypatch):
    workflow=_workflow(
        workflow_type="CREATE_BATCH",intent="BATCH_CREATION",manager_name="Grace",
        entities={"route_id":"route-1","route_name":"Guangzhou → Kinshasa",
                  "shipping_service_id":"service-1","service_name":"Air Cargo",
                  "origin_warehouse_id":"warehouse-1","origin_warehouse_name":"Guangzhou Warehouse",
                  "destination_office_id":"office-1","batch_type":"AIR_GROUPAGE",
                  "capacity_weight_kg":2200,"capacity_cbm":8},
    )
    calls={}
    monkeypatch.setattr(service,"get_workflow_run",lambda *_:workflow)
    monkeypatch.setattr(service,"assert_permission",lambda user,org,permission:calls.update(permission=permission))
    monkeypatch.setattr(service,"claim_workflow_execution",lambda *_:workflow)
    monkeypatch.setattr(service,"create_batch",lambda org,tenant,payload:calls.update(
        org=org,tenant=tenant,payload=payload
    ) or {"id":"batch-1","batch_code":payload["batch_code"],"status":"DRAFT"})
    monkeypatch.setattr(service,"update_workflow_status",lambda *_args,**_kwargs:{**workflow,"workflow_status":"APPROVED"})

    result=service.approve_operator_workflow("org-1","workflow-1","manager-1")

    assert calls["permission"]=="batches.create"
    assert calls["payload"]["batch_code"]=="BAT-AI-WORKFLOW"
    assert calls["payload"]["origin_warehouse_id"]=="warehouse-1"
    assert calls["payload"]["shipping_service_id"]=="service-1"
    assert result["result"]["batch"]["status"]=="DRAFT"


def test_batch_conversion_requires_dedicated_permission(monkeypatch):
    workflow=_workflow(
        workflow_type="CONVERT_BATCH_TO_SHIPMENT",intent="BATCH_CONVERSION",manager_name="Grace",
        entities={"batch_id":"batch-1","batch_code":"BAT-2026-00184","batch_status":"READY_FOR_SHIPMENT"},
    )
    calls={}
    monkeypatch.setattr(service,"get_workflow_run",lambda *_:workflow)
    monkeypatch.setattr(service,"assert_permission",lambda user,org,permission:calls.update(permission=permission))
    monkeypatch.setattr(service,"claim_workflow_execution",lambda *_:workflow)
    monkeypatch.setattr(service,"convert_batch",lambda org,batch,tenant:calls.update(
        org=org,batch=batch,tenant=tenant
    ) or {"id":"shipment-1","expedition_reference":"EXP-2026-00458","status":"PREPARING"})
    monkeypatch.setattr(service,"update_workflow_status",lambda *_args,**_kwargs:{**workflow,"workflow_status":"APPROVED"})

    result=service.approve_operator_workflow("org-1","workflow-1","manager-1")

    assert calls["permission"]=="batches.convert"
    assert calls["batch"]=="batch-1"
    assert result["result"]["expedition"]["expedition_reference"]=="EXP-2026-00458"


def test_pending_review_action_does_not_consume_an_unrelated_question(monkeypatch):
    workflow=_workflow(workflow_type="CREATE_BATCH",entities={"route_id":"r-1","shipping_service_id":"s-1","origin_warehouse_id":"w-1"})
    monkeypatch.setattr(service,"answer_platform_query",lambda *_args,**_kwargs:{
        "content":"Deux batchs sont prêts.","tool":"batches.list","cards":[]})
    monkeypatch.setattr(service,"create_operator_message",lambda _org,_user,role,content,**kwargs:{
        "id":"answer-1","role":role,"content":content,"metadata":kwargs.get("metadata")})

    result=service._continue_review_workflow("org-1","user-1",workflow,"Quels batchs sont prêts ?",None,"INTERNAL")

    assert result["dialogue_state"]=="ANSWERED"
    assert result["workflow"] is workflow
    assert result["tool"]=="batches.list"


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
