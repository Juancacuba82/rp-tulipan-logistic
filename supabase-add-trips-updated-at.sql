-- =============================================================================
-- RP Tulipan — trips.updated_at (change detection between PCs)
-- Paste in Supabase → SQL Editor → Run   (safe to run more than once)
-- =============================================================================
-- What it enables (the web works WITHOUT it; it just stays in "manual Refresh" mode):
--   1) Calendar asks every ~45 s "what changed since my last check?" and updates
--      only those orders (no Realtime needed, tiny queries, uses the index below).
--   2) Before saving an order, the web warns if another person saved it after you
--      opened it (so nobody silently overwrites someone else's changes).
--
-- updated_at is set by the database on EVERY update (including RPC / soft-delete),
-- so it can't be forgotten by the app code.
-- =============================================================================

-- 1) Column. Existing rows get "now" once; it is a metadata-only change (fast).
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2) Trigger: refresh updated_at automatically on every UPDATE.
CREATE OR REPLACE FUNCTION public.set_trips_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trips_updated_at ON public.trips;
CREATE TRIGGER trg_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.set_trips_updated_at();

-- 3) Index so "updated_at > X" and "newest updated_at" are instant.
CREATE INDEX IF NOT EXISTS idx_trips_updated_at
  ON public.trips (updated_at DESC);

-- -----------------------------------------------------------------------------
-- OPTIONAL — only if the date filter is slow. First check whether an index on
-- trips(date) already exists (it may, under another name):
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'trips';
-- If there is none, this speeds up the Calendar date filter:
--   CREATE INDEX IF NOT EXISTS idx_trips_date ON public.trips (date DESC);
--
-- Check how the Calendar query runs ("Seq Scan" = no index used):
--   EXPLAIN ANALYZE
--   SELECT * FROM trips
--   WHERE date >= '2026-09-01' AND date <= '2026-09-30'
--     AND (is_deleted = false OR is_deleted IS NULL)
--   ORDER BY date DESC;
-- -----------------------------------------------------------------------------
