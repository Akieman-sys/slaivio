import uuid

from sqlalchemy import text

from app.db.database import engine


def _tracking_id():
    return "SLAIVO-" + str(uuid.uuid4())[:8].upper()


def get_or_create_client(
    org_id: str,
    client_phone: str,
    client_name: str | None = None,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select *
                from clients
                where org_id = :org_id
                  and phone = :phone
                limit 1
            """),
            {
                "org_id": org_id,
                "phone": client_phone,
            },
        ).fetchone()

        if row:
            return dict(row._mapping)

        row = conn.execute(
            text("""
                insert into clients (
                    org_id,
                    phone,
                    name
                )
                values (
                    :org_id,
                    :phone,
                    :name
                )
                returning *
            """),
            {
                "org_id": org_id,
                "phone": client_phone,
                "name": client_name,
            },
        ).fetchone()
        conn.commit()

        return dict(row._mapping)


def create_real_dossier(
    org_id: str,
    client_phone: str,
    origin_country: str | None,
    destination_city: str | None,
    client_name: str | None = None,
    origin_city: str | None = None,
    destination_country: str | None = None,
    goods_type: str | None = None,
    estimated_weight_kg: float | None = None,
    estimated_volume_cbm: float | None = None,
    shipping_mode: str | None = None,
):
    client = get_or_create_client(
        org_id=org_id,
        client_phone=client_phone,
        client_name=client_name,
    )

    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into dossiers (
                    org_id,
                    client_id,
                    case_type,
                    status_global,
                    intake_status,
                    validation_status,
                    origin_country,
                    origin_city,
                    destination_country,
                    destination_city,
                    goods_type,
                    estimated_weight_kg,
                    estimated_volume_cbm,
                    shipping_mode,
                    client_full_name
                )
                values (
                    :org_id,
                    :client_id,
                    'COMMERCIAL_CARGO',
                    'DRAFT',
                    'PARTIAL',
                    'PENDING',
                    :origin_country,
                    :origin_city,
                    :destination_country,
                    :destination_city,
                    :goods_type,
                    :estimated_weight_kg,
                    :estimated_volume_cbm,
                    :shipping_mode,
                    :client_name
                )
                returning *
            """),
            {
                "org_id": org_id,
                "client_id": client["id"],
                "origin_country": origin_country,
                "origin_city": origin_city,
                "destination_country": destination_country,
                "destination_city": destination_city,
                "goods_type": goods_type,
                "estimated_weight_kg": estimated_weight_kg,
                "estimated_volume_cbm": estimated_volume_cbm,
                "shipping_mode": shipping_mode,
                "client_name": client_name,
            },
        ).fetchone()

        conn.commit()
        return dict(row._mapping)


def create_real_shipment(
    org_id: str,
    dossier: dict,
):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                insert into shipments (
                    org_id,
                    dossier_id,
                    client_id,
                    tracking_id,
                    status,
                    origin_country,
                    origin_city,
                    destination_country,
                    destination_city,
                    goods_type,
                    weight_kg,
                    volume_cbm,
                    shipping_mode
                )
                values (
                    :org_id,
                    :dossier_id,
                    :client_id,
                    :tracking_id,
                    'CREATED',
                    :origin_country,
                    :origin_city,
                    :destination_country,
                    :destination_city,
                    :goods_type,
                    :weight_kg,
                    :volume_cbm,
                    :shipping_mode
                )
                returning *
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier["id"],
                "client_id": dossier["client_id"],
                "tracking_id": _tracking_id(),
                "origin_country": dossier.get("origin_country"),
                "origin_city": dossier.get("origin_city"),
                "destination_country": dossier.get("destination_country"),
                "destination_city": dossier.get("destination_city"),
                "goods_type": dossier.get("goods_type"),
                "weight_kg": dossier.get("estimated_weight_kg"),
                "volume_cbm": dossier.get("estimated_volume_cbm"),
                "shipping_mode": dossier.get("shipping_mode"),
            },
        ).fetchone()

        conn.commit()
        return dict(row._mapping)


def create_dossier_event(
    org_id: str,
    dossier_id: str,
    event_type: str,
    payload: str,
):
    with engine.connect() as conn:
        conn.execute(
            text("""
                insert into dossier_events (
                    org_id,
                    dossier_id,
                    event_type,
                    payload
                )
                values (
                    :org_id,
                    :dossier_id,
                    :event_type,
                    cast(:payload as jsonb)
                )
            """),
            {
                "org_id": org_id,
                "dossier_id": dossier_id,
                "event_type": event_type,
                "payload": payload,
            },
        )
        conn.commit()

