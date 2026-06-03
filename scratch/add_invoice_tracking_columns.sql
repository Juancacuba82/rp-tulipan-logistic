-- ============================================================
-- RP Tulipan Logistic — Invoice Automation: DB Migration
-- Run this in your Supabase SQL Editor (one time only)
-- ============================================================

-- 1. Add the "last invoice sent" timestamp column
ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS invoice_last_sent TIMESTAMPTZ DEFAULT NULL;

-- 2. Add the "how many times invoice was sent" counter column  
ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS invoice_reminder_count INTEGER DEFAULT 0;

-- ── VERIFY ──────────────────────────────────────────────────
-- Run this to confirm the columns were added:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'trips'
--   AND column_name IN ('invoice_last_sent', 'invoice_reminder_count');
