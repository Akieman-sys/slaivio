from pathlib import Path

from app.ai.services.dialogue_validation import correction_from_message, dialogue_act, validate_field


ROOT=Path(__file__).parents[3]


def test_dialogue_acts_do_not_confuse_greetings_and_workflow_answers():
    assert dialogue_act("Salut") == "GREETING"
    assert dialogue_act("je sais pas",True) == "UNKNOWN_ANSWER"
    assert dialogue_act("finalement annule",True) == "CANCEL"
    assert dialogue_act("le colis n'est pas créé",True) == "STATUS_QUESTION"


def test_semantic_validation_rejects_unknown_and_off_topic_values():
    assert validate_field("origin_country","je sais pas")["status"] == "UNKNOWN"
    assert validate_field("goods_type","je cherche à vendre ma maison")["status"] == "INVALID"
    assert validate_field("goods_type","3 cartons de vêtements")["status"] == "VALID"


def test_targeted_correction_is_extracted():
    assert correction_from_message("remplace la destination par Goma") == ("destination_city","Goma")


def test_conversation_schema_is_tenant_safe_and_idempotent():
    sql=(ROOT/"infra/sql/089_ai_conversation_engine.sql").read_text(encoding="utf-8")
    for table in ("ai_conversation_sessions","ai_workflow_field_validations","ai_tool_executions"):
        assert f"create table if not exists {table}" in sql
    assert "unique(org_id, idempotency_key)" in sql
    assert "org_id text not null references organizations(id)" in sql


def test_copilot_exposes_explicit_workflow_controls():
    api=(ROOT/"apps/api/app/api/ai_copilot.py").read_text(encoding="utf-8")
    service=(ROOT/"apps/api/app/ai/services/operator_copilot_service.py").read_text(encoding="utf-8")
    assert '"pause","resume","cancel","correct"' in api
    assert "find_client_by_phone" in service
    assert "create_package" in service
    assert "resolve_location" in service


def test_failed_and_stale_executions_are_recoverable():
    repository=(ROOT/"apps/api/app/ai/repositories/workflow_repository.py").read_text(encoding="utf-8")
    service=(ROOT/"apps/api/app/ai/services/operator_copilot_service.py").read_text(encoding="utf-8")
    assert "workflow_status in ('PREPARED','FAILED')" in repository
    assert "updated_at<now()-interval '2 minutes'" in repository
    assert 'update_workflow_status(org_id,workflow_id,"FAILED"' in service
    assert "find_client_by_phone(org_id,workflow[\"client_phone\"])" in service
