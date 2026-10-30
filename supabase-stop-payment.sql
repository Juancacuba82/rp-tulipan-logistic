-- Stop payment plan (how they should pay) + result (what happened at the stop).
-- Run in the Supabase SQL editor.
alter table trips
  add column if not exists stop_pay_plan text,
  add column if not exists stop_pay_result text,
  add column if not exists stop_pay_result_at timestamptz,
  add column if not exists stop_pay_result_by text;

comment on column trips.stop_pay_plan is 'CASH | ZELLE | BILL_LATER';
comment on column trips.stop_pay_result is 'WAITING | PAID_CASH | PAID_ZELLE';
