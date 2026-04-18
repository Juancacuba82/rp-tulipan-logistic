-- SQL Schema for RP TULIPAN LOGISTIC
-- Execute this in your Supabase SQL Editor

-- 1. TRIPS TABLE (v3 Refined Schema)
CREATE TABLE IF NOT EXISTS trips (
    trip_id TEXT PRIMARY KEY,
    date DATE,
    size TEXT,
    n_cont TEXT,
    release_no TEXT,
    order_no TEXT,
    city TEXT,
    pickup_address TEXT,
    delivery_place TEXT,
    doors_direction TEXT,
    miles NUMERIC,
    customer TEXT,
    yard_services TEXT,
    yard_rate NUMERIC,
    date_out DATE,
    day_rate NUMERIC,
    company TEXT,
    driver TEXT,
    trans_pay NUMERIC,      -- Renamed from rate
    type_payment TEXT,     -- Renamed from pay_type
    sales_price NUMERIC,
    collect_payment TEXT,
    amount NUMERIC,
    phone_no TEXT,         -- Renamed from phone
    paid_driver NUMERIC,    -- Renamed from paid_driver_amount
    status TEXT,
    commission_percent TEXT,
    commission_driver NUMERIC,
    income_dis_fee NUMERIC,
    invoice TEXT,
    note TEXT,
    email TEXT,
    service_mode TEXT,     -- Renamed from mode
    monthly_rate NUMERIC,
    start_date_rent DATE,
    next_due DATE,
    st_yard TEXT,
    st_rent TEXT,
    st_rate TEXT,
    st_sales TEXT,
    st_amount TEXT,
    paid BOOLEAN DEFAULT false, -- New: Checkbox state (CASH/PAID)
    pending_balance NUMERIC,
    payout_status TEXT,
    truck_unit TEXT,
    trailer_unit TEXT,
    final_driver_pay NUMERIC DEFAULT 0, -- New: Calculated 30% or 100% net pay
    yard_rate_paid BOOLEAN DEFAULT false, -- New: PAID status for Yard Rate
    price_per_day NUMERIC DEFAULT 0, -- New: Daily rate for Yard Services
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MIGRATION: Add new columns if they don't exist
ALTER TABLE trips ADD COLUMN IF NOT EXISTS service_mode TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS trans_pay NUMERIC;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS type_payment TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS phone_no TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS paid_driver NUMERIC;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT false;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS final_driver_pay NUMERIC DEFAULT 0;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS yard_rate_paid BOOLEAN DEFAULT false;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS price_per_day NUMERIC DEFAULT 0;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS qty INTEGER DEFAULT 1;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS signature TEXT;

-- 2. RELEASES TABLE (MODIFIED for Granular Inventory)
DROP TABLE IF EXISTS releases;
CREATE TABLE IF NOT EXISTS releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_no TEXT NOT NULL, -- No longer unique to allow (Rel + Type + Cond)
    date DATE,
    type TEXT,
    condition TEXT,
    depot TEXT,
    depot_address TEXT,
    city TEXT,
    qty_20 INTEGER DEFAULT 0,
    price_20 NUMERIC DEFAULT 0,
    qty_40 INTEGER DEFAULT 0,
    price_40 NUMERIC DEFAULT 0,
    qty_45 INTEGER DEFAULT 0,
    price_45 NUMERIC DEFAULT 0,
    seller TEXT,
    total_stock INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE,
    category TEXT,
    description TEXT,
    amount NUMERIC,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. FLEET TABLE
CREATE TABLE IF NOT EXISTS fleet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id TEXT UNIQUE, -- JS internal ID
    type TEXT, -- 'truck' or 'trailer'
    unit_number TEXT,
    vin TEXT,
    plate TEXT,
    year INTEGER,
    miles INTEGER,
    last_service_date DATE,
    last_service_miles INTEGER,
    next_service_due_date DATE,
    next_service_due_miles INTEGER,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: Policies are provided below for public development access.
-- Adjust for production as needed.

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select" ON trips FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON trips FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON trips FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON trips FOR DELETE USING (true);

CREATE POLICY "Allow public select" ON releases FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON releases FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON releases FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON releases FOR DELETE USING (true);

CREATE POLICY "Allow public select" ON expenses FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON expenses FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON expenses FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON expenses FOR DELETE USING (true);

CREATE POLICY "Allow public select" ON fleet FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON fleet FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON fleet FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON fleet FOR DELETE USING (true);

-- 5. SETTLEMENTS TABLE
CREATE TABLE IF NOT EXISTS settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver TEXT,
    initial_date DATE,
    final_date DATE,
    cash_balance NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select" ON settlements FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON settlements FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON settlements FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON settlements FOR DELETE USING (true);

-- Corrected Settlement History Table (replaces old settlements table)
-- WARNING: Only run the DROP below manually if you want to delete old data:
-- DROP TABLE IF EXISTS settlements;
CREATE TABLE IF NOT EXISTS settlement_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_name TEXT,
    start_date DATE,
    end_date DATE,
    cash_balance NUMERIC,
    status TEXT,         -- New Field
    payment_type TEXT,   -- New Field
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settlement_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select settlement_history" ON settlement_history FOR SELECT USING (true);
CREATE POLICY "Allow public insert settlement_history" ON settlement_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update settlement_history" ON settlement_history FOR UPDATE USING (true);
CREATE POLICY "Allow public delete settlement_history" ON settlement_history FOR DELETE USING (true);
-- 6. CALL LOGS TABLE
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE DEFAULT CURRENT_DATE,
    customer TEXT,
    phone TEXT,
    city TEXT,
    zip_code TEXT,
    measures TEXT,
    amount NUMERIC DEFAULT 0,
    next_call_date DATE,
    seller TEXT,
    status TEXT DEFAULT 'PENDING',
    description TEXT,
    service_type TEXT, -- 'Sales', 'Transport', 'Service Yard'
    created_by TEXT,   -- Email of the user who registered the call
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select call_logs" ON call_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert call_logs" ON call_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update call_logs" ON call_logs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete call_logs" ON call_logs FOR DELETE USING (true);