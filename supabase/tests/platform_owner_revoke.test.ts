import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// BL-C7-01 — the Platform Owner RPCs were callable by `anon`.
//
// Runs the ACTUAL .sql files from disk against a REAL PostgreSQL, in the order
// production applies them, and proves the exposure both ways:
//
//   RED   before 20260807_platform_owner_revoke_public_execute.sql,
//         `anon` can call all three functions — including actually inserting a
//         row into admin_roles.
//   GREEN after it, all three answer `42501 permission denied for function`,
//         and service_role still works.
//
// WHY A SEPARATE SUITE, AND WHY THIS PRELUDE.
//
// platform_owner_bootstrap.test.ts creates ONLY `service_role`. It never
// creates `anon`/`authenticated` and never applies Supabase's
// `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated`.
// So it has been green against a platform on which this vulnerability cannot
// exist — the same false-premise failure audit_chain.test.ts documents as F-04.
// The prelude below is copied from that corrected harness, because the platform
// facts are what make the assertions mean anything.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const PHASE0 = readFileSync(join(REPO, 'supabase/migrations/20260713_backoffice_phase0.sql'), 'utf8')
const OWNER = readFileSync(join(REPO, 'supabase/migrations/20260803_platform_owner.sql'), 'utf8')
const REVOKE_FIX = readFileSync(
  join(REPO, 'supabase/migrations/20260807_platform_owner_revoke_public_execute.sql'),
  'utf8',
)

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      CREATE ROLE service_role NOLOGIN;
    END IF;
  END $$;

  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- The platform fact the whole finding turns on: Supabase configures this on
  -- every project, so a function created afterwards carries an EXPLICIT anon
  -- grant on top of PostgreSQL's PUBLIC default. Re-applied on every beforeEach
  -- because DROP SCHEMA public CASCADE also drops its pg_default_acl entries.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE TABLE IF NOT EXISTS profiles (id UUID PRIMARY KEY, email TEXT);
`

const OWNER_ID = '11111111-1111-1111-1111-111111111111'
const VICTIM_ID = '22222222-2222-2222-2222-222222222222'
const ATTACKER_ID = '33333333-3333-3333-3333-333333333333'
const PORT = 54337

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

/** Runs `sql` as `anon` and returns the PostgreSQL error code, or null on success. */
async function asAnon(sql: string): Promise<string | null> {
  try {
    await db.query('SET ROLE anon')
    await db.query(sql)
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  } finally {
    await db.query('RESET ROLE')
  }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgrevoke-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    // --locale=C: the Windows runner's default collation is WIN1252 and initdb
    // refuses it. Same workaround as the existing suites.
    initdbFlags: ['--locale=C'],
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient('test')
  await db.connect()
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* already closed */ }
  try { await pg?.stop() } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
})

beforeEach(async () => {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(PHASE0)
  await db.query(OWNER)
  await db.query(
    `INSERT INTO profiles (id, email) VALUES ($1,'owner@x'), ($2,'victim@x'), ($3,'attacker@x')`,
    [OWNER_ID, VICTIM_ID, ATTACKER_ID],
  )
})

describe('BL-C7-01 — RED: before the revoke migration, anon reaches the Owner RPCs', () => {
  it('anon can execute fn_is_platform_owner', async () => {
    expect(await asAnon(`SELECT fn_is_platform_owner('${OWNER_ID}')`)).toBeNull()
  })

  it('anon can execute fn_revoke_admin_role (reaches the function body, not a grant check)', async () => {
    // P0002 is the function's OWN "role assignment does not exist" — proving it
    // ran. A missing grant would be 42501 instead.
    expect(await asAnon(`SELECT fn_revoke_admin_role('${ATTACKER_ID}','${OWNER_ID}')`)).toBe('P0002')
  })

  it('anon can actually GRANT itself a non-super_admin role — the escalation', async () => {
    // No authorization check exists for roles below super_admin, and p_actor_id
    // is whatever the caller says it is.
    expect(
      await asAnon(`SELECT fn_grant_admin_role('${OWNER_ID}','${ATTACKER_ID}','admin')`),
    ).toBeNull()

    const { rows } = await db.query(
      `SELECT role::text AS role FROM admin_roles WHERE user_id = $1`,
      [ATTACKER_ID],
    )
    expect(rows.map(r => r.role)).toContain('admin')
  })
})

describe('BL-C7-01 — GREEN: after the revoke migration', () => {
  beforeEach(async () => {
    await db.query(REVOKE_FIX)
  })

  it('anon is denied on all three functions with 42501 permission denied', async () => {
    expect(await asAnon(`SELECT fn_is_platform_owner('${OWNER_ID}')`)).toBe('42501')
    expect(await asAnon(`SELECT fn_grant_admin_role('${OWNER_ID}','${ATTACKER_ID}','admin')`)).toBe('42501')
    expect(await asAnon(`SELECT fn_revoke_admin_role('${ATTACKER_ID}','${OWNER_ID}')`)).toBe('42501')
  })

  it('the escalation no longer writes anything', async () => {
    await asAnon(`SELECT fn_grant_admin_role('${OWNER_ID}','${ATTACKER_ID}','admin')`)
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM admin_roles WHERE user_id = $1`,
      [ATTACKER_ID],
    )
    expect(rows[0].n).toBe(0)
  })

  it('authenticated is denied too — REVOKE FROM PUBLIC alone would have missed it', async () => {
    try {
      await db.query('SET ROLE authenticated')
      await db.query(`SELECT fn_is_platform_owner('${OWNER_ID}')`)
      throw new Error('authenticated should not be able to execute fn_is_platform_owner')
    } catch (e) {
      expect((e as { code?: string }).code).toBe('42501')
    } finally {
      await db.query('RESET ROLE')
    }
  })

  it('service_role still works — the application path is intact', async () => {
    // Only the CALLS run as service_role. The verification SELECT must not:
    // service_role holds EXECUTE on these functions but no direct SELECT on
    // admin_roles, which is the point of routing writes through a
    // SECURITY DEFINER function in the first place.
    await db.query('SET ROLE service_role')
    try {
      const owner = await db.query(`SELECT fn_is_platform_owner($1) AS v`, [OWNER_ID])
      expect(owner.rows[0].v).toBe(false) // no owner seeded; the point is that it RAN

      await db.query(`SELECT fn_grant_admin_role($1,$2,'admin')`, [OWNER_ID, VICTIM_ID])
    } finally {
      await db.query('RESET ROLE')
    }

    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM admin_roles WHERE user_id = $1`,
      [VICTIM_ID],
    )
    expect(rows[0].n).toBe(1)
  })

  it('no anon / authenticated / PUBLIC grant survives in the ACL', async () => {
    const { rows } = await db.query(`
      SELECT p.proname, a.grantee::regrole::text AS grantee
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(p.proacl) a
      WHERE p.proname IN ('fn_is_platform_owner','fn_grant_admin_role','fn_revoke_admin_role')
        AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon','authenticated'))
    `)
    expect(rows).toEqual([])
  })

  it('is idempotent — re-applying changes nothing', async () => {
    await db.query(REVOKE_FIX)
    expect(await asAnon(`SELECT fn_is_platform_owner('${OWNER_ID}')`)).toBe('42501')
  })
})
