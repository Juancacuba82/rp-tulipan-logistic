-- =============================================================================
-- RP Tulipan — Expense Profit Line (cost center for Profit Report)
-- Paste in Supabase → SQL Editor → Run
-- =============================================================================
-- Adds profit_line so each expense can subtract from the matching Profit row:
--   rpt_transportation | rpt_sales | rpt_operating | rpt_yard | contractors
--   (Run supabase-migrate-profit-lines-5.sql to convert legacy values.)
-- NULL / empty = Unassigned (still counts in total, shown separately)
-- =============================================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS profit_line text;

COMMENT ON COLUMN public.expenses.profit_line IS
  'Profit line: rpt_transportation|rpt_sales|rpt_operating|rpt_yard|contractors';

CREATE INDEX IF NOT EXISTS idx_expenses_profit_line
  ON public.expenses (profit_line)
  WHERE is_deleted IS NOT TRUE;

-- Auto-assign safe overhead categories (existing rows only where still empty)
UPDATE public.expenses
SET profit_line = 'rpt_operating'
WHERE (profit_line IS NULL OR trim(profit_line) = '')
  AND lower(trim(coalesce(category, ''))) IN (
    'utilities',
    'taxes/licenses',
    'insurance',
    'payroll',
    'rent',
    'office/supplies',
    'marketing/ads',
    'professional services'
  )
  AND (is_deleted IS NOT TRUE);

-- Optional check after running:
-- SELECT profit_line, category, count(*) FROM expenses
-- WHERE is_deleted IS NOT TRUE
-- GROUP BY 1, 2 ORDER BY 1, 2;
