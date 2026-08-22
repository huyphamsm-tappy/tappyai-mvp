-- ============================================================================
-- K-2 — the Configuration Provider's runtime tier: `platform_settings`
--
-- AUTHORIZATION: Owner Decision D1b, 2026-08-22
--   (docs/controller-v2/OWNER_DECISIONS_2026-08-22.md). No previous migration
--   authorization covers this table; this one names it explicitly. Applied
--   under the ADR-017 pattern: preflight -> explicit authorization -> apply
--   frozen migration -> verify -> rollback window.
--
-- CONTRACT
--   01_CONTROLLER_V2_ARCHITECTURE.md §4.1   the five columns below, verbatim
--   FOUNDATION_01_CONTRACTS.md §7           precedence: runtime > flags > env
--                                           > build-time defaults
--
-- ---------------------------------------------------------------------------
-- WHY THIS TABLE'S SCHEMA AUTHORITY IS §4.1 AND NOT `04`
--
-- ERRATA-005 declares `docs/backoffice/04_Database_Architecture.md` the single
-- authoritative schema source, and `04` does not mention this table at all
-- (measured: zero occurrences). `04` governs the BACK OFFICE's twenty modules;
-- this is a Controller-core table, which is why it appears in the Controller's
-- own architecture instead. Decision D1b resolved that gap rather than letting
-- this workstream pick a schema. It also refused the same treatment for
-- `module_registry`, which is superseded by the shipped registry-in-code under
-- Decision B15 - so exactly one of the two §4.1 tables is created here.
--
-- ---------------------------------------------------------------------------
-- EXACTLY FIVE COLUMNS, AND `updated_at` IS DELIBERATELY ABSENT
--
-- Every other table in this schema carries created_at/updated_at, and the
-- reflex to add one here is strong. §4.1 names five columns. The whole reason
-- D1b was needed is that nobody had authority to write this schema; inventing
-- a sixth column would be this workstream doing precisely that, one column at
-- a time. The absence is recorded here so a later reader sees a decision
-- rather than an oversight - and a test asserts the column set so adding one
-- later has to be deliberate.
--
-- ---------------------------------------------------------------------------
-- THE RISK THIS TABLE CARRIES, STATED PLAINLY
--
-- The runtime tier OUTRANKS the environment (§7). So a row here can override a
-- value an operator set in Vercel, including a key a module declared as a
-- security key - §7 bars USER/ROLE PREFERENCE from overriding those, and a DB
-- settings store is not preference. That is the contract's ordering, not an
-- accident, and it is why the access boundary below is service_role only. A
-- writable-by-anon settings table would be an authorization bypass, not merely
-- a data leak.
--
-- IDEMPOTENT: safe to run repeatedly.
-- ROLLBACK:   supabase/migrations/rollback/20260822_k2_platform_settings_rollback.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key             TEXT PRIMARY KEY,
  value           JSONB NOT NULL,
  scope           TEXT NOT NULL DEFAULT 'global',
  value_schema    TEXT,
  -- NO cascade: deleting the administrator who last changed a setting must not
  -- delete the setting. The same reasoning as `user_notes.author_id`.
  updated_by      UUID REFERENCES public.profiles(id),
  CONSTRAINT platform_settings_scope_check CHECK (scope IN ('global', 'hub', 'module'))
);

-- The loader reads global-scope rows on every Controller boot. Hub- and
-- module-scoped rows are stored but deliberately not loaded into the flat
-- Controller key space - see `snapshotFromRows`.
CREATE INDEX IF NOT EXISTS idx_platform_settings_scope ON public.platform_settings(scope);

-- ---------------------------------------------------------------------------
-- The access boundary (ADR-019).
--
-- A new table here is BORN fully open: `pg_default_acl` grants anon and
-- authenticated everything. For most tables that is a read leak. For this one
-- it is worse: an anonymous INSERT could set a key that outranks the
-- environment on the next Controller boot.
--
-- `service_role` keeps access: it is the API tier's identity, and the
-- Controller reaches this table through the admin client.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.platform_settings FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
-- Zero policies, deliberately (04 §8): with RLS on, a missing policy is a
-- denial, and `service_role` reaches the table by BYPASSRLS rather than policy.

-- ============================================================================
-- VERIFICATION (run after apply; read-only)
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name='platform_settings';                  -- service_role only
--   SELECT relrowsecurity FROM pg_class
--    WHERE oid='public.platform_settings'::regclass;         -- t
--   SELECT count(*) FROM pg_policies WHERE tablename='platform_settings';  -- 0
--   SELECT count(*) FROM public.platform_settings;                          -- 0
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='platform_settings' ORDER BY 1;
--     -- key, scope, updated_by, value, value_schema  (five, no updated_at)
--
--   -- credential-free existence probe: PGRST205 -> 42501
-- ============================================================================
