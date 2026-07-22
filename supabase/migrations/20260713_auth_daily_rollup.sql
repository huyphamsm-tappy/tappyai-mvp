-- ============================================================================
-- Phase 1 · Step 3 — auth_daily_rollup + rollup functions
-- Approved spec: PHASE_1_AUTH_ANALYTICS_SPEC.md §2.2. Mirrors feature_usage_rollup.
--
-- Populated by the analytics-snapshot cron (idempotent, incremental over a VN-day
-- window — reconciles late events, §8A.4). Aggregation logic lives ONCE here
-- (SR-4). Day bucketing is Asia/Ho_Chi_Minh (ADR-008). Additive + idempotent.
-- ============================================================================

-- 1. Rollup fact (grain: VN day × platform × method)
CREATE TABLE IF NOT EXISTS public.auth_daily_rollup (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date    date NOT NULL,          -- Asia/Ho_Chi_Minh calendar day
  platform         text NOT NULL DEFAULT 'unknown',
  method           text NOT NULL DEFAULT 'unknown',
  signups          integer NOT NULL DEFAULT 0,
  logins_success   integer NOT NULL DEFAULT 0,
  logins_failed    integer NOT NULL DEFAULT 0,
  first_logins     integer NOT NULL DEFAULT 0,
  returning_logins integer NOT NULL DEFAULT 0,
  unique_users     integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, platform, method)
);
CREATE INDEX IF NOT EXISTS idx_auth_daily_rollup_date ON public.auth_daily_rollup(snapshot_date DESC);

ALTER TABLE public.auth_daily_rollup ENABLE ROW LEVEL SECURITY; -- deny-by-default (04 §8)

-- 2. Aggregation (SR-4): recompute the window's rows from user_events and UPSERT.
--    Recompute-and-overwrite => idempotent + reconciles late-arriving events.
CREATE OR REPLACE FUNCTION public.fn_rollup_auth_daily(p_from date, p_to date)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.auth_daily_rollup AS r (
    snapshot_date, platform, method,
    signups, logins_success, logins_failed, first_logins, returning_logins, unique_users
  )
  SELECT
    (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date            AS snapshot_date,
    COALESCE(e.platform, 'unknown')                                 AS platform,
    COALESCE(e.metadata->>'method', 'unknown')                      AS method,
    count(*) FILTER (WHERE e.event_type = 'auth_signup_completed')  AS signups,
    count(*) FILTER (WHERE e.event_type = 'auth_login_completed')   AS logins_success,
    count(*) FILTER (WHERE e.event_type = 'auth_login_failed')      AS logins_failed,
    count(*) FILTER (WHERE e.event_type = 'auth_login_completed' AND e.metadata->>'is_first_login' = 'true')  AS first_logins,
    count(*) FILTER (WHERE e.event_type = 'auth_login_completed' AND e.metadata->>'is_first_login' = 'false') AS returning_logins,
    count(DISTINCT e.user_id)                                        AS unique_users
  FROM public.user_events e
  WHERE e.event_type IN ('auth_signup_completed','auth_login_completed','auth_login_failed')
    AND (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN p_from AND p_to
  GROUP BY 1, 2, 3
  ON CONFLICT (snapshot_date, platform, method) DO UPDATE SET
    signups          = EXCLUDED.signups,
    logins_success   = EXCLUDED.logins_success,
    logins_failed    = EXCLUDED.logins_failed,
    first_logins     = EXCLUDED.first_logins,
    returning_logins = EXCLUDED.returning_logins,
    unique_users     = EXCLUDED.unique_users,
    updated_at       = now();
$$;

-- 3. last_login_at is authoritative from auth.users (spec §2.1). Set-based,
--    idempotent (only touches rows whose value actually changed).
CREATE OR REPLACE FUNCTION public.fn_sync_last_login()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  UPDATE public.user_acquisition ua
  SET last_login_at = u.last_sign_in_at, updated_at = now()
  FROM auth.users u
  WHERE u.id = ua.user_id
    AND u.last_sign_in_at IS DISTINCT FROM ua.last_login_at;
$$;
