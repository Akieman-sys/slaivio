-- SLAIVIO Pilot V1 - simple company knowledge library.
-- Safe to run after 098_pilot_followups.sql.
--
-- Published knowledge remains stable while an edited draft is prepared. The
-- existing Knowledge OS keeps versions, chunks, audit and AI retrieval; this
-- layer only simplifies the agency-facing workflow.

alter table knowledge_entries
  add column if not exists pilot_idempotency_key text,
  add column if not exists pilot_kind text,
  add column if not exists pilot_client_visible boolean;

create unique index if not exists uq_knowledge_entries_pilot_idempotency
  on knowledge_entries(org_id, pilot_idempotency_key)
  where pilot_idempotency_key is not null;

create table if not exists pilot_knowledge_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organizations(id),
  knowledge_id uuid not null references knowledge_entries(id) on delete cascade,
  subject text not null,
  answer text not null,
  kind text not null,
  category text not null,
  client_visible boolean not null default true,
  language text not null default 'FR',
  review_due_at timestamptz,
  base_version integer not null,
  idempotency_key text,
  created_by text not null,
  created_by_name text,
  updated_by text not null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_pilot_knowledge_draft_kind check (
    kind in ('CLIENT_ANSWER','COMPANY_INFORMATION','INTERNAL_INSTRUCTION')
  ),
  unique(org_id, knowledge_id)
);

create unique index if not exists uq_pilot_knowledge_draft_idempotency
  on pilot_knowledge_drafts(org_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_pilot_knowledge_drafts_recent
  on pilot_knowledge_drafts(org_id, updated_at desc);

-- Existing entries receive a human Pilot classification without changing
-- their publication state, content, audience or AI permissions.
update knowledge_entries
set pilot_kind = case
      when knowledge_type = 'FAQ' then 'CLIENT_ANSWER'
      when knowledge_type in ('PROCEDURE','POLICY','RULE') then 'INTERNAL_INSTRUCTION'
      else 'COMPANY_INFORMATION'
    end,
    pilot_client_visible = case when ai_scope in ('CLIENT','BOTH') then true else false end
where pilot_kind is null or pilot_client_visible is null;

insert into permissions(permission_code, description)
values
  ('pilot.knowledge.read', 'Consulter la base de connaissances simplifiée du Pilot'),
  ('pilot.knowledge.manage', 'Créer et modifier les brouillons de connaissances du Pilot'),
  ('pilot.knowledge.publish', 'Publier, retirer et archiver les connaissances du Pilot')
on conflict(permission_code) do update set description = excluded.description;

insert into role_permissions(role_id, permission_id)
select role.id, permission.id
from organization_roles role
join permissions permission on permission.permission_code like 'pilot.knowledge.%'
where role.role_code in ('OWNER','MANAGER')
   or (
     role.role_code in ('OPERATOR','SUPPORT')
     and permission.permission_code in ('pilot.knowledge.read','pilot.knowledge.manage')
   )
on conflict do nothing;

revoke all on pilot_knowledge_drafts from public;

comment on table pilot_knowledge_drafts is
  'Unpublished Pilot edit kept separate from the currently published answer used by WhatsApp AI.';
comment on column knowledge_entries.pilot_client_visible is
  'Human-facing choice mapped to technical audiences and AI scope by the Pilot API.';
