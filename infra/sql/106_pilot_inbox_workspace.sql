-- SLAIVIO Pilot V1 - professional Inbox workspace controls.
-- Safe to run after 105_whatsapp_qr_linked_device.sql.
--
-- The organization keeps one default AI policy. A responsible person may
-- temporarily override that policy for one conversation without changing the
-- rest of the agency Inbox.

alter table conversation_assignments
  add column if not exists ai_mode_override text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_conversation_assignment_ai_mode'
      and conrelid = 'conversation_assignments'::regclass
  ) then
    alter table conversation_assignments
      add constraint ck_conversation_assignment_ai_mode
      check (ai_mode_override is null or ai_mode_override in ('CONTROLLED_AUTO','PAUSED'));
  end if;
end;
$$;

create index if not exists idx_conversation_assignments_ai_mode
  on conversation_assignments(org_id, ai_mode_override, updated_at desc)
  where ai_mode_override is not null;

comment on column conversation_assignments.ai_mode_override is
  'Optional per-conversation override. NULL inherits the agency Pilot AI mode.';
