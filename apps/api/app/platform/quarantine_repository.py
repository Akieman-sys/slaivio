from uuid import uuid4

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
                       last_seen_at, retry_count, replay_attempts,
                       next_replay_at, processed_at, last_replay_error, expires_at
                from platform_inbound_event_envelopes
                where routing_status <> 'PROCESSED'
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


def get_quarantine_metrics() -> dict:
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                select routing_status, count(*)::integer as count
                from platform_inbound_event_envelopes
                group by routing_status
            """)
        ).fetchall()
        stale = conn.execute(
            text("""
                select count(*)::integer
                from platform_inbound_event_envelopes
                where routing_status in (
                    'QUARANTINED', 'PENDING_REPLAY', 'REPLAY_FAILED'
                ) and received_at < now() - interval '15 minutes'
            """)
        ).scalar_one()
        oldest = conn.execute(
            text("""
                select min(received_at)
                from platform_inbound_event_envelopes
                where routing_status <> 'PROCESSED'
            """)
        ).scalar_one_or_none()
    return {
        "by_status": {row._mapping["routing_status"]: row._mapping["count"] for row in rows},
        "stale_over_15m": stale,
        "oldest_unresolved_at": oldest,
    }


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
                set routing_status = 'PENDING_REPLAY',
                    resolved_at = now(),
                    resolved_org_id = :org_id,
                    resolution_actor_id = :actor_user_id,
                    resolution_reason = :reason,
                    next_replay_at = now(),
                    last_replay_error = null
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
                    'PENDING_REPLAY', :org_id, :reason
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


def requeue_quarantine_envelope(
    *, envelope_id: str, actor_user_id: str, reason: str
) -> dict | None:
    with engine.begin() as conn:
        previous = conn.execute(
            text("""
                select routing_status, resolved_org_id
                from platform_inbound_event_envelopes
                where id = cast(:envelope_id as uuid)
                for update
            """),
            {"envelope_id": envelope_id},
        ).fetchone()
        if not previous or previous._mapping["routing_status"] not in {
            "REPLAY_FAILED", "DEAD_LETTER"
        }:
            return None
        row = conn.execute(
            text("""
                update platform_inbound_event_envelopes
                set routing_status = 'PENDING_REPLAY', replay_attempts = 0,
                    next_replay_at = now(), last_replay_error = null,
                    processing_lease_id = null,
                    processing_lease_expires_at = null
                where id = cast(:envelope_id as uuid)
                returning id, provider, provider_event_id, routing_status,
                          resolved_org_id, next_replay_at
            """),
            {"envelope_id": envelope_id},
        ).fetchone()
        conn.execute(
            text("""
                insert into platform_quarantine_audit_log (
                    envelope_id, actor_user_id, action, previous_status,
                    new_status, resolved_org_id, reason
                ) values (
                    cast(:envelope_id as uuid), :actor_user_id, 'REQUEUE',
                    :previous_status, 'PENDING_REPLAY', :org_id, :reason
                )
            """),
            {
                "envelope_id": envelope_id,
                "actor_user_id": actor_user_id,
                "previous_status": previous._mapping["routing_status"],
                "org_id": previous._mapping["resolved_org_id"],
                "reason": reason,
            },
        )
        return dict(row._mapping) if row else None


def claim_replay_envelope(
    envelope_id: str | None = None,
    lease_seconds: int = 120,
) -> dict | None:
    lease_id = str(uuid4())
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                with candidate as (
                    select id
                    from platform_inbound_event_envelopes
                    where (:envelope_id is null or id = cast(:envelope_id as uuid))
                      and resolved_org_id is not null
                      and signature_verified = true
                      and expires_at > now()
                      and (
                        (routing_status in ('PENDING_REPLAY', 'REPLAY_FAILED')
                         and coalesce(next_replay_at, now()) <= now())
                        or
                        (routing_status = 'PROCESSING'
                         and processing_lease_expires_at < now())
                      )
                    order by next_replay_at nulls first, received_at
                    for update skip locked
                    limit 1
                )
                update platform_inbound_event_envelopes q
                set routing_status = 'PROCESSING',
                    replay_attempts = replay_attempts + 1,
                    processing_started_at = now(),
                    processing_lease_id = cast(:lease_id as uuid),
                    processing_lease_expires_at = now() + make_interval(secs => :lease_seconds),
                    last_replay_error = null
                from candidate
                where q.id = candidate.id
                returning q.*
            """),
            {
                "envelope_id": envelope_id,
                "lease_id": lease_id,
                "lease_seconds": lease_seconds,
            },
        ).fetchone()
        return dict(row._mapping) if row else None


def complete_replay(envelope_id: str, lease_id: str) -> dict | None:
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                update platform_inbound_event_envelopes
                set routing_status = 'PROCESSED', processed_at = now(),
                    processing_lease_id = null,
                    processing_lease_expires_at = null,
                    next_replay_at = null, last_replay_error = null
                where id = cast(:envelope_id as uuid)
                  and routing_status = 'PROCESSING'
                  and processing_lease_id = cast(:lease_id as uuid)
                returning id, provider, provider_event_id, routing_status,
                          resolved_org_id, replay_attempts, processed_at
            """),
            {"envelope_id": envelope_id, "lease_id": lease_id},
        ).fetchone()
        if row:
            conn.execute(
                text("""
                    insert into platform_quarantine_audit_log (
                        envelope_id, actor_user_id, action, previous_status,
                        new_status, resolved_org_id, reason
                    ) values (
                        cast(:envelope_id as uuid), 'SYSTEM', 'REPLAY_SUCCESS',
                        'PROCESSING', 'PROCESSED', :org_id, 'Replay completed'
                    )
                """),
                {"envelope_id": envelope_id, "org_id": row._mapping["resolved_org_id"]},
            )
        return dict(row._mapping) if row else None


def fail_replay(
    envelope_id: str,
    lease_id: str,
    error: str,
    max_attempts: int,
) -> dict | None:
    safe_error = error[:1000]
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                update platform_inbound_event_envelopes
                set routing_status = case
                        when replay_attempts >= :max_attempts then 'DEAD_LETTER'
                        else 'REPLAY_FAILED'
                    end,
                    next_replay_at = case
                        when replay_attempts >= :max_attempts then null
                        else now() + make_interval(
                            secs => least(3600, 30 * power(2, replay_attempts - 1))::integer
                        )
                    end,
                    processing_lease_id = null,
                    processing_lease_expires_at = null,
                    last_replay_error = :error
                where id = cast(:envelope_id as uuid)
                  and routing_status = 'PROCESSING'
                  and processing_lease_id = cast(:lease_id as uuid)
                returning id, routing_status, resolved_org_id, replay_attempts,
                          next_replay_at, last_replay_error
            """),
            {
                "envelope_id": envelope_id,
                "lease_id": lease_id,
                "error": safe_error,
                "max_attempts": max_attempts,
            },
        ).fetchone()
        if row:
            status = row._mapping["routing_status"]
            conn.execute(
                text("""
                    insert into platform_quarantine_audit_log (
                        envelope_id, actor_user_id, action, previous_status,
                        new_status, resolved_org_id, reason
                    ) values (
                        cast(:envelope_id as uuid), 'SYSTEM', 'REPLAY_FAILURE',
                        'PROCESSING', :status, :org_id, :error
                    )
                """),
                {
                    "envelope_id": envelope_id,
                    "status": status,
                    "org_id": row._mapping["resolved_org_id"],
                    "error": safe_error,
                },
            )
        return dict(row._mapping) if row else None
