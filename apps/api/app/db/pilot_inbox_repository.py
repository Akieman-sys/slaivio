from sqlalchemy import text

from app.db.database import engine
from app.services.dossier_document_storage import create_document_download_url


PHONE_SQL = "regexp_replace(coalesce({value}, ''), '[^0-9]', '', 'g')"
AI_OVERRIDE_SQL = "nullif(to_jsonb(assignment)->>'ai_mode_override', '')"
AI_DEFAULT_SQL = "coalesce(nullif(to_jsonb(ai)->>'pilot_response_mode', ''), 'SUGGESTION_ONLY')"


def _rows(result):
    return [dict(row._mapping) for row in result.fetchall()]


def register_inbound(org_id: str, phone: str, client_id: str | None, dossier_id: str | None):
    """Make an inbound message visible to the Pilot without duplicating CRM data."""
    with engine.begin() as conn:
        row = conn.execute(text("""
            insert into conversation_assignments(
              org_id, client_phone, client_id, dossier_id, status, priority,
              queue_name, unread_count, requires_attention, waiting_since
            ) values (
              :org_id, :phone, cast(:client_id as uuid), cast(:dossier_id as uuid),
              'OPEN', 'NORMAL', 'PILOT', 1, true, now()
            )
            on conflict(org_id, client_phone) do update set
              client_id = coalesce(conversation_assignments.client_id, excluded.client_id),
              dossier_id = coalesce(conversation_assignments.dossier_id, excluded.dossier_id),
              status = 'OPEN',
              queue_name = 'PILOT',
              unread_count = coalesce(conversation_assignments.unread_count, 0) + 1,
              requires_attention = true,
              waiting_since = coalesce(conversation_assignments.waiting_since, now()),
              updated_at = now()
            returning *
        """), {"org_id": org_id, "phone": phone, "client_id": client_id, "dossier_id": dossier_id}).fetchone()
        return dict(row._mapping) if row else None


def list_conversations(
    org_id: str, view: str = "all", query: str | None = None, page: int = 1, page_size: int = 40,
    number_role: str | None = None, status: str | None = None, queue_name: str | None = None,
    priority: str | None = None, requires_attention: bool | None = None,
):
    conditions = ["conversation.org_id = :org_id"]
    params = {"org_id": org_id, "limit": page_size, "offset": (page - 1) * page_size}
    if view == "unread":
        conditions.append("coalesce(assignment.status, 'OPEN') <> 'CLOSED'")
        conditions.append("coalesce(assignment.unread_count, 0) > 0")
    elif view == "attention":
        conditions.append("coalesce(assignment.status, 'OPEN') <> 'CLOSED'")
        conditions.append("coalesce(assignment.requires_attention, false)")
    elif view == "ai":
        conditions.append("coalesce(assignment.status, 'OPEN') <> 'CLOSED'")
        conditions.append(f"coalesce({AI_OVERRIDE_SQL}, {AI_DEFAULT_SQL}) = 'CONTROLLED_AUTO'")
    elif view == "groups":
        conditions.append("conversation.is_group")
    elif view == "private":
        conditions.append("not conversation.is_group")
    elif view == "waiting":
        conditions.append("coalesce(assignment.status, 'OPEN') <> 'CLOSED'")
        conditions.append("(coalesce(assignment.unread_count, 0) > 0 or coalesce(assignment.requires_attention, false) or (assignment.id is null and conversation.last_direction = 'inbound'))")
    elif view == "closed":
        conditions.append("coalesce(assignment.status, 'OPEN') = 'CLOSED'")
    elif view == "open":
        conditions.append("coalesce(assignment.status, 'OPEN') <> 'CLOSED'")
    if number_role:
        conditions.append("conversation.number_role = :number_role")
        params["number_role"] = number_role
    if status:
        conditions.append("coalesce(assignment.status, 'OPEN') = :status")
        params["status"] = status
    if queue_name:
        conditions.append("coalesce(assignment.queue_name, 'UNASSIGNED') = :queue_name")
        params["queue_name"] = queue_name
    if priority:
        conditions.append("coalesce(assignment.priority, 'NORMAL') = :priority")
        params["priority"] = priority
    if requires_attention is not None:
        conditions.append("coalesce(assignment.requires_attention, false) = :requires_attention")
        params["requires_attention"] = requires_attention
    if query:
        conditions.append("""(
          conversation.phone ilike :query
          or coalesce(conversation.conversation_name, '') ilike :query
          or coalesce(conversation.last_sender_name, '') ilike :query
          or coalesce(conversation.last_sender_phone, '') ilike :query
          or coalesce(client.display_name, client.name, '') ilike :query
          or coalesce(client.client_reference, '') ilike :query
          or coalesce(dossier.title, dossier.dossier_reference, '') ilike :query
        )""")
        params["query"] = f"%{query.strip()}%"
    where_sql = " and ".join(conditions)
    sql = text(f"""
      with conversation as (
        select
          org_id,
          coalesce(nullif(conversation_jid, ''), case when direction = 'outbound' then to_phone else from_phone end) phone,
          max(created_at) last_message_at,
          max(created_at) filter(where direction = 'inbound') last_inbound_at,
          (array_agg(text_body order by created_at desc))[1] last_message,
          (array_agg(direction order by created_at desc))[1] last_direction,
          (array_agg(number_role order by created_at desc))[1] number_role,
          bool_or(is_group) is_group,
          (array_agg(nullif(conversation_name, '') order by created_at desc) filter(where conversation_name is not null))[1] conversation_name,
          (array_agg(from_phone order by created_at desc) filter(where direction = 'inbound'))[1] last_sender_phone,
          (array_agg(nullif(sender_name, '') order by created_at desc) filter(where direction = 'inbound' and sender_name is not null))[1] last_sender_name,
          count(distinct from_phone) filter(where direction = 'inbound' and is_group) participant_count,
          count(*) message_count
        from messages
        where org_id = :org_id
          and coalesce(sender_jid, '') not like '%@newsletter'
          and coalesce(conversation_jid, '') not like '%@newsletter'
        group by org_id, coalesce(nullif(conversation_jid, ''), case when direction = 'outbound' then to_phone else from_phone end)
      ), enriched as (
        select
          conversation.*,
          coalesce(assignment.status, 'OPEN') conversation_status,
          coalesce(assignment.unread_count, 0) unread_count,
          coalesce(assignment.requires_attention, false) requires_attention,
          assignment.waiting_since,
          coalesce(assignment.queue_name, 'UNASSIGNED') queue_name,
          coalesce(assignment.priority, 'NORMAL') priority,
          assignment.row_version,
          {AI_OVERRIDE_SQL} ai_mode_override,
          coalesce({AI_OVERRIDE_SQL}, {AI_DEFAULT_SQL}) effective_ai_mode,
          client.id client_id,
          client.client_reference,
          coalesce(
            nullif(client.display_name, coalesce(client.phone, client.whatsapp_phone)),
            nullif(client.name, coalesce(client.phone, client.whatsapp_phone))
          ) client_name,
          client.email client_email,
          coalesce(client.phone, client.whatsapp_phone) client_phone,
          dossier.id dossier_id,
          dossier.dossier_reference,
          dossier.title dossier_title,
          (conversation.last_inbound_at >= now() - interval '24 hours') can_reply
        from conversation
        left join conversation_assignments assignment
          on assignment.org_id = conversation.org_id and assignment.client_phone = conversation.phone
        left join ai_settings ai on ai.org_id = conversation.org_id
        left join lateral (
          select candidate.* from clients candidate
          where candidate.org_id = conversation.org_id
            and (
              candidate.id = assignment.client_id
              or {PHONE_SQL.format(value='coalesce(candidate.phone, candidate.whatsapp_phone)')} = {PHONE_SQL.format(value='conversation.last_sender_phone')}
            )
          order by (candidate.id = assignment.client_id) desc, candidate.updated_at desc nulls last
          limit 1
        ) client on true
        left join lateral (
          select candidate.id, candidate.dossier_reference, candidate.title
          from dossiers candidate
          left join dossier_clients relation
            on relation.org_id = candidate.org_id and relation.dossier_id = candidate.id
            and relation.client_id = client.id and relation.archived_at is null
          where candidate.org_id = conversation.org_id
            and candidate.archived_at is null
            and (candidate.whatsapp_group_jid = conversation.phone or relation.client_id is not null)
          order by (candidate.whatsapp_group_jid = conversation.phone) desc,
                   (candidate.id = assignment.dossier_id) desc, relation.last_updated_at desc nulls last
          limit 1
        ) dossier on true
        where {where_sql}
      )
      select *, count(*) over() total_count
      from enriched
      order by requires_attention desc, last_message_at desc
      limit :limit offset :offset
    """)
    with engine.connect() as conn:
        items = _rows(conn.execute(sql, params))
    total = int(items[0].get("total_count", 0)) if items else 0
    for item in items:
        item.pop("total_count", None)
    return {"items": items, "page": page, "page_size": page_size, "total": total}


def conversation_detail(org_id: str, phone: str, before=None, message_limit: int = 100):
    with engine.connect() as conn:
        conversation = conn.execute(text("""
          select bool_or(is_group) is_group,
                 (array_agg(nullif(conversation_name, '') order by created_at desc)
                   filter(where conversation_name is not null))[1] conversation_name,
                 count(distinct from_phone) filter(where direction='inbound' and is_group) participant_count,
                 (array_agg(from_phone order by created_at desc) filter(where direction='inbound'))[1] last_sender_phone,
                 (array_agg(nullif(sender_name, '') order by created_at desc)
                   filter(where direction='inbound' and sender_name is not null))[1] last_sender_name
          from messages
          where org_id=:org_id
            and coalesce(nullif(conversation_jid, ''), case when direction='outbound' then to_phone else from_phone end)=:phone
        """), {"org_id": org_id, "phone": phone}).mappings().first()
        sender_phone = conversation["last_sender_phone"] if conversation else phone
        client = conn.execute(text(f"""
          select client.id, client.client_reference,
                 coalesce(
                   nullif(client.display_name, coalesce(client.phone, client.whatsapp_phone)),
                   nullif(client.name, coalesce(client.phone, client.whatsapp_phone))
                 ) display_name,
                 client.phone, client.email, client.customer_type
          from clients client
          left join conversation_assignments assignment
            on assignment.org_id = client.org_id and assignment.client_phone = :phone
          where client.org_id = :org_id and (
            client.id = assignment.client_id or
            {PHONE_SQL.format(value='coalesce(client.phone, client.whatsapp_phone)')} = {PHONE_SQL.format(value=':sender_phone')}
          )
          order by (client.id = assignment.client_id) desc, client.updated_at desc nulls last
          limit 1
        """), {"org_id": org_id, "phone": phone, "sender_phone": sender_phone}).mappings().first()
        assignment = conn.execute(text("""
          select client_id, dossier_id, status, unread_count, requires_attention,
                 waiting_since, last_read_at, row_version, ai_mode_override
          from conversation_assignments
          where org_id = :org_id and client_phone = :phone
        """), {"org_id": org_id, "phone": phone}).mappings().first()
        messages = _rows(conn.execute(text("""
          select * from (
            select id, direction, text_body, message_type, send_status, error_message,
                   provider_message_id, created_at, received_at, from_phone sender_phone,
                   sender_name, sender_jid, conversation_jid, is_group,
                   media_object_path, media_mime_type, media_file_name, media_size_bytes
            from messages
            where org_id = :org_id
              and coalesce(nullif(conversation_jid, ''), case when direction='outbound' then to_phone else from_phone end) = :phone
              and (:before is null or created_at < cast(:before as timestamptz))
            order by created_at desc
            limit :message_limit
          ) recent
          order by created_at asc
        """), {"org_id": org_id, "phone": phone, "before": before, "message_limit": message_limit + 1}))
        has_older_messages = len(messages) > message_limit
        if has_older_messages:
            messages = messages[1:]
        for message in messages:
            object_path = message.get("media_object_path")
            message["media_url"] = None
            if object_path:
                try:
                    message["media_url"] = create_document_download_url(object_path, expires_in=300)
                except RuntimeError:
                    # The text/caption must remain readable even if storage is
                    # temporarily unavailable.
                    pass
        dossiers = _rows(conn.execute(text("""
              select dossier.id, dossier.dossier_reference, dossier.title,
                     coalesce(relation.last_updated_at, dossier.updated_at) last_updated_at,
                     (dossier.id = cast(:selected as uuid)) selected
              from dossiers dossier
              left join dossier_clients relation
                on dossier.org_id = relation.org_id and dossier.id = relation.dossier_id
                and relation.client_id=cast(:client_id as uuid) and relation.archived_at is null
              where dossier.org_id = :org_id and dossier.archived_at is null
                and (dossier.whatsapp_group_jid=:phone or relation.client_id is not null)
              order by selected desc, relation.last_updated_at desc
            """), {"org_id": org_id, "phone": phone, "client_id": client["id"] if client else None,
                     "selected": assignment["dossier_id"] if assignment else None}))
    return {
        "phone": phone,
        "is_group": bool(conversation and conversation["is_group"]),
        "conversation_name": conversation["conversation_name"] if conversation else None,
        "participant_count": int(conversation["participant_count"] or 0) if conversation else 0,
        "last_sender_phone": conversation["last_sender_phone"] if conversation else None,
        "last_sender_name": conversation["last_sender_name"] if conversation else None,
        "client": dict(client) if client else None,
        "assignment": dict(assignment) if assignment else None,
        "dossiers": dossiers,
        "messages": messages,
        "has_older_messages": has_older_messages,
    }


def set_context(org_id: str, phone: str, client_id: str, dossier_id: str | None, expected_version: int | None, actor_id: str):
    with engine.begin() as conn:
        exists = conn.execute(text("""
          select 1 from messages where org_id=:org_id
            and coalesce(nullif(conversation_jid, ''), case when direction='outbound' then to_phone else from_phone end)=:phone
          limit 1
        """), {"org_id": org_id, "phone": phone}).first()
        if not exists:
            raise ValueError("conversation_not_found")
        client = conn.execute(text("select 1 from clients where org_id=:org_id and id=cast(:client_id as uuid)"), {"org_id": org_id, "client_id": client_id}).first()
        if not client:
            raise ValueError("client_not_found")
        if dossier_id:
            linked = conn.execute(text("""
              select 1 from dossier_clients where org_id=:org_id
                and client_id=cast(:client_id as uuid) and dossier_id=cast(:dossier_id as uuid)
                and archived_at is null
            """), {"org_id": org_id, "client_id": client_id, "dossier_id": dossier_id}).first()
            if not linked:
                raise ValueError("client_not_in_dossier")
        current = conn.execute(text("select row_version from conversation_assignments where org_id=:org_id and client_phone=:phone for update"), {"org_id": org_id, "phone": phone}).first()
        if current and expected_version is not None and current[0] != expected_version:
            raise ValueError("stale_conversation_version")
        row = conn.execute(text("""
          insert into conversation_assignments(org_id, client_phone, client_id, dossier_id, status, queue_name, updated_by)
          values(:org_id, :phone, cast(:client_id as uuid), cast(:dossier_id as uuid), 'OPEN', 'PILOT', :actor_id)
          on conflict(org_id, client_phone) do update set
            client_id=excluded.client_id, dossier_id=excluded.dossier_id,
            queue_name='PILOT', updated_by=excluded.updated_by
          returning *
        """), {"org_id": org_id, "phone": phone, "client_id": client_id, "dossier_id": dossier_id, "actor_id": actor_id}).mappings().one()
        return dict(row)


def mark_read(org_id: str, phone: str, actor_id: str):
    with engine.begin() as conn:
        row = conn.execute(text("""
          insert into conversation_assignments(org_id, client_phone, status, queue_name, unread_count, requires_attention, last_read_at, updated_by)
          values(:org_id, :phone, 'OPEN', 'PILOT', 0, false, now(), :actor_id)
          on conflict(org_id, client_phone) do update set
            unread_count=0,
            last_read_at=now(), updated_by=excluded.updated_by
          returning *
        """), {"org_id": org_id, "phone": phone, "actor_id": actor_id}).mappings().one()
        return dict(row)


def update_state(org_id: str, phone: str, status: str, requires_attention: bool, actor_id: str):
    with engine.begin() as conn:
        row = conn.execute(text("""
          insert into conversation_assignments(org_id, client_phone, status, queue_name, unread_count, requires_attention, waiting_since, updated_by)
          values(:org_id, :phone, :status, 'PILOT', 0, :attention,
                 case when :attention then now() else null end, :actor_id)
          on conflict(org_id, client_phone) do update set
            status=excluded.status, requires_attention=excluded.requires_attention,
            unread_count=0, last_read_at=now(),
            waiting_since=case when excluded.requires_attention then coalesce(conversation_assignments.waiting_since, now()) else null end,
            updated_by=excluded.updated_by
          returning *
        """), {"org_id": org_id, "phone": phone, "status": status, "attention": requires_attention, "actor_id": actor_id}).mappings().one()
        return dict(row)


def update_ai_mode(org_id: str, phone: str, mode: str | None, actor_id: str):
    with engine.begin() as conn:
        exists = conn.execute(text("""
          select 1 from messages
          where org_id=:org_id
            and coalesce(nullif(conversation_jid, ''), case when direction='outbound' then to_phone else from_phone end)=:phone
          limit 1
        """), {"org_id": org_id, "phone": phone}).first()
        if not exists:
            raise ValueError("conversation_not_found")
        row = conn.execute(text("""
          insert into conversation_assignments(
            org_id, client_phone, status, queue_name, ai_mode_override, updated_by
          ) values(:org_id, :phone, 'OPEN', 'PILOT', :mode, :actor_id)
          on conflict(org_id, client_phone) do update set
            ai_mode_override=excluded.ai_mode_override,
            updated_by=excluded.updated_by
          returning *
        """), {
            "org_id": org_id, "phone": phone, "mode": mode, "actor_id": actor_id,
        }).mappings().one()
        return dict(row)


def effective_ai_mode(org_id: str, phone: str) -> str | None:
    with engine.connect() as conn:
        return conn.execute(text("""
          select coalesce(
            nullif(to_jsonb(assignment)->>'ai_mode_override', ''),
            nullif(to_jsonb(settings)->>'pilot_response_mode', ''),
            'SUGGESTION_ONLY'
          )
          from ai_settings settings
          left join conversation_assignments assignment
            on assignment.org_id=settings.org_id and assignment.client_phone=:phone
          where settings.org_id=:org_id
        """), {"org_id": org_id, "phone": phone}).scalar()
