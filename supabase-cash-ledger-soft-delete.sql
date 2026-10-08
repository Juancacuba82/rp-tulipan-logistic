-- Soft-delete support for cash_ledger (Cash Ledger manual rows + turn-ins / invoice payments)

ALTER TABLE public.cash_ledger
  ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

ALTER TABLE public.cash_ledger
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.cash_ledger
  ADD COLUMN IF NOT EXISTS deleted_by text;

CREATE INDEX IF NOT EXISTS idx_cash_ledger_not_deleted
  ON public.cash_ledger (date)
  WHERE is_deleted IS NOT TRUE;

COMMENT ON COLUMN public.cash_ledger.is_deleted IS
  'When true the row is hidden from Cash Ledger. Prefer this over hard delete.';
