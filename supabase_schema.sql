-- SQL Schema for RP TULIPAN LOGISTIC
-- Execute this in your Supabase SQL Editor

-- 1. TRIPS TABLE
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id TEXT UNIQUE NOT NULL,
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
    payment_date DATE,
    yard_services TEXT,
    yard_rate NUMERIC,
    date_out DATE,
    day_rate NUMERIC,
    company TEXT,
    driver TEXT,
    rate NUMERIC,
    pay_type TEXT,
    sales_price NUMERIC,
    collect_payment TEXT,
    amount NUMERIC,
    phone TEXT,
    paid_driver_amount NUMERIC,
    status TEXT,
    commission_percent TEXT,
    commission_driver NUMERIC,
    income_dis_fee NUMERIC,
    invoice TEXT,
    note TEXT,
    email TEXT,
    mode TEXT,
    monthly_rate NUMERIC,
    start_date_rent DATE,
    next_due DATE,
    st_yard TEXT,
    st_rent TEXT,
    st_rate TEXT,
    st_sales TEXT,
    st_amount TEXT,
    pending_balance NUMERIC,
    payout_status TEXT,
    truck_unit TEXT,
    trailer_unit TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RELEASES TABLE
CREATE TABLE IF NOT EXISTS releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_no TEXT UNIQUE NOT NULL,
    date DATE,
    type TEXT,
    depot TEXT,
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
