-- Hourly rates for Attendance Report (shared across all browsers/PCs).
-- Paste this in Supabase → SQL Editor → Run.

CREATE TABLE IF NOT EXISTS public.attendance_hourly_rates (
  email text PRIMARY KEY,
  hourly_rate numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

COMMENT ON TABLE public.attendance_hourly_rates IS 'Shared employee hourly rates used by the Attendance Report payroll cards.';

ALTER TABLE public.attendance_hourly_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_rates_select ON public.attendance_hourly_rates;
CREATE POLICY attendance_rates_select
  ON public.attendance_hourly_rates
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS attendance_rates_write_admin ON public.attendance_hourly_rates;
CREATE POLICY attendance_rates_write_admin
  ON public.attendance_hourly_rates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND lower(trim(coalesce(role, ''))) = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND lower(trim(coalesce(role, ''))) = 'admin'
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.attendance_hourly_rates TO authenticated;
GRANT ALL ON public.attendance_hourly_rates TO service_role;
