-- Driver "Start this trip" — which order the driver is doing right now.
-- Run this in the Supabase SQL editor.
alter table trips
  add column if not exists driver_started_at timestamptz,
  add column if not exists driver_started_by text;

create index if not exists idx_trips_driver_started
  on public.trips (driver_started_at)
  where driver_started_at is not null;
