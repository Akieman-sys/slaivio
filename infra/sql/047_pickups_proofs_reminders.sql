-- Pickup proof media and reminder hardening. Safe to rerun.
alter table pickup_orders add column if not exists last_reminded_at timestamptz;
alter table pickup_orders add column if not exists reminder_count integer not null default 0;
alter table pickup_orders add column if not exists receipt_number text;
create unique index if not exists uq_pickup_receipt_number on pickup_orders(org_id,receipt_number) where receipt_number is not null;
alter table pickup_proofs add column if not exists proof_type text not null default 'SIGNATURE';
alter table pickup_proofs add column if not exists checksum_sha256 text;
alter table pickup_proofs add column if not exists notes text;
