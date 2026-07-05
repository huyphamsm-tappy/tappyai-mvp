-- ============================================================================
-- Security Issue (Critical): profiles.email publicly readable via anon key
-- ============================================================================
-- Root cause: public.profiles carries TWO permissive SELECT policies with
-- qual=true for the {public} role ("Public profiles are viewable by everyone"
-- and "profiles_select"), applied out-of-band in the live DB. RLS is row-level
-- and cannot hide a single column, so any holder of the public anon key can
-- enumerate every user's `email` via a direct PostgREST `?select=email` call.
--
-- `email` is a DUPLICATE of the canonical auth.users.email (copied by the
-- handle_new_user trigger). The app never needs profiles.email: the owner's
-- email is always available from the session (auth.users.email / user.email),
-- and no code reads OTHER users' email from profiles. The clean fix is to stop
-- duplicating it and remove the column — matching the billing_customers pattern
-- already used for stripe_customer_id.
--
-- Applied in TWO stages to avoid any breakage window (same discipline as
-- add_billing_customers_isolation.sql):
--   PART 1 (this file, safe to run NOW — closes the Critical immediately):
--     * revoke column-level SELECT on email from the anon role, and
--     * stop the trigger writing email into profiles.
--     Neither touches a code path: no app query reads email under the anon
--     role, and the owner still reads email from the session, not the column.
--   PART 2 (bottom, run ONLY AFTER the code that drops `email` from the
--     api/profile select list is deployed): drop the duplicate column.
-- Never edit historical migrations.
-- ============================================================================

-- ---- PART 1 : immediate hardening (safe pre-deploy) -------------------------

-- Close the audited vector: the anon role can no longer read the email column
-- at all (column-level privilege is role-wide; RLS row policies are unaffected).
-- Public/unauthenticated reads only ever select full_name/avatar_url, so this
-- breaks nothing. Authenticated users retain column access until PART 2 removes
-- the column entirely.
-- Guarded: live production introspection (2026-07-05) showed profiles.email has
-- ALREADY been dropped in prod, so an unconditional REVOKE on the column would
-- error there. Only run it if the column still exists (older/fresh DBs).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email'
  ) THEN
    EXECUTE 'REVOKE SELECT (email) ON public.profiles FROM anon';
  END IF;
END $$;

-- Stop duplicating auth.users.email into profiles on signup. The column still
-- exists after this (dropped in PART 2), so leaving it unset is harmless —
-- nothing reads it. auth.users.email remains the single source of truth.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name  = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = now();
  RETURN new;
END;
$$;

-- ---- PART 2 : run ONLY after the code change in this changeset is deployed ---
-- (api/profile/route.ts no longer selects the `email` column.) This removes the
-- duplicate entirely, closing the residual authenticated-user read path too.
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;
