-- Keep inbound WhatsApp media outside the raw webhook payload and preserve
-- the source identity used to resolve phone-number (PN) and LID addressing.
-- Safe and idempotent after 111_pilot_whatsapp_conversation_identity.sql.

alter table messages
  add column if not exists sender_jid text,
  add column if not exists media_object_path text,
  add column if not exists media_mime_type text,
  add column if not exists media_file_name text,
  add column if not exists media_size_bytes bigint;

-- Older gateway revisions converted every numeric JID to a leading-+ value.
-- Newsletter IDs use the reserved 120363… namespace and are longer than an
-- E.164 phone number. Mark those legacy rows so the Inbox can hide them.
update messages
set sender_jid = regexp_replace(from_phone, '[^0-9]', '', 'g') || '@newsletter'
where provider = 'QR_LINKED_DEVICE'
  and coalesce(is_group, false) = false
  and conversation_jid is null
  and regexp_replace(from_phone, '[^0-9]', '', 'g') like '120363%'
  and length(regexp_replace(from_phone, '[^0-9]', '', 'g')) > 15
  and sender_jid is null;

create index if not exists idx_messages_whatsapp_sender_jid
  on messages(org_id, sender_jid, created_at desc)
  where sender_jid is not null;

comment on column messages.sender_jid is
  'Technical WhatsApp sender identity. A @lid value must never be presented as a phone number.';
comment on column messages.media_object_path is
  'Private object-storage path for inbound WhatsApp media; access is provided through short-lived signed URLs.';
