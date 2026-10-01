-- Driver cash wallet: who is holding company cash (office vs driver).
-- Run in Supabase SQL editor if save/update errors mention these columns.

ALTER TABLE trips ADD COLUMN IF NOT EXISTS cash_collector text DEFAULT 'office';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_cash_held numeric DEFAULT 0;

COMMENT ON COLUMN trips.cash_collector IS 'office | driver — who physically received the cash';
COMMENT ON COLUMN trips.driver_cash_held IS 'Open company cash still held by the assigned driver for this trip';
