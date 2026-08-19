from pathlib import Path

from app.ai.services.dialogue_validation import correction_from_message, dialogue_act, validate_field
from app.ai.services.platform_query_service import _client_search_term
from app.ai.services.operator_copilot_service import _fallback_intent, _missing_fields, _parse_due_at


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


def test_client_creation_is_distinct_from_dossier_and_package_creation():
    assert _fallback_intent("crée un client") == ("CLIENT_CREATION",0.9)
    assert _missing_fields("CREATE_CLIENT",{},None)==["client_phone","client_name"]
    assert _missing_fields("CREATE_CLIENT",{"client_name":"Jeremy"},"+243900000001")==[]


def test_followup_creation_has_its_own_control_workflow():
    assert _fallback_intent("crée une relance client") == ("FOLLOWUP_CREATION",0.9)
    assert _missing_fields("CREATE_FOLLOWUP",{},None)==["client_phone","followup_reason","due_at"]
    assert _parse_due_at("demain à 16h") is not None


def test_followup_mutations_have_a_controlled_versioned_workflow():
    assert _fallback_intent("reporte FUP-2026-001284 à demain 16h") == ("FOLLOWUP_STATUS_UPDATE",0.95)
    assert _fallback_intent("termine FUP-2026-001284") == ("FOLLOWUP_STATUS_UPDATE",0.95)
    assert _missing_fields("UPDATE_FOLLOWUP",{"followup_id":"f-1","mutation_action":"COMPLETE","row_version":2},None)==[]
    assert _missing_fields("UPDATE_FOLLOWUP",{"followup_id":"f-1","mutation_action":"COMPLETE"},None)==["row_version"]
    assert _parse_due_at("reporte FUP-2026-001284 à demain 16h") is not None


def test_package_status_change_is_controlled_and_delivery_needs_proof():
    service=(ROOT/"apps/api/app/ai/services/operator_copilot_service.py").read_text(encoding="utf-8")
    assert _fallback_intent("marque COL-2026-00124 comme reçu") == ("PACKAGE_STATUS_UPDATE",0.95)
    assert "UPDATE_PACKAGE_STATUS" in service
    assert 'target=="DELIVERED"' in service
    assert "delivery_proof_required" in service


def test_transversal_read_tools_are_checked_before_action_workflows():
    service=(ROOT/"apps/api/app/ai/services/operator_copilot_service.py").read_text(encoding="utf-8")
    tools=(ROOT/"apps/api/app/ai/services/platform_query_service.py").read_text(encoding="utf-8")
    for capability in ("operations.overview","clients.search","packages.list","dossiers.list","tracking.read","routes.list","services.list","warehouses.list",
                       "pricing.quote","departures.list","batches.list","shipments.list","pickups.list","finance.list",
                       "followups.list","broadcasts.list","knowledge.search"):
        assert capability in tools
    assert service.index("answer_platform_query(") < service.index("detect_intent(org_id=org_id")
    assert _client_search_term("est ce qu'il y a un client nomer Bawaba") == "Bawaba"
    assert "assert_permission(actor_id,org_id,PERMISSIONS[capability])" in tools
    assert "WHATSAPP_CAPABILITIES" in tools
    assert "record_tool_execution(" in service
