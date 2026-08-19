-- ============================================================================
-- Controller V2 — Phase 2 / Module 08 User Management
-- `public.account_status` — privileged account-state, isolated from `profiles`
--
-- GATE: applied to production ONLY under explicit Owner authorization, as its
--       own change with its own preflight, verification and rollback window
--       (ADR-017 pattern). Nothing here runs as part of a batch.
--
-- AUTHORITY
--   Owner authorization 2026-08-19 — "Module 08 Candidate C". The four
--   account-status fields MUST LEAVE `public.profiles`. This is an authorized
--   deviation from `docs/backoffice/04_Database_Architecture.md` §7, which
--   places them on `profiles`; the deviation and its reasoning are recorded in
--   ADR-022. The FIELDS are unchanged — same four names, same types, same state
--   machine (`10_User_Management.md` §4). Only their location changes.
--
--   `profiles` remains CONSUMER-APP-OWNED and is NOT touched by this migration.
--
-- WHY THE FIELDS CANNOT LIVE ON `profiles` (measured on production, 2026-08-19)
--   `profiles` carries two permissive SELECT policies with `qual = true` for the
--   `{public}` role, and table grants giving `anon` and `authenticated`
--   SELECT/INSERT/UPDATE/DELETE. RLS filters ROWS, never COLUMNS. Therefore any
--   column placed on `profiles` is:
--     * readable by the anonymous internet — an anon-key GET returned all 21
--       rows (`content-range: 0-2/21`); `ban_reason` would be world-readable;
--     * writable by its own subject — a suspended user could PATCH their own row
--       and clear `is_suspended`, which inverts the requirement that suspension
--       be real enforcement rather than an admin-only flag.
--   Column-level privileges cannot repair this in place: a column-level REVOKE
--   against an existing TABLE-level grant is silently inert (measured on
--   PostgreSQL 17.5 — the ACL does not change and no warning is raised), and the
--   working form denies `SELECT *`, which 11 consumer call sites rely on.
--   `add_billing_customers_isolation.sql` reached the same conclusion for
--   `stripe_customer_id`, and `add_profiles_email_isolation.sql` for `email`.
--   This migration follows that established pattern.
--
-- SILENCE IS NOT "CLOSED" (ADR-019, extended to tables)
--   Production `pg_default_acl` for tables in schema `public` reads
--     anon=arwdDxtm/postgres  authenticated=arwdDxtm/postgres
--   so a newly created table is born with FULL privileges for `anon` and
--   `authenticated`. The REVOKE in section 2 is therefore mandatory, not
--   defensive tidiness: without it this table would reproduce, exactly, the
--   defect it exists to avoid.
--
-- ROLLBACK
--   supabase/migrations/rollback/20260819_m08_account_status_rollback.sql
--
-- SAFETY
--   Purely additive. Creates one table; alters no existing object. No backfill:
--   an ABSENT ROW MEANS ACTIVE, so all existing users remain active and no
--   signup trigger is introduced. Consumer enforcement must therefore LEFT JOIN
--   and COALESCE the booleans to false.
--
--   A ban does NOT revoke sessions by virtue of this column. Session revocation
--   is an Auth Admin API operation performed by the admin surface; the column
--   records state, it does not enforce it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The table.
--    `user_id` is both primary key and foreign key: at most one status row per
--    user, removed with the profile. This does not transfer ownership of
--    `profiles` — Module 08 is an administrative facade over consumer-owned data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_status (
  user_id         UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_suspended    BOOLEAN     NOT NULL DEFAULT false,
  suspended_until TIMESTAMPTZ,
  is_banned       BOOLEAN     NOT NULL DEFAULT false,
  ban_reason      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Close it. THIS MUST FOLLOW THE CREATE IMMEDIATELY.
--    Every migration in this repository must be correct when applied section by
--    section (ADR-019, Migration policy) — production SQL is applied by hand, so
--    "the migration is atomic" is not a guarantee the deployment method grants.
--    Between section 1 and section 2 the table is open; keep them adjacent.
--
--    `service_role` is deliberately NOT revoked: it is the administrative write
--    path (`19_Security.md` §4 Layer 3) and it carries BYPASSRLS. Its grant is
--    also stated explicitly rather than inherited, so this file remains correct
--    if the platform defaults ever change.
--
--    PUBLIC is named for completeness. On tables PostgreSQL grants PUBLIC
--    nothing by default, so this is a statement of intent, not a fix.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.account_status FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE public.account_status TO service_role;

ALTER TABLE public.account_status ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Authenticated self-read — four columns, never `ban_reason`.
--
--    This is a column-list GRANT on a table that holds no table-level grant for
--    `authenticated`. That is the form that works. (The inverse — revoking one
--    column out of a table-level grant — does nothing at all.)
--
--    `ban_reason` is an internal moderation note. It is withheld from `anon` and
--    from `authenticated`, including from the subject of the note, and is
--    reachable only through the service-role admin surface. Its `33` §3 data
--    classification remains an open Owner decision; it does not block this
--    migration precisely because the field is exposed to no PostgREST role.
--
--    Granting the four non-sensitive columns is what lets consumer enforcement
--    keep using the existing user-scoped Supabase client, rather than moving
--    post/comment/chat onto service_role.
--
--    Consequence, stated rather than discovered later: `SELECT *` on this table
--    is denied for `authenticated`, because `*` expands to `ban_reason`. Readers
--    must name their columns.
-- ---------------------------------------------------------------------------
GRANT SELECT (user_id, is_suspended, suspended_until, is_banned)
  ON public.account_status TO authenticated;

-- Own row only. No INSERT, UPDATE or DELETE policy exists, and none should:
-- with RLS enabled a missing policy is a denial, and `service_role` reaches the
-- table by BYPASSRLS rather than by policy. This is what makes suspension
-- un-clearable by its subject.
DROP POLICY IF EXISTS account_status_select_own ON public.account_status;
CREATE POLICY account_status_select_own ON public.account_status
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Expiry support.
--    `10_User_Management.md` §4: "Cron job: auto-unsuspend when suspended_until
--    passes". This index serves that lookup and nothing else; the job itself is
--    not created here and no cron architecture is invented by this migration.
--    Partial, because the rows that matter are a small minority.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_account_status_suspended_until
  ON public.account_status (suspended_until)
  WHERE is_suspended AND suspended_until IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Timestamps. Reuses the existing `public.set_updated_at()` already used by
--    `profiles` (trigger `profiles_set_updated_at`). No new function.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS account_status_set_updated_at ON public.account_status;
CREATE TRIGGER account_status_set_updated_at
  BEFORE UPDATE ON public.account_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- VERIFY (read-only, after apply)
--
--   -- 1. anon and authenticated hold no table privilege; service_role does.
--   SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
--     FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND table_name='account_status'
--    GROUP BY grantee ORDER BY grantee;
--   -- Expect: service_role only.
--
--   -- 2. authenticated reads exactly four columns.
--   SELECT column_name, privilege_type
--     FROM information_schema.column_privileges
--    WHERE table_schema='public' AND table_name='account_status' AND grantee='authenticated'
--    ORDER BY column_name;
--   -- Expect: SELECT on user_id, is_suspended, suspended_until, is_banned. No ban_reason.
--
--   -- 3. The catalogue answer, asked directly.
--   SELECT has_column_privilege('authenticated','public.account_status','ban_reason','SELECT') AS reason_readable,
--          has_any_column_privilege('anon','public.account_status','SELECT')                   AS anon_any,
--          has_any_column_privilege('authenticated','public.account_status','UPDATE')          AS auth_can_write;
--   -- Expect: false, false, false.
--
--   -- 4. RLS on, exactly one SELECT policy for authenticated.
--   SELECT (SELECT relrowsecurity FROM pg_class WHERE oid='public.account_status'::regclass) AS rls,
--          policyname, cmd, roles::text, qual
--     FROM pg_policies WHERE schemaname='public' AND tablename='account_status';
--   -- Expect: rls true; one row; cmd SELECT; roles {authenticated}.
--
--   -- 5. FK, index and trigger.
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid='public.account_status'::regclass AND contype='f';
--   SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='account_status';
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.account_status'::regclass AND NOT tgisinternal;
--
--   -- 6. Nobody is suspended or banned by this migration, and nothing is backfilled.
--   SELECT count(*) AS rows_created FROM public.account_status;
--   -- Expect: 0.
--
--   -- 7. `profiles` is unchanged.
--   SELECT count(*) AS leaked FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='profiles'
--      AND column_name IN ('is_suspended','suspended_until','is_banned','ban_reason');
--   -- Expect: 0.
-- ============================================================================
