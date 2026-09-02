-- SLAIVIO Pilot V1 - inbound WhatsApp conversations may exist before CRM context.
-- Safe to run after 106_pilot_inbox_workspace.sql.
--
-- Receiving a message must not implicitly create a Client or a Dossier. An
-- operator explicitly creates/selects the Client and associates a Dossier from
-- the Inbox. These nullable references preserve the message until that action.

alter table messages
  alter column client_id drop not null,
  alter column dossier_id drop not null;

alter table messages_raw
  alter column client_id drop not null,
  alter column dossier_id drop not null;

comment on column messages.client_id is
  'Nullable until an operator explicitly associates the WhatsApp conversation with a Client.';

comment on column messages.dossier_id is
  'Nullable until an operator explicitly selects a Dossier for the WhatsApp conversation.';
