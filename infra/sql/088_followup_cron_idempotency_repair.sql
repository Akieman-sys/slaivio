-- Repair the idempotency contract used by the Follow-up recovery cron.
--
-- followup_tasks accepts manual rows without an idempotency key, therefore the
-- unique index is intentionally partial. PostgreSQL requires the same partial
-- predicate in INSERT ... ON CONFLICT for index inference.

alter table followup_tasks
  add column if not exists idempotency_key text;

-- Preserve historical rows if an older deployment created duplicates. Only
-- the oldest row keeps the automatic key; no operational record is deleted.
with ranked as (
  select id,
         row_number() over (
           partition by org_id, idempotency_key
           order by created_at, id
         ) as duplicate_rank
  from followup_tasks
  where idempotency_key is not null
)
update followup_tasks task
set idempotency_key = null
from ranked
where task.id = ranked.id
  and ranked.duplicate_rank > 1;

drop index if exists idx_followup_idempotency;

create unique index idx_followup_idempotency
  on followup_tasks(org_id, idempotency_key)
  where idempotency_key is not null;

comment on index idx_followup_idempotency is
  'Prevents duplicate automatic follow-ups per organization while allowing manual tasks without an idempotency key.';
