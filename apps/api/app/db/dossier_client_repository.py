from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.clients.repository import normalize_email, normalize_phone, update_client
from app.db.database import engine


class DuplicateDossierClientError(ValueError):
    def __init__(self, client: dict):
        super().__init__("duplicate_client")
        self.client = client


def _safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_safe(item) for item in value]
    return value


def _dict(row) -> dict | None:
    return _safe(dict(row._mapping)) if row else None


RELATION_SELECT = """
    select
      relation.id::text relation_id,
      relation.org_id,
      relation.dossier_id::text,
      relation.client_id::text,
      client.client_reference,
      relation.dossier_client_reference,
      coalesce(client.display_name, client.name, client.company_name, client.phone, client.email, 'Client sans nom') display_name,
      client.name,
      client.company_name,
      client.phone,
      client.whatsapp_phone,
      client.email,
      client.customer_type,
      client.lifecycle_status,
      client.country,
      client.city,
      client.address,
      client.preferred_language,
      client.row_version client_row_version,
      relation.relationship_role,
      relation.situation,
      relation.status_in_dossier,
      relation.attention_required,
      relation.attention_reason,
      relation.last_updated_at,
      relation.row_version,
      relation.sync_version,
      relation.archived_at,
      relation.created_at,
      relation.updated_at
    from dossier_clients relation
    join clients client
      on client.org_id = relation.org_id
     and client.id = relation.client_id
"""


def _locked_dossier(conn, org_id: str, dossier_id: str, *, allow_archived: bool = False) -> dict | None:
    return _dict(conn.execute(
        text("""
            select id::text, org_id, client_id::text, archived_at, row_version
            from dossiers
            where org_id = :org_id and id = :dossier_id
              and (:allow_archived or archived_at is null)
            for update
        """),
        {"org_id": org_id, "dossier_id": dossier_id, "allow_archived": allow_archived},
    ).fetchone())


def _relation_by_id(conn, org_id: str, relation_id: str) -> dict | None:
    return _dict(conn.execute(
        text(RELATION_SELECT + " where relation.org_id = :org_id and relation.id = :relation_id"),
        {"org_id": org_id, "relation_id": relation_id},
    ).fetchone())


def _client_by_id(conn, org_id: str, client_id: str) -> dict | None:
    return _dict(conn.execute(text("""
        select id::text, client_reference,
               coalesce(display_name, name, company_name, phone, email, 'Client sans nom') display_name,
               name, company_name, phone, whatsapp_phone, email, customer_type,
               lifecycle_status, source, preferred_language, row_version, created_at, updated_at
        from clients
        where org_id = :org_id and id = :client_id and deleted_at is null
        limit 1
    """), {"org_id": org_id, "client_id": client_id}).fetchone())


def _relation_for_client(conn, org_id: str, dossier_id: str, client_id: str, *, active_only: bool = True) -> dict | None:
    archived = "and relation.archived_at is null" if active_only else ""
    return _dict(conn.execute(
        text(RELATION_SELECT + f"""
            where relation.org_id = :org_id
              and relation.dossier_id = :dossier_id
              and relation.client_id = :client_id
              {archived}
            order by relation.created_at desc
            limit 1
        """),
        {"org_id": org_id, "dossier_id": dossier_id, "client_id": client_id},
    ).fetchone())


def _event(conn, *, org_id: str, dossier_id: str, user_id: str, event_type: str, payload: dict) -> None:
    conn.execute(text("""
        insert into dossier_events(org_id, dossier_id, event_type, payload)
        values(:org_id, :dossier_id, :event_type, cast(:payload as jsonb))
    """), {
        "org_id": org_id,
        "dossier_id": dossier_id,
        "event_type": event_type,
        "payload": json.dumps({"user_id": user_id, **payload}, ensure_ascii=False, default=str),
    })


def list_dossier_clients(org_id: str, dossier_id: str, *, include_archived: bool = False, q: str | None = None) -> list[dict]:
    filters = ["relation.org_id = :org_id", "relation.dossier_id = :dossier_id"]
    params: dict[str, Any] = {"org_id": org_id, "dossier_id": dossier_id}
    if not include_archived:
        filters.append("relation.archived_at is null")
    if q:
        filters.append("""(
          coalesce(client.client_reference, '') ilike :q
          or coalesce(client.display_name, client.name, client.company_name, '') ilike :q
          or coalesce(client.phone, '') ilike :q
          or coalesce(client.whatsapp_phone, '') ilike :q
          or coalesce(client.email, '') ilike :q
        )""")
        params["q"] = f"%{q.strip()}%"
    with engine.connect() as conn:
        rows = conn.execute(
            text(RELATION_SELECT + f" where {' and '.join(filters)} order by relation.attention_required desc, relation.last_updated_at desc"),
            params,
        ).fetchall()
    return [_safe(dict(row._mapping)) for row in rows]


def search_clients_for_dossier(org_id: str, q: str, *, dossier_id: str | None = None, limit: int = 20) -> list[dict]:
    normalized = q.strip()
    if len(normalized) < 2:
        return []
    phone = "".join(character for character in normalized if character.isdigit())
    params = {
        "org_id": org_id,
        "q": f"%{normalized}%",
        "phone": f"%{phone}%" if phone else "%__no_phone__%",
        "dossier_id": dossier_id,
        "limit": min(max(limit, 1), 50),
    }
    with engine.connect() as conn:
        rows = conn.execute(text("""
            select
              client.id::text,
              client.client_reference,
              coalesce(client.display_name, client.name, client.company_name, client.phone, client.email, 'Client sans nom') display_name,
              client.name,
              client.company_name,
              client.phone,
              client.whatsapp_phone,
              client.email,
              client.customer_type,
              client.lifecycle_status,
              client.row_version,
              exists(
                select 1 from dossier_clients relation
                where relation.org_id = client.org_id
                  and relation.client_id = client.id
                  and relation.dossier_id = cast(:dossier_id as uuid)
                  and relation.archived_at is null
              ) already_attached
            from clients client
            where client.org_id = :org_id
              and client.deleted_at is null
              and (
                coalesce(client.client_reference, '') ilike :q
                or coalesce(client.display_name, client.name, client.company_name, '') ilike :q
                or coalesce(client.phone, '') ilike :q
                or coalesce(client.whatsapp_phone, '') ilike :q
                or coalesce(client.email, '') ilike :q
                or regexp_replace(coalesce(client.phone, client.whatsapp_phone, ''), '[^0-9]', '', 'g') ilike :phone
              )
            order by already_attached, client.updated_at desc
            limit :limit
        """), params).fetchall()
    return [_safe(dict(row._mapping)) for row in rows]


def _attach(conn, *, org_id: str, dossier: dict, client_id: str, user_id: str, payload: dict) -> tuple[dict, bool]:
    idempotency_key = payload.get("idempotency_key")
    if idempotency_key:
        replay = conn.execute(text("""
            select id::text from dossier_clients
            where org_id = :org_id and idempotency_key = :idempotency_key
            limit 1
        """), {"org_id": org_id, "idempotency_key": idempotency_key}).fetchone()
        if replay:
            return _relation_by_id(conn, org_id, str(replay[0])) or {}, True

    client = conn.execute(text("""
        select id::text from clients
        where org_id = :org_id and id = :client_id and deleted_at is null
        for update
    """), {"org_id": org_id, "client_id": client_id}).fetchone()
    if not client:
        raise ValueError("client_not_found")

    existing = _relation_for_client(conn, org_id, dossier["id"], client_id)
    if existing:
        return existing, True

    is_primary = not dossier.get("client_id")
    try:
        relation_id = conn.execute(text("""
            insert into dossier_clients(
              org_id, dossier_id, client_id, relationship_role,
              dossier_client_reference, situation, status_in_dossier,
              attention_required, attention_reason, idempotency_key,
              created_by, updated_by
            )
            select
              :org_id, :dossier_id, client.id,
              case when :is_primary then 'PRIMARY' else :relationship_role end,
              client.client_reference, :situation, :status_in_dossier,
              :attention_required, :attention_reason, :idempotency_key,
              :user_id, :user_id
            from clients client
            where client.org_id = :org_id and client.id = :client_id
            returning id::text
        """), {
            "org_id": org_id,
            "dossier_id": dossier["id"],
            "client_id": client_id,
            "is_primary": is_primary,
            "relationship_role": None if payload.get("relationship_role") == "PRIMARY" else payload.get("relationship_role"),
            "situation": payload.get("situation"),
            "status_in_dossier": payload.get("status_in_dossier"),
            "attention_required": bool(payload.get("attention_required", False)),
            "attention_reason": payload.get("attention_reason") if payload.get("attention_required") else None,
            "idempotency_key": idempotency_key,
            "user_id": user_id,
        }).scalar_one()
    except IntegrityError as exc:
        raise ValueError("dossier_client_conflict") from exc

    if is_primary:
        conn.execute(text("""
            update dossiers
            set client_id = :client_id, updated_by = :user_id,
                updated_at = now(), row_version = row_version + 1
            where org_id = :org_id and id = :dossier_id and archived_at is null
        """), {"org_id": org_id, "dossier_id": dossier["id"], "client_id": client_id, "user_id": user_id})

    _event(conn, org_id=org_id, dossier_id=dossier["id"], user_id=user_id,
           event_type="DOSSIER_CLIENT_ATTACHED", payload={"client_id": client_id})
    return _relation_by_id(conn, org_id, relation_id) or {}, False


def attach_client_to_dossier(org_id: str, dossier_id: str, client_id: str, user_id: str, payload: dict) -> tuple[dict, bool]:
    with engine.begin() as conn:
        dossier = _locked_dossier(conn, org_id, dossier_id)
        if not dossier:
            raise ValueError("dossier_not_found")
        return _attach(conn, org_id=org_id, dossier=dossier, client_id=client_id, user_id=user_id, payload=payload)


def create_client_in_dossier(org_id: str, dossier_id: str, user_id: str, client_payload: dict, relation_payload: dict) -> tuple[dict, dict, bool]:
    phone = normalize_phone(client_payload.get("phone"))
    # Dans le Pilot V1, le numéro principal est aussi le numéro WhatsApp.
    # whatsapp_phone reste synchronisé uniquement pour les anciens consommateurs.
    whatsapp = phone
    email = normalize_email(client_payload.get("email"))
    with engine.begin() as conn:
        dossier = _locked_dossier(conn, org_id, dossier_id)
        if not dossier:
            raise ValueError("dossier_not_found")

        idempotency_key = relation_payload.get("idempotency_key")
        if idempotency_key:
            replay = conn.execute(text("""
                select client_id::text from dossier_clients
                where org_id = :org_id and idempotency_key = :idempotency_key
                limit 1
            """), {"org_id": org_id, "idempotency_key": idempotency_key}).fetchone()
            if replay:
                client_id = str(replay[0])
                relation = _relation_for_client(conn, org_id, dossier_id, client_id, active_only=False) or {}
                return _client_by_id(conn, org_id, client_id) or {}, relation, True

        duplicate = conn.execute(text("""
            select id::text, client_reference,
                   coalesce(display_name, name, company_name, phone, email, 'Client sans nom') display_name,
                   phone, whatsapp_phone, email
            from clients
            where org_id = :org_id and deleted_at is null
              and (
                (:phone is not null and normalized_phone = :phone)
                or (:email is not null and normalized_email = :email)
              )
            order by created_at
            limit 1
        """), {"org_id": org_id, "phone": phone or whatsapp, "email": email}).fetchone()
        if duplicate:
            raise DuplicateDossierClientError(_dict(duplicate) or {})

        display_name = (
            client_payload.get("display_name")
            or client_payload.get("name")
            or phone
            or email
        )
        try:
            client_id = conn.execute(text("""
                insert into clients(
                  org_id, name, display_name, company_name, phone, whatsapp_phone,
                  email, normalized_phone, normalized_email, customer_type,
                  lifecycle_status, source, preferred_language, created_by, updated_by,
                  last_activity_at
                ) values (
                  :org_id, :name, :display_name, :company_name, :phone, :whatsapp_phone,
                  :email, :normalized_phone, :normalized_email, :customer_type,
                  :lifecycle_status, :source, :preferred_language, :user_id, :user_id,
                  now()
                ) returning id::text
            """), {
                "org_id": org_id,
                "name": client_payload.get("name"),
                "display_name": display_name,
                "company_name": None,
                "phone": phone,
                "whatsapp_phone": whatsapp,
                "email": email,
                "normalized_phone": phone or whatsapp,
                "normalized_email": email,
                "customer_type": client_payload.get("customer_type") or "individual",
                "lifecycle_status": "lead",
                "source": "manual",
                "preferred_language": "FR",
                "user_id": user_id,
            }).scalar_one()
        except IntegrityError as exc:
            raise ValueError("duplicate_client") from exc

        conn.execute(text("""
            insert into audit_logs(org_id, actor_id, entity_type, entity_id, action, metadata, severity)
            values(:org_id, :user_id, 'client', :client_id, 'client.created_in_dossier',
                   cast(:metadata as jsonb), 'INFO')
        """), {
            "org_id": org_id,
            "user_id": user_id,
            "client_id": client_id,
            "metadata": json.dumps({"dossier_id": dossier_id}),
        })
        relation, replayed = _attach(
            conn, org_id=org_id, dossier=dossier, client_id=client_id,
            user_id=user_id, payload=relation_payload,
        )
        return _client_by_id(conn, org_id, client_id) or {}, relation, replayed


def update_dossier_client(org_id: str, dossier_id: str, client_id: str, user_id: str, payload: dict) -> dict:
    expected_version = int(payload["row_version"])
    with engine.begin() as conn:
        dossier = _locked_dossier(conn, org_id, dossier_id)
        if not dossier:
            raise ValueError("dossier_not_found")
        relation = _relation_for_client(conn, org_id, dossier_id, client_id)
        if not relation:
            raise ValueError("dossier_client_not_found")

        if payload.get("make_primary"):
            conn.execute(text("""
                update dossier_clients
                set relationship_role = null, updated_by = :user_id
                where org_id = :org_id and dossier_id = :dossier_id
                  and archived_at is null and relationship_role = 'PRIMARY'
                  and client_id <> :client_id
            """), {"org_id": org_id, "dossier_id": dossier_id, "client_id": client_id, "user_id": user_id})

        values = {
            "situation": payload.get("situation", relation.get("situation")),
            "status_in_dossier": payload.get("status_in_dossier", relation.get("status_in_dossier")),
            "attention_required": payload.get("attention_required", relation.get("attention_required", False)),
            "attention_reason": payload.get("attention_reason", relation.get("attention_reason")),
            "relationship_role": (
                "PRIMARY" if payload.get("make_primary")
                else (
                    relation.get("relationship_role")
                    if payload.get("relationship_role") == "PRIMARY"
                    else payload.get("relationship_role", relation.get("relationship_role"))
                )
            ),
        }
        if not values["attention_required"]:
            values["attention_reason"] = None
        result = conn.execute(text("""
            update dossier_clients
            set situation = :situation,
                status_in_dossier = :status_in_dossier,
                attention_required = :attention_required,
                attention_reason = :attention_reason,
                relationship_role = :relationship_role,
                updated_by = :user_id
            where org_id = :org_id and dossier_id = :dossier_id
              and client_id = :client_id and archived_at is null
              and row_version = :expected_version
            returning id::text
        """), {
            **values, "user_id": user_id, "org_id": org_id, "dossier_id": dossier_id,
            "client_id": client_id, "expected_version": expected_version,
        }).fetchone()
        if not result:
            raise ValueError("stale_dossier_client_version")
        if payload.get("make_primary"):
            conn.execute(text("""
                update dossiers set client_id = :client_id, updated_by = :user_id,
                    updated_at = now(), row_version = row_version + 1
                where org_id = :org_id and id = :dossier_id and archived_at is null
            """), {"org_id": org_id, "dossier_id": dossier_id, "client_id": client_id, "user_id": user_id})
        _event(conn, org_id=org_id, dossier_id=dossier_id, user_id=user_id,
               event_type="DOSSIER_CLIENT_UPDATED", payload={"client_id": client_id})
        return _relation_by_id(conn, org_id, str(result[0])) or {}


def update_client_profile_in_dossier(
    org_id: str,
    dossier_id: str,
    client_id: str,
    user_id: str,
    payload: dict,
) -> dict:
    """Update the canonical client record through its Pilot dossier context."""
    with engine.connect() as conn:
        relation = _relation_for_client(conn, org_id, dossier_id, client_id)
    if not relation:
        raise ValueError("dossier_client_not_found")

    updated = update_client(org_id, client_id, user_id, payload)
    if not updated:
        raise ValueError("client_not_found")

    with engine.begin() as conn:
        current = _relation_for_client(conn, org_id, dossier_id, client_id)
        if not current:
            raise ValueError("dossier_client_not_found")
        relation_id = conn.execute(text("""
            update dossier_clients
            set updated_by = :user_id
            where org_id = :org_id and dossier_id = :dossier_id
              and client_id = :client_id and archived_at is null
            returning id::text
        """), {
            "org_id": org_id,
            "dossier_id": dossier_id,
            "client_id": client_id,
            "user_id": user_id,
        }).scalar_one()
        _event(
            conn,
            org_id=org_id,
            dossier_id=dossier_id,
            user_id=user_id,
            event_type="DOSSIER_CLIENT_PROFILE_UPDATED",
            payload={"client_id": client_id},
        )
        return _relation_by_id(conn, org_id, relation_id) or {}


def archive_dossier_client(org_id: str, dossier_id: str, client_id: str, user_id: str, expected_version: int) -> dict:
    with engine.begin() as conn:
        dossier = _locked_dossier(conn, org_id, dossier_id)
        if not dossier:
            raise ValueError("dossier_not_found")
        relation = _relation_for_client(conn, org_id, dossier_id, client_id)
        if not relation:
            raise ValueError("dossier_client_not_found")
        result = conn.execute(text("""
            update dossier_clients
            set archived_at = now(), archived_by = :user_id, updated_by = :user_id
            where org_id = :org_id and dossier_id = :dossier_id and client_id = :client_id
              and archived_at is null and row_version = :expected_version
            returning id::text
        """), {"org_id": org_id, "dossier_id": dossier_id, "client_id": client_id,
                 "user_id": user_id, "expected_version": expected_version}).fetchone()
        if not result:
            raise ValueError("stale_dossier_client_version")

        if dossier.get("client_id") == client_id:
            replacement = conn.execute(text("""
                select client_id::text from dossier_clients
                where org_id = :org_id and dossier_id = :dossier_id and archived_at is null
                order by created_at, id limit 1
            """), {"org_id": org_id, "dossier_id": dossier_id}).fetchone()
            replacement_id = str(replacement[0]) if replacement else None
            if replacement_id:
                conn.execute(text("""
                    update dossier_clients set relationship_role = 'PRIMARY', updated_by = :user_id
                    where org_id = :org_id and dossier_id = :dossier_id and client_id = :client_id
                      and archived_at is null
                """), {"org_id": org_id, "dossier_id": dossier_id, "client_id": replacement_id, "user_id": user_id})
            conn.execute(text("""
                update dossiers set client_id = :client_id, updated_by = :user_id,
                    updated_at = now(), row_version = row_version + 1
                where org_id = :org_id and id = :dossier_id and archived_at is null
            """), {"org_id": org_id, "dossier_id": dossier_id, "client_id": replacement_id, "user_id": user_id})

        _event(conn, org_id=org_id, dossier_id=dossier_id, user_id=user_id,
               event_type="DOSSIER_CLIENT_REMOVED", payload={"client_id": client_id})
        return _relation_by_id(conn, org_id, str(result[0])) or {}


def restore_dossier_client(org_id: str, dossier_id: str, client_id: str, user_id: str, expected_version: int) -> dict:
    with engine.begin() as conn:
        dossier = _locked_dossier(conn, org_id, dossier_id)
        if not dossier:
            raise ValueError("dossier_not_found")
        relation = _relation_for_client(conn, org_id, dossier_id, client_id, active_only=False)
        if not relation or relation.get("archived_at") is None:
            raise ValueError("archived_dossier_client_not_found")
        make_primary = not dossier.get("client_id")
        try:
            result = conn.execute(text("""
                update dossier_clients
                set archived_at = null, archived_by = null, updated_by = :user_id,
                    relationship_role = case when :make_primary then 'PRIMARY' else null end
                where org_id = :org_id and id = :relation_id and archived_at is not null
                  and row_version = :expected_version
                returning id::text
            """), {"org_id": org_id, "relation_id": relation["relation_id"], "user_id": user_id,
                     "make_primary": make_primary, "expected_version": expected_version}).fetchone()
        except IntegrityError as exc:
            raise ValueError("dossier_client_conflict") from exc
        if not result:
            raise ValueError("stale_dossier_client_version")
        if make_primary:
            conn.execute(text("""
                update dossiers set client_id = :client_id, updated_by = :user_id,
                    updated_at = now(), row_version = row_version + 1
                where org_id = :org_id and id = :dossier_id
            """), {"org_id": org_id, "dossier_id": dossier_id, "client_id": client_id, "user_id": user_id})
        _event(conn, org_id=org_id, dossier_id=dossier_id, user_id=user_id,
               event_type="DOSSIER_CLIENT_RESTORED", payload={"client_id": client_id})
        return _relation_by_id(conn, org_id, str(result[0])) or {}


def move_dossier_client(
    org_id: str,
    dossier_id: str,
    client_id: str,
    target_dossier_id: str,
    user_id: str,
    payload: dict,
) -> tuple[dict, bool]:
    if dossier_id == target_dossier_id:
        raise ValueError("same_target_dossier")
    expected_version = int(payload["row_version"])
    idempotency_key = payload.get("idempotency_key")
    with engine.begin() as conn:
        locked = conn.execute(text("""
            select id::text, client_id::text, archived_at, row_version
            from dossiers
            where org_id = :org_id and id in (:source_id, :target_id)
            order by id
            for update
        """), {
            "org_id": org_id, "source_id": dossier_id, "target_id": target_dossier_id,
        }).fetchall()
        dossiers = {str(row._mapping["id"]): _dict(row) or {} for row in locked}
        source = dossiers.get(dossier_id)
        target = dossiers.get(target_dossier_id)
        if not source or source.get("archived_at") is not None:
            raise ValueError("dossier_not_found")
        if not target or target.get("archived_at") is not None:
            raise ValueError("target_dossier_not_found")

        if idempotency_key:
            replay = conn.execute(text("""
                select id::text from dossier_clients
                where org_id = :org_id and idempotency_key = :idempotency_key
                limit 1
            """), {"org_id": org_id, "idempotency_key": idempotency_key}).fetchone()
            if replay:
                return _relation_by_id(conn, org_id, str(replay[0])) or {}, True

        source_relation = _relation_for_client(conn, org_id, dossier_id, client_id)
        if not source_relation:
            raise ValueError("dossier_client_not_found")
        if int(source_relation["row_version"]) != expected_version:
            raise ValueError("stale_dossier_client_version")
        if _relation_for_client(conn, org_id, target_dossier_id, client_id):
            raise ValueError("client_already_in_target_dossier")

        archived = conn.execute(text("""
            update dossier_clients
            set archived_at = now(), archived_by = :user_id, updated_by = :user_id
            where org_id = :org_id and dossier_id = :dossier_id and client_id = :client_id
              and archived_at is null and row_version = :expected_version
            returning id::text
        """), {
            "org_id": org_id, "dossier_id": dossier_id, "client_id": client_id,
            "user_id": user_id, "expected_version": expected_version,
        }).fetchone()
        if not archived:
            raise ValueError("stale_dossier_client_version")

        if source.get("client_id") == client_id:
            replacement = conn.execute(text("""
                select client_id::text from dossier_clients
                where org_id = :org_id and dossier_id = :dossier_id and archived_at is null
                order by created_at, id limit 1
            """), {"org_id": org_id, "dossier_id": dossier_id}).fetchone()
            replacement_id = str(replacement[0]) if replacement else None
            if replacement_id:
                conn.execute(text("""
                    update dossier_clients set relationship_role = 'PRIMARY', updated_by = :user_id
                    where org_id = :org_id and dossier_id = :dossier_id
                      and client_id = :client_id and archived_at is null
                """), {
                    "org_id": org_id, "dossier_id": dossier_id,
                    "client_id": replacement_id, "user_id": user_id,
                })
            conn.execute(text("""
                update dossiers set client_id = :client_id, updated_by = :user_id,
                    updated_at = now(), row_version = row_version + 1
                where org_id = :org_id and id = :dossier_id
            """), {
                "org_id": org_id, "dossier_id": dossier_id,
                "client_id": replacement_id, "user_id": user_id,
            })

        relation_payload = {
            "relationship_role": payload.get("relationship_role") or source_relation.get("relationship_role"),
            "situation": payload.get("situation", source_relation.get("situation")),
            "status_in_dossier": payload.get("status_in_dossier", source_relation.get("status_in_dossier")),
            "attention_required": payload.get("attention_required", source_relation.get("attention_required", False)),
            "attention_reason": payload.get("attention_reason", source_relation.get("attention_reason")),
            "idempotency_key": idempotency_key,
        }
        moved, replayed = _attach(
            conn, org_id=org_id, dossier=target, client_id=client_id,
            user_id=user_id, payload=relation_payload,
        )
        _event(conn, org_id=org_id, dossier_id=dossier_id, user_id=user_id,
               event_type="DOSSIER_CLIENT_MOVED_OUT",
               payload={"client_id": client_id, "target_dossier_id": target_dossier_id})
        _event(conn, org_id=org_id, dossier_id=target_dossier_id, user_id=user_id,
               event_type="DOSSIER_CLIENT_MOVED_IN",
               payload={"client_id": client_id, "source_dossier_id": dossier_id})
        return moved, replayed


def dossier_client_history(org_id: str, dossier_id: str, client_id: str, *, limit: int = 100) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            select id::text, event_type, actor_id, old_data, new_data, metadata, created_at
            from dossier_client_events
            where org_id = :org_id and dossier_id = :dossier_id and client_id = :client_id
            order by created_at desc limit :limit
        """), {"org_id": org_id, "dossier_id": dossier_id, "client_id": client_id,
                 "limit": min(max(limit, 1), 200)}).fetchall()
    return [_safe(dict(row._mapping)) for row in rows]
