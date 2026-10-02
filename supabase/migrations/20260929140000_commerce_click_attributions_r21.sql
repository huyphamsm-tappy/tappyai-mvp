-- R21 (Android review of Phương án C, 2026-09-29) — on top of 20260929130000_commerce_click_attributions.
--
-- 1. A deleted account (or anonymous guest session) takes its click joins with it: identity_id now
--    references auth.users(id) ON DELETE CASCADE. Supabase anonymous sessions are auth.users rows too,
--    so a guest's rows go when the guest user is removed. Rows whose identity no longer exists are
--    removed first (the constraint could not be added over them). Rows with no identity (NULL) stay
--    until the 12-month sweep.
-- 2. The 12-month sweep becomes bounded per call (like decision_evidence_sweep) and is scheduled daily
--    by the Vercel cron /api/cron/click-attributions-sweep, which logs the count deleted.
--
-- Rollback: rollback/20260929140000_commerce_click_attributions_r21_rollback.sql

DELETE FROM public.commerce_click_attributions c
WHERE c.identity_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.identity_id);

ALTER TABLE public.commerce_click_attributions
  DROP CONSTRAINT IF EXISTS commerce_click_attributions_identity_fkey;
ALTER TABLE public.commerce_click_attributions
  ADD CONSTRAINT commerce_click_attributions_identity_fkey
  FOREIGN KEY (identity_id) REFERENCES auth.users(id) ON DELETE CASCADE;

DROP FUNCTION IF EXISTS public.commerce_click_attributions_sweep();
CREATE OR REPLACE FUNCTION public.commerce_click_attributions_sweep(p_limit integer DEFAULT 5000)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH doomed AS (
    SELECT sub1 FROM public.commerce_click_attributions
    WHERE clicked_at < now() - interval '12 months'
    ORDER BY clicked_at
    LIMIT greatest(1, least(p_limit, 50000))
  ), gone AS (
    DELETE FROM public.commerce_click_attributions c USING doomed d WHERE c.sub1 = d.sub1 RETURNING 1
  )
  SELECT count(*)::integer FROM gone
$$;
REVOKE ALL ON FUNCTION public.commerce_click_attributions_sweep(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_click_attributions_sweep(integer) TO service_role;

-- Check (read-only):
--   SELECT confdeltype FROM pg_constraint WHERE conname = 'commerce_click_attributions_identity_fkey';  -- expect 'c'
--   SELECT has_function_privilege('authenticated', 'public.commerce_click_attributions_sweep(integer)', 'EXECUTE'); -- expect f
