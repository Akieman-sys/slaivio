from sqlalchemy import text

from app.db.database import engine


def create_quarantine_envelope(data: dict) -> dict | None:
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                insert into platform_inbound_event_envelopes (
                    provider, provider_event_id, provider_account_id,
                    provider_phone_number_id, event_type, failure_reason,
                    payload_encrypted, payload_hash, signature_verified
                ) values (
                    :provider, :provider_event_id, :provider_account_id,
                    :provider_phone_number_id, :event_type, :failure_reason,
                    :payload_encrypted, :payload_hash, :signature_verified
                )
                on conflict (provider, provider_event_id) do update set
                    last_seen_at = now(),
                    retry_count = platform_inbound_event_envelopes.retry_count + 1,
                    failure_reason = excluded.failure_reason
                returning id, provider, provider_event_id, routing_status,
                          failure_reason, received_at, retry_count
            """),
            data,
        ).fetchone()
        return dict(row._mapping) if row else None


def list_quarantine_envelopes(limit: int = 100) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select id, provider, provider_event_id, provider_account_id,
                       provider_phone_number_id, event_type, routing_status,
                       failure_reason, signature_verified, received_at,
                       last_seen_at, retry_count, expires_at
                from platform_inbound_event_envelopes
                where routing_status = 'QUARANTINED'
                order by received_at desc
                limit :limit
            """),
            {"limit": limit},
        ).fetchall()
        return [dict(row._mapping) for row in rows]


def user_has_platform_permission(user_id: str, permission_code: str) -> bool:
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                select 1 from platform_operator_permissions
                where user_id = :user_id
                  and permission_code = :permission_code
                  and status = 'ACTIVE'
            """),
            {"user_id": user_id, "permission_code": permission_code},
        ).fetchone()
        return row is not None


def resolve_quarantine_envelope(
    *,
    envelope_id: str,
    org_id: str,
    actor_user_id: str,
    reason: str,
) -> dict | None:
    with engine.begin() as conn:
        organization = conn.execute(
            text("select id from organizations where id = :org_id"),
            {"org_id": org_id},
        ).fetchone()
        if not organization:
            return None

        previous = conn.execute(
            text("""
                select routing_status
                from platform_inbound_event_envelopes
                where id = :envelope_id
                for update
            """),
            {"envelope_id": envelope_id},
        ).fetchone()
        if not previous or previous._mapping["routing_status"] != "QUARANTINED":
            return None

        row = conn.execute(
            text("""
                update platform_inbound_event_envelopes
                set routing_status = 'MANUALLY_RESOLVED',
                    resolved_at = now(),
                    resolved_org_id = :org_id,
                    resolution_actor_id = :actor_user_id,
                    resolution_reason = :reason
                where id = :envelope_id
                returning id, provider, provider_event_id, routing_status,
                          resolved_org_id, resolved_at
            """),
            {
                "envelope_id": envelope_id,
                "org_id": org_id,
                "actor_user_id": actor_user_id,
                "reason": reason,
            },
        ).fetchone()
        conn.execute(
            text("""
                insert into platform_quarantine_audit_log (
                    envelope_id, actor_user_id, action, previous_status,
                    new_status, resolved_org_id, reason
                ) values (
                    :envelope_id, :actor_user_id, 'RESOLVE', 'QUARANTINED',
                    'MANUALLY_RESOLVED', :org_id, :reason
                )
            """),
            {
                "envelope_id": envelope_id,
                "actor_user_id": actor_user_id,
                "org_id": org_id,
                "reason": reason,
            },
        )
        return dict(row._mapping) if row else None
