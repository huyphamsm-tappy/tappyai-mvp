import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'
import { VIDEO_ASSET_STATES, MODERATION_STATES, canTransition } from '../../src/lib/media/video/assetState'

// Explore video lifecycle (20261111_video_assets.sql) proven at the DATABASE: the real migration executed verbatim.
const REPO = join(__dirname, '..', '..')
const MIG = readFileSync(join(REPO, 'supabase/migrations/20261111_video_assets.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261111_video_assets_rollback.sql'), 'utf8')

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
const B = '22222222-2222-4222-8222-222222222222'
const PORT = 54316 // unique across supabase/tests (portAllocation.test.ts)

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

async function setup() {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(MIG)
  for (const id of [A, B]) await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [id, `${id}@example.com`])
}
async function errorAs(role: string, sql: string, params: unknown[] = []): Promise<string | null> {
  try { await db.query(`SET ROLE ${role}`); await db.query(sql, params as never[]); return null }
  catch (e) { return (e as { code?: string }).code ?? 'unknown' } finally { await db.query('RESET ROLE') }
}
let n = 0
async function asset(over: { owner?: string; state?: string; moderation?: string; key?: string } = {}): Promise<string> {
  const key = over.key ?? `idem-key-${++n}-${Math.random().toString(36).slice(2, 10)}`
  const r = await db.query(
    `INSERT INTO public.video_assets (owner_id, idempotency_key, state, moderation_state) VALUES ($1,$2,$3,$4) RETURNING id`,
    [over.owner ?? A, key, over.state ?? 'draft', over.moderation ?? 'pending'])
  return r.rows[0].id as string
}
const state = async (id: string) => (await db.query('SELECT state, moderation_state, deleted_at FROM public.video_assets WHERE id=$1', [id])).rows[0]
async function transition(id: string, to: string, extra: { moderation?: string | null; event?: string; actor?: string; reason?: string | null; corr?: string | null } = {}) {
  return db.query(
    'SELECT * FROM public.video_asset_transition($1,$2,$3,$4,$5,$6,$7)',
    [id, to, extra.event ?? 'test', extra.actor ?? 'service:test', extra.reason ?? null, extra.corr ?? null, extra.moderation ?? null])
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgvideoassets-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

describe('the transition table in SQL is the one in TypeScript', () => {
  beforeEach(async () => { await setup() })

  it('agrees for every pair of states (11 x 11)', async () => {
    const mismatches: string[] = []
    for (const from of VIDEO_ASSET_STATES) {
      for (const to of VIDEO_ASSET_STATES) {
        const r = await db.query('SELECT public.video_asset_transition_allowed($1,$2) AS ok', [from, to])
        if (r.rows[0].ok !== canTransition(from, to)) mismatches.push(`${from} -> ${to}: sql=${r.rows[0].ok} ts=${canTransition(from, to)}`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it('the CHECK lists in SQL accept exactly the TypeScript states', async () => {
    for (const s of VIDEO_ASSET_STATES) {
      const mod = s === 'ready' || s === 'published' ? 'approved' : 'pending'
      const id = await asset({ state: s === 'deleted' ? 'draft' : s, moderation: mod })
      expect(id).toBeTruthy()
    }
    expect(await errorAs('postgres', `INSERT INTO public.video_assets (owner_id, idempotency_key, state) VALUES ('${A}','bogus-state-key','bogus')`)).toBe('23514')
    for (const m of MODERATION_STATES) {
      expect(await errorAs('postgres', `INSERT INTO public.video_assets (owner_id, idempotency_key, moderation_state) VALUES ('${A}','mod-${m}-key1','${m}')`)).toBeNull()
    }
    expect(await errorAs('postgres', `INSERT INTO public.video_assets (owner_id, idempotency_key, moderation_state) VALUES ('${A}','bogus-mod-key','maybe')`)).toBe('23514')
  })
})

describe('video_assets rows', () => {
  beforeEach(async () => { await setup() })

  it('starts as a private draft, unmoderated, with timestamps and no public reference', async () => {
    const id = await asset()
    const r = (await db.query('SELECT * FROM public.video_assets WHERE id=$1', [id])).rows[0]
    expect(r.state).toBe('draft')
    expect(r.moderation_state).toBe('pending')
    expect(r.overlay_version).toBe(0)
    expect(r.deleted_at).toBeNull()
    expect(r.created_at).toBeInstanceOf(Date)
    expect(r.source_object_key).toBeNull()
  })

  it('the same owner and idempotency key can only create ONE asset (a retry cannot duplicate)', async () => {
    await db.query(`INSERT INTO public.video_assets (owner_id, idempotency_key) VALUES ($1,'same-key-12345678')`, [A])
    expect(await errorAs('postgres', `INSERT INTO public.video_assets (owner_id, idempotency_key) VALUES ('${A}','same-key-12345678')`)).toBe('23505')
    expect(await errorAs('postgres', `INSERT INTO public.video_assets (owner_id, idempotency_key) VALUES ('${B}','same-key-12345678')`)).toBeNull()
  })

  it('an idempotency key must be 8..128 characters', async () => {
    expect(await errorAs('postgres', `INSERT INTO public.video_assets (owner_id, idempotency_key) VALUES ('${A}','short')`)).toBe('23514')
    expect(await errorAs('postgres', `INSERT INTO public.video_assets (owner_id, idempotency_key) VALUES ('${A}','${'x'.repeat(129)}')`)).toBe('23514')
  })

  it('ready and published exist ONLY with an approved moderation decision', async () => {
    for (const s of ['ready', 'published']) {
      for (const m of ['pending', 'review_required', 'rejected']) {
        expect(await errorAs('postgres', `INSERT INTO public.video_assets (owner_id, idempotency_key, state, moderation_state) VALUES ('${A}','k-${s}-${m}-1','${s}','${m}')`), `${s}/${m}`).toBe('23514')
      }
      expect(await errorAs('postgres', `INSERT INTO public.video_assets (owner_id, idempotency_key, state, moderation_state) VALUES ('${A}','k-${s}-ok-1','${s}','approved')`)).toBeNull()
    }
  })

  it('deleted_at is set exactly when the state is deleted', async () => {
    expect(await errorAs('postgres', `INSERT INTO public.video_assets (owner_id, idempotency_key, state) VALUES ('${A}','k-del-nodate1','deleted')`)).toBe('23514')
    expect(await errorAs('postgres', `INSERT INTO public.video_assets (owner_id, idempotency_key, deleted_at) VALUES ('${A}','k-notdel-date','2026-11-05T00:00:00Z')`)).toBe('23514')
  })

  it('a direct UPDATE cannot make an illegal jump (the trigger enforces the table)', async () => {
    const id = await asset({ state: 'uploaded' })
    expect(await errorAs('postgres', `UPDATE public.video_assets SET state='published', moderation_state='approved' WHERE id='${id}'`)).toBe('23514')
    expect((await state(id)).state).toBe('uploaded')
    expect(await errorAs('postgres', `UPDATE public.video_assets SET state='processing' WHERE id='${id}'`)).toBeNull()
    expect((await state(id)).state).toBe('processing')
  })

  it('owner, idempotency key and creation time cannot be changed', async () => {
    const id = await asset()
    expect(await errorAs('postgres', `UPDATE public.video_assets SET owner_id='${B}' WHERE id='${id}'`)).toBe('23514')
    expect(await errorAs('postgres', `UPDATE public.video_assets SET idempotency_key='another-key-1234' WHERE id='${id}'`)).toBe('23514')
    expect(await errorAs('postgres', `UPDATE public.video_assets SET created_at = now() - interval '1 day' WHERE id='${id}'`)).toBe('23514')
  })

  it('updated_at moves on every update', async () => {
    const id = await asset()
    const before = (await db.query('SELECT updated_at FROM public.video_assets WHERE id=$1', [id])).rows[0].updated_at as Date
    await db.query('SELECT pg_sleep(0.05)')
    await db.query(`UPDATE public.video_assets SET transcode_job_id='job-1' WHERE id=$1`, [id])
    const after = (await db.query('SELECT updated_at FROM public.video_assets WHERE id=$1', [id])).rows[0].updated_at as Date
    expect(after.getTime()).toBeGreaterThan(before.getTime())
  })

  it('deleting the account removes its assets and their history (no orphan rows)', async () => {
    const id = await asset({ owner: A })
    await transition(id, 'uploading')
    expect((await db.query('SELECT count(*)::int AS c FROM public.video_asset_events WHERE asset_id=$1', [id])).rows[0].c).toBe(1)
    await db.query('DELETE FROM auth.users WHERE id=$1', [A])
    expect((await db.query('SELECT count(*)::int AS c FROM public.video_assets')).rows[0].c).toBe(0)
    expect((await db.query('SELECT count(*)::int AS c FROM public.video_asset_events')).rows[0].c).toBe(0)
  })
})

describe('video_asset_transition (the one write path)', () => {
  beforeEach(async () => { await setup() })

  it('moves the state and writes one event with from/to, actor, reason and correlation', async () => {
    const id = await asset()
    const r = await transition(id, 'uploading', { event: 'upload_session_created', actor: `user:${A}`, reason: 'start', corr: 'corr-1' })
    expect(r.rows[0]).toMatchObject({ state: 'uploading', changed: true })
    const ev = (await db.query('SELECT * FROM public.video_asset_events WHERE asset_id=$1', [id])).rows
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ from_state: 'draft', to_state: 'uploading', event_type: 'upload_session_created', actor: `user:${A}`, reason: 'start', correlation_id: 'corr-1' })
  })

  it('is idempotent: repeating a transition that already happened changes nothing and writes no second event', async () => {
    const id = await asset()
    await transition(id, 'uploading')
    const again = await transition(id, 'uploading')
    expect(again.rows[0]).toMatchObject({ state: 'uploading', changed: false })
    expect((await db.query('SELECT count(*)::int AS c FROM public.video_asset_events WHERE asset_id=$1', [id])).rows[0].c).toBe(1)
  })

  it('refuses an illegal transition and leaves the row and the history untouched', async () => {
    const id = await asset({ state: 'uploaded' })
    let code = ''
    try { await transition(id, 'published', { moderation: 'approved' }) } catch (e) { code = (e as { code?: string }).code ?? '' }
    expect(code).toBe('23514')
    expect((await state(id)).state).toBe('uploaded')
    expect((await db.query('SELECT count(*)::int AS c FROM public.video_asset_events WHERE asset_id=$1', [id])).rows[0].c).toBe(0)
  })

  it('refuses ready without an approved decision, and accepts it when the decision comes with the move', async () => {
    const id = await asset({ state: 'moderating' })
    let code = ''
    try { await transition(id, 'ready') } catch (e) { code = (e as { code?: string }).code ?? '' }
    expect(code).toBe('23514')
    expect((await state(id)).state).toBe('moderating')
    const ok = await transition(id, 'ready', { moderation: 'approved', event: 'auto_approved' })
    expect(ok.rows[0]).toMatchObject({ state: 'ready', moderation_state: 'approved', changed: true })
  })

  it('walks the whole happy path and records every step in order', async () => {
    const id = await asset()
    for (const to of ['uploading', 'uploaded', 'processing', 'moderating']) await transition(id, to)
    await transition(id, 'ready', { moderation: 'approved' })
    await transition(id, 'published')
    const ev = (await db.query('SELECT from_state, to_state FROM public.video_asset_events WHERE asset_id=$1 ORDER BY id', [id])).rows
    expect(ev.map(e => `${e.from_state}>${e.to_state}`)).toEqual([
      'draft>uploading', 'uploading>uploaded', 'uploaded>processing', 'processing>moderating', 'moderating>ready', 'ready>published',
    ])
    expect((await state(id))).toMatchObject({ state: 'published', moderation_state: 'approved' })
  })

  it('a takedown of a published video flips the decision away from approved in the same step', async () => {
    const id = await asset({ state: 'published', moderation: 'approved' })
    const r = await transition(id, 'rejected', { moderation: 'rejected', event: 'takedown', reason: 'policy' })
    expect(r.rows[0]).toMatchObject({ state: 'rejected', moderation_state: 'rejected', changed: true })
  })

  it('deleting stamps deleted_at once and nothing can leave deleted afterwards', async () => {
    const id = await asset({ state: 'published', moderation: 'approved' })
    await transition(id, 'deleted')
    const s1 = await state(id)
    expect(s1.state).toBe('deleted')
    expect(s1.deleted_at).toBeInstanceOf(Date)
    for (const to of VIDEO_ASSET_STATES) {
      if (to === 'deleted') continue
      let code = ''
      try { await transition(id, to, { moderation: 'approved' }) } catch (e) { code = (e as { code?: string }).code ?? '' }
      expect(code, `deleted -> ${to}`).toBe('23514')
    }
    const again = await transition(id, 'deleted')
    expect(again.rows[0].changed).toBe(false)
    expect((await state(id)).deleted_at).toEqual(s1.deleted_at)
  })

  it('an unknown asset is reported, not created', async () => {
    let code = ''
    try { await transition('99999999-9999-4999-8999-999999999999', 'uploading') } catch (e) { code = (e as { code?: string }).code ?? '' }
    expect(code).toBe('P0002')
  })

  it('needs a non-empty actor and event type (the audit trail always says who and what)', async () => {
    const id = await asset()
    let c1 = ''; let c2 = ''
    try { await transition(id, 'uploading', { actor: '' }) } catch (e) { c1 = (e as { code?: string }).code ?? '' }
    try { await transition(id, 'uploading', { event: '' }) } catch (e) { c2 = (e as { code?: string }).code ?? '' }
    expect(c1).toBe('22023')
    expect(c2).toBe('22023')
    expect((await state(id)).state).toBe('draft')
  })
})

describe('who can touch it', () => {
  beforeEach(async () => { await setup() })

  it('row level security is on for both tables', async () => {
    const r = await db.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('video_assets','video_asset_events') ORDER BY relname`)
    expect(r.rows).toEqual([{ relname: 'video_asset_events', relrowsecurity: true }, { relname: 'video_assets', relrowsecurity: true }])
  })

  it('anon and signed-in users can read, write and call NOTHING (the server mediates every access)', async () => {
    const id = await asset()
    for (const role of ['anon', 'authenticated']) {
      expect(await errorAs(role, 'SELECT * FROM public.video_assets'), `${role} select assets`).toBe('42501')
      expect(await errorAs(role, 'SELECT * FROM public.video_asset_events'), `${role} select events`).toBe('42501')
      expect(await errorAs(role, `INSERT INTO public.video_assets (owner_id, idempotency_key) VALUES ('${A}','role-insert-12345')`), `${role} insert`).toBe('42501')
      expect(await errorAs(role, `UPDATE public.video_assets SET state='published'`), `${role} update`).toBe('42501')
      expect(await errorAs(role, `DELETE FROM public.video_assets`), `${role} delete`).toBe('42501')
      expect(await errorAs(role, `SELECT * FROM public.video_asset_transition('${id}','uploading','t','a')`), `${role} rpc`).toBe('42501')
    }
  })

  it('the service role works through the function and the tables, but cannot rewrite or erase the history', async () => {
    const id = await asset()
    expect(await errorAs('service_role', `SELECT * FROM public.video_asset_transition('${id}','uploading','t','service:test')`)).toBeNull()
    expect(await errorAs('service_role', 'SELECT * FROM public.video_assets')).toBeNull()
    expect(await errorAs('service_role', 'SELECT * FROM public.video_asset_events')).toBeNull()
    expect(await errorAs('service_role', `UPDATE public.video_asset_events SET reason='edited'`)).toBe('42501')
    expect(await errorAs('service_role', `DELETE FROM public.video_asset_events`)).toBe('42501')
  })
})

describe('rollback', () => {
  it('drops the objects it created and touches nothing else', async () => {
    await setup()
    await db.query(`CREATE TABLE public.bystander (id int)`)
    await db.query(ROLLBACK)
    const r = await db.query(`SELECT to_regclass('public.video_assets') AS a, to_regclass('public.video_asset_events') AS e, to_regclass('public.bystander') AS b`)
    expect(r.rows[0].a).toBeNull()
    expect(r.rows[0].e).toBeNull()
    expect(r.rows[0].b).not.toBeNull()
    const f = await db.query(`SELECT count(*)::int AS c FROM pg_proc WHERE proname IN ('video_asset_transition','video_asset_transition_allowed','video_assets_guard')`)
    expect(f.rows[0].c).toBe(0)
    await db.query(MIG) // and it can be applied again
  })
})
