-- SLAIVIO Pilot V1 - persisted AI and WhatsApp channel preferences.
-- Safe to run after 107_pilot_unattached_whatsapp_conversations.sql.

alter table ai_settings
  add column if not exists system_prompt text not null default '',
  add column if not exists user_prompt_template text not null default '',
  add column if not exists communication_style text not null default 'PROFESSIONAL',
  add column if not exists prompt_row_version integer not null default 1;

alter table organization_whatsapp_numbers
  add column if not exists auto_mark_read boolean not null default false,
  add column if not exists group_replies_enabled boolean not null default false;

alter table organizations
  add column if not exists whatsapp_group_on_dossier_create boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='ck_ai_communication_style') then
    alter table ai_settings add constraint ck_ai_communication_style
      check (communication_style in ('PROFESSIONAL','CONCISE','FORMAL','WARM'));
  end if;
end $$;

comment on column organizations.whatsapp_group_on_dossier_create is
  'When enabled, a supported WhatsApp provider may create a group after explicit dossier creation.';
