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
-- SCOPE — exactly TWO functions: get_interaction_avgs and
-- sync_review_watch_stats. This migration changes WHO MAY CALL them. It does not
-- change what either of them does. No schema, no data, no RLS, no trigger, no
-- application code.
--
-- DEDUPLICATED AFTER THE P0 HOTFIX
-- Six functions were originally in scope. Four of them are now owned by the P0
-- hotfix `fix/platform-owner-revoke-public` (merged to main as 1d33137), which
-- closes them in its own migrations:
--   fn_is_platform_owner, fn_grant_admin_role, fn_revoke_admin_role
--     → supabase/migrations/20260807_platform_owner_revoke_public_execute.sql
--   fn_sync_last_login
--     → supabase/migrations/20260807b_sync_last_login_revoke_public_execute.sql
-- Those four are deliberately NOT touched here: a second REVOKE would be a
-- redundant no-op and would split ownership of one security contract across two
-- migrations. This phase now owns exactly the two functions the hotfix does not.
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
-- Both functions are created by migrations whose filenames sort AFTER this one
-- (`add_counter_security_definer.sql`, `add_phase4_hardening.sql` — digits sort
-- before letters). On a fresh environment applied in filename order this file
-- would otherwise run first and fail mid-way with a bare `42883`, half-applied.
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
    ('get_interaction_avgs(UUID)'),
    ('sync_review_watch_stats(UUID)')
  ) AS t(sig)
  WHERE to_regprocedure('public.' || sig) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Platform Hardening Phase 0: target function(s) do not exist: %. Apply the migrations that create them first (add_phase4_hardening.sql, add_counter_security_definer.sql).',
      v_missing USING ERRCODE = '42883';
  END IF;
END
$preconditions$;


-- ---------------------------------------------------------------------------
-- 1. Unauthenticated read and write paths
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
REVOKE EXECUTE ON FUNCTION get_interaction_avgs(UUID) FROM PUBLIC, anon, authenticated;
-- no GRANT: no legitimate caller exists.

REVOKE EXECUTE ON FUNCTION sync_review_watch_stats(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION sync_review_watch_stats(UUID) TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. Deliberately NOT in scope — recorded, not changed
--
-- (a) Owned by the P0 hotfix (see header), closed in their own migrations and
--     NOT re-closed here:
--       fn_is_platform_owner, fn_grant_admin_role, fn_revoke_admin_role,
--       fn_sync_last_login.
--
-- (b) Reachable by `anon` BY DESIGN. Each was granted to `anon` explicitly by
--     its own migration, so the intent is on the record and this phase does not
--     reverse it. Named here so a future reader can tell "intentionally open"
--     from "accidentally open" without re-deriving it:
--
--       increment_deal_click(UUID)   — 20260724_partner_deals_hardening.sql:76
--                                      GRANT ... TO anon, authenticated
--       music_increment_play(UUID)   — 20260711_music_ugc_combined.sql:37
--                                      GRANT ... TO anon, authenticated
--       music_saved_count(UUID)      — 20260706b_add_music_count_fns.sql:9
--                                      GRANT ... TO anon, authenticated
--       music_followed_count(UUID)   — 20260706b_add_music_count_fns.sql:14
--                                      GRANT ... TO anon, authenticated
--
-- (c) The six SECURITY DEFINER TRIGGER functions reachable by `anon`
--     (fn_audit_log_chain, handle_new_user, update_follow_counts,
--     update_review_comment_count, update_review_like_count,
--     update_review_save_count). A direct call to a trigger function raises
--     "trigger functions can only be called as triggers" regardless of
--     privilege, so a REVOKE there is a no-op that would imply a hole existed.
--
-- (d) pg_default_acl is NOT modified. Narrowing it would change every past and
--     future function at once and would close the four intentional functions in
--     (b). That is a separate decision with its own gate (ADR-019, Alternatives).
-- ---------------------------------------------------------------------------
