import json

from sqlalchemy import text

from app.db.database import engine


def create_dossier_draft(
    org_id: str,
    client_phone: str,
    source_message: str,
    workflow_id: str | None = None,
    client_name: str | None = None,
    case_type: str = "SEND_CARGO",
    origin_country: str | None = None,
    origin_city: str | None = None,
    destination_country: str | None = None,
    destination_city: str | None = None,
    goods_type: str | None = None,
    estimated_weight_kg: float | None = None,
    estimated_volume_cbm: float | None = None,
    shipping_mode: str | None = None,
    missing_fields: list | None = None,
    manager_id: str | None = None,
    manager_name: str | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into ai_dossier_drafts (
                    org_id,
                    client_phone,
                    workflow_id,
                    source_message,
                    client_name,
                    case_type,
                    origin_country,
                    origin_city,
                    destination_country,
                    destination_city,
                    goods_type,
                    estimated_weight_kg,
                    estimated_volume_cbm,
                    shipping_mode,
                    missing_fields,
                    manager_id,
                    manager_name
                )
                values (
                    :org_id,
                    :client_phone,
                    :workflow_id,
                    :source_message,
                    :client_name,
                    :case_type,
                    :origin_country,
                    :origin_city,
                    :destination_country,
                    :destination_city,
                    :goods_type,
                    :estimated_weight_kg,
                    :estimated_volume_cbm,
                    :shipping_mode,
                    cast(:missing_fields as jsonb),
                    :manager_id,
                    :manager_name
                )
                returning *
            """),
            {
                "org_id": org_id,
                "client_phone": client_phone,
                "workflow_id": workflow_id,
                "source_message": source_message,
                "client_name": client_name,
                "case_type": case_type,
                "origin_country": origin_country,
                "origin_city": origin_city,
                "destination_country": destination_country,
                "destination_city": destination_city,
                "goods_type": goods_type,
                "estimated_weight_kg": estimated_weight_kg,
                "estimated_volume_cbm": estimated_volume_cbm,
                "shipping_mode": shipping_mode,
                "missing_fields": json.dumps(missing_fields or []),
                "manager_id": manager_id,
                "manager_name": manager_name,
            },
        ).fetchone()

        conn.commit()
        return dict(row._mapping)


def get_dossier_draft(org_id: str, draft_id: str):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select *
                from ai_dossier_drafts
                where id = :draft_id
                  and org_id = :org_id
                limit 1
            """),
            {
                "org_id": org_id,
                "draft_id": draft_id,
            },
        ).fetchone()

        return dict(row._mapping) if row else None


def list_dossier_drafts(
    org_id: str,
    client_phone: str,
):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select *
                from ai_dossier_drafts
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


def update_dossier_draft_status(
    org_id: str,
    draft_id: str,
    status: str,
    created_dossier_id: str | None = None,
    created_shipment_id: str | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                update ai_dossier_drafts
                set
                    status = :status,
                    created_dossier_id = coalesce(
                        :created_dossier_id,
                        created_dossier_id
                    ),
                    created_shipment_id = coalesce(
                        :created_shipment_id,
                        created_shipment_id
                    ),
                    updated_at = now()
                where id = :draft_id
                  and org_id = :org_id
                returning *
            """),
            {
                "org_id": org_id,
                "draft_id": draft_id,
                "status": status,
                "created_dossier_id": created_dossier_id,
                "created_shipment_id": created_shipment_id,
            },
        ).fetchone()

        conn.commit()
        return dict(row._mapping) if row else None
