-- Rollback for 20260920_f028_dob_self_correct_while_ineligible.sql
-- Restores set_user_date_of_birth() to the one-self-correction-for-everyone behaviour
-- from 20260908_user_demographics_foundation.sql (verbatim). Idempotent (CREATE OR REPLACE).
-- No data change either way — this only redefines a function.

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

  IF NOT COALESCE(v_found, false) OR v_existing IS NULL THEN
    INSERT INTO public.user_demographics (user_id, date_of_birth, age_declared_at)
    VALUES (v_uid, p_dob, now())
    ON CONFLICT (user_id) DO UPDATE
      SET date_of_birth   = EXCLUDED.date_of_birth,
          age_declared_at = EXCLUDED.age_declared_at,
          updated_at      = now();
    RETURN 'recorded';
  END IF;

  IF v_existing = p_dob THEN
    RETURN 'unchanged';
  END IF;

  IF COALESCE(v_cor, 0) >= 1 THEN
    RETURN 'correction_exhausted';
  END IF;

  UPDATE public.user_demographics
     SET date_of_birth   = p_dob,
         dob_corrections = COALESCE(dob_corrections, 0) + 1,
         age_declared_at = now(),
         updated_at      = now()
   WHERE user_id = v_uid;

  RETURN 'corrected';
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_date_of_birth(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_date_of_birth(DATE) TO authenticated, service_role;
