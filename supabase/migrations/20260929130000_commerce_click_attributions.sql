-- Affiliate click attribution — owner decision 2026-09-29 (Phương án C).
--
-- Every click on a tracked ACCESSTRADE link goes through Tappy's /go/at, which draws a NEW RANDOM
-- `sub1` (24 hex, CSPRNG — not derived from any id, never repeated) and records the join here before
-- redirecting to the network. ACCESSTRADE's conversion reports carry the sub1; reconciliation looks it
-- up in this table. The network never sees who clicked, and cannot tell two clicks of the same person
-- apart.
--
-- Server only: RLS on, NO policy for any role, and anon/authenticated privileges revoked. The service
-- role (the /go/at route and reconciliation jobs) bypasses RLS. Rows are kept 12 months for commission
-- reconciliation (network validation + payout cycles), then removed by `commerce_click_attributions_sweep()`.
--
-- Additive: no existing table or policy is touched. Rollback: rollback/20260929130000_commerce_click_attributions_rollback.sql

CREATE TABLE IF NOT EXISTS public.commerce_click_attributions (
  sub1          TEXT PRIMARY KEY CHECK (sub1 ~ '^[0-9a-f]{24}$'),
  -- The Supabase user id of the account OR the anonymous session that clicked; NULL when the link
  -- carried no identity (e.g. no attribution secret at render time).
  identity_id   UUID NULL,
  provider_id   TEXT NOT NULL CHECK (length(provider_id) BETWEEN 1 AND 40),
  -- The ACCESSTRADE deep link the click was sent to (without sub1): campaign + merchant destination.
  target_url    TEXT NOT NULL CHECK (length(target_url) BETWEEN 1 AND 4000),
  clicked_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commerce_click_attributions_identity_idx ON public.commerce_click_attributions (identity_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS commerce_click_attributions_clicked_idx ON public.commerce_click_attributions (clicked_at);

ALTER TABLE public.commerce_click_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_click_attributions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.commerce_click_attributions FROM anon, authenticated;

COMMENT ON TABLE public.commerce_click_attributions IS
  'Per-click affiliate sub1 -> identity join (Phương án C, 2026-09-29). Server only (RLS, no policies). Kept 12 months.';

-- 12-month retention. Called by the lead / a scheduled job; SECURITY DEFINER so it runs as owner,
-- EXECUTE granted to service_role only.
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

-- Check (read-only):
--   SELECT to_regclass('public.commerce_click_attributions') IS NOT NULL AS table_ok,
--          (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.commerce_click_attributions'::regclass) AS rls_on,
--          (SELECT count(*) FROM pg_policies WHERE tablename = 'commerce_click_attributions') AS policies,  -- expect 0
--          has_table_privilege('authenticated', 'public.commerce_click_attributions', 'SELECT') AS auth_select; -- expect f
