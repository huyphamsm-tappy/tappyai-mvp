-- ============================================================================
-- Platform Hardening Phase 0 — close the accidental `anon` reach on
-- SECURITY DEFINER functions.
--
-- Policy: docs/architecture/ADR-019-supabase-grant-model.md
--
-- WHY THIS FILE EXISTS
-- Supabase configures
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
-- so every function created in `public` carries an EXPLICIT grant to `anon` and
-- `authenticated` in addition to PostgreSQL's PUBLIC default. `REVOKE ... FROM
-- PUBLIC` removes only the latter. Measured on production: `pg_default_acl`
-- records `anon=X/postgres  authenticated=X/postgres  service_role=X/postgres`.
--
-- Six functions were measured reachable by `anon` without any migration ever
-- intending it. None of them was granted to `anon` by its own migration; three
-- were granted only to `service_role`, one only to `authenticated`, and two
-- carry no GRANT statement anywhere in the repository.
--
-- SCOPE — exactly six functions. This migration changes WHO MAY CALL them.
-- It does not change what any of them does. No schema, no data, no RLS, no
-- trigger, no application code.
--
-- Canonical form (ADR-019):
--   REVOKE EXECUTE ON FUNCTION <sig> FROM PUBLIC, anon, authenticated;
--   GRANT  EXECUTE ON FUNCTION <sig> TO <only the roles that genuinely call it>;
--
-- `PUBLIC` stays in the revoke list because it is a separate grantee — it is
-- what closes the hole on a plain PostgreSQL instance. Naming it is
-- completeness, not portability: this file REQUIRES the roles `anon`,
-- `authenticated` and `service_role` to exist and raises `42704` otherwise.
-- That is intended; ten migrations in this repository already reference these
-- roles unconditionally and none guards for their existence. A guard that
-- skipped silently would produce a migration that "succeeds" while revoking
-- nothing.
--
-- IDEMPOTENT. Re-running is a no-op: REVOKE on an already-revoked privilege and
-- GRANT of an already-held privilege both do nothing. Safe to re-apply.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Preconditions — fail loudly, never silently
--
-- Four of the six functions are created by migrations whose filenames sort
-- AFTER this one (`add_counter_security_definer.sql`, `add_phase4_hardening.sql`
-- — digits sort before letters). On a fresh environment applied in filename
-- order this file would otherwise run first and fail mid-way with a bare
-- `42883`, half-applied.
--
-- This block turns that into one actionable message naming exactly what is
-- missing. It does NOT skip: a missing target is an error, because a migration
-- that reports success while revoking nothing is the defect this whole phase
-- exists to remove.
-- ---------------------------------------------------------------------------
DO $preconditions$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(sig, ', ' ORDER BY sig) INTO v_missing
  FROM (VALUES
    ('fn_is_platform_owner(UUID)'),
    ('fn_grant_admin_role(UUID, UUID, admin_role, TEXT, TIMESTAMPTZ)'),
    ('fn_revoke_admin_role(UUID, UUID)'),
    ('fn_sync_last_login()'),
    ('get_interaction_avgs(UUID)'),
    ('sync_review_watch_stats(UUID)')
  ) AS t(sig)
  WHERE to_regprocedure('public.' || sig) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Platform Hardening Phase 0: target function(s) do not exist: %. Apply the migrations that create them first (20260713_auth_daily_rollup.sql, 20260803_platform_owner.sql, add_phase4_hardening.sql, add_counter_security_definer.sql).',
      v_missing USING ERRCODE = '42883';
  END IF;
END
$preconditions$;


-- ---------------------------------------------------------------------------
-- 1. P1 — the information oracle
--
-- fn_is_platform_owner(UUID) returns a boolean for ANY user id supplied, so an
-- unauthenticated caller could test whether a given account is the Platform
-- Owner. This is the one function in scope with real value to an attacker.
--
-- Callers, measured: ZERO from application code. Its only callers are inside
-- fn_grant_admin_role and fn_revoke_admin_role, which are SECURITY DEFINER
-- owned by `postgres` — inside them the current user is the owner, so those
-- calls are unaffected by any grant change here.
--
-- Its own migration (20260803_platform_owner.sql:200) granted service_role
-- only. `service_role` is re-granted below to preserve that intent exactly.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION fn_is_platform_owner(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fn_is_platform_owner(UUID) TO service_role;


-- ---------------------------------------------------------------------------
-- 2. P2 — the privileged admin paths
--
-- fn_grant_admin_role / fn_revoke_admin_role enforce the constitutional rules
-- server-side and raise 42501 for a non-Owner actor, so unauthenticated reach
-- was NOT a privilege-escalation path. It was an unauthenticated caller able to
-- reach a privileged code path. That is enough to close.
--
-- Callers, measured:
--   fn_grant_admin_role  → src/app/api/admin/rbac/roles/route.ts:66
--   fn_revoke_admin_role → src/app/api/admin/rbac/roles/[id]/route.ts:42
-- Both use createAdminClient() ⇒ role `service_role`, behind requirePermission
-- and requireOwner. Their own migration granted service_role only
-- (20260803_platform_owner.sql:201-202).
--
-- Component 1 behaviour is unchanged: the internal 42501 checks are untouched.
-- Only reachability narrows.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION fn_grant_admin_role(UUID, UUID, admin_role, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fn_grant_admin_role(UUID, UUID, admin_role, TEXT, TIMESTAMPTZ) TO service_role;

REVOKE EXECUTE ON FUNCTION fn_revoke_admin_role(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fn_revoke_admin_role(UUID, UUID) TO service_role;


-- ---------------------------------------------------------------------------
-- 3. P3 — unauthenticated write and read paths
--
-- fn_sync_last_login()
--   Mutates last_login_at across profiles. NO GRANT statement exists anywhere in
--   the repository — its anon reach came purely from the platform default.
--   Caller, measured: src/app/api/cron/analytics-snapshot/route.ts:60, using
--   createAdminClient() ⇒ `service_role`, behind Bearer ${CRON_SECRET}.
--
-- get_interaction_avgs(UUID)
--   NO GRANT statement anywhere, and ZERO call sites: repo-wide search over
--   every file type found only its defining migration and four documentation
--   references; every .rpc() call in src/ uses a string literal, so there is no
--   dynamic invocation; production reports no dependent function, policy or
--   trigger. It was superseded by sync_review_watch_stats — two documents
--   (docs/FINAL_ARCHITECTURE.md:305, docs/ios/05_DATABASE_CONTRACT.md:146) still
--   claim the interact route calls it; the route calls sync_review_watch_stats
--   and increment_review_view instead.
--   Therefore it is revoked WITHOUT being re-granted to any client role. The
--   function itself is left in place: dropping it is destructive and outside
--   this phase's scope.
--
-- sync_review_watch_stats(UUID)
--   THE ONE FUNCTION IN SCOPE THAT KEEPS `authenticated`.
--   Caller, measured: src/app/api/reviews/[id]/interact/route.ts:54. That route
--   builds its client from the ANON key plus the caller's JWT
--   (src/lib/auth/getRequestUser.ts:25-32) and returns early when there is no
--   user (route.ts:11), so PostgREST executes it as `authenticated`, never as
--   `anon`. Its own migration granted `authenticated` only
--   (add_counter_security_definer.sql:83) — the author's intent was explicit and
--   the platform overrode it. Revoking `anon` restores that intent; revoking
--   `authenticated` would break production.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION fn_sync_last_login() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fn_sync_last_login() TO service_role;

REVOKE EXECUTE ON FUNCTION get_interaction_avgs(UUID) FROM PUBLIC, anon, authenticated;
-- no GRANT: no legitimate caller exists.

REVOKE EXECUTE ON FUNCTION sync_review_watch_stats(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION sync_review_watch_stats(UUID) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. Deliberately NOT in scope — recorded, not changed
--
-- These four functions are reachable by `anon` BY DESIGN. Each was granted to
-- `anon` explicitly by its own migration, so the intent is on the record and
-- this phase does not reverse it. No statement below — they are named here so a
-- future reader can tell "intentionally open" from "accidentally open" without
-- re-deriving it:
--
--   increment_deal_click(UUID)   — 20260724_partner_deals_hardening.sql:76
--                                  GRANT ... TO anon, authenticated
--   music_increment_play(UUID)   — 20260711_music_ugc_combined.sql:37
--                                  GRANT ... TO anon, authenticated
--   music_saved_count(UUID)      — 20260706b_add_music_count_fns.sql:9
--                                  GRANT ... TO anon, authenticated
--   music_followed_count(UUID)   — 20260706b_add_music_count_fns.sql:14
--                                  GRANT ... TO anon, authenticated
--
-- Also NOT touched: the six SECURITY DEFINER TRIGGER functions reachable by
-- `anon` (fn_audit_log_chain, handle_new_user, update_follow_counts,
-- update_review_comment_count, update_review_like_count, update_review_save_count).
-- A direct call to a trigger function raises "trigger functions can only be
-- called as triggers" regardless of privilege, so a REVOKE there is a no-op that
-- would imply a hole existed.
--
-- pg_default_acl is NOT modified. Narrowing it would change every past and
-- future function at once and would close the four intentional functions above.
-- That is a separate decision with its own gate (ADR-019, Alternatives).
-- ---------------------------------------------------------------------------
