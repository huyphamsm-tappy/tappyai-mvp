-- ============================================================================
-- Controller V2 — Component 11: Session Security
--
-- Contract: docs/controller-v2/11_COMPONENT11_SESSION_SECURITY_CONTRACT.md
-- Coupling: docs/architecture/ADR-021-c11-auth-sessions-dependency.md
-- Grants:   docs/architecture/ADR-019-supabase-grant-model.md
--
-- C11 governs GoTrue sessions. It does not create them, refresh them or expire
-- them — Supabase Auth owns all of that. This file ships four functions and no
-- table: the sessions already exist, in `auth.sessions`, and a mirror of them
-- would be wrong the moment a session is created outside the app's knowledge.
--
-- ── WHAT REVOCATION ACTUALLY IS (measured 2026-08-14) ───────────────────────
-- GoTrue has no `revoked` column. Revoking a session DELETES its row, and the
-- access token bound to it stops working immediately — measured against
-- staging: `getUser` returned 403 `session_not_found` with 3597 of 3600 seconds
-- of token life remaining.
--
-- So the contract's three states map onto storage like this:
--
--   active   row exists, and not_after is NULL or in the future
--   expired  row exists, and not_after <= now()
--   revoked  THE ROW IS GONE
--
-- Terminality therefore needs no predicate to enforce it: a deleted row cannot
-- transition anywhere, and re-authentication creates a new session with a new
-- id. Idempotency falls out the same way — revoking twice deletes 0 rows the
-- second time.
--
-- ── WHY THESE FUNCTIONS EXIST AT ALL ────────────────────────────────────────
-- Measured: `anon`, `authenticated` and `service_role` all have USAGE on the
-- `auth` schema but NONE of them can SELECT `auth.sessions`. A SECURITY DEFINER
-- function owned by the schema owner is therefore the only path, and it is a
-- narrow one: each function names its columns explicitly, so a Supabase upgrade
-- that drops or renames one raises 42703 instead of quietly returning nothing.
--
-- Additive and idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. SCHEMA ASSUMPTION GUARD — fail loudly, at apply time
--
-- ADR-021's central risk: `auth.sessions` belongs to GoTrue, not to us. If an
-- upgrade changes it, C11 must break in a way somebody notices. This block is
-- the first line of that — applying this migration against a schema that no
-- longer carries the columns C11 reads stops here, with the missing column
-- named, rather than shipping functions that silently return empty inventories.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  required TEXT[] := ARRAY['id','user_id','created_at','refreshed_at','not_after','aal','user_agent'];
  missing  TEXT[];
BEGIN
  SELECT array_agg(c)
    INTO missing
    FROM unnest(required) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'sessions' AND column_name = c
   );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'C11: auth.sessions is missing expected column(s): %. Supabase Auth changed its schema; see ADR-021 before proceeding.', array_to_string(missing, ', ')
      USING ERRCODE = '42703';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'is_anonymous'
  ) THEN
    RAISE EXCEPTION 'C11: auth.users.is_anonymous is absent; the anonymous exclusion (P-4) cannot be enforced.'
      USING ERRCODE = '42703';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------
-- 1. fn_session_inventory — the read surface
--
-- Projects EXACTLY the eight fields the contract §16 froze. The columns it
-- deliberately never touches are the reason the projection is explicit:
--
--   refresh_token_hmac_key   credential material
--   refresh_token_counter    credential material
--   ip                       personal data, withheld by P-6
--   user_agent               read ONLY to derive a coarse class, never returned
--   tag, scopes, factor_id, oauth_client_id, updated_at   not in the contract
--
-- `refreshed_at` is `timestamp WITHOUT time zone` in GoTrue while every other
-- timestamp here carries one. It is stamped in UTC, so it is converted rather
-- than reinterpreted — omitting the conversion would shift it by the server's
-- offset and quietly misreport "last activity".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_session_inventory(
  p_user_id UUID,
  p_limit   INTEGER DEFAULT 20,
  p_before  TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  id                UUID,
  user_id           UUID,
  state             TEXT,
  created_at        TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  aal               TEXT,
  client_class      TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $inventory$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.user_id,
    CASE WHEN s.not_after IS NOT NULL AND s.not_after <= now() THEN 'expired' ELSE 'active' END,
    s.created_at,
    (s.refreshed_at AT TIME ZONE 'UTC'),
    s.not_after,
    s.aal::TEXT,
    -- Coarsened platform class. The raw user agent never leaves this function;
    -- what comes out is one of three constants. P-6 permits a platform class
    -- where it is already available, and forbids the string it is derived from.
    CASE
      WHEN s.user_agent IS NULL THEN 'unknown'
      WHEN s.user_agent ILIKE '%okhttp%'
        OR s.user_agent ILIKE '%CFNetwork%'
        OR s.user_agent ILIKE '%Darwin%'
        OR s.user_agent ILIKE '%Dart%' THEN 'native'
      WHEN s.user_agent ILIKE '%Mozilla%' THEN 'web'
      ELSE 'unknown'
    END
  FROM auth.sessions s
  JOIN auth.users u ON u.id = s.user_id
  WHERE s.user_id = p_user_id
    AND u.is_anonymous = false                       -- P-4
    AND (p_before IS NULL OR s.created_at < p_before) -- cursor
  ORDER BY s.created_at DESC
  LIMIT GREATEST(LEAST(p_limit, 50), 0);             -- contract §7 caps at 50
END
$inventory$;

-- ---------------------------------------------------------------------------
-- 2. fn_session_subject — who owns this session?
--
-- Exists so the ROUTE can run its own Owner-target check before asking for a
-- mutation, which is what "protection in both the handler and the function"
-- (contract §5.1.1) requires. Returns NULL for an unknown session and for an
-- anonymous subject, so neither can be probed through it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_session_subject(p_session_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $subject$
  SELECT s.user_id
    FROM auth.sessions s
    JOIN auth.users u ON u.id = s.user_id
   WHERE s.id = p_session_id
     AND u.is_anonymous = false;
$subject$;

-- ---------------------------------------------------------------------------
-- 3. fn_session_revoke — end ONE session
--
-- Returns the count and a reason, so the route can answer 403 for an Owner
-- target and 404 for an unknown session without a second round trip and
-- without a caller being able to distinguish them by timing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_session_revoke(p_session_id UUID)
RETURNS TABLE(revoked INTEGER, reason TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $revoke$
DECLARE
  v_subject UUID;
  v_anon    BOOLEAN;
  v_count   INTEGER;
BEGIN
  SELECT s.user_id, u.is_anonymous
    INTO v_subject, v_anon
    FROM auth.sessions s
    JOIN auth.users u ON u.id = s.user_id
   WHERE s.id = p_session_id;

  IF v_subject IS NULL THEN
    RETURN QUERY SELECT 0, 'not_found'; RETURN;
  END IF;

  -- P-4: anonymous sessions are outside C11 v1 entirely. Reported as not_found
  -- so the surface cannot be used to enumerate anonymous identities.
  IF v_anon THEN
    RETURN QUERY SELECT 0, 'not_found'; RETURN;
  END IF;

  -- P-2: the Ultimate Owner can never be the target. Enforced here as well as
  -- in the handler, because the database is the authority and a future caller
  -- must not be able to route around the application check.
  IF fn_is_platform_owner(v_subject) THEN
    RETURN QUERY SELECT 0, 'owner_protected'; RETURN;
  END IF;

  DELETE FROM auth.sessions WHERE id = p_session_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, 'ok';
END
$revoke$;

-- ---------------------------------------------------------------------------
-- 4. fn_session_revoke_all — forced logout
--
-- ONE statement. Its effect set is that statement's READ COMMITTED snapshot,
-- which is the whole of P-1's snapshot boundary: a session that becomes visible
-- after the DELETE begins is not matched, so a login racing a forced logout
-- survives and this never becomes an account lock.
--
-- There is deliberately no second pass and no application-tier
-- select-then-revoke. Two statements would leave a window in which a concurrent
-- login is either wrongly killed or wrongly spared, depending on timing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_session_revoke_all(p_user_id UUID)
RETURNS TABLE(revoked INTEGER, reason TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $revoke_all$
DECLARE
  v_anon  BOOLEAN;
  v_count INTEGER;
BEGIN
  SELECT u.is_anonymous INTO v_anon FROM auth.users u WHERE u.id = p_user_id;

  IF v_anon IS NULL OR v_anon THEN
    RETURN QUERY SELECT 0, 'not_found'; RETURN;
  END IF;

  IF fn_is_platform_owner(p_user_id) THEN
    RETURN QUERY SELECT 0, 'owner_protected'; RETURN;
  END IF;

  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, 'ok';
END
$revoke_all$;

-- ---------------------------------------------------------------------------
-- 5. Grants — ADR-019
--
-- The four functions are the app tier's only path to `auth.sessions`, so
-- service_role needs EXECUTE. anon and authenticated must not: an end user
-- reaching fn_session_subject would gain a session-existence oracle, and
-- reaching either revoke function would gain the ability to log other people
-- out. Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on new functions to
-- all three, so silence here would leave exactly that open.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION fn_session_inventory(UUID, INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fn_session_inventory(UUID, INTEGER, TIMESTAMPTZ) TO service_role;

REVOKE EXECUTE ON FUNCTION fn_session_subject(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fn_session_subject(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION fn_session_revoke(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fn_session_revoke(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION fn_session_revoke_all(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fn_session_revoke_all(UUID) TO service_role;
