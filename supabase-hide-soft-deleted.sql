-- =============================================================================
-- RP Tulipan — Hide soft-deleted rows from every module
-- Paste this entire script in Supabase → SQL Editor → Run
-- =============================================================================
-- What this does:
--   1. Creates admin-only RPCs for the Recycle Bin (list / restore / destroy)
--   2. Adds a RESTRICTIVE RLS policy so SELECT never returns is_deleted = true
--      (not even for admins). Drivers Reports, Accounting, etc. cannot leak.
-- Recycle Bin reads deleted rows through admin_list_deleted(), which bypasses RLS.
-- =============================================================================

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND lower(trim(coalesce(role, ''))) = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_assert_table(p_table text)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  allowed text[] := ARRAY[
    'trips', 'rentals', 'releases', 'expenses', 'receivables_invoices',
    'settlement_history', 'fleet', 'drivers', 'customers', 'call_logs',
    'yard_stock', 'tasks'
  ];
BEGIN
  IF p_table IS NULL OR NOT (p_table = ANY (allowed)) THEN
    RAISE EXCEPTION 'Invalid table: %', p_table;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_id_column(p_table text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_table
    WHEN 'trips' THEN 'trip_id'
    WHEN 'fleet' THEN 'unit_id'
    ELSE 'id'
  END;
$$;

-- ---------- Recycle Bin: list ----------
CREATE OR REPLACE FUNCTION public.admin_list_deleted(p_table text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  PERFORM public.admin_assert_table(p_table);

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
       FROM (
         SELECT *
         FROM public.%I
         WHERE is_deleted = true
         ORDER BY deleted_at DESC NULLS LAST
       ) t',
    p_table
  ) INTO result;

  RETURN result;
END;
$$;

-- ---------- Recycle Bin: restore ----------
CREATE OR REPLACE FUNCTION public.admin_restore_record(p_table text, p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  id_col text;
  n int;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  PERFORM public.admin_assert_table(p_table);
  id_col := public.admin_id_column(p_table);

  EXECUTE format(
    'UPDATE public.%I
        SET is_deleted = false,
            deleted_at = null,
            deleted_by = null
      WHERE %I::text = $1',
    p_table, id_col
  ) USING p_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Record not found in %', p_table;
  END IF;
END;
$$;

-- ---------- Recycle Bin: permanent delete (only if already in the bin) ----------
CREATE OR REPLACE FUNCTION public.admin_hard_delete(p_table text, p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  id_col text;
  n int;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  PERFORM public.admin_assert_table(p_table);
  id_col := public.admin_id_column(p_table);

  EXECUTE format(
    'DELETE FROM public.%I
      WHERE %I::text = $1
        AND is_deleted = true',
    p_table, id_col
  ) USING p_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Record not found or not in recycle bin: %', p_table;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_assert_table(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_id_column(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_deleted(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_restore_record(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_hard_delete(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_deleted(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_record(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete(text, text) TO authenticated;

-- ---------- RLS: hide deleted rows on SELECT ----------
CREATE OR REPLACE FUNCTION public.apply_hide_soft_deleted(p_table text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  has_rls boolean;
  has_any_policy boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) THEN
    RAISE NOTICE 'Skipping %: table not found', p_table;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'is_deleted'
  ) THEN
    RAISE NOTICE 'Skipping %: no is_deleted column', p_table;
    RETURN;
  END IF;

  SELECT c.relrowsecurity INTO has_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = p_table;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = p_table
  ) INTO has_any_policy;

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);

  -- Table had RLS off and no policies: keep current "open" write access,
  -- then hide deleted rows on SELECT only.
  IF NOT has_rls AND NOT has_any_policy THEN
    EXECUTE format('DROP POLICY IF EXISTS soft_delete_all_fallback ON public.%I', p_table);
    EXECUTE format(
      'CREATE POLICY soft_delete_all_fallback ON public.%I
         FOR ALL TO authenticated, anon
         USING (true) WITH CHECK (true)',
      p_table
    );
  END IF;

  EXECUTE format('DROP POLICY IF EXISTS hide_soft_deleted ON public.%I', p_table);
  EXECUTE format(
    'CREATE POLICY hide_soft_deleted ON public.%I
       AS RESTRICTIVE
       FOR SELECT
       TO authenticated, anon
       USING (is_deleted IS NOT TRUE)',
    p_table
  );

  RAISE NOTICE 'Applied hide_soft_deleted on %', p_table;
END;
$$;

SELECT public.apply_hide_soft_deleted(t)
FROM unnest(ARRAY[
  'trips',
  'rentals',
  'releases',
  'expenses',
  'receivables_invoices',
  'settlement_history',
  'fleet',
  'drivers',
  'customers',
  'call_logs',
  'yard_stock',
  'tasks',
  'pickup_addresses',
  'delivery_addresses',
  'depots',
  'sellers',
  'companies',
  'container_sizes',
  'expense_categories'
]) AS t;

DROP FUNCTION public.apply_hide_soft_deleted(text);
