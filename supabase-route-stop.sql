-- Driver day stop order (1, 2, 3…) — not stored in Notes.
-- Run this in the Supabase SQL editor.
alter table trips
  add column if not exists route_stop smallint;

create index if not exists idx_trips_route_stop
  on public.trips (date, driver, route_stop)
  where route_stop is not null;
