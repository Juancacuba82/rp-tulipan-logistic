-- Last 4 digits of each driver's company debit card (used by Bank CSV import).
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS card_last4 text;
COMMENT ON COLUMN drivers.card_last4 IS 'Last 4 digits of company debit card(s). Comma-separated if more than one.';
