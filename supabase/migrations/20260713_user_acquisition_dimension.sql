-- ============================================================================
-- Phase 1 · Step 2 — user_acquisition dimension + backfill
-- Approved spec: docs/backoffice/phase-reports/PHASE_1_AUTH_ANALYTICS_SPEC.md §2.1
--
-- SR-1: user_acquisition is the PERMANENT single source of truth for acquisition.
--       Every future analytics module correlates by user_id JOIN — never copies
--       these attributes. Long-lived (outlives raw user_events / 90-day retention).
-- SR-4: the merge logic lives ONCE, here (fn_upsert_user_acquisition); the TS
--       service and future cron are thin callers.
--
-- Idempotent + additive: new table + function + one-time backfill (ON CONFLICT
-- DO NOTHING). Touches no existing table.
-- ============================================================================

-- 1. Dimension table (spec §2.1)
CREATE TABLE IF NOT EXISTS public.user_acquisition (
  user_id            uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  anon_id            uuid,
  signup_method      text,        -- google | zalo | apple | email_otp | email | … (open vocab)
  signup_platform    text,        -- web | android | ios  (ACQUISITION platform; distinct from per-event usage platform)
  signup_app_version text,
  signup_device_type text,
  signup_country     text,
  signup_language    text,
  acquisition_source text,        -- referrer/utm/campaign or 'organic'
  signup_at          timestamptz,
  first_login_at     timestamptz,
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_acquisition_method    ON public.user_acquisition(signup_method);
CREATE INDEX IF NOT EXISTS idx_user_acquisition_platform  ON public.user_acquisition(signup_platform);
CREATE INDEX IF NOT EXISTS idx_user_acquisition_source    ON public.user_acquisition(acquisition_source);
CREATE INDEX IF NOT EXISTS idx_user_acquisition_signup_at ON public.user_acquisition(signup_at);

-- RLS: analytics dimension — deny-by-default (04 §8). Written/read via the
-- service-role client (bypasses RLS). No direct client access.
ALTER TABLE public.user_acquisition ENABLE ROW LEVEL SECURITY;

-- 2. Single reusable writer (SR-4). First-write-wins for acquisition attributes
--    (COALESCE keeps the existing value); earliest first_login, latest last_login.
--    Called by the backfill, the (future Step 3) cron, and any event-driven update.
CREATE OR REPLACE FUNCTION public.fn_upsert_user_acquisition(
  p_user_id            uuid,
  p_anon_id            uuid        DEFAULT NULL,
  p_signup_method      text        DEFAULT NULL,
  p_signup_platform    text        DEFAULT NULL,
  p_signup_app_version text        DEFAULT NULL,
  p_signup_device_type text        DEFAULT NULL,
  p_signup_country     text        DEFAULT NULL,
  p_signup_language    text        DEFAULT NULL,
  p_acquisition_source text        DEFAULT NULL,
  p_signup_at          timestamptz DEFAULT NULL,
  p_first_login_at     timestamptz DEFAULT NULL,
  p_last_login_at      timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.user_acquisition AS ua (
    user_id, anon_id, signup_method, signup_platform, signup_app_version,
    signup_device_type, signup_country, signup_language, acquisition_source,
    signup_at, first_login_at, last_login_at
  ) VALUES (
    p_user_id, p_anon_id, p_signup_method, p_signup_platform, p_signup_app_version,
    p_signup_device_type, p_signup_country, p_signup_language, p_acquisition_source,
    p_signup_at, p_first_login_at, p_last_login_at
  )
  ON CONFLICT (user_id) DO UPDATE SET
    anon_id            = COALESCE(ua.anon_id,            EXCLUDED.anon_id),
    signup_method      = COALESCE(ua.signup_method,      EXCLUDED.signup_method),
    signup_platform    = COALESCE(ua.signup_platform,    EXCLUDED.signup_platform),
    signup_app_version = COALESCE(ua.signup_app_version, EXCLUDED.signup_app_version),
    signup_device_type = COALESCE(ua.signup_device_type, EXCLUDED.signup_device_type),
    signup_country     = COALESCE(ua.signup_country,     EXCLUDED.signup_country),
    signup_language    = COALESCE(ua.signup_language,    EXCLUDED.signup_language),
    acquisition_source = COALESCE(ua.acquisition_source, EXCLUDED.acquisition_source),
    signup_at          = LEAST(COALESCE(ua.signup_at,      EXCLUDED.signup_at),      COALESCE(EXCLUDED.signup_at,      ua.signup_at)),
    first_login_at     = LEAST(COALESCE(ua.first_login_at, EXCLUDED.first_login_at), COALESCE(EXCLUDED.first_login_at, ua.first_login_at)),
    last_login_at      = GREATEST(COALESCE(ua.last_login_at, EXCLUDED.last_login_at), COALESCE(EXCLUDED.last_login_at, ua.last_login_at)),
    updated_at         = now();
$$;

-- 3. ONE-TIME BACKFILL (idempotent). Historical users have no envelope, so
--    platform/version/device are 'unknown'; signup_method = their first auth
--    identity provider (else 'unknown'); signup_at/first_login_at ≈ account
--    creation; last_login_at = auth.users.last_sign_in_at (authoritative).
INSERT INTO public.user_acquisition (
  user_id, signup_method, signup_platform, signup_app_version, signup_device_type,
  signup_at, first_login_at, last_login_at
)
SELECT
  u.id,
  COALESCE(
    (SELECT i.provider FROM auth.identities i WHERE i.user_id = u.id ORDER BY i.created_at ASC LIMIT 1),
    'unknown'
  ),
  'unknown', 'unknown', 'unknown',
  u.created_at, u.created_at, u.last_sign_in_at
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
ON CONFLICT (user_id) DO NOTHING;
