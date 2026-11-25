-- ROLLBACK for supabase/migrations/20261202_age_adult_declaration.sql. NOT applied automatically.
-- Section 1 restores the previous user_age_status() shape and removes the new write function; it destroys nothing.
-- Section 2 (commented out) drops the three columns and DELETES the stored declarations (time, terms version, minor refusals) — run it only on purpose.
-- Rolling back makes accounts that only pressed the button `unknown` again (they will be asked once more); accounts with a date of birth are unaffected.

BEGIN;

DROP FUNCTION IF EXISTS public.record_age_declaration(BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.user_age_status();

CREATE FUNCTION public.user_age_status()
RETURNS TABLE (
  has_dob          BOOLEAN,
  age_years        INTEGER,
  age_band         TEXT,
  corrections_used SMALLINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_dob DATE;
  v_cor SMALLINT;
  v_age INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, NULL::INTEGER, NULL::TEXT, 0::SMALLINT;
    RETURN;
  END IF;
  SELECT d.date_of_birth, d.dob_corrections
    INTO v_dob, v_cor
    FROM public.user_demographics d
   WHERE d.user_id = v_uid;
  IF v_dob IS NULL THEN
    RETURN QUERY SELECT false, NULL::INTEGER, NULL::TEXT, COALESCE(v_cor, 0::SMALLINT);
    RETURN;
  END IF;
  v_age := date_part('year', age(CURRENT_DATE, v_dob))::INTEGER;
  RETURN QUERY SELECT true, v_age, public.age_band_of(v_dob), COALESCE(v_cor, 0::SMALLINT);
END;
$$;

REVOKE ALL ON FUNCTION public.user_age_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_age_status() TO authenticated, service_role;

COMMIT;

-- Section 2 — destructive, uncomment by hand:
-- ALTER TABLE public.user_demographics DROP CONSTRAINT IF EXISTS user_demographics_adult_declaration_chk;
-- ALTER TABLE public.user_demographics
--   DROP COLUMN IF EXISTS adult_declared_at,
--   DROP COLUMN IF EXISTS adult_terms_version,
--   DROP COLUMN IF EXISTS minor_declared_at;
