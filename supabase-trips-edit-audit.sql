-- Who created / last saved each Calendar order (for hover + conflict dialog).
-- Paste in Supabase → SQL Editor → Run. Safe to run more than once.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS updated_by text;

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS edit_log text;
