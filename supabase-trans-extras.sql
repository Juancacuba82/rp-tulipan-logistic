-- Extra services on a Transport trip (per move). Run in the Supabase SQL editor.
alter table trips
  add column if not exists trans_extras text,
  add column if not exists trans_extras_rate numeric default 0,
  add column if not exists st_trans_extra text default 'PEND',
  add column if not exists xe_cash boolean default false;
