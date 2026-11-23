-- Stop 1, 2, 3 + photos/signatures flag.
-- Paste this whole file in Supabase → SQL Editor → Run.
-- If it still fails after Run, go to Settings → API → Reload schema.

alter table trips
  add column if not exists route_stop smallint,
  add column if not exists needs_delivery_proof boolean not null default true,
  add column if not exists driver_stop_done_at timestamptz;

create index if not exists idx_trips_route_stop
  on public.trips (date, driver, route_stop)
  where route_stop is not null;

notify pgrst, 'reload schema';

-- Verify: should return route_stop / needs_delivery_proof / driver_stop_done_at
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'trips'
  and column_name in ('route_stop', 'needs_delivery_proof', 'driver_stop_done_at')
order by column_name;
