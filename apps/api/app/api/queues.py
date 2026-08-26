from fastapi import APIRouter, Depends
from sqlalchemy import text

from app.core.tenant_context import get_current_tenant
from app.core.permissions import require_permission
from app.db.database import engine
from app.db.queue_repository import update_queue


router = APIRouter()


@router.get("/queues", dependencies=[Depends(require_permission("inbox.read"))])
def get_queues(
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]

    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select
                    queue_name,
                    count(*) as total
                from inbox_conversations_view
                where org_id = :org_id
                group by queue_name
                order by total desc
            """),
            {
                "org_id": org_id,
            },
        ).fetchall()

    return {
        "status": "ok",
        "queues": [dict(row._mapping) for row in rows],
    }


@router.patch("/queues/{phone}", dependencies=[Depends(require_permission("inbox.manage"))])
def update_queue_route(
    phone: str,
    queue_name: str,
    tenant=Depends(get_current_tenant),
):
    org_id = tenant["org_id"]

    assignment = update_queue(
        org_id=org_id,
        client_phone=phone,
        queue_name=queue_name,
    )

    return {
        "status": "ok",
        "assignment": assignment,
    }
