import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// F-096 · audit_log personal data and retention (owner decisions 2026-09-25), on the REAL
// back-office table and the REAL chain (20260713 + 20260807), then 20260925d:
//   1. no email is stored in a new row, whatever the writer passes
//   2. IP + user-agent live in audit_log_client (90 days); the chained row carries only a salted
//      digest, verifiable while the side row exists
//   3. date of birth / phone / email / tokens in before/after/metadata are masked
//   4. the chain keeps 12 months: a VERIFIED prefix is pruned behind an anchor and the chain
//      still verifies; an unanchored head deletion is still caught; a tampered prefix is never pruned
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const PHASE0 = read('supabase/migrations/20260713_backoffice_phase0.sql')
const CHAIN = read('supabase/migrations/20260807_audit_chain.sql')
const PII = read('supabase/migrations/20260925d_audit_log_pii_retention.sql')
const ROLLBACK = read('supabase/migrations/rollback/20260925d_audit_log_pii_retention_rollback.sql')

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  CREATE TABLE IF NOT EXISTS profiles (id UUID PRIMARY KEY, email TEXT);
`

const PORT = 54396
const ACTOR = '11111111-1111-4111-8111-111111111111'

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'audit-pii-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('audit_pii')
  db = pg.getPgClient('audit_pii')
  await db.connect()
}, 240_000)

afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

beforeEach(async () => {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(PHASE0)
  await db.query(CHAIN)
})

interface Ins { email?: string; action?: string; ip?: string | null; ua?: string | null; before?: unknown; after?: unknown; metadata?: unknown; createdAt?: string }
async function insert(o: Ins = {}): Promise<string> {
  const r = await db.query(
    `INSERT INTO audit_log (actor_id, actor_email, actor_role, action, before_state, after_state, metadata, ip_address, user_agent, created_at)
     VALUES ($1, $2, 'admin', $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now())) RETURNING id`,
    [ACTOR, o.email ?? 'staff@example.test', o.action ?? 'test.action',
      o.before === undefined ? null : JSON.stringify(o.before), o.after === undefined ? null : JSON.stringify(o.after),
      o.metadata === undefined ? null : JSON.stringify(o.metadata), o.ip === undefined ? '203.0.113.7' : o.ip,
      o.ua === undefined ? 'Mozilla/5.0' : o.ua, o.createdAt ?? null])
  return r.rows[0].id as string
}
const problems = async (from: number | null = null) => (await db.query('SELECT * FROM fn_verify_audit_chain($1, $2)', [from, null])).rows
const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0]
async function asRole(role: string, sql: string): Promise<string | null> {
  try { await db.query(`SET ROLE ${role}`); await db.query(sql); return null }
  catch (e) { return (e as { code?: string }).code ?? 'unknown' }
  finally { await db.query('RESET ROLE') }
}

describe('1-3 · what a new audit row stores', () => {
  beforeEach(async () => { await db.query(PII) })

  it('no email, no IP, no user-agent in the chained row; IP + UA in the side table', async () => {
    const id = await insert({ email: 'staff@example.test', ip: '203.0.113.7', ua: 'Mozilla/5.0' })
    const row = await one('SELECT actor_email, ip_address, user_agent, metadata FROM audit_log WHERE id = $1', [id])
    expect(row.actor_email).toBeNull()
    expect(row.ip_address).toBeNull()
    expect(row.user_agent).toBeNull()
    const side = await one('SELECT host(ip_address) ip, user_agent, salt FROM audit_log_client WHERE audit_id = $1', [id])
    expect(side.ip).toBe('203.0.113.7')
    expect(side.user_agent).toBe('Mozilla/5.0')
    // The digest proves the side row while it exists: sha256(salt || ip || '\n' || ua).
    const digest = createHash('sha256').update(Buffer.concat([side.salt as Buffer, Buffer.from('203.0.113.7\nMozilla/5.0', 'utf8')])).digest('hex')
    expect(row.metadata.client_digest).toBe(digest)
  })

  it('a row with no IP and no UA gets no side row and no digest', async () => {
    const id = await insert({ ip: null, ua: null, metadata: { reason: 'x' } })
    expect((await one('SELECT count(*)::int c FROM audit_log_client WHERE audit_id = $1', [id])).c).toBe(0)
    expect((await one('SELECT metadata FROM audit_log WHERE id = $1', [id])).metadata).toEqual({ reason: 'x' })
  })

  it('masks date of birth, phone, email and tokens in before/after/metadata — nested too — and keeps the rest', async () => {
    const id = await insert({
      before: { date_of_birth: '1990-04-12', age_band: 'under_18', profile: { phone: '0901234567', city: 'HCM' } },
      after: { dob: '1991-01-01', age_band: '35_44' },
      metadata: { email: 'user@example.test', refresh_token: '1//abc', reason: 'correction' },
    })
    const r = await one('SELECT before_state b, after_state a, metadata m FROM audit_log WHERE id = $1', [id])
    expect(r.b).toEqual({ date_of_birth: '***', age_band: 'under_18', profile: { phone: '***', city: 'HCM' } })
    expect(r.a).toEqual({ dob: '***', age_band: '35_44' })
    expect(r.m).toMatchObject({ email: '***', refresh_token: '***', reason: 'correction' })
  })

  it('the chain still verifies — the PII trigger fires BEFORE the chain trigger', async () => {
    for (let i = 0; i < 5; i++) await insert({ action: `a${i}` })
    expect(await problems()).toEqual([])
    const names = (await db.query(`SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_log'::regclass AND NOT tgisinternal ORDER BY tgname`)).rows.map(r => r.tgname)
    expect(names.indexOf('aaa_audit_log_pii')).toBeLessThan(names.indexOf('zzz_audit_log_chain'))
  })

  it('🚨 the side table and the retention functions are closed to anon and authenticated', async () => {
    for (const role of ['anon', 'authenticated']) {
      expect(await asRole(role, 'SELECT * FROM audit_log_client'), role).toBe('42501')
      expect(await asRole(role, 'SELECT * FROM audit_log_anchor'), role).toBe('42501')
      expect(await asRole(role, 'SELECT audit_log_client_sweep(90)'), role).toBe('42501')
      expect(await asRole(role, 'SELECT audit_log_prune(12)'), role).toBe('42501')
    }
    expect(await asRole('service_role', 'SELECT audit_log_client_sweep(90)')).toBeNull()
  })
})

describe('rows written BEFORE the migration are not rewritten', () => {
  it('keep their email/IP/UA and the chain verifies across the boundary', async () => {
    const old = await insert({ email: 'old@example.test' })
    await db.query(PII)
    await insert({ email: 'new@example.test' })
    expect((await one('SELECT actor_email FROM audit_log WHERE id = $1', [old])).actor_email).toBe('old@example.test')
    expect(await problems()).toEqual([])
  })
})

describe('2 · IP/UA retention: 90 days', () => {
  beforeEach(async () => { await db.query(PII) })

  it('sweeps side rows older than 90 days only; the chain is untouched', async () => {
    const oldId = await insert({ action: 'old' })
    const newId = await insert({ action: 'new' })
    await db.query(`UPDATE audit_log_client SET created_at = now() - interval '91 days' WHERE audit_id = $1`, [oldId])
    expect((await one('SELECT audit_log_client_sweep(90) n')).n).toBe(1)
    expect((await one('SELECT count(*)::int c FROM audit_log_client WHERE audit_id = $1', [newId])).c).toBe(1)
    expect(await problems()).toEqual([])
  })
})

describe('4 · the 12-month chain with an anchor', () => {
  beforeEach(async () => { await db.query(PII) })
  const OLD = `now() - interval '13 months'`

  async function seedOldAndNew() {
    for (let i = 0; i < 3; i++) await insert({ action: `old${i}`, createdAt: (await one(`SELECT (${OLD})::text t`)).t })
    for (let i = 0; i < 2; i++) await insert({ action: `new${i}` })
  }

  it('prunes the verified old prefix, records an anchor, and the chain still verifies clean', async () => {
    await seedOldAndNew()
    expect((await one('SELECT audit_log_prune(12) n')).n).toBe(3)
    expect((await one(`SELECT count(*)::int c FROM audit_log WHERE action LIKE 'old%'`)).c).toBe(0)
    expect((await one('SELECT count(*)::int c FROM audit_log_anchor')).c).toBe(1)
    expect(await problems()).toEqual([])
    const first = Number((await one('SELECT min(seq) s FROM audit_log')).s)
    expect(await problems(first)).toEqual([])  // a ranged check whose predecessor was pruned
    expect((await one('SELECT count(*)::int c FROM audit_log_client')).c).toBe(2) // pruned rows' side rows went too
  })

  it('🚨 an UNANCHORED head deletion is still reported (A-2 holds)', async () => {
    await seedOldAndNew()
    await db.query('SELECT audit_log_prune(12)')
    await db.query('DELETE FROM audit_log WHERE seq = (SELECT min(seq) FROM audit_log)')
    expect((await problems()).map(p => p.problem)).toContain('prev_mismatch')
  })

  it('🚨 a tampered prefix is NEVER pruned — pruning must not launder it', async () => {
    await seedOldAndNew()
    await db.query(`UPDATE audit_log SET action = 'forged' WHERE action = 'old1'`)
    await expect(db.query('SELECT audit_log_prune(12)')).rejects.toMatchObject({ code: '55000' })
    expect((await one(`SELECT count(*)::int c FROM audit_log WHERE action LIKE 'old%' OR action = 'forged'`)).c).toBe(3)
    expect((await one('SELECT count(*)::int c FROM audit_log_anchor')).c).toBe(0)
  })

  it('refuses a retention shorter than 12 months; nothing old enough → prunes nothing', async () => {
    await expect(db.query('SELECT audit_log_prune(6)')).rejects.toMatchObject({ code: '22023' })
    await insert({ action: 'recent' })
    expect((await one('SELECT audit_log_prune(12) n')).n).toBe(0)
  })
})

describe('rollback', () => {
  it('removes the trigger, tables and functions; new rows keep what the writer passed again', async () => {
    await db.query(PII)
    await db.query(ROLLBACK)
    const id = await insert({ email: 'after-rollback@example.test' })
    expect((await one('SELECT actor_email, host(ip_address) ip FROM audit_log WHERE id = $1', [id]))).toEqual({ actor_email: 'after-rollback@example.test', ip: '203.0.113.7' })
    expect((await one(`SELECT count(*)::int c FROM pg_class WHERE relname IN ('audit_log_client','audit_log_anchor')`)).c).toBe(0)
    expect(await problems()).toEqual([])
  })
})
