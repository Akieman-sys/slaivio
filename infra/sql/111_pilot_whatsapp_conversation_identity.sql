-- Preserve the identity of WhatsApp group conversations and their senders.
-- Safe and idempotent after 110_pilot_runtime_schema_repair.sql.

alter table messages
  add column if not exists conversation_jid text,
  add column if not exists sender_name text,
  add column if not exists conversation_name text,
  add column if not exists is_group boolean not null default false;

-- Recover group identity for pilot messages received before these dedicated
-- columns existed. The signed gateway payload was already kept in messages_raw.
update messages message
set conversation_jid = nullif(raw.raw_payload->>'group_jid', ''),
    sender_name = nullif(raw.raw_payload->>'sender_name', ''),
    conversation_name = nullif(raw.raw_payload->>'group_name', ''),
    is_group = true
from messages_raw raw
where raw.org_id = message.org_id
  and raw.raw_payload->>'provider_message_id' = message.provider_message_id
  and nullif(raw.raw_payload->>'group_jid', '') is not null
  and message.conversation_jid is null;

create index if not exists idx_messages_whatsapp_conversation
  on messages(org_id, conversation_jid, created_at desc)
  where conversation_jid is not null;

create index if not exists idx_messages_whatsapp_sender
  on messages(org_id, from_phone, created_at desc)
  where is_group = true;

comment on column messages.conversation_jid is
  'WhatsApp chat JID. Group messages use the @g.us JID; private messages may leave this null for compatibility.';
comment on column messages.sender_name is
  'Display name announced by WhatsApp for the participant who sent this message.';
comment on column messages.conversation_name is
  'WhatsApp group subject when this message belongs to a group.';
