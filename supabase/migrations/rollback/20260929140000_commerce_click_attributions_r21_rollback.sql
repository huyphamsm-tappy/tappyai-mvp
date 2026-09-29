-- Rollback of 20260929140000_commerce_click_attributions_r21.sql: back to the unbounded sweep and no FK.
-- Rows already removed (orphans at apply time, cascades since) are not restored.
ALTER TABLE public.commerce_click_attributions DROP CONSTRAINT IF EXISTS commerce_click_attributions_identity_fkey;
DROP FUNCTION IF EXISTS public.commerce_click_attributions_sweep(integer);
CREATE OR REPLACE FUNCTION public.commerce_click_attributions_sweep()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH gone AS (
    DELETE FROM public.commerce_click_attributions WHERE clicked_at < now() - interval '12 months' RETURNING 1
  )
  SELECT count(*)::integer FROM gone
$$;
REVOKE ALL ON FUNCTION public.commerce_click_attributions_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_click_attributions_sweep() TO service_role;
