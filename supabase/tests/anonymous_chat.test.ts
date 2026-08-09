import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// Anonymous Chat V1 — quota RPC + anon→account carry-over, against a REAL
// PostgreSQL running the ACTUAL .sql files from disk, in production order.
//
// WHY THE PRELUDE LOOKS LIKE THIS
//
// 1. auth.uid()/auth.jwt() are defined the way Supabase defines them — reading
//    `request.jwt.claims` — NOT as constants. A constant stub cannot express
//    "anonymous session" vs "real account", which is the entire subject here.
//    Tests then SET request.jwt.claims to impersonate a session. This mirrors
//    production semantics rather than inventing an abstraction.
//
// 2. `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated,
//    service_role` is applied, because that is what this Supabase project actually
//    does (measured 2026-08-08: pg_default_acl carries anon=X and authenticated=X
//    for new functions, from both the postgres and supabase_admin grantors).
//    Without it the ACL assertions would be green against a platform on which the
//    defect cannot exist — the F-04 / platform_owner_bootstrap failure mode.
//
// 3. public.conversations is created with the shape and the single RLS policy
//    measured in production:
//      ALL / roles=public / USING (auth.uid() = user_id), no separate WITH CHECK.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const USAGE = readFileSync(join(REPO, 'supabase/migrations/20260711_anon_chat_usage.sql'), 'utf8')
const USAGE_ACL = readFileSync(
  join(REPO, 'supabase/migrations/20260808_anon_chat_usage_acl_hardening.sql'), 'utf8')
const CLAIM = readFileSync(
  join(REPO, 'supabase/migrations/20260808b_anon_claim_conversations.sql'), 'utf8')

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;

  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  -- Supabase's own definitions, not stubs: identity comes from the request's JWT claims.
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $fn$;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
    SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
  $fn$;
  GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;

  CREATE TABLE public.conversations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL,
    title      TEXT,
    category   TEXT,
    messages   JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users can manage own conversations" ON public.conversations
    FOR ALL TO public USING (auth.uid() = user_id);
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO anon, authenticated, service_role;
`

const ANON_A = '11111111-1111-1111-1111-111111111111'
const ANON_B = '22222222-2222-2222-2222-222222222222'
const ACCOUNT = '33333333-3333-3333-3333-333333333333'
const ANON_DAILY_LIMIT = 5 // mirrors src/lib/config/product.ts
const PORT = 54339

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

/** Impersonate a session: anonymous, real account, or none.
 *  is_local MUST be false — each db.query() is its own implicit transaction, so a
 *  transaction-scoped setting would vanish before the next statement ran. */
async function asSession(uid: string | null, isAnonymous: boolean) {
  if (uid === null) {
    await db.query(`SELECT set_config('request.jwt.claims', '', false)`)
    return
  }
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: uid, role: 'authenticated', is_anonymous: isAnonymous })])
}

/** Runs `sql` as `role`, returning the PostgreSQL error code or null on success. */
async function asRole(role: string, sql: string): Promise<string | null> {
  try {
    await db.query(`SET ROLE ${role}`)
    await db.query(sql)
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  } finally {
    await db.query('RESET ROLE')
  }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pganon-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--locale=C'],
  })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
})

beforeEach(async () => {
  // A test whose statement threw mid-`SET ROLE` would otherwise leak that role into this
  // setup, which then fails with "must be owner of schema auth" and masks the real failure.
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(USAGE)
  await db.query(USAGE_ACL)
  await db.query(CLAIM)
  await asSession(null, false)
})

// ═══════════════ A. anonymous chat quota ═══════════════

describe('A. anon_chat_usage_increment', () => {
  it('rejects a request with no session (auth.uid() IS NULL)', async () => {
    await asSession(null, false)
    await expect(db.query('SELECT public.anon_chat_usage_increment()')).rejects.toThrow(/not authenticated/i)
  })

  it('rejects a real (non-anonymous) account', async () => {
    await asSession(ACCOUNT, false)
    await expect(db.query('SELECT public.anon_chat_usage_increment()')).rejects.toThrow(/not an anonymous session/i)
  })

  it('accepts an anonymous session and starts at 1', async () => {
    await asSession(ANON_A, true)
    const { rows } = await db.query('SELECT public.anon_chat_usage_increment() AS n')
    expect(rows[0].n).toBe(1)
  })

  it('allows exactly 5 and blocks the 6th (product rule: count > ANON_DAILY_LIMIT)', async () => {
    await asSession(ANON_A, true)
    const counts: number[] = []
    for (let i = 0; i < 6; i++) {
      const { rows } = await db.query('SELECT public.anon_chat_usage_increment() AS n')
      counts.push(rows[0].n)
    }
    expect(counts).toEqual([1, 2, 3, 4, 5, 6])
    expect(counts.filter(n => n <= ANON_DAILY_LIMIT)).toHaveLength(5) // 5 served
    expect(counts[5] > ANON_DAILY_LIMIT).toBe(true)                   // 6th refused
  })

  it('counts per identity — one anonymous user cannot spend another\'s quota', async () => {
    await asSession(ANON_A, true)
    await db.query('SELECT public.anon_chat_usage_increment()')
    await db.query('SELECT public.anon_chat_usage_increment()')
    await asSession(ANON_B, true)
    const { rows } = await db.query('SELECT public.anon_chat_usage_increment() AS n')
    expect(rows[0].n).toBe(1)
  })

  it('increments atomically — no lost update under repeated concurrent-style writes', async () => {
    // ON CONFLICT DO UPDATE takes a row lock, so interleaved callers serialise. Fire many
    // increments and assert none were lost, which a read-modify-write would fail.
    await asSession(ANON_A, true)
    await Promise.all(Array.from({ length: 25 }, () => db.query('SELECT public.anon_chat_usage_increment()')))
    await db.query('RESET ROLE')
    const { rows } = await db.query('SELECT count FROM public.anon_chat_usage WHERE user_id = $1', [ANON_A])
    expect(rows[0].count).toBe(25)
  })

  it('the usage table itself is unreachable — RLS on, no policies', async () => {
    await asSession(ANON_A, true)
    await db.query('SELECT public.anon_chat_usage_increment()')
    // service_role has the table grant but RLS still filters; anon/authenticated get nothing.
    expect(await asRole('authenticated', 'SELECT * FROM public.anon_chat_usage')).not.toBeNull()
  })

  it('ACL: anon is denied, authenticated is allowed', async () => {
    expect(await asRole('anon', 'SELECT public.anon_chat_usage_increment()')).toBe('42501')
    // authenticated passes the grant and fails on the function's own guard instead.
    expect(await asRole('authenticated', 'SELECT public.anon_chat_usage_increment()')).not.toBe('42501')
  })

  it('ACL: no anon/PUBLIC grant survives the corrective migration', async () => {
    const { rows } = await db.query(`
      SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS grantee
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE n.nspname='public' AND p.proname='anon_chat_usage_increment'
        AND a.privilege_type='EXECUTE'
        AND (a.grantee = 0 OR a.grantee::regrole::text = 'anon')`)
    expect(rows).toEqual([])
  })
})

// ═══════════════ B. anon → account carry-over ═══════════════

describe('B. fn_claim_anonymous_conversations', () => {
  beforeEach(async () => {
    await db.query(
      `INSERT INTO public.conversations (user_id, title) VALUES ($1,'a1'), ($1,'a2'), ($2,'other'), ($3,'mine')`,
      [ANON_A, ANON_B, ACCOUNT])
  })

  it('anon cannot execute it', async () => {
    expect(await asRole('anon',
      `SELECT public.fn_claim_anonymous_conversations('${ANON_A}','${ACCOUNT}')`)).toBe('42501')
  })

  it('authenticated cannot execute it — a signed-in user must go through the route', async () => {
    expect(await asRole('authenticated',
      `SELECT public.fn_claim_anonymous_conversations('${ANON_A}','${ACCOUNT}')`)).toBe('42501')
  })

  it('service_role can execute it and moves exactly the anonymous user\'s rows', async () => {
    await db.query('SET ROLE service_role')
    const { rows } = await db.query(
      `SELECT public.fn_claim_anonymous_conversations($1,$2) AS moved`, [ANON_A, ACCOUNT])
    await db.query('RESET ROLE')
    expect(rows[0].moved).toBe(2)

    const owned = await db.query('SELECT title FROM public.conversations WHERE user_id=$1 ORDER BY title', [ACCOUNT])
    expect(owned.rows.map(r => r.title)).toEqual(['a1', 'a2', 'mine'])
  })

  it('leaves other anonymous users untouched', async () => {
    await db.query('SET ROLE service_role')
    await db.query(`SELECT public.fn_claim_anonymous_conversations($1,$2)`, [ANON_A, ACCOUNT])
    await db.query('RESET ROLE')
    const { rows } = await db.query('SELECT count(*)::int AS n FROM public.conversations WHERE user_id=$1', [ANON_B])
    expect(rows[0].n).toBe(1)
  })

  it('is idempotent — a second claim moves 0 rows and duplicates nothing', async () => {
    await db.query('SET ROLE service_role')
    const first = await db.query(`SELECT public.fn_claim_anonymous_conversations($1,$2) AS m`, [ANON_A, ACCOUNT])
    const second = await db.query(`SELECT public.fn_claim_anonymous_conversations($1,$2) AS m`, [ANON_A, ACCOUNT])
    await db.query('RESET ROLE')
    expect(first.rows[0].m).toBe(2)
    expect(second.rows[0].m).toBe(0)
    const total = await db.query('SELECT count(*)::int AS n FROM public.conversations')
    expect(total.rows[0].n).toBe(4) // rows MOVED, never copied
  })

  it('rejects a self-claim', async () => {
    await db.query('SET ROLE service_role')
    await expect(db.query(`SELECT public.fn_claim_anonymous_conversations($1,$1)`, [ANON_A]))
      .rejects.toThrow(/INVALID_CLAIM/)
    await db.query('RESET ROLE')
  })

  it('rejects null ids', async () => {
    await db.query('SET ROLE service_role')
    await expect(db.query(`SELECT public.fn_claim_anonymous_conversations(NULL,$1)`, [ACCOUNT]))
      .rejects.toThrow(/INVALID_CLAIM/)
    await db.query('RESET ROLE')
  })

  it('RLS stays intact after the move: the account sees them, the anonymous id does not', async () => {
    await db.query('SET ROLE service_role')
    await db.query(`SELECT public.fn_claim_anonymous_conversations($1,$2)`, [ANON_A, ACCOUNT])
    await db.query('RESET ROLE')

    await asSession(ACCOUNT, false)
    await db.query('SET ROLE authenticated')
    const mine = await db.query('SELECT count(*)::int AS n FROM public.conversations')
    await db.query('RESET ROLE')
    expect(mine.rows[0].n).toBe(3)

    await asSession(ANON_A, true)
    await db.query('SET ROLE authenticated')
    const stale = await db.query('SELECT count(*)::int AS n FROM public.conversations')
    await db.query('RESET ROLE')
    expect(stale.rows[0].n).toBe(0)
  })

  it('a client cannot re-point ownership itself — the RLS policy forbids it', async () => {
    // This is why the privileged function exists at all: with no separate WITH CHECK the
    // policy reuses USING to check the NEW row, so re-pointing user_id at another uid is
    // rejected outright rather than silently ignored.
    await asSession(ANON_A, true)
    const code = await asRole('authenticated',
      `UPDATE public.conversations SET user_id='${ACCOUNT}' WHERE user_id='${ANON_A}'`)
    expect(code).toBe('42501') // new row violates row-level security policy

    const { rows } = await db.query('SELECT count(*)::int AS n FROM public.conversations WHERE user_id=$1', [ANON_A])
    expect(rows[0].n).toBe(2) // untouched
  })

  it('ACL: only service_role (and the owner) hold EXECUTE', async () => {
    const { rows } = await db.query(`
      SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS grantee
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE n.nspname='public' AND p.proname='fn_claim_anonymous_conversations'
        AND a.privilege_type='EXECUTE'
        AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon','authenticated'))`)
    expect(rows).toEqual([])
  })
})
