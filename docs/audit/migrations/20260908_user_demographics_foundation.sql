-- ============================================================================
-- V3 User Data Foundation — `public.user_demographics`
-- Private demographic + professional attributes of the ONE canonical user,
-- isolated from the public-read `public.profiles` table.
--
-- GATE: applied to production ONLY under explicit Owner authorization, as its
--       own change with its own preflight, verification and rollback window
--       (ADR-014 / ADR-017 pattern). Nothing here runs as part of a batch.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A SEPARATE TABLE AND NOT COLUMNS ON `profiles`
-- ---------------------------------------------------------------------------
-- The requirement was "store date of birth in the canonical profile, and
-- protect it strictly". On this database those two halves cannot both hold for
-- `public.profiles`, and the reason is measured rather than assumed:
--
--   * `profiles` carries TWO permissive SELECT policies with `qual = true` for
--     the `{public}` role, and table-level grants giving `anon` and
--     `authenticated` SELECT/INSERT/UPDATE/DELETE. This was measured on
--     production on 2026-08-19 and is recorded verbatim in
--     `20260819_m08_account_status.sql` §"WHY THE FIELDS CANNOT LIVE ON
--     profiles", and earlier in `add_profiles_email_isolation.sql`.
--
--   * RLS filters ROWS, never COLUMNS. So a `date_of_birth` column placed on
--     `profiles` would be readable by the anonymous internet via a PostgREST
--     `?select=date_of_birth` call — exactly the Critical that
--     `add_profiles_email_isolation.sql` exists to close for `email`.
--
--   * It would also be WRITABLE BY ITS OWN SUBJECT. That is not a privacy
--     detail here, it is the whole enforcement question: a user who can PATCH
--     their own `date_of_birth` can clear an under-18 block at will, which
--     makes the 18+ gate advisory rather than enforcement — the identical
--     failure `account_status` was created to avoid for `is_suspended`.
--
--   * Column-level privileges cannot repair this in place. A column-level
--     REVOKE against an existing TABLE-level grant is silently inert (measured
--     on PostgreSQL 17.5 — the ACL does not change and no warning is raised),
--     and the working form denies `SELECT *`, which 11 consumer call sites rely
--     on.
--
-- This is therefore NOT a second profile system. `public.profiles` remains the
-- ONE canonical identity and the ONE canonical profile; `user_id` here is both
-- primary key and foreign key to it, so there is at most one demographic row
-- per profile and it is removed with the profile. The same resolution was
-- reached three times before in this repository — `billing_customers` for
-- `stripe_customer_id`, the removal of `profiles.email`, and `account_status`
-- for the four moderation fields — and this migration follows that established
-- pattern rather than inventing a new one.
--
-- `profiles` is NOT touched by this migration.
--
-- ---------------------------------------------------------------------------
-- WHY THE FK IS TO `profiles` AND NOT TO `auth.users`
-- ---------------------------------------------------------------------------
-- `20260808c_handle_new_user_skip_anonymous.sql` stops the signup trigger from
-- creating a `profiles` row for an anonymous identity. Pointing the FK at
-- `profiles` therefore makes "an anonymous session cannot acquire demographic
-- data" a structural property of the schema, not a rule the application has to
-- remember. The functions below also check `is_anonymous` explicitly, so the
-- guarantee holds at both layers.
--
-- ---------------------------------------------------------------------------
-- SILENCE IS NOT "CLOSED" (ADR-019, extended to tables)
-- ---------------------------------------------------------------------------
-- Production `pg_default_acl` for tables in schema `public` reads
--   anon=arwdDxtm/postgres  authenticated=arwdDxtm/postgres
-- so a newly created table is born with FULL privileges for `anon` and
-- `authenticated`. The REVOKE in section 2 is mandatory, not defensive tidiness.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. `set_updated_at()` — reused, created only if this database lacks it.
--    Production already has it (trigger `profiles_set_updated_at`), but it is
--    defined out-of-band and appears in no migration file, so a fresh database
--    built from `supabase/migrations` alone would not have it. CREATE OR
--    REPLACE unconditionally would overwrite production's definition; this
--    guarded form never does.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.set_updated_at() RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = public
      AS $body$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $body$;
    $fn$;
    -- ADR-019: a trigger function is not reachable by a PostgREST role, but the
    -- grant is stated rather than inherited so this file stays correct if the
    -- platform defaults change.
    EXECUTE 'REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. The table.
--
--    `date_of_birth` is stored ONCE and age / age band are DERIVED from it
--    (section 5). No `age` or `age_band` column exists, deliberately: a stored
--    age is wrong the day after it is written, and an independently editable
--    duplicate of a value that gates access is a second source of truth for the
--    same decision.
--
--    `dob_corrections` implements the one-self-correction rule. It is a counter
--    rather than a boolean so the audit question "how many times has this
--    changed" has an answer, and it is unreachable by any client role.
--
--    `gender` is a TEXT with a CHECK rather than an ENUM: adding a value to a
--    Postgres ENUM cannot run inside a transaction on older versions and is a
--    schema change either way, whereas widening a CHECK is a one-line ALTER.
--    The option set is deliberately not binary — the pre-existing product value
--    (`auth.users.raw_user_meta_data ->> 'gender'`, male/female only) cannot
--    represent a user who is neither, and had no way to decline the question.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_demographics (
  user_id              UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- HIGHLY SENSITIVE. No client role holds any privilege on these three.
  date_of_birth        DATE,
  age_declared_at      TIMESTAMPTZ,
  dob_corrections      SMALLINT    NOT NULL DEFAULT 0,
  -- Times an ADMIN corrected this date. Separate from `dob_corrections` on
  -- purpose: an administrative fix must not silently hand the user a fresh
  -- self-service allowance (spend it, ask support, spend it again), and
  -- "has this row ever been touched by support" must be answerable without
  -- scanning the audit log.
  admin_corrections    SMALLINT    NOT NULL DEFAULT 0,

  -- PERSONAL PROFILE. Owner-readable and owner-writable, never public.
  gender               TEXT,
  gender_self_describe TEXT,
  city                 TEXT,
  country              TEXT,
  occupation           TEXT,
  industry             TEXT,
  education_level      TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_demographics_gender_chk CHECK (
    gender IS NULL OR gender IN ('female', 'male', 'other', 'prefer_not_to_say')
  ),
  -- A free-text self-description belongs only to the option that asks for one.
  CONSTRAINT user_demographics_self_describe_chk CHECK (
    gender_self_describe IS NULL OR gender = 'other'
  ),
  -- ISO-3166-1 alpha-2, upper case. Narrow enough to keep the future audience
  -- dimension joinable; not a lookup table, which nothing would populate.
  CONSTRAINT user_demographics_country_chk CHECK (
    country IS NULL OR country ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT user_demographics_dob_chk CHECK (
    date_of_birth IS NULL
    OR (date_of_birth > DATE '1900-01-01' AND date_of_birth <= CURRENT_DATE)
  ),
  CONSTRAINT user_demographics_corrections_chk CHECK (dob_corrections BETWEEN 0 AND 1),
  CONSTRAINT user_demographics_admin_corrections_chk CHECK (admin_corrections >= 0),
  -- Free text is bounded at the schema so an oversized write is a database
  -- error rather than a row nothing can render.
  CONSTRAINT user_demographics_text_len_chk CHECK (
    coalesce(length(gender_self_describe), 0) <= 60
    AND coalesce(length(city), 0)            <= 80
    AND coalesce(length(occupation), 0)      <= 80
    AND coalesce(length(industry), 0)        <= 80
    AND coalesce(length(education_level), 0) <= 80
  )
);

-- ---------------------------------------------------------------------------
-- 2. Close it. THIS MUST FOLLOW THE CREATE IMMEDIATELY.
--    Every migration in this repository must be correct when applied section by
--    section (ADR-019, Migration policy) — production SQL is applied by hand, so
--    "the migration is atomic" is not a guarantee the deployment method grants.
--    Between section 1 and section 2 the table is open; keep them adjacent.
--
--    `service_role` is deliberately NOT revoked: it is the administrative path
--    (`19_Security.md` §4 Layer 3) and it carries BYPASSRLS. Its grant is stated
--    explicitly rather than inherited.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.user_demographics FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE public.user_demographics TO service_role;

ALTER TABLE public.user_demographics ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Owner access — column lists, never the whole row.
--
--    This is a column-list GRANT on a table that holds no table-level grant for
--    `authenticated`. That is the form that works. (The inverse — revoking one
--    column out of a table-level grant — does nothing at all; measured, see the
--    header.)
--
--    `date_of_birth`, `age_declared_at` and `dob_corrections` are granted to NO
--    PostgREST role, following the `account_status.ban_reason` precedent. The
--    consequences are stated here rather than discovered later:
--
--      * `SELECT *` on this table is DENIED for `authenticated`, because `*`
--        expands to `date_of_birth`. Readers must name their columns.
--      * A user cannot read their own raw DOB over PostgREST, and cannot write
--        it at all. Both go through the SECURITY DEFINER functions in section 5,
--        which is what makes the one-correction rule un-bypassable and keeps the
--        18+ decision out of the subject's hands.
--      * Nothing is lost to the product: the profile surface needs the DERIVED
--        age and age band, not the raw date (see `docs/` note in the route).
--
--    `anon` is granted nothing at all. An anonymous session has no row here by
--    construction (the FK, section 1) and must not be able to probe for one.
-- ---------------------------------------------------------------------------
GRANT SELECT (user_id, gender, gender_self_describe, city, country,
              occupation, industry, education_level, created_at, updated_at)
  ON public.user_demographics TO authenticated;

GRANT INSERT (user_id, gender, gender_self_describe, city, country,
              occupation, industry, education_level)
  ON public.user_demographics TO authenticated;

GRANT UPDATE (gender, gender_self_describe, city, country,
              occupation, industry, education_level)
  ON public.user_demographics TO authenticated;

-- Own row only, on every verb. There is deliberately no DELETE policy and no
-- DELETE grant: the row is removed with the profile by the FK cascade, and a
-- user deleting the row would silently reset `dob_corrections` to zero — a
-- correction-limit bypass dressed up as a privacy action.
DROP POLICY IF EXISTS user_demographics_select_own ON public.user_demographics;
CREATE POLICY user_demographics_select_own ON public.user_demographics
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_demographics_insert_own ON public.user_demographics;
CREATE POLICY user_demographics_insert_own ON public.user_demographics
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_demographics_update_own ON public.user_demographics;
CREATE POLICY user_demographics_update_own ON public.user_demographics
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Timestamps. Reuses `public.set_updated_at()` (section 0), already used by
--    `profiles` and `account_status`. No new function for this.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS user_demographics_set_updated_at ON public.user_demographics;
CREATE TRIGGER user_demographics_set_updated_at
  BEFORE UPDATE ON public.user_demographics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. The two functions that are the ONLY path to `date_of_birth`.
--
--    Both are SECURITY DEFINER with a pinned `search_path`, and both key on
--    `auth.uid()` — they take no user id argument, so one user cannot address
--    another's row by passing a different id. That is the same shape as the
--    existing `anon_chat_usage_increment`.
--
--    ADR-019: `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon,
--    authenticated, service_role` is in force on this project, so a function
--    that says nothing about grants is OPEN. `REVOKE ... FROM PUBLIC` alone
--    removes only PostgreSQL's own default and leaves the Supabase grant
--    standing. Every REVOKE below therefore names `anon` explicitly.
-- ---------------------------------------------------------------------------

-- 5.0 Banding — the ONE derivation, used by every function in this file.
--
--     Extracted rather than repeated so `user_age_status()` and the admin
--     correction path cannot come to disagree about which band a date falls in.
--     That dimension is what the future audience foundation keys on; two
--     implementations of it would be a silent, permanent data-quality defect.
--
--     STABLE, not IMMUTABLE: it reads CURRENT_DATE, so its result changes with
--     the clock. Declaring it IMMUTABLE would let the planner cache a band
--     across a day boundary, and someone would turn 18 without the system
--     noticing.
CREATE OR REPLACE FUNCTION public.age_band_of(p_dob DATE)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_dob IS NULL THEN NULL
    WHEN date_part('year', age(CURRENT_DATE, p_dob)) < 18 THEN 'under_18'
    WHEN date_part('year', age(CURRENT_DATE, p_dob)) < 25 THEN '18_24'
    WHEN date_part('year', age(CURRENT_DATE, p_dob)) < 35 THEN '25_34'
    WHEN date_part('year', age(CURRENT_DATE, p_dob)) < 45 THEN '35_44'
    WHEN date_part('year', age(CURRENT_DATE, p_dob)) < 55 THEN '45_54'
    WHEN date_part('year', age(CURRENT_DATE, p_dob)) < 65 THEN '55_64'
    ELSE '65_plus'
  END
$$;

-- Not SECURITY DEFINER: it takes a date and returns a string, touching no
-- table, so it needs no elevated rights. ADR-019 still applies — the platform
-- grants EXECUTE to anon/authenticated by default, and a function that says
-- nothing is OPEN. Revoked from both; only the definer functions in this file
-- and service_role need it.
REVOKE ALL ON FUNCTION public.age_band_of(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.age_band_of(DATE) TO service_role;

-- 5a. Read the caller's OWN derived age status. Never returns date_of_birth.
--
--     Returns derived values only. `age_band` is computed here so that Web,
--     Android and any future client cannot disagree about which band a user is
--     in — the band is a demographic dimension the audience foundation will key
--     on, and two clients banding the same person differently would be a
--     silent, permanent data-quality defect.
--
--     `has_dob` is separate from `age_years IS NOT NULL` on purpose: it lets the
--     caller distinguish "we have never asked this user" from "we asked and the
--     answer is being withheld", which are different product states.
CREATE OR REPLACE FUNCTION public.user_age_status()
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

  -- Whole years elapsed. `date_part('year', age(...))` handles leap years and
  -- the not-yet-had-a-birthday-this-year case without any client arithmetic.
  v_age := date_part('year', age(CURRENT_DATE, v_dob))::INTEGER;

  -- Banded by the one shared helper (section 5.0), never inline here.
  RETURN QUERY SELECT true, v_age, public.age_band_of(v_dob), COALESCE(v_cor, 0::SMALLINT);
END;
$$;

-- ADR-019 G1/G2: revoke from PUBLIC *and* from both PostgREST roles by name,
-- then grant back only to the roles that call it. Revoking from PUBLIC alone is
-- not enough — the platform's ALTER DEFAULT PRIVILEGES grant to `anon` and
-- `authenticated` is a separate, explicit grant that survives it.
REVOKE ALL ON FUNCTION public.user_age_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_age_status() TO authenticated, service_role;

-- 5b. Record or correct the caller's OWN date of birth.
--
--     Returns a STATUS CODE, never the stored date, and never an age. The
--     caller re-reads `user_age_status()` if it needs the derived values, so
--     there is exactly one place that derives them.
--
--     Codes: 'recorded' | 'corrected' | 'unchanged' | 'correction_exhausted'
--            | 'invalid_date' | 'anonymous_not_eligible' | 'unauthenticated'
--
--     The one-self-correction rule lives HERE rather than in the API route
--     because the route is not the only thing that can call PostgREST with a
--     user's JWT. A rule enforced only in application code would be bypassable
--     by anyone holding their own access token — which is every signed-in user.
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

  -- An anonymous identity must not acquire demographic data at all. The FK to
  -- `profiles` already makes the INSERT impossible; this returns the honest
  -- reason instead of a foreign-key error.
  SELECT u.is_anonymous INTO v_anon FROM auth.users u WHERE u.id = v_uid;
  IF COALESCE(v_anon, false) THEN
    RETURN 'anonymous_not_eligible';
  END IF;

  -- Validated here as well as by the CHECK constraint: a constraint violation
  -- is an exception the caller must catch, while this is a value it can branch
  -- on. The CHECK remains as the backstop for every other write path.
  IF p_dob IS NULL OR p_dob > CURRENT_DATE OR p_dob <= DATE '1900-01-01' THEN
    RETURN 'invalid_date';
  END IF;

  SELECT d.date_of_birth, d.dob_corrections, true
    INTO v_existing, v_cor, v_found
    FROM public.user_demographics d
   WHERE d.user_id = v_uid;

  -- First declaration. Also covers the case where a row exists because the user
  -- already saved a city or occupation, but has never given a date.
  IF NOT COALESCE(v_found, false) OR v_existing IS NULL THEN
    INSERT INTO public.user_demographics (user_id, date_of_birth, age_declared_at)
    VALUES (v_uid, p_dob, now())
    ON CONFLICT (user_id) DO UPDATE
      SET date_of_birth   = EXCLUDED.date_of_birth,
          age_declared_at = EXCLUDED.age_declared_at,
          updated_at      = now();
    RETURN 'recorded';
  END IF;

  -- Re-submitting the same date is not a correction and must not consume the
  -- single allowance — a double-tap or a retry after a network failure would
  -- otherwise cost the user their one chance to fix a genuine mistake.
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

-- Same ADR-019 form as above: revoke from PUBLIC, anon and authenticated, then
-- grant EXECUTE back to the two roles that legitimately call it. `anon` is never
-- granted: an anonymous identity has no profile row and cannot hold a date of
-- birth, so it has no reason to reach this function at all.
REVOKE ALL ON FUNCTION public.set_user_date_of_birth(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_date_of_birth(DATE) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The support/admin correction path.
--
-- WHY THIS EXISTS
--   `set_user_date_of_birth()` allows the user ONE self-correction. After that a
--   genuine mis-tap is unrecoverable by the person it affects, and TappyAI has
--   no other way to fix it — so without this, a mistyped year is a permanent
--   lockout with no remedy.
--
-- WHY IT IS A FUNCTION RATHER THAN "let an admin run an UPDATE"
--   `service_role` already holds ALL on this table, so the capability EXISTS
--   today. What it lacks is a path that is explicit and auditable (`23` §3). A
--   raw UPDATE leaves no record of who changed a date of birth, or why. This
--   makes the operation single-purpose, refuses it without a written reason,
--   and writes the audit row in the SAME statement as the change, so the two
--   cannot come apart.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * It does NOT return the stored date, before or after. Nothing about this
--     path widens read access to `date_of_birth`.
--   * It does NOT write the date into `audit_log`. The audit records the
--     BAND and the eligibility outcome, which is what makes the decision
--     reviewable; copying the raw value into a second table with different
--     retention would recreate exactly the duplication this design removes.
--   * It does NOT reset `dob_corrections`. The user needs the RIGHT value, not
--     another attempt.
--   * It has NO HTTP surface. `/api/admin/*` is Controller-owned (Module 08)
--     and out of scope here — see the launch-blocker note in the task report.
--     This is the primitive that surface will call, and nothing calls it yet.
--
-- `p_reason` mirrors `19_Security.md` §5 / `admin/users/schema.ts`: min 20
-- characters, so "fix" is not an audit trail.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_date_of_birth(
  p_user_id     UUID,
  p_dob         DATE,
  p_actor_id    UUID,
  p_actor_email TEXT,
  p_actor_role  TEXT,
  p_reason      TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before_dob  DATE;
  v_exists      BOOLEAN;
  v_before_band TEXT;
  v_after_band  TEXT;
BEGIN
  IF p_user_id IS NULL OR p_actor_id IS NULL
     OR coalesce(trim(p_actor_email), '') = '' OR coalesce(trim(p_actor_role), '') = '' THEN
    RETURN 'invalid_actor';
  END IF;

  IF coalesce(length(trim(p_reason)), 0) < 20 THEN
    RETURN 'reason_too_short';
  END IF;

  IF p_dob IS NULL OR p_dob > CURRENT_DATE OR p_dob <= DATE '1900-01-01' THEN
    RETURN 'invalid_date';
  END IF;

  -- The subject must be a real account. An anonymous identity has no profile
  -- row, so there is nothing to correct and the FK would refuse the write.
  SELECT true INTO v_exists FROM public.profiles WHERE id = p_user_id;
  IF NOT coalesce(v_exists, false) THEN
    RETURN 'user_not_found';
  END IF;

  SELECT d.date_of_birth INTO v_before_dob
    FROM public.user_demographics d WHERE d.user_id = p_user_id;

  v_before_band := public.age_band_of(v_before_dob);
  v_after_band  := public.age_band_of(p_dob);

  INSERT INTO public.user_demographics (user_id, date_of_birth, age_declared_at, admin_corrections)
  VALUES (p_user_id, p_dob, now(), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET date_of_birth     = EXCLUDED.date_of_birth,
        age_declared_at   = EXCLUDED.age_declared_at,
        admin_corrections = public.user_demographics.admin_corrections + 1,
        updated_at        = now();

  -- Same statement, same transaction: the change and its record commit together
  -- or not at all. The chain trigger (Component 7) links this row like any other.
  INSERT INTO public.audit_log (
    actor_id, actor_email, actor_role, action, target_type, target_id,
    before_state, after_state, metadata
  ) VALUES (
    p_actor_id, p_actor_email, p_actor_role,
    'user.date_of_birth.corrected', 'user', p_user_id::text,
    jsonb_build_object('age_band', v_before_band, 'had_date_of_birth', v_before_dob IS NOT NULL),
    jsonb_build_object('age_band', v_after_band),
    jsonb_build_object('reason', trim(p_reason))
  );

  RETURN 'corrected';
END;
$$;

-- service_role ONLY. Not `authenticated`, and emphatically not `anon`: this is
-- the one function in this file that can write a date of birth for somebody
-- other than the caller, so no PostgREST client role may execute it. ADR-019
-- form — revoke from PUBLIC and both client roles by name, then grant back.
REVOKE ALL ON FUNCTION public.admin_set_user_date_of_birth(UUID, DATE, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_date_of_birth(UUID, DATE, UUID, TEXT, TEXT, TEXT)
  TO service_role;

-- ============================================================================
-- VERIFY (read-only, after apply)
--
--   -- 1. anon and authenticated hold NO table privilege; service_role does.
--   SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
--     FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND table_name='user_demographics'
--    GROUP BY grantee ORDER BY grantee;
--   -- Expect: service_role only.
--
--   -- 2. The three sensitive columns are readable by no client role.
--   SELECT has_column_privilege('authenticated','public.user_demographics','date_of_birth','SELECT') AS dob_read,
--          has_column_privilege('authenticated','public.user_demographics','date_of_birth','UPDATE') AS dob_write,
--          has_column_privilege('authenticated','public.user_demographics','dob_corrections','SELECT') AS cor_read,
--          has_any_column_privilege('anon','public.user_demographics','SELECT')                       AS anon_any;
--   -- Expect: false, false, false, false.
--
--   -- 3. The owner-editable columns ARE readable/writable by authenticated.
--   SELECT column_name, privilege_type
--     FROM information_schema.column_privileges
--    WHERE table_schema='public' AND table_name='user_demographics' AND grantee='authenticated'
--    ORDER BY column_name, privilege_type;
--   -- Expect: no row mentioning date_of_birth, age_declared_at or dob_corrections.
--
--   -- 4. RLS on, three own-row policies, no DELETE policy.
--   SELECT (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_demographics'::regclass) AS rls,
--          policyname, cmd, roles::text, qual, with_check
--     FROM pg_policies WHERE schemaname='public' AND tablename='user_demographics' ORDER BY policyname;
--   -- Expect: rls true; SELECT/INSERT/UPDATE only; roles {authenticated}.
--
--   -- 5. Function ACLs (ADR-019) — anon must not be able to execute either.
--   SELECT p.proname,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
--          p.prosecdef                                               AS security_definer,
--          p.proconfig                                               AS settings
--     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname IN ('user_age_status','set_user_date_of_birth');
--   -- Expect: anon_exec false; auth_exec true; security_definer true; settings {search_path=public}.
--
--   -- 6. Nothing is created or backfilled by this migration.
--   SELECT count(*) AS rows_created FROM public.user_demographics;
--   -- Expect: 0.
--
--   -- 7. `profiles` is unchanged — no demographic column leaked onto it.
--   SELECT count(*) AS leaked FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='profiles'
--      AND column_name IN ('date_of_birth','age','age_band','gender','occupation',
--                          'industry','education_level','dob_corrections');
--   -- Expect: 0.
-- ============================================================================
