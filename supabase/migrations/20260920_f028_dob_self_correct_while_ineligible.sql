-- ============================================================================
-- F-028 — a mistyped date of birth must be self-recoverable.
--
-- BEFORE: set_user_date_of_birth() allowed exactly ONE self-correction for
-- everyone. A user whose single correction landed them ineligible (a typo toward
-- a year under 18) was then blocked from the whole product AND out of self-service
-- corrections — recoverable only by a support/admin round-trip
-- (admin_set_user_date_of_birth). For a solo-operated product that is not adequate.
--
-- AFTER: a user who is currently INELIGIBLE (their stored date of birth reads as
-- under 18) may keep self-correcting. A user who is currently ELIGIBLE is
-- UNCHANGED — exactly one correction, then 'correction_exhausted'.
--
-- WHY THIS DOES NOT WEAKEN THE 18+ GATE:
--   * An ineligible->ineligible correction stays ineligible; the gate still blocks them.
--   * The gate is self-declared and unverified — an under-18 can already enter an
--     adult date on the FIRST declaration, so refusing a later correction protects
--     nothing; it only traps honest adults who mistyped. This change removes that
--     trap without granting any capability an under-18 did not already have.
--   * Eligible-user behaviour and the general one-correction limit are untouched.
--
-- Idempotent: CREATE OR REPLACE. Additive; changes one branch of one function.
-- Rollback: supabase/migrations/rollback/20260920_f028_dob_self_correct_while_ineligible_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_user_date_of_birth(p_dob DATE)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_anon      BOOLEAN;
  v_existing  DATE;
  v_cor       SMALLINT;
  v_found     BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'unauthenticated';
  END IF;

  SELECT u.is_anonymous INTO v_anon FROM auth.users u WHERE u.id = v_uid;
  IF COALESCE(v_anon, false) THEN
    RETURN 'anonymous_not_eligible';
  END IF;

  IF p_dob IS NULL OR p_dob > CURRENT_DATE OR p_dob <= DATE '1900-01-01' THEN
    RETURN 'invalid_date';
  END IF;

  SELECT d.date_of_birth, d.dob_corrections, true
    INTO v_existing, v_cor, v_found
    FROM public.user_demographics d
   WHERE d.user_id = v_uid;

  -- First declaration (or a row that exists for a city/occupation but has no date yet).
  IF NOT COALESCE(v_found, false) OR v_existing IS NULL THEN
    INSERT INTO public.user_demographics (user_id, date_of_birth, age_declared_at)
    VALUES (v_uid, p_dob, now())
    ON CONFLICT (user_id) DO UPDATE
      SET date_of_birth   = EXCLUDED.date_of_birth,
          age_declared_at = EXCLUDED.age_declared_at,
          updated_at      = now();
    RETURN 'recorded';
  END IF;

  -- Re-submitting the same date is not a correction and must not consume the allowance.
  IF v_existing = p_dob THEN
    RETURN 'unchanged';
  END IF;

  -- F-028: exhaustion applies ONLY while the user is currently ELIGIBLE. An ineligible user
  -- (stored DOB under 18, same threshold as public.age_band_of) may keep self-correcting so a
  -- mistyped date is never a lockout. Eligible users are unchanged: one correction, then exhausted.
  IF COALESCE(v_cor, 0) >= 1
     AND date_part('year', age(CURRENT_DATE, v_existing)) >= 18 THEN
    RETURN 'correction_exhausted';
  END IF;

  UPDATE public.user_demographics
     SET date_of_birth   = p_dob,
         -- F-028: only a correction made FROM an ELIGIBLE state consumes the single allowance. A
         -- correction made while currently INELIGIBLE is a free recovery and does not increment —
         -- which also keeps dob_corrections within its `BETWEEN 0 AND 1` CHECK when an ineligible
         -- user re-corrects repeatedly. (From an eligible state the exhaustion check above already
         -- guaranteed dob_corrections = 0 here, so this never exceeds 1.)
         dob_corrections = CASE
           WHEN date_part('year', age(CURRENT_DATE, v_existing)) >= 18
             THEN COALESCE(dob_corrections, 0) + 1
             ELSE COALESCE(dob_corrections, 0)
         END,
         age_declared_at = now(),
         updated_at      = now()
   WHERE user_id = v_uid;

  RETURN 'corrected';
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_date_of_birth(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_date_of_birth(DATE) TO authenticated, service_role;
