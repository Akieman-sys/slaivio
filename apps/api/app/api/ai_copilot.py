from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.ai.repositories.escalation_repository import list_ai_escalation_events
from app.ai.repositories.operator_message_repository import list_operator_messages
from app.ai.repositories.workflow_repository import list_operator_workflows
from app.ai.services.operator_copilot_service import (
    approve_operator_workflow,
    reject_operator_workflow,
    control_operator_workflow,
)
from app.ai.services.conversation_orchestrator import handle_conversation
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant


router = APIRouter(prefix="/ai/copilot", tags=["AI Copilot"])


class CopilotMessageRequest(BaseModel):
    message: str = Field(min_length=2, max_length=4000)
    client_phone: str | None = Field(default=None, max_length=40)


class CopilotDecisionRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class CopilotControlRequest(BaseModel):
    value: str | None = Field(default=None,max_length=500)


@router.get("/messages")
def get_messages(limit: int = 50, tenant=Depends(get_current_tenant)):
    return {"messages": list_operator_messages(tenant["org_id"], limit)}


@router.post("/messages")
def post_message(body: CopilotMessageRequest, tenant=Depends(get_current_tenant)):
    return handle_conversation(
        org_id=tenant["org_id"],
        actor_id=tenant["user_id"],
        actor_name=tenant.get("actor_name"),
        message=body.message,
        client_phone=body.client_phone,
        workspace_id=tenant.get("workspace_id"),
        channel="INTERNAL",
    )


@router.get("/workflows")
def get_workflows(
    workflow_status: str | None = None,
    limit: int = 30,
    tenant=Depends(get_current_tenant),
):
    return {
        "workflows": list_operator_workflows(
            tenant["org_id"], workflow_status=workflow_status, limit=limit
        )
    }


@router.post(
    "/workflows/{workflow_id}/approve",
    dependencies=[
        Depends(require_permission("clients.create")),
        Depends(require_permission("dossiers.create")),
        Depends(require_permission("packages.create")),
        Depends(require_permission("ai.copilot.execute")),
    ],
)
def approve_workflow(workflow_id: str, tenant=Depends(get_current_tenant)):
    return approve_operator_workflow(tenant["org_id"], workflow_id, tenant["user_id"])


@router.post(
    "/workflows/{workflow_id}/reject",
    dependencies=[Depends(require_permission("dossiers.create"))],
)
def reject_workflow(
    workflow_id: str,
    body: CopilotDecisionRequest,
    tenant=Depends(get_current_tenant),
):
    return {"workflow": reject_operator_workflow(tenant["org_id"], workflow_id, body.reason)}


@router.post("/workflows/{workflow_id}/{action}",dependencies=[Depends(require_permission("ai.copilot.execute"))])
def control_workflow(workflow_id: str,action: str,body: CopilotControlRequest,
                     tenant=Depends(get_current_tenant)):
    if action not in {"pause","resume","cancel","correct"}:
        raise HTTPException(422,"unsupported_workflow_action")
    return {"workflow":control_operator_workflow(tenant["org_id"],tenant["user_id"],workflow_id,action,body.value)}


@router.get("/escalations")
def get_escalations(limit: int = 30, tenant=Depends(get_current_tenant)):
    return {"escalations": list_ai_escalation_events(tenant["org_id"], limit)}
