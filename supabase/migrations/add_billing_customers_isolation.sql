-- ============================================================================
-- Security Issue #1 (Critical): isolate stripe_customer_id from public profiles
-- ============================================================================
-- Root cause: public.profiles has TWO permissive SELECT policies with qual=true
-- for the {public} role ("Public profiles are viewable by everyone" and
-- "profiles_select"). RLS OR-combines policies, so the whole table — including
-- stripe_customer_id — is readable by anyone holding the public anon key via a
-- direct PostgREST call. RLS is row-level and cannot hide a single column, and a
-- column-level REVOKE would break the app's many `profiles.select('*')` reads of
-- the owner's own row. The clean fix is to move the only sensitive column out of
-- the public table into a restricted one; the remaining profiles columns
-- (username, full_name, avatar_url, counts, language, onboarded) are public-safe
-- social data.
--
-- Applied in TWO stages to avoid any breakage window:
--   PART 1 (this file, run first): create billing_customers + backfill + RLS.
--   Then deploy the checkout code that reads/writes billing_customers.
--   PART 2 (bottom, run AFTER deploy): drop profiles.stripe_customer_id.
-- ============================================================================

-- ---- PART 1 : create + backfill (additive, safe to run before the deploy) ----
CREATE TABLE IF NOT EXISTS public.billing_customers (
  user_id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

-- No anon access at all; authenticated may read ONLY their own row; writes are
-- service_role-only (no INSERT/UPDATE/DELETE policies -> default deny, and
-- service_role bypasses RLS).
REVOKE ALL ON public.billing_customers FROM anon, authenticated;
GRANT SELECT ON public.billing_customers TO authenticated;

DROP POLICY IF EXISTS billing_customers_select_own ON public.billing_customers;
CREATE POLICY billing_customers_select_own ON public.billing_customers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

INSERT INTO public.billing_customers (user_id, stripe_customer_id)
  SELECT id, stripe_customer_id
  FROM public.profiles
  WHERE stripe_customer_id IS NOT NULL
  ON CONFLICT (user_id) DO NOTHING;

-- ---- PART 2 : run ONLY after the checkout code change is deployed ------------
-- ALTER TABLE public.profiles DROP COLUMN stripe_customer_id;
