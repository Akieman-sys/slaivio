from pathlib import Path

from app.ai.services.dialogue_validation import correction_from_message, dialogue_act, validate_field
from app.ai.services.platform_query_service import _client_search_term


ROOT=Path(__file__).parents[3]


def test_dialogue_acts_do_not_confuse_greetings_and_workflow_answers():
    assert dialogue_act("Salut") == "GREETING"
    assert dialogue_act("je sais pas",True) == "UNKNOWN_ANSWER"
    assert dialogue_act("finalement annule",True) == "CANCEL"
    assert dialogue_act("le colis n'est pas créé",True) == "STATUS_QUESTION"
    assert dialogue_act("continue",True) == "RESUME"


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


def test_internal_and_whatsapp_share_the_conversation_boundary():
    orchestrator=(ROOT/"apps/api/app/ai/services/conversation_orchestrator.py").read_text(encoding="utf-8")
    api=(ROOT/"apps/api/app/api/ai_copilot.py").read_text(encoding="utf-8")
    whatsapp=(ROOT/"apps/api/app/ai/services/auto_reply_service.py").read_text(encoding="utf-8")
    assert "def handle_conversation(" in orchestrator
    assert "prepare_operator_message(" in orchestrator
    assert "handle_conversation(" in api
    assert "handle_conversation(" in whatsapp


def test_paused_workflow_can_be_resumed_from_the_conversation():
    repository=(ROOT/"apps/api/app/ai/repositories/workflow_repository.py").read_text(encoding="utf-8")
    service=(ROOT/"apps/api/app/ai/services/operator_copilot_service.py").read_text(encoding="utf-8")
    assert "workflow_status in ('PREPARED','PAUSED')" in repository
    assert 'if act == "RESUME"' in service


def test_transversal_read_tools_are_checked_before_action_workflows():
    service=(ROOT/"apps/api/app/ai/services/operator_copilot_service.py").read_text(encoding="utf-8")
    tools=(ROOT/"apps/api/app/ai/services/platform_query_service.py").read_text(encoding="utf-8")
    for capability in ("clients.search","packages.list","dossiers.list","tracking.read","routes.list","services.list","warehouses.list"):
        assert capability in tools
    assert service.index("answer_platform_query(") < service.index("detect_intent(org_id=org_id")
    assert _client_search_term("est ce qu'il y a un client nomer Bawaba") == "Bawaba"
