-- Optional WhatsApp group lifecycle for dossiers using the linked-device pilot.
-- Safe to run after 108_pilot_ai_and_channel_preferences.sql.

alter table dossiers
  add column if not exists whatsapp_group_jid text,
  add column if not exists whatsapp_group_status text not null default 'DISABLED',
  add column if not exists whatsapp_group_created_at timestamptz,
  add column if not exists whatsapp_group_last_error text;

alter table dossiers drop constraint if exists ck_dossiers_whatsapp_group_status;
alter table dossiers add constraint ck_dossiers_whatsapp_group_status check (
  whatsapp_group_status in ('DISABLED','WAITING_FOR_PARTICIPANT','CREATING','CONNECTED','FAILED')
);

create unique index if not exists uq_dossiers_whatsapp_group_jid
  on dossiers(org_id, whatsapp_group_jid)
  where whatsapp_group_jid is not null;

comment on column dossiers.whatsapp_group_jid is
  'Optional WhatsApp group created only after the organization enables dossier groups and a participant is explicitly attached.';
