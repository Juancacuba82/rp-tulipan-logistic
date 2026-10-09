-- Attach one PDF per calendar order. Run this in the Supabase SQL editor.
alter table trips
  add column if not exists order_pdf_url text,
  add column if not exists order_pdf_name text;
