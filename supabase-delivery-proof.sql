-- Office marks whether a trip needs 4 photos + 2 signatures.
-- Run this in the Supabase SQL editor.
alter table trips
  add column if not exists needs_delivery_proof boolean not null default true,
  add column if not exists driver_stop_done_at timestamptz;
