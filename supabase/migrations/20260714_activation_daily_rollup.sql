-- ============================================================================
-- Phase 2 · Step 4 — activation_daily_rollup + rollup function
-- Approved spec: PHASE_2_ACTIVATION_ANALYTICS_SPEC.md §6. Mirrors auth_daily_rollup.
--
-- Grain includes rule_version (spec §6/§14 item 2): switching the active rule
-- never collides with or overwrites prior rule versions' history — new rows,
-- not new tables, not new columns.
--
-- Populated by the analytics-snapshot cron (idempotent recompute-overwrite,
-- same as fn_rollup_auth_daily). Additive: no existing table/function/RLS
-- policy touched. File only, NOT applied to any database as part of this step.
-- ============================================================================

-- 1. Rollup fact (grain: VN day × platform × signup_source × rule_version)
CREATE TABLE IF NOT EXISTS public.activation_daily_rollup (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date                   date NOT NULL,   -- Asia/Ho_Chi_Minh calendar day of signup
  platform                        text NOT NULL DEFAULT 'unknown',
  signup_source                   text NOT NULL DEFAULT 'organic',
  rule_version                    text NOT NULL DEFAULT 'none', -- 'none' = not yet activated under any rule
  signups_in_cohort               integer NOT NULL DEFAULT 0,
  activated_count                 integer NOT NULL DEFAULT 0,
  activated_within_7d_count       integer NOT NULL DEFAULT 0,
  avg_time_to_activation_seconds  numeric,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, platform, signup_source, rule_version)
);
CREATE INDEX IF NOT EXISTS idx_activation_daily_rollup_date ON public.activation_daily_rollup(snapshot_date DESC);

ALTER TABLE public.activation_daily_rollup ENABLE ROW LEVEL SECURITY; -- deny-by-default (04 §8)

-- 2. Aggregation (SR-4): recompute the window's rows from user_acquisition and
--    UPSERT. Recompute-and-overwrite => idempotent + reconciles late activations.
--    Non-activated signups land under rule_version='none' — an honest bucket,
--    not a fabricated rate.
CREATE OR REPLACE FUNCTION public.fn_rollup_activation_daily(p_from date, p_to date)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.activation_daily_rollup AS r (
    snapshot_date, platform, signup_source, rule_version,
    signups_in_cohort, activated_count, activated_within_7d_count, avg_time_to_activation_seconds
  )
  SELECT
    (ua.signup_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS snapshot_date,
    COALESCE(ua.signup_platform, 'unknown')              AS platform,
    COALESCE(ua.acquisition_source, 'organic')            AS signup_source,
    COALESCE(ua.activation_rule_version, 'none')          AS rule_version,
    COUNT(*)                                                                                    AS signups_in_cohort,
    COUNT(*) FILTER (WHERE ua.activated_at IS NOT NULL)                                          AS activated_count,
    COUNT(*) FILTER (WHERE ua.activated_at IS NOT NULL AND ua.activated_at <= ua.signup_at + interval '7 days') AS activated_within_7d_count,
    AVG(EXTRACT(EPOCH FROM (ua.activated_at - ua.signup_at))) FILTER (WHERE ua.activated_at IS NOT NULL)        AS avg_time_to_activation_seconds
  FROM public.user_acquisition ua
  WHERE ua.signup_at IS NOT NULL
    AND (ua.signup_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN p_from AND p_to
  GROUP BY 1, 2, 3, 4
  ON CONFLICT (snapshot_date, platform, signup_source, rule_version) DO UPDATE SET
    signups_in_cohort              = EXCLUDED.signups_in_cohort,
    activated_count                = EXCLUDED.activated_count,
    activated_within_7d_count      = EXCLUDED.activated_within_7d_count,
    avg_time_to_activation_seconds = EXCLUDED.avg_time_to_activation_seconds,
    updated_at                     = now();
$$;
