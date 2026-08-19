import json

from sqlalchemy import text

from app.db.database import engine


def create_workflow_run(
    org_id: str,
    client_phone: str,
    source_message: str,
    intent: str,
    confidence: float,
    workflow_type: str,
    entities: dict,
    proposed_actions: list,
    manager_id: str | None = None,
    manager_name: str | None = None,
    workspace_id: str | None = None,
    channel: str = "INTERNAL",
    dialogue_state: str = "COLLECTING",
    risk_level: str = "MEDIUM",
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into ai_workflow_runs (
                    org_id,
                    client_phone,
                    source_message,
                    intent,
                    confidence,
                    workflow_type,
                    entities,
                    proposed_actions,
                    manager_id,
                    manager_name, workspace_id, channel, dialogue_state, risk_level
                )
                values (
                    :org_id,
                    :client_phone,
                    :source_message,
                    :intent,
                    :confidence,
                    :workflow_type,
                    cast(:entities as jsonb),
                    cast(:proposed_actions as jsonb),
                    :manager_id,
                    :manager_name, :workspace_id, :channel, :dialogue_state, :risk_level
                )
                returning *
            """),
            {
                "org_id": org_id,
                "client_phone": client_phone,
                "source_message": source_message,
                "intent": intent,
                "confidence": confidence,
                "workflow_type": workflow_type,
                "entities": json.dumps(entities or {}),
                "proposed_actions": json.dumps(proposed_actions or []),
                "manager_id": manager_id,
                "manager_name": manager_name,
                "workspace_id": workspace_id,
                "channel": channel,
                "dialogue_state": dialogue_state,
                "risk_level": risk_level,
            },
        ).fetchone()

        conn.commit()
        return dict(row._mapping)


def list_workflow_runs(
    org_id: str,
    client_phone: str,
):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select *
                from ai_workflow_runs
                where org_id = :org_id
                  and client_phone = :client_phone
                order by created_at desc
                limit 30
            """),
            {
                "org_id": org_id,
                "client_phone": client_phone,
            },
        ).fetchall()

        return [dict(row._mapping) for row in rows]


def get_workflow_run(org_id: str, workflow_id: str):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select *
                from ai_workflow_runs
                where id = :workflow_id
                  and org_id = :org_id
                limit 1
            """),
            {"org_id": org_id, "workflow_id": workflow_id},
        ).fetchone()

        return dict(row._mapping) if row else None


def get_active_operator_workflow(org_id: str, user_id: str):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select *
                from ai_workflow_runs
                where org_id = :org_id
                  and manager_id = :user_id
                  and workflow_status = 'PREPARED'
                  and workflow_type = 'CREATE_SHIPMENT_DRAFT'
                order by created_at desc
                limit 1
            """),
            {"org_id": org_id, "user_id": user_id},
        ).fetchone()

        return dict(row._mapping) if row else None


def list_operator_workflows(
    org_id: str,
    workflow_status: str | None = None,
    limit: int = 30,
):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select *
                from ai_workflow_runs
                where org_id = :org_id
                  and (
                    cast(:workflow_status as text) is null
                    or workflow_status = :workflow_status
                  )
                order by created_at desc
                limit :limit
            """),
            {
                "org_id": org_id,
                "workflow_status": workflow_status,
                "limit": min(max(limit, 1), 100),
            },
        ).fetchall()

        return [dict(row._mapping) for row in rows]


def update_workflow_status(
    org_id: str,
    workflow_id: str,
    status: str,
    result_payload: dict | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                update ai_workflow_runs
                set
                    workflow_status = :status,
                    result_payload = coalesce(
                        cast(:result_payload as jsonb),
                        result_payload
                    ),
                    updated_at = now()
                where id = :workflow_id
                  and org_id = :org_id
                returning *
            """),
            {
                "org_id": org_id,
                "workflow_id": workflow_id,
                "status": status,
                "result_payload": (
                    json.dumps(result_payload)
                    if result_payload is not None
                    else None
                ),
            },
        ).fetchone()

        conn.commit()
        return dict(row._mapping) if row else None


def update_workflow_details(
    org_id: str,
    workflow_id: str,
    client_phone: str,
    source_message: str,
    entities: dict,
    proposed_actions: list,
    dialogue_state: str | None = None,
    client_id: str | None = None,
    dossier_id: str | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                update ai_workflow_runs
                set
                    client_phone = :client_phone,
                    source_message = :source_message,
                    entities = cast(:entities as jsonb),
                    proposed_actions = cast(:proposed_actions as jsonb),
                    dialogue_state = coalesce(:dialogue_state, dialogue_state),
                    client_id = coalesce(cast(:client_id as uuid), client_id),
                    dossier_id = coalesce(cast(:dossier_id as uuid), dossier_id),
                    updated_at = now()
                where id = :workflow_id
                  and org_id = :org_id
                  and workflow_status = 'PREPARED'
                returning *
            """),
            {
                "org_id": org_id,
                "workflow_id": workflow_id,
                "client_phone": client_phone,
                "source_message": source_message,
                "entities": json.dumps(entities or {}),
                "proposed_actions": json.dumps(proposed_actions or []),
                "dialogue_state": dialogue_state,
                "client_id": client_id,
                "dossier_id": dossier_id,
            },
        ).fetchone()

        conn.commit()
        return dict(row._mapping) if row else None


def claim_workflow_execution(org_id: str,workflow_id: str):
    with engine.begin() as conn:
        row=conn.execute(text("""update ai_workflow_runs set workflow_status='EXECUTING',
            dialogue_state='EXECUTING',updated_at=now() where org_id=:org and id=:id
            and workflow_status='PREPARED' returning *"""),{"org":org_id,"id":workflow_id}).fetchone()
        return dict(row._mapping) if row else None


def save_field_validation(org_id: str, workflow_id: str, field_name: str, raw_value: str,
                          result: dict, workspace_id: str | None = None):
    with engine.begin() as conn:
        conn.execute(text("""
            insert into ai_workflow_field_validations(
                org_id,workspace_id,workflow_id,field_name,raw_value,normalized_value,
                validation_status,reason,choices
            ) values(:org,:workspace,cast(:workflow as uuid),:field,:raw,cast(:value as jsonb),
                     :status,:reason,cast(:choices as jsonb))
            on conflict(workflow_id,field_name) do update set
                raw_value=excluded.raw_value,normalized_value=excluded.normalized_value,
                validation_status=excluded.validation_status,reason=excluded.reason,
                choices=excluded.choices,created_at=now()
        """), {
            "org": org_id, "workspace": workspace_id, "workflow": workflow_id,
            "field": field_name, "raw": raw_value,
            "value": json.dumps(result.get("value")), "status": result["status"],
            "reason": result.get("reason"), "choices": json.dumps(result.get("choices") or []),
        })
