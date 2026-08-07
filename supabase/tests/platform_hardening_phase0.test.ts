import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// Platform Hardening Phase 0 — the THREE functions the Platform Owner hotfix
// does NOT touch. The three Component-1 RPCs (fn_is_platform_owner,
// fn_grant_admin_role, fn_revoke_admin_role) are covered permanently by
// platform_owner_revoke.test.ts and are deliberately NOT retested here.
//
// This suite runs the REAL migration chain and the REAL PH-0 migration from
// disk (docs/architecture/ADR-020). Scope contract (LOCKED): every assertion
// stays in the FUNCTION-PERMISSION layer — has_function_privilege() for runtime
// capability, proacl for the ACL. No assertion touches row visibility, RLS,
// JWT claims, session identity, auth.uid() or auth.role(). The auth.uid() stub
// below returns NULL only so the migration chain's RLS policies can be created;
// no assertion here observes its value.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const mig = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')

// The migration under test.
const PH0 = mig('20260807_platform_hardening_phase0.sql')

// Minimal chain measured empirically (ADR-020 Option B′): the smallest real-file
// sequence that creates all six functions PH-0's §0 precondition requires. Order
// is load-bearing; do not reorder.
const CHAIN = [
  '20260713_backoffice_phase0.sql',                       // admin_role enum, admin_roles, audit_log
  '20260713_auth_daily_rollup.sql',                       // fn_sync_last_login
  '20260712_prod_baseline_and_review_saves_indexes.sql',  // review_saves + review RLS
  'add_explore_upgrade.sql',                              // review_interactions
  'add_social_week2.sql',                                 // review_comments, user_follows
  'add_phase4_hardening.sql',                             // get_interaction_avgs
  'add_counter_security_definer.sql',                     // sync_review_watch_stats
  '20260803_platform_owner.sql',                          // the three C1 RPCs
].map(mig)

// Repository-baseline PRELUDE (ADR-020, LOCKED). ONLY objects whose CREATE is
// absent from repository migration history — existence-and-type scaffolds, no
// behaviour. `check_function_bodies = off` lets LANGUAGE sql functions be
// created without resolving body-only table dependencies, so the chain stays
// minimal without rewriting any migration.
const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;

  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- The platform fact F-04 turned on. Without it every privilege assertion is
  -- vacuous (ADR-019 engineering principle). Re-applied every beforeEach because
  -- DROP SCHEMA public CASCADE drops its pg_default_acl entries.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY, last_sign_in_at TIMESTAMPTZ);

  -- auth.uid(): repository-baseline function (ADR-020). Existence-and-type
  -- scaffold ONLY — returns NULL so RLS policies in the chain can be created.
  -- No assertion in this suite observes its value.
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

  -- profiles / reviews: repository-baseline tables. Minimum columns the chain's
  -- migrations read but do not themselves create (ADR-020 SECTION 4).
  CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY, email TEXT, follower_count INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY,
    is_hidden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    like_count INTEGER DEFAULT 0,
    save_count INTEGER DEFAULT 0,
    watch_time_avg DOUBLE PRECISION DEFAULT 0
  );

  SET check_function_bodies = off;
`

const P3 = ['fn_sync_last_login', 'get_interaction_avgs', 'sync_review_watch_stats'] as const
const PORT = 54345

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

/** EXECUTE capability for one role on one public function. Function-permission layer only. */
async function canExecute(role: string, fn: string): Promise<boolean> {
  const r = await db.query(
    `SELECT has_function_privilege($1, p.oid, 'EXECUTE') AS ok
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = $2`,
    [role, fn]
  )
  return r.rows[0]?.ok === true
}

/** The function's ACL as text, or a marker for the built-in default. */
async function acl(fn: string): Promise<string> {
  const r = await db.query(
    `SELECT COALESCE(array_to_string(p.proacl, ' '), '<null: built-in default>') AS acl
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = $1`,
    [fn]
  )
  return r.rows[0]?.acl ?? '<absent>'
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgph0-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('ph0')
  db = pg.getPgClient('ph0')
  await db.connect()
}, 240_000)

afterAll(async () => {
  try { await db?.end() } catch { /* already closed */ }
  try { await pg?.stop() } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

/** Rebuild from the real migration chain before every test. PH-0 is NOT applied here. */
beforeEach(async () => {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE;')
  await db.query(PRELUDE)
  for (const m of CHAIN) await db.query(m)
})

const applyPH0 = () => db.query(PH0)

describe('PH-0 harness — the platform this suite models', () => {
  it('reproduces Supabase default privileges on functions', async () => {
    // Guards the guard (ADR-019). fn_sync_last_login is created by the chain and
    // never granted explicitly, so its ACL proves default privileges were in
    // force at CREATE time. proacl, not has_function_privilege — the latter
    // cannot distinguish an explicit grant from the PUBLIC fallback.
    const a = await acl('fn_sync_last_login')
    expect(a, 'anon default grant materialised').toContain('anon=X')
    expect(a, 'authenticated default grant materialised').toContain('authenticated=X')
  })
})

describe('PH-0 RED — before the migration, all three P3 functions are anon-callable', () => {
  it('anon can execute all three (pre-PH0 default grants)', async () => {
    for (const fn of P3) {
      expect(await canExecute('anon', fn), `anon should reach ${fn} pre-PH0`).toBe(true)
      expect(await canExecute('authenticated', fn), `authenticated should reach ${fn} pre-PH0`).toBe(true)
    }
  })
})

describe('PH-0 GREEN — after the migration', () => {
  beforeEach(applyPH0)

  it('fn_sync_last_login: anon denied, authenticated denied, service_role allowed', async () => {
    expect(await canExecute('anon', 'fn_sync_last_login')).toBe(false)
    expect(await canExecute('authenticated', 'fn_sync_last_login')).toBe(false)
    expect(await canExecute('service_role', 'fn_sync_last_login')).toBe(true)

    const a = await acl('fn_sync_last_login')
    expect(a).not.toContain('anon=X')
    expect(a).not.toContain('authenticated=X')
    expect(a).toContain('service_role=X')
  })

  it('get_interaction_avgs: anon denied, authenticated denied, no replacement client grant', async () => {
    expect(await canExecute('anon', 'get_interaction_avgs')).toBe(false)
    expect(await canExecute('authenticated', 'get_interaction_avgs')).toBe(false)

    // "No replacement grant": PH-0 revokes and adds no GRANT for this function.
    // The ACL therefore carries no anon/authenticated entry; service_role
    // survives only as the un-revoked default-privilege residue, not a PH-0 grant.
    const a = await acl('get_interaction_avgs')
    expect(a).not.toContain('anon=X')
    expect(a).not.toContain('authenticated=X')
  })

  it('sync_review_watch_stats: anon denied, authenticated STILL allowed, service_role unchanged', async () => {
    expect(await canExecute('anon', 'sync_review_watch_stats')).toBe(false)
    expect(await canExecute('authenticated', 'sync_review_watch_stats')).toBe(true)
    expect(await canExecute('service_role', 'sync_review_watch_stats')).toBe(true)

    const a = await acl('sync_review_watch_stats')
    expect(a).not.toContain('anon=X')
    expect(a).toContain('authenticated=X')
    expect(a).toContain('service_role=X')
  })

  it('is idempotent — re-applying PH-0 changes nothing', async () => {
    await applyPH0()
    expect(await canExecute('anon', 'fn_sync_last_login')).toBe(false)
    expect(await canExecute('authenticated', 'sync_review_watch_stats')).toBe(true)
    expect(await canExecute('service_role', 'get_interaction_avgs')).toBe(true)
  })
})
