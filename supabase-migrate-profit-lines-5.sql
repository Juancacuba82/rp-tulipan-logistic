-- =============================================================================
-- RP Tulipan — Migrate expense profit_line to 5 official lines
-- Run in Supabase → SQL Editor (after profit_line column exists)
-- =============================================================================
-- Official values:
--   rpt_transportation | rpt_sales | rpt_operating | rpt_yard | contractors
-- =============================================================================

UPDATE public.expenses SET profit_line = 'rpt_sales' WHERE profit_line = 'sales' AND (is_deleted IS NOT TRUE);
UPDATE public.expenses SET profit_line = 'rpt_yard' WHERE profit_line = 'yard' AND (is_deleted IS NOT TRUE);
UPDATE public.expenses SET profit_line = 'rpt_transportation' WHERE profit_line = 'tulipan' AND (is_deleted IS NOT TRUE);
UPDATE public.expenses SET profit_line = 'rpt_operating' WHERE profit_line = 'overhead' AND (is_deleted IS NOT TRUE);
UPDATE public.expenses SET profit_line = 'contractors' WHERE profit_line = 'contractor' AND (is_deleted IS NOT TRUE);

-- Legacy lines that are no longer used for expenses → operating pool
UPDATE public.expenses SET profit_line = 'rpt_operating'
WHERE profit_line IN ('jr', 'rentals', 'storage_tulipan', 'storage_yard', 'custom_invoices')
  AND (is_deleted IS NOT TRUE);

-- Auto-assign global categories on still-empty rows
UPDATE public.expenses
SET profit_line = 'rpt_operating'
WHERE (profit_line IS NULL OR trim(profit_line) = '')
  AND lower(trim(coalesce(category, ''))) IN (
    'utilities', 'taxes/licenses', 'insurance', 'payroll', 'rent',
    'office/supplies', 'marketing/ads', 'professional services'
  )
  AND (is_deleted IS NOT TRUE);

-- Fuel → Transportation (client policy: all fuel on RP Tulipan Transportation)
UPDATE public.expenses
SET profit_line = 'rpt_transportation'
WHERE lower(trim(coalesce(category, ''))) = 'fuel'
  AND (is_deleted IS NOT TRUE);

COMMENT ON COLUMN public.expenses.profit_line IS
  'Profit line: rpt_transportation|rpt_sales|rpt_operating|rpt_yard|contractors';

-- SELECT profit_line, count(*) FROM expenses WHERE is_deleted IS NOT TRUE GROUP BY 1 ORDER BY 1;
