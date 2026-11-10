import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Explore video part 3 (20261112_video_asset_cleanup.sql) proven at the DATABASE: which source files are due for removal, the legal hold that postpones it,
// and the record that a source was removed. The real migrations executed verbatim in production order.
const REPO = join(__dirname, '..', '..')
const mig = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')
const BASE = mig('20261111_video_assets.sql')
const CLEANUP = mig('20261112_video_asset_cleanup.sql')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261112_video_asset_cleanup_rollback.sql'), 'utf8')

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email VARCHAR(255));
`
const A = '11111111-1111-4111-8111-111111111111'
const PORT = 54317 // unique across supabase/tests (portAllocation.test.ts)

let pg: EmbeddedPostgres
let db: Client
let dataDir: string
let n = 0

async function setup() {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(BASE)
  await db.query(CLEANUP)
  await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [A, 'a@example.com'])
}
async function errorAs(role: string, sql: string): Promise<string | null> {
  try { await db.query(`SET ROLE ${role}`); await db.query(sql); return null }
  catch (e) { return (e as { code?: string }).code ?? 'unknown' } finally { await db.query('RESET ROLE') }
}
/** Inserted directly so updated_at can be old (the guard trigger only runs on UPDATE). */
async function asset(o: { state?: string; moderation?: string; key?: string | null; ageHours?: number; hold?: string | null; removed?: boolean }): Promise<string> {
  const state = o.state ?? 'draft'
  const mod = state === 'ready' || state === 'published' ? 'approved' : (o.moderation ?? 'pending')
  const r = await db.query(
    `INSERT INTO public.video_assets (owner_id, idempotency_key, state, moderation_state, source_bucket, source_object_key, updated_at, deleted_at, legal_hold_until, source_removed_at)
     VALUES ($1,$2,$3,$4,$5,$6, now() - make_interval(hours => $7), $8, $9, $10) RETURNING id`,
    [A, `cleanup-key-${++n}-xx`, state, mod, o.key === null ? null : 'src-bucket', o.key === null ? null : (o.key ?? `vsrc/${A}/k${n}.mp4`), o.ageHours ?? 0,
      state === 'deleted' ? new Date().toISOString() : null, o.hold ?? null, o.removed ? new Date().toISOString() : null])
  return r.rows[0].id as string
}
const due = async (hours = 24, limit = 100) =>
  (await db.query('SELECT id, source_object_key, reason FROM public.video_assets_due_for_source_cleanup($1,$2)', [hours, limit])).rows as Array<{ id: string; source_object_key: string; reason: string }>
const events = async (id: string) => (await db.query('SELECT from_state, to_state, event_type, actor, reason FROM public.video_asset_events WHERE asset_id=$1 ORDER BY id', [id])).rows

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgvideocleanup-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

describe('which source files are due for removal', () => {
  beforeEach(async () => { await setup() })

  it('a deleted video is due at once; its reason says why', async () => {
    const id = await asset({ state: 'deleted' })
    expect(await due()).toEqual([{ id, source_object_key: expect.stringContaining('vsrc/'), reason: 'deleted' }])
  })

  it('a FAILED upload is due only after the stale window; an abandoned upload (never completed) likewise', async () => {
    const freshFailed = await asset({ state: 'failed', ageHours: 1 })
    const oldFailed = await asset({ state: 'failed', ageHours: 30 })
    const freshUploading = await asset({ state: 'uploading', ageHours: 2 })
    const oldUploading = await asset({ state: 'uploading', ageHours: 48 })
    const got = Object.fromEntries((await due()).map(r => [r.id, r.reason]))
    expect(got[oldFailed]).toBe('failed')
    expect(got[oldUploading]).toBe('abandoned')
    expect(got[freshFailed]).toBeUndefined()
    expect(got[freshUploading]).toBeUndefined()
  })

  it('🚨 a live video is NEVER due, whatever its age: uploaded, processing, moderating, review_required, ready, published, rejected', async () => {
    for (const s of ['uploaded', 'processing', 'moderating', 'review_required', 'ready', 'published', 'rejected']) await asset({ state: s, ageHours: 24 * 400 })
    expect(await due()).toEqual([])
  })

  it('an asset with no source key (a draft, or a session that never opened) has nothing to remove', async () => {
    await asset({ state: 'draft', key: null, ageHours: 99 })
    await asset({ state: 'deleted', key: null })
    expect(await due()).toEqual([])
  })

  it('a source already removed is not due again', async () => {
    await asset({ state: 'deleted', removed: true })
    expect(await due()).toEqual([])
  })

  it('🚨 a legal hold keeps the file: not due while the hold is in the future, due again once it has lapsed', async () => {
    const held = await asset({ state: 'deleted', hold: new Date(Date.now() + 3600_000).toISOString() })
    const lapsed = await asset({ state: 'deleted', hold: new Date(Date.now() - 3600_000).toISOString() })
    const ids = (await due()).map(r => r.id)
    expect(ids).toContain(lapsed)
    expect(ids).not.toContain(held)
  })

  it('oldest first, and the limit is honoured and clamped to a sane range', async () => {
    const first = await asset({ state: 'failed', ageHours: 100 })
    await asset({ state: 'failed', ageHours: 50 })
    await asset({ state: 'failed', ageHours: 30 })
    const two = await due(24, 2)
    expect(two).toHaveLength(2)
    expect(two[0].id).toBe(first)
    expect((await due(24, 0)).length).toBe(1) // limit below 1 becomes 1
    expect((await due(24, 999999)).length).toBe(3) // an absurd limit is clamped, not an error
    expect((await due(0, 100)).length).toBeGreaterThan(0) // stale hours below 1 become 1
  })
})

describe('recording that a source was removed', () => {
  beforeEach(async () => { await setup() })

  it('stamps source_removed_at, appends ONE event, and leaves the state alone', async () => {
    const id = await asset({ state: 'deleted' })
    const r = await db.query(`SELECT * FROM public.video_asset_source_removed($1, 'service:cleanup', 'deleted')`, [id])
    expect(r.rows[0]).toMatchObject({ changed: true })
    const row = (await db.query('SELECT state, source_removed_at FROM public.video_assets WHERE id=$1', [id])).rows[0]
    expect(row.state).toBe('deleted')
    expect(row.source_removed_at).toBeInstanceOf(Date)
    expect(await events(id)).toEqual([{ from_state: 'deleted', to_state: 'deleted', event_type: 'source_removed', actor: 'service:cleanup', reason: 'deleted' }])
  })

  it('is idempotent: a second call changes nothing and writes no second event', async () => {
    const id = await asset({ state: 'deleted' })
    await db.query(`SELECT * FROM public.video_asset_source_removed($1,'service:cleanup','deleted')`, [id])
    const again = await db.query(`SELECT * FROM public.video_asset_source_removed($1,'service:cleanup','deleted')`, [id])
    expect(again.rows[0]).toMatchObject({ changed: false })
    expect(await events(id)).toHaveLength(1)
  })

  it('an unknown asset is reported, and an actor is required', async () => {
    expect(await errorAs('postgres', `SELECT * FROM public.video_asset_source_removed('99999999-9999-4999-8999-999999999999','a','r')`)).toBe('P0002')
    const id = await asset({ state: 'deleted' })
    expect(await errorAs('postgres', `SELECT * FROM public.video_asset_source_removed('${id}','','r')`)).toBe('22023')
  })

  it('🚨 refuses to record a removal for an asset still under a legal hold (the file must not be reported gone)', async () => {
    const id = await asset({ state: 'deleted', hold: new Date(Date.now() + 3600_000).toISOString() })
    expect(await errorAs('postgres', `SELECT * FROM public.video_asset_source_removed('${id}','service:cleanup','deleted')`)).toBe('55000')
  })
})

describe('the legal hold', () => {
  beforeEach(async () => { await setup() })

  it('sets a future date with an event, and clears with null', async () => {
    const id = await asset({ state: 'published' })
    const until = new Date(Date.now() + 86_400_000).toISOString()
    await db.query(`SELECT * FROM public.video_asset_set_hold($1,$2,'admin:x','report 123')`, [id, until])
    expect((await db.query('SELECT legal_hold_until FROM public.video_assets WHERE id=$1', [id])).rows[0].legal_hold_until).toBeInstanceOf(Date)
    await db.query(`SELECT * FROM public.video_asset_set_hold($1,NULL,'admin:x','released')`, [id])
    expect((await db.query('SELECT legal_hold_until FROM public.video_assets WHERE id=$1', [id])).rows[0].legal_hold_until).toBeNull()
    expect((await events(id)).map(e => e.event_type)).toEqual(['hold_set', 'hold_cleared'])
  })

  it('a hold in the past is refused, and an actor and a reason are required', async () => {
    const id = await asset({ state: 'published' })
    expect(await errorAs('postgres', `SELECT * FROM public.video_asset_set_hold('${id}', now() - interval '1 hour','admin:x','why')`)).toBe('22023')
    expect(await errorAs('postgres', `SELECT * FROM public.video_asset_set_hold('${id}', now() + interval '1 hour','','why')`)).toBe('22023')
    expect(await errorAs('postgres', `SELECT * FROM public.video_asset_set_hold('${id}', now() + interval '1 hour','admin:x','')`)).toBe('22023')
  })

  it('an unknown asset is reported', async () => {
    expect(await errorAs('postgres', `SELECT * FROM public.video_asset_set_hold('99999999-9999-4999-8999-999999999999', now() + interval '1 hour','admin:x','why')`)).toBe('P0002')
  })
})

describe('who can call them', () => {
  beforeEach(async () => { await setup() })

  it('only the service role; anon and signed-in users are refused', async () => {
    const id = await asset({ state: 'deleted' })
    for (const role of ['anon', 'authenticated']) {
      expect(await errorAs(role, `SELECT * FROM public.video_assets_due_for_source_cleanup(24, 10)`), `${role} due`).toBe('42501')
      expect(await errorAs(role, `SELECT * FROM public.video_asset_source_removed('${id}','a','r')`), `${role} removed`).toBe('42501')
      expect(await errorAs(role, `SELECT * FROM public.video_asset_set_hold('${id}', now() + interval '1 hour','a','r')`), `${role} hold`).toBe('42501')
    }
    expect(await errorAs('service_role', `SELECT * FROM public.video_assets_due_for_source_cleanup(24, 10)`)).toBeNull()
    expect(await errorAs('service_role', `SELECT * FROM public.video_asset_source_removed('${id}','service:cleanup','deleted')`)).toBeNull()
  })
})

describe('rollback', () => {
  it('removes what it added and leaves the first migration intact', async () => {
    await setup()
    await db.query(ROLLBACK)
    const f = await db.query(`SELECT count(*)::int AS c FROM pg_proc WHERE proname IN ('video_assets_due_for_source_cleanup','video_asset_source_removed','video_asset_set_hold')`)
    expect(f.rows[0].c).toBe(0)
    const cols = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='video_assets' AND column_name IN ('legal_hold_until','source_removed_at')`)
    expect(cols.rows).toEqual([])
    expect((await db.query(`SELECT to_regclass('public.video_assets') AS t`)).rows[0].t).not.toBeNull()
    expect((await db.query(`SELECT count(*)::int AS c FROM pg_proc WHERE proname='video_asset_transition'`)).rows[0].c).toBe(1)
    await db.query(CLEANUP) // and it can be applied again
  })
})
