-- 18+ gate becomes ONE BUTTON (owner decision 18/11/2026). FILE ONLY: this migration has NOT been applied to any database and must not be applied
-- without the owner. Until it is applied, user_age_status() keeps its old shape, record_age_declaration() does not exist, and the web age check FAILS
-- CLOSED: the account stays `unknown`, is sent to /age-check, and the button answers 503 (nobody is admitted).
--
-- WHAT IT DOES
--  1. Adds three columns to public.user_demographics:
--       adult_declared_at   timestamptz  when the person pressed "I confirm I am 18 or older"
--       adult_terms_version text         the Terms version that was on screen (see src/lib/account/adultDeclaration.ts)
--       minor_declared_at   timestamptz  when the person pressed "I am under 18" (the refusal; durable on the account)
--     They get NO grant: same privilege model as date_of_birth (table-level privileges are revoked for PUBLIC/anon/authenticated in
--     20260908_user_demographics_foundation.sql and only the listed columns are granted back, so a new column is invisible to PostgREST roles).
--     The REVOKE below repeats that on purpose, so the file stays correct even if a table-level grant is ever added later.
--  2. record_age_declaration(p_adult boolean, p_terms_version text) — SECURITY DEFINER, keyed on auth.uid() only (no user id argument).
--       adult:  'recorded' | 'unchanged' (idempotent: the first time and version stay) | 'dob_under_18' (a date of birth that says under 18 is never
--               overridden by a button) | 'minor_declared' (an account that declared a minor cannot flip to adult)
--       minor:  'recorded' | 'unchanged'
--       both:   'anonymous_not_eligible' | 'unauthenticated' | 'invalid_terms_version'
--  3. user_age_status() gains a `declaration` column ('adult' | 'minor' | NULL) so the answer is derived in ONE place. The rules (applied in
--     src/lib/account/ageEligibility.ts evaluateAgeEligibility):
--       declaration = 'minor'                      -> ineligible (wins over everything except an admin correction to an adult date of birth)
--       a date of birth on file                    -> the date decides, exactly as before (an adult declaration never overrides an under-18 date)
--       no date of birth, declaration = 'adult'    -> eligible
--       otherwise                                  -> unknown (fail closed)
--     The old four columns keep their meaning. Because the return type changes, the function is dropped and re-created with the SAME grants
--     (authenticated + service_role). A client that does not know the new column simply ignores it.
-- Existing accounts: nothing changes for anyone who has a date of birth. Nobody is auto-declared.
-- Rollback: rollback/20261202_age_adult_declaration_rollback.sql.

BEGIN;

ALTER TABLE public.user_demographics
  ADD COLUMN IF NOT EXISTS adult_declared_at   timestamptz,
  ADD COLUMN IF NOT EXISTS adult_terms_version text,
  ADD COLUMN IF NOT EXISTS minor_declared_at   timestamptz;

ALTER TABLE public.user_demographics
  DROP CONSTRAINT IF EXISTS user_demographics_adult_declaration_chk;
ALTER TABLE public.user_demographics
  ADD CONSTRAINT user_demographics_adult_declaration_chk CHECK (
    (adult_declared_at IS NULL) = (adult_terms_version IS NULL)
    AND coalesce(length(adult_terms_version), 0) <= 32
  );

REVOKE ALL (adult_declared_at, adult_terms_version, minor_declared_at)
  ON public.user_demographics FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- user_age_status(): same four columns, plus `declaration`.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.user_age_status();

CREATE FUNCTION public.user_age_status()
RETURNS TABLE (
  has_dob          BOOLEAN,
  age_years        INTEGER,
  age_band         TEXT,
  corrections_used SMALLINT,
  declaration      TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_dob   DATE;
  v_cor   SMALLINT;
  v_adm   SMALLINT;
  v_adult TIMESTAMPTZ;
  v_minor TIMESTAMPTZ;
  v_age   INTEGER;
  v_decl  TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, NULL::INTEGER, NULL::TEXT, 0::SMALLINT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT d.date_of_birth, d.dob_corrections, d.admin_corrections, d.adult_declared_at, d.minor_declared_at
    INTO v_dob, v_cor, v_adm, v_adult, v_minor
    FROM public.user_demographics d
   WHERE d.user_id = v_uid;

  IF v_dob IS NOT NULL THEN
    v_age := date_part('year', age(CURRENT_DATE, v_dob))::INTEGER;
  END IF;

  -- A minor declaration stands unless support (admin_set_user_date_of_birth) later corrected the date to an adult one.
  IF v_minor IS NOT NULL AND NOT (COALESCE(v_adm, 0) > 0 AND v_age IS NOT NULL AND v_age >= 18) THEN
    v_decl := 'minor';
  ELSIF v_adult IS NOT NULL THEN
    v_decl := 'adult';
  ELSE
    v_decl := NULL;
  END IF;

  IF v_dob IS NULL THEN
    RETURN QUERY SELECT false, NULL::INTEGER, NULL::TEXT, COALESCE(v_cor, 0::SMALLINT), v_decl;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_age, public.age_band_of(v_dob), COALESCE(v_cor, 0::SMALLINT), v_decl;
END;
$$;

REVOKE ALL ON FUNCTION public.user_age_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_age_status() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- record_age_declaration(): the one write path for the button. auth.uid() only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_age_declaration(p_adult BOOLEAN, p_terms_version TEXT)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_anon    BOOLEAN;
  v_dob     DATE;
  v_adult   TIMESTAMPTZ;
  v_minor   TIMESTAMPTZ;
  v_terms   TEXT := btrim(COALESCE(p_terms_version, ''));
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'unauthenticated';
  END IF;

  SELECT u.is_anonymous INTO v_anon FROM auth.users u WHERE u.id = v_uid;
  IF COALESCE(v_anon, false) THEN
    RETURN 'anonymous_not_eligible';
  END IF;

  IF p_adult IS NULL THEN
    RETURN 'invalid_terms_version';
  END IF;

  SELECT d.date_of_birth, d.adult_declared_at, d.minor_declared_at
    INTO v_dob, v_adult, v_minor
    FROM public.user_demographics d
   WHERE d.user_id = v_uid
   FOR UPDATE;

  IF NOT p_adult THEN
    IF v_minor IS NOT NULL THEN
      RETURN 'unchanged';
    END IF;
    INSERT INTO public.user_demographics (user_id, minor_declared_at)
    VALUES (v_uid, now())
    ON CONFLICT (user_id) DO UPDATE
      SET minor_declared_at = now(),
          updated_at        = now();
    RETURN 'recorded';
  END IF;

  -- p_adult = true
  IF v_terms = '' OR length(v_terms) > 32 THEN
    RETURN 'invalid_terms_version';
  END IF;
  IF v_minor IS NOT NULL THEN
    RETURN 'minor_declared';
  END IF;
  IF v_dob IS NOT NULL AND date_part('year', age(CURRENT_DATE, v_dob)) < 18 THEN
    RETURN 'dob_under_18';
  END IF;
  IF v_adult IS NOT NULL THEN
    RETURN 'unchanged';
  END IF;

  INSERT INTO public.user_demographics (user_id, adult_declared_at, adult_terms_version)
  VALUES (v_uid, now(), v_terms)
  ON CONFLICT (user_id) DO UPDATE
    SET adult_declared_at   = now(),
        adult_terms_version = v_terms,
        updated_at          = now()
    WHERE public.user_demographics.adult_declared_at IS NULL;
  RETURN 'recorded';
END;
$$;

REVOKE ALL ON FUNCTION public.record_age_declaration(BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_age_declaration(BOOLEAN, TEXT) TO authenticated, service_role;

COMMIT;
