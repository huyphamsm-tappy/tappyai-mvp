import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// Controller V2 — Component 11 (Session Security): the migration, EXECUTED.
//
// Contract: docs/controller-v2/11_COMPONENT11_SESSION_SECURITY_CONTRACT.md
// Coupling: docs/architecture/ADR-021-c11-auth-sessions-dependency.md
//
// ⚠️ WHAT THIS FILE PROVES, AND WHAT IT CANNOT.
//
// `auth.sessions` is created by GoTrue, not by any migration in this
// repository, so this suite builds a STAND-IN with the shape measured against
// the staging project on 2026-08-14 (ADR-021 records the measurement). That is
// legitimate for testing C11's own logic — projection, filters, Owner
// protection, snapshot semantics, grants — and it is worthless as evidence
// about GoTrue itself, because a stand-in shaped by our own assumptions cannot
// notice those assumptions going stale.
//
// The two are kept apart on purpose:
//
//   this suite ......... C11's behaviour against a real PostgreSQL
//   the diagnostic probe GoTrue's behaviour (O-1 revocation timing, O-2 TTL,
//                        O-3 the real column list)
//
// Drift in the real schema is caught by the migration's own guard block, which
// this suite tests by removing a column and requiring the apply to fail.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260814_c11_session_security.sql'), 'utf8')

// The real definition, sliced out of the real Component 1 migration rather than
// copied. A copy would drift, and "is this the Platform Owner" is exactly the
// question C11 must not answer differently from C1.
const OWNER_SQL = (() => {
  const full = readFileSync(join(REPO, 'supabase/migrations/20260803_platform_owner.sql'), 'utf8')
  const start = full.indexOf('CREATE OR REPLACE FUNCTION fn_is_platform_owner')
  const end = full.indexOf('$$;', start) + 3
  if (start < 0 || end < 3) throw new Error('fn_is_platform_owner not found in the C1 migration')
  return full.slice(start, end)
})()

// auth.sessions as MEASURED on staging, 2026-08-14 — all 15 columns, including
// the ones C11 must never touch. Reproducing the credential columns is the
// point: a projection that leaked one would show up here.
const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;

  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  -- Measured: all three hold USAGE on auth, and none can SELECT auth.sessions.
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='aal_level') THEN
      CREATE TYPE auth.aal_level AS ENUM ('aal1','aal2','aal3');
    END IF;
  END $$;

  CREATE TABLE auth.users (
    id UUID PRIMARY KEY,
    email TEXT,
    is_anonymous BOOLEAN NOT NULL DEFAULT false
  );

  CREATE TABLE auth.sessions (
    id                     UUID PRIMARY KEY,
    user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at             TIMESTAMPTZ,
    updated_at             TIMESTAMPTZ,
    factor_id              UUID,
    aal                    auth.aal_level,
    not_after              TIMESTAMPTZ,
    refreshed_at           TIMESTAMP,            -- WITHOUT time zone, as measured
    user_agent             TEXT,
    ip                     INET,
    tag                    TEXT,
    oauth_client_id        UUID,
    refresh_token_hmac_key TEXT,                 -- credential material
    refresh_token_counter  BIGINT,               -- credential material
    scopes                 TEXT
  );

  CREATE TABLE public.platform_owner (
    user_id UUID PRIMARY KEY,
    active  BOOLEAN NOT NULL DEFAULT true
  );

  -- Control object: created under the same default privileges as C11's
  -- functions and never revoked, so its ACL proves the defaults were in force.
  CREATE FUNCTION public.harness_control_fn() RETURNS INT LANGUAGE sql IMMUTABLE AS $ctl$ SELECT 1 $ctl$;

  ${OWNER_SQL}
`

const PORT = 54352
const FN = ['fn_session_inventory', 'fn_session_subject', 'fn_session_revoke', 'fn_session_revoke_all'] as const

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

const uuid = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`
const ALICE = uuid(1)
const BOB = uuid(2)
const OWNER = uuid(3)
const GHOST = uuid(4)      // anonymous subject
const SESSION = (n: number) => uuid(100 + n)

async function addUser(id: string, opts: { anonymous?: boolean; owner?: boolean } = {}) {
  await db.query(`INSERT INTO auth.users (id, email, is_anonymous) VALUES ($1, $2, $3)`, [
    id, `${id}@example.com`, opts.anonymous ?? false,
  ])
  if (opts.owner) await db.query(`INSERT INTO public.platform_owner (user_id, active) VALUES ($1, true)`, [id])
}

async function addSession(
  id: string,
  userId: string,
  opts: { notAfter?: string | null; createdAt?: string; userAgent?: string | null; refreshedAt?: string } = {}
) {
  await db.query(
    `INSERT INTO auth.sessions
       (id, user_id, created_at, updated_at, aal, not_after, refreshed_at, user_agent, ip,
        tag, refresh_token_hmac_key, refresh_token_counter, scopes)
     VALUES ($1,$2,$3,$3,'aal1',$4,$5,$6,'203.0.113.7','t','SECRET-HMAC-KEY',7,'openid')`,
    [
      id, userId,
      opts.createdAt ?? new Date().toISOString(),
      opts.notAfter === undefined ? null : opts.notAfter,
      opts.refreshedAt ?? '2026-08-14 10:00:00',
      opts.userAgent === undefined ? 'Mozilla/5.0' : opts.userAgent,
    ]
  )
}

const inventory = async (userId: string, limit = 20, before: string | null = null) =>
  (await db.query(`SELECT * FROM fn_session_inventory($1, $2, $3)`, [userId, limit, before])).rows

const revoke = async (sessionId: string) =>
  (await db.query(`SELECT * FROM fn_session_revoke($1)`, [sessionId])).rows[0] as { revoked: number; reason: string }

const revokeAll = async (userId: string) =>
  (await db.query(`SELECT * FROM fn_session_revoke_all($1)`, [userId])).rows[0] as { revoked: number; reason: string }

const sessionIds = async (userId?: string) =>
  (await db.query(
    userId ? `SELECT id FROM auth.sessions WHERE user_id = $1 ORDER BY id` : `SELECT id FROM auth.sessions ORDER BY id`,
    userId ? [userId] : []
  )).rows.map((r) => r.id as string)

/** Attempt an execution AS a role. Returns the SQLSTATE, or null on success. */
async function tryAsRole(role: string, sql: string, params: unknown[] = []): Promise<string | null> {
  await db.query(`SET ROLE ${role}`)
  try {
    await db.query(sql, params)
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'UNKNOWN'
  } finally {
    await db.query('RESET ROLE')
  }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgc11-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('c11')
  db = pg.getPgClient('c11')
  await db.connect()
}, 240_000)

afterAll(async () => {
  try { await db?.end() } catch { /* already closed */ }
  try { await pg?.stop() } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

beforeEach(async () => {
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  // A deliberately non-UTC session timezone. `refreshed_at` is the one naive
  // timestamp in auth.sessions; on a UTC server, dropping the AT TIME ZONE
  // conversion would still produce the right answer and the test guarding it
  // would prove nothing.
  await db.query("SET TIME ZONE 'Asia/Bangkok'")
})

const applyMigration = () => db.query(MIGRATION)

describe('C11 runtime — harness fidelity', () => {
  it('reproduces Supabase default privileges, so every REVOKE below is non-vacuous', async () => {
    await applyMigration()
    const acl = await db.query(
      `SELECT COALESCE(array_to_string(proacl,' '),'<default>') AS acl FROM pg_proc p
         JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='harness_control_fn'`
    )
    expect(acl.rows[0].acl).toContain('anon=X')
  })

  it('carries every column measured on the real auth.sessions', async () => {
    const cols = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='auth' AND table_name='sessions' ORDER BY column_name`
    )
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      'aal', 'created_at', 'factor_id', 'id', 'ip', 'not_after', 'oauth_client_id',
      'refresh_token_counter', 'refresh_token_hmac_key', 'refreshed_at', 'scopes',
      'tag', 'updated_at', 'user_agent', 'user_id',
    ])
  })
})

describe('C11 runtime — the migration', () => {
  it('applies, and is idempotent', async () => {
    await applyMigration()
    await addUser(ALICE)
    await addSession(SESSION(1), ALICE)
    await applyMigration()
    expect(await sessionIds()).toEqual([SESSION(1)])
  })

  it('creates all four functions as SECURITY DEFINER with a pinned search_path', async () => {
    await applyMigration()
    const r = await db.query(
      `SELECT proname, prosecdef, proconfig::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND proname LIKE 'fn_session%' ORDER BY proname`
    )
    expect(r.rows.map((x) => x.proname)).toEqual([...FN].sort())
    for (const row of r.rows) {
      expect(row.prosecdef, `${row.proname} must be SECURITY DEFINER`).toBe(true)
      expect(row.proconfig, `${row.proname} must pin search_path`).toContain('search_path=public, pg_temp')
    }
  })

  it('FAILS LOUDLY when auth.sessions has lost a column C11 reads', async () => {
    // ADR-021's core requirement. A Supabase upgrade that drops a column must
    // stop the apply with the column named, never ship a function that returns
    // an empty inventory.
    await db.query('ALTER TABLE auth.sessions DROP COLUMN user_agent')
    let err: { code?: string; message?: string } = {}
    try { await applyMigration() } catch (e) { err = e as typeof err }
    expect(err.code, 'the guard did not fire').toBe('42703')
    expect(err.message).toContain('user_agent')
    expect(err.message).toContain('ADR-021')
  })

  it('FAILS LOUDLY when auth.users.is_anonymous disappears', async () => {
    await db.query('ALTER TABLE auth.users DROP COLUMN is_anonymous')
    let err: { code?: string; message?: string } = {}
    try { await applyMigration() } catch (e) { err = e as typeof err }
    expect(err.code).toBe('42703')
    expect(err.message).toContain('P-4')
  })
})

describe('C11 runtime — inventory', () => {
  beforeEach(async () => {
    await applyMigration()
    await addUser(ALICE)
    await addUser(BOB)
    await addUser(GHOST, { anonymous: true })
  })

  it('returns EXACTLY the eight contracted fields — no credential ever leaves', async () => {
    await addSession(SESSION(1), ALICE)
    const rows = await inventory(ALICE)
    expect(Object.keys(rows[0]).sort()).toEqual([
      'aal', 'client_class', 'created_at', 'expires_at', 'id', 'last_refreshed_at', 'state', 'user_id',
    ])
    // The row in the table really does carry credential material, so this is a
    // statement about the projection rather than about an empty column.
    const raw = await db.query(`SELECT refresh_token_hmac_key FROM auth.sessions WHERE id=$1`, [SESSION(1)])
    expect(raw.rows[0].refresh_token_hmac_key).toBe('SECRET-HMAC-KEY')
    expect(JSON.stringify(rows)).not.toContain('SECRET-HMAC-KEY')
    expect(JSON.stringify(rows)).not.toContain('203.0.113.7')   // ip
    expect(JSON.stringify(rows)).not.toContain('Mozilla')       // raw user agent
  })

  it('shows another user nothing of yours — cross-user isolation', async () => {
    await addSession(SESSION(1), ALICE)
    await addSession(SESSION(2), BOB)
    expect((await inventory(ALICE)).map((r) => r.id)).toEqual([SESSION(1)])
    expect((await inventory(BOB)).map((r) => r.id)).toEqual([SESSION(2)])
  })

  it('excludes anonymous subjects entirely (P-4)', async () => {
    await addSession(SESSION(3), GHOST)
    expect(await inventory(GHOST)).toEqual([])
    expect(await sessionIds(GHOST), 'the row must still exist — excluded, not deleted').toEqual([SESSION(3)])
  })

  it('reports expired only when not_after has passed', async () => {
    await addSession(SESSION(1), ALICE, { notAfter: '2020-01-01T00:00:00Z' })
    await addSession(SESSION(2), ALICE, { notAfter: '2099-01-01T00:00:00Z' })
    await addSession(SESSION(3), ALICE, { notAfter: null })
    const byId = Object.fromEntries((await inventory(ALICE)).map((r) => [r.id, r.state]))
    expect(byId[SESSION(1)]).toBe('expired')
    expect(byId[SESSION(2)]).toBe('active')
    expect(byId[SESSION(3)], 'no expiry means active, not expired').toBe('active')
  })

  it('coarsens the platform class and never returns what it derived it from', async () => {
    await addSession(SESSION(1), ALICE, { userAgent: 'okhttp/4.12.0' })
    await addSession(SESSION(2), ALICE, { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })
    await addSession(SESSION(3), ALICE, { userAgent: null })
    const byId = Object.fromEntries((await inventory(ALICE)).map((r) => [r.id, r.client_class]))
    expect(byId[SESSION(1)]).toBe('native')
    expect(byId[SESSION(2)]).toBe('web')
    expect(byId[SESSION(3)]).toBe('unknown')
    expect(JSON.stringify(await inventory(ALICE))).not.toContain('okhttp')
  })

  it('converts refreshed_at from naive UTC rather than reinterpreting it', async () => {
    await addSession(SESSION(1), ALICE, { refreshedAt: '2026-08-14 10:00:00' })
    const [row] = await inventory(ALICE)
    expect(new Date(row.last_refreshed_at).toISOString()).toBe('2026-08-14T10:00:00.000Z')
  })

  it('orders newest first, honours the cursor, and caps the page at 50', async () => {
    for (let i = 1; i <= 4; i++) {
      await addSession(SESSION(i), ALICE, { createdAt: `2026-08-1${i}T00:00:00Z` })
    }
    expect((await inventory(ALICE)).map((r) => r.id)).toEqual([SESSION(4), SESSION(3), SESSION(2), SESSION(1)])
    expect((await inventory(ALICE, 2)).map((r) => r.id)).toEqual([SESSION(4), SESSION(3)])
    expect((await inventory(ALICE, 20, '2026-08-13T00:00:00Z')).map((r) => r.id)).toEqual([SESSION(2), SESSION(1)])
    expect(await inventory(ALICE, 999)).toHaveLength(4)   // fewer rows than the cap
    expect(await inventory(ALICE, 0)).toHaveLength(0)
  })

  it('caps an oversized page at 50 rather than honouring it', async () => {
    // Four rows cannot tell a cap of 50 from no cap at all, so this asks for
    // more than the cap with more than the cap available.
    for (let i = 1; i <= 51; i++) {
      await addSession(uuid(200 + i), ALICE, { createdAt: `2026-06-${String(i % 28 + 1).padStart(2, '0')}T00:00:00Z` })
    }
    expect(await inventory(ALICE, 999)).toHaveLength(50)
  })
})

describe('C11 runtime — revoke one session', () => {
  beforeEach(async () => {
    await applyMigration()
    await addUser(ALICE)
    await addUser(BOB)
    await addUser(OWNER, { owner: true })
    await addUser(GHOST, { anonymous: true })
  })

  it('deletes exactly that session and nothing else', async () => {
    await addSession(SESSION(1), ALICE)
    await addSession(SESSION(2), ALICE)
    await addSession(SESSION(3), BOB)
    expect(await revoke(SESSION(1))).toEqual({ revoked: 1, reason: 'ok' })
    expect(await sessionIds()).toEqual([SESSION(2), SESSION(3)])
  })

  it('is idempotent — a revoked session is gone, and re-revoking is not an error', async () => {
    await addSession(SESSION(1), ALICE)
    expect((await revoke(SESSION(1))).revoked).toBe(1)
    expect(await revoke(SESSION(1))).toEqual({ revoked: 0, reason: 'not_found' })
  })

  it('reports an unknown session as not_found rather than failing', async () => {
    expect(await revoke(SESSION(9))).toEqual({ revoked: 0, reason: 'not_found' })
  })

  it('REFUSES to revoke the Platform Owner, and leaves the session intact (P-2)', async () => {
    await addSession(SESSION(1), OWNER)
    expect(await revoke(SESSION(1))).toEqual({ revoked: 0, reason: 'owner_protected' })
    expect(await sessionIds(OWNER)).toEqual([SESSION(1)])
  })

  it('will not touch an anonymous subject, and does not admit it exists (P-4)', async () => {
    await addSession(SESSION(1), GHOST)
    expect(await revoke(SESSION(1))).toEqual({ revoked: 0, reason: 'not_found' })
    expect(await sessionIds(GHOST)).toEqual([SESSION(1)])
  })

  it('fn_session_subject answers for a real subject and stays silent otherwise', async () => {
    await addSession(SESSION(1), ALICE)
    await addSession(SESSION(2), GHOST)
    const subject = async (id: string) => (await db.query(`SELECT fn_session_subject($1) AS s`, [id])).rows[0].s
    expect(await subject(SESSION(1))).toBe(ALICE)
    expect(await subject(SESSION(2)), 'anonymous must not be resolvable').toBeNull()
    expect(await subject(SESSION(9))).toBeNull()
  })
})

describe('C11 runtime — forced logout', () => {
  beforeEach(async () => {
    await applyMigration()
    await addUser(ALICE)
    await addUser(BOB)
    await addUser(OWNER, { owner: true })
    await addUser(GHOST, { anonymous: true })
  })

  it('ends every session for one subject and touches no other subject', async () => {
    await addSession(SESSION(1), ALICE)
    await addSession(SESSION(2), ALICE)
    await addSession(SESSION(3), BOB)
    expect(await revokeAll(ALICE)).toEqual({ revoked: 2, reason: 'ok' })
    expect(await sessionIds()).toEqual([SESSION(3)])
  })

  it('reports zero when there is nothing to end', async () => {
    expect(await revokeAll(ALICE)).toEqual({ revoked: 0, reason: 'ok' })
  })

  it('REFUSES the Platform Owner (P-2)', async () => {
    await addSession(SESSION(1), OWNER)
    expect(await revokeAll(OWNER)).toEqual({ revoked: 0, reason: 'owner_protected' })
    expect(await sessionIds(OWNER)).toEqual([SESSION(1)])
  })

  it('refuses an anonymous or unknown subject', async () => {
    await addSession(SESSION(1), GHOST)
    expect(await revokeAll(GHOST)).toEqual({ revoked: 0, reason: 'not_found' })
    expect(await revokeAll(uuid(77))).toEqual({ revoked: 0, reason: 'not_found' })
    expect(await sessionIds(GHOST)).toEqual([SESSION(1)])
  })

  it('SNAPSHOT BOUNDARY: a login racing the forced logout survives (P-1, I-8)', async () => {
    // The ratified purpose of the snapshot rule: revoke-all must never become an
    // account lock. A BEFORE DELETE trigger inserts a fresh session while the
    // DELETE is executing — exactly the race a concurrent sign-in creates. Under
    // one-statement snapshot semantics the new row is not in the statement's
    // snapshot and survives. An implementation that looped or re-queried would
    // delete it too, and this test would fail.
    await addSession(SESSION(1), ALICE)
    await addSession(SESSION(2), ALICE)
    await db.query(`
      CREATE FUNCTION auth.simulate_login() RETURNS TRIGGER LANGUAGE plpgsql AS $trg$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM auth.sessions WHERE id = '${SESSION(50)}') THEN
          INSERT INTO auth.sessions (id, user_id, created_at, aal, refreshed_at, user_agent)
          VALUES ('${SESSION(50)}', OLD.user_id, now(), 'aal1', now(), 'Mozilla/5.0');
        END IF;
        RETURN OLD;
      END $trg$;
      CREATE TRIGGER simulate_login BEFORE DELETE ON auth.sessions
        FOR EACH ROW EXECUTE FUNCTION auth.simulate_login();
    `)

    const result = await revokeAll(ALICE)
    expect(result.revoked, 'only the two sessions in the snapshot').toBe(2)
    expect(await sessionIds(ALICE), 'the racing login must survive').toEqual([SESSION(50)])
  })

  it('is atomic — a rolled-back transaction leaves every session standing', async () => {
    await addSession(SESSION(1), ALICE)
    await addSession(SESSION(2), ALICE)
    await db.query('BEGIN')
    expect((await revokeAll(ALICE)).revoked).toBe(2)
    await db.query('ROLLBACK')
    expect(await sessionIds(ALICE)).toEqual([SESSION(1), SESSION(2)])
  })
})

describe('C11 runtime — grants are the boundary', () => {
  beforeEach(applyMigration)

  it('no PostgREST role but service_role may execute any C11 function', async () => {
    const calls: Record<string, [string, unknown[]]> = {
      fn_session_inventory: [`SELECT * FROM fn_session_inventory($1, 10, NULL)`, [ALICE]],
      fn_session_subject: [`SELECT fn_session_subject($1)`, [SESSION(1)]],
      fn_session_revoke: [`SELECT * FROM fn_session_revoke($1)`, [SESSION(1)]],
      fn_session_revoke_all: [`SELECT * FROM fn_session_revoke_all($1)`, [ALICE]],
    }
    for (const [fn, [sql, params]] of Object.entries(calls)) {
      for (const role of ['anon', 'authenticated']) {
        expect(await tryAsRole(role, sql, params), `${role} reached ${fn}`).toBe('42501')
      }
      expect(await tryAsRole('service_role', sql, params), `service_role blocked from ${fn}`).toBeNull()
    }
  })

  it('the ACLs are explicit, not merely empty by accident', async () => {
    const r = await db.query(
      `SELECT proname, COALESCE(array_to_string(proacl,' '),'<default>') AS acl FROM pg_proc p
         JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname LIKE 'fn_session%'`
    )
    expect(r.rows).toHaveLength(4)
    for (const row of r.rows) {
      expect(row.acl, `${row.proname} still has default privileges`).not.toBe('<default>')
      expect(row.acl).toContain('service_role=X')
      expect(row.acl).not.toContain('anon=X')
      expect(row.acl).not.toContain('authenticated=X')
    }
  })

  it('no PostgREST role can reach auth.sessions directly — the function is the only path', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const r = await db.query(`SELECT has_table_privilege($1, 'auth.sessions', 'SELECT') AS ok`, [role])
      expect(r.rows[0].ok, `${role} can read auth.sessions directly`).toBe(false)
    }
  })
})
