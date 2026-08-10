from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.permissions import require_permission
from app.core.tenant_context import get_current_tenant

from app.performance.repositories.performance_repository import (
    list_performance_metrics,
    performance_summary,
)
from app.performance.repositories.sla_repository import list_sla_breaches
from app.performance.services.performance_service import (
    record_operator_output,
    record_response_time,
    record_shipment_delay,
)


router = APIRouter()


class ResponseTimeRequest(BaseModel):
    org_id: str
    conversation_id: str
    first_message_at: str
    first_reply_at: str
    actor_id: str | None = None
    actor_name: str | None = None


class ShipmentDelayRequest(BaseModel):
    org_id: str
    shipment_id: str
    eta_at: str
    arrived_at: str


class OperatorOutputRequest(BaseModel):
    org_id: str
    actor_id: str
    actor_name: str
    count: int
    metric_name: str = "Messages handled"


@router.post("/performance/response-time", dependencies=[Depends(require_permission("analytics.read"))])
def create_response_time_metric(
    body: ResponseTimeRequest,
    tenant=Depends(get_current_tenant),
):
    return {
        "status": "ok",
        **record_response_time(
            org_id=tenant["org_id"],
            conversation_id=body.conversation_id,
            first_message_at=body.first_message_at,
            first_reply_at=body.first_reply_at,
            actor_id=body.actor_id,
            actor_name=body.actor_name,
        ),
    }


@router.post("/performance/shipment-delay", dependencies=[Depends(require_permission("analytics.read"))])
def create_shipment_delay_metric(
    body: ShipmentDelayRequest,
    tenant=Depends(get_current_tenant),
):
    return {
        "status": "ok",
        **record_shipment_delay(
            org_id=tenant["org_id"],
            shipment_id=body.shipment_id,
            eta_at=body.eta_at,
            arrived_at=body.arrived_at,
        ),
    }


@router.post("/performance/operator-output", dependencies=[Depends(require_permission("analytics.read"))])
def create_operator_output_metric(
    body: OperatorOutputRequest,
    tenant=Depends(get_current_tenant),
):
    return {
        "status": "ok",
        **record_operator_output(
            org_id=tenant["org_id"],
            actor_id=body.actor_id,
            actor_name=body.actor_name,
            count=body.count,
            metric_name=body.metric_name,
        ),
    }


@router.get("/performance/metrics/{org_id}", dependencies=[Depends(require_permission("analytics.read"))])
def get_metrics(
    org_id: str,
    metric_type: str | None = None,
    tenant=Depends(get_current_tenant),
):
    if org_id != tenant["org_id"]:
        raise HTTPException(status_code=403, detail="cross_tenant_analytics_forbidden")
    return {
        "status": "ok",
        "metrics": list_performance_metrics(
            org_id=org_id,
            metric_type=metric_type,
        ),
    }


@router.get("/performance/summary/{org_id}", dependencies=[Depends(require_permission("analytics.read"))])
def get_summary(
    org_id: str,
    tenant=Depends(get_current_tenant),
):
    if org_id != tenant["org_id"]:
        raise HTTPException(status_code=403, detail="cross_tenant_analytics_forbidden")
    return {
        "status": "ok",
        "summary": performance_summary(org_id),
    }


@router.get("/performance/sla-breaches/{org_id}", dependencies=[Depends(require_permission("analytics.read"))])
def get_breaches(
    org_id: str,
    status: str | None = None,
    tenant=Depends(get_current_tenant),
):
    if org_id != tenant["org_id"]:
        raise HTTPException(status_code=403, detail="cross_tenant_analytics_forbidden")
    return {
        "status": "ok",
        "breaches": list_sla_breaches(
            org_id=org_id,
            status=status,
        ),
    }

