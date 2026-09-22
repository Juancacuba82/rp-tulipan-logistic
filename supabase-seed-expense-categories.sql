-- =============================================================================
-- RP Tulipan — Official expense categories (seed + cleanup helpers)
-- Paste in Supabase → SQL Editor → Run
-- =============================================================================
-- Safe to re-run. Does NOT delete legacy category rows automatically.
-- Remap of expense.category values is done from the app (Admin → Manage → Normalize)
-- or with the UPDATE block at the bottom (review before running).
-- =============================================================================

INSERT INTO public.expense_categories (name)
SELECT v.name
FROM (VALUES
  ('Fuel'),
  ('Tolls'),
  ('Service/Repairs'),
  ('Driver Payment'),
  ('Commission'),
  ('Payroll'),
  ('Insurance'),
  ('Rent'),
  ('Utilities'),
  ('Taxes/Licenses'),
  ('Marketing/Ads'),
  ('Office/Supplies'),
  ('Fleet/Truck Payment'),
  ('Equipment'),
  ('Professional Services'),
  ('Other')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.expense_categories c
  WHERE lower(trim(c.name)) = lower(trim(v.name))
    AND (c.is_deleted IS NOT TRUE)
);

-- Optional: remap common legacy expense.category values (review then uncomment)
/*
UPDATE public.expenses SET category = 'Commission'
WHERE lower(trim(category)) = 'commission' AND (is_deleted IS NOT TRUE);

UPDATE public.expenses SET category = 'Marketing/Ads'
WHERE lower(trim(category)) IN ('facebook ads', 'tiktok ads', 'marketing', 'ads')
  AND (is_deleted IS NOT TRUE);

UPDATE public.expenses SET category = 'Service/Repairs'
WHERE lower(trim(category)) IN ('maintenance', 'maintenance & repairs', 'paint purchase & labor', 'service/repairs')
  AND (is_deleted IS NOT TRUE);

UPDATE public.expenses SET category = 'Fleet/Truck Payment'
WHERE lower(trim(category)) IN ('monthly trucks payment', 'fleet', 'fleet/truck payment')
  AND (is_deleted IS NOT TRUE);

UPDATE public.expenses SET category = 'Office/Supplies'
WHERE lower(trim(category)) IN ('office & yard supplies / maintenance', 'office/supplies', 'office')
  AND (is_deleted IS NOT TRUE);

UPDATE public.expenses SET category = 'Professional Services'
WHERE lower(trim(category)) IN ('hortas & associates', 'professional services')
  AND (is_deleted IS NOT TRUE);

UPDATE public.expenses SET category = 'Equipment'
WHERE lower(trim(category)) IN ('equipment', 'equipment & machinery')
  AND (is_deleted IS NOT TRUE);

UPDATE public.expenses SET category = 'Other'
WHERE lower(trim(category)) IN ('operating expenses', 'revisar', 'other', 'communication')
  AND (is_deleted IS NOT TRUE);
*/
