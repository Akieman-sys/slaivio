from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.tenant_context import get_current_tenant
from app.ai.repositories.workflow_repository import (
    list_workflow_runs,
    update_workflow_status,
)
from app.ai.services.workflow_engine import prepare_ai_workflow


router = APIRouter()


class PrepareWorkflowRequest(BaseModel):
    source_message: str
    manager_id: str | None = None
    manager_name: str | None = None


class UpdateWorkflowStatusRequest(BaseModel):
    status: str
    result_payload: dict | None = None


@router.post("/inbox/conversations/{phone}/ai-workflow")
def create_workflow(
    phone: str,
    body: PrepareWorkflowRequest,
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]

    return prepare_ai_workflow(
        org_id=org_id,
        client_phone=phone,
        source_message=body.source_message,
        manager_id=body.manager_id,
        manager_name=body.manager_name,
    )


@router.get("/inbox/conversations/{phone}/ai-workflows")
def get_workflows(
    phone: str,
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]

    return {
        "status": "ok",
        "workflows": list_workflow_runs(
            org_id=org_id,
            client_phone=phone,
        ),
    }


@router.patch("/ai-workflows/{workflow_id}/status")
def change_workflow_status(
    workflow_id: str,
    body: UpdateWorkflowStatusRequest,
    tenant=Depends(get_current_tenant),
):
    return {
        "status": "ok",
        "workflow": update_workflow_status(
            org_id=tenant["org_id"],
            workflow_id=workflow_id,
            status=body.status,
            result_payload=body.result_payload,
        ),
    }
