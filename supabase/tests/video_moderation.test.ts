import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Explore video VID-03 (20261114_video_moderation.sql) proven at the DATABASE: the append-only decision record, the idempotent automatic decision, the child-safety hold,
// the human decision with its required note, and that ready still requires approved. The real migrations executed verbatim in production order.
const REPO = join(__dirname, '..', '..')
const mig = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')
const BASE = mig('20261111_video_assets.sql')
const CLEANUP = mig('20261112_video_asset_cleanup.sql')
const TRANSCODE = mig('20261113_video_transcode.sql')
const MODERATION = mig('20261114_video_moderation.sql')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261114_video_moderation_rollback.sql'), 'utf8')

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
const PORT = 54319 // unique across supabase/tests (portAllocation.test.ts)
const FUTURE = () => new Date(Date.now() + 365 * 86_400_000).toISOString()

let pg: EmbeddedPostgres
let db: Client
let dataDir: string
let n = 0

async function setup() {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  for (const sql of [BASE, CLEANUP, TRANSCODE, MODERATION]) await db.query(sql)
  await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [A, 'a@example.com'])
}
async function errorAs(role: string, sql: string, params: unknown[] = []): Promise<string | null> {
  try { await db.query(`SET ROLE ${role}`); await db.query(sql, params); return null }
  catch (e) { return (e as { code?: string }).code ?? 'unknown' } finally { await db.query('RESET ROLE') }
}
async function asset(state: string): Promise<string> {
  const mod = state === 'ready' || state === 'published' ? 'approved' : 'pending'
  const r = await db.query(
    `INSERT INTO public.video_assets (owner_id, idempotency_key, state, moderation_state, deleted_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [A, `moderation-key-${++n}-xx`, state, mod, state === 'deleted' ? new Date().toISOString() : null])
  return r.rows[0].id as string
}
interface Auto { decision?: string; category?: string | null; confidence?: number | null; reason?: string; priority?: string; csam?: boolean; hold?: string | null; transcript?: string | null }
const auto = async (id: string, o: Auto = {}) =>
  (await db.query(
    'SELECT asset_id, state, changed FROM public.video_moderation_record_auto($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
    [id, o.decision ?? 'approve', o.category ?? null, o.confidence ?? 0.99, o.reason ?? 'all_clear', o.priority ?? 'normal', 'openai', 'omni-moderation-latest', 'vmod-1',
      JSON.stringify({ visual: { status: 'analysed', key: 'vstg/x/frames0000000000.jpeg' } }), o.transcript ?? null, o.csam ?? false, o.hold ?? null, 'service:video-moderation'],
  )).rows[0] as { asset_id: string; state: string; changed: boolean }
const human = async (id: string, decision: string, note: string | null, actor = 'user:mod-1') =>
  (await db.query('SELECT asset_id, state, changed FROM public.video_moderation_review_decide($1,$2,$3,$4)', [id, decision, note, actor])).rows[0] as { asset_id: string; state: string; changed: boolean }
const results = async (id: string) => (await db.query('SELECT * FROM public.video_moderation_results WHERE asset_id=$1 ORDER BY id', [id])).rows
const events = async (id: string) => (await db.query('SELECT from_state, to_state, event_type, actor, reason FROM public.video_asset_events WHERE asset_id=$1 ORDER BY id', [id])).rows
const row = async (id: string) => (await db.query('SELECT state, moderation_state, legal_hold_until FROM public.video_assets WHERE id=$1', [id])).rows[0]

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgvideomoderation-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

describe('the automatic decision', () => {
  beforeEach(async () => { await setup() })

  it('approve moves moderating to ready WITH moderation approved, writes one audited result row and one history event', async () => {
    const id = await asset('moderating')
    expect(await auto(id, { decision: 'approve', transcript: 'xin chào' })).toMatchObject({ asset_id: id, state: 'ready', changed: true })
    expect(await row(id)).toMatchObject({ state: 'ready', moderation_state: 'approved' })
    const r = await results(id)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ kind: 'automated', decision: 'approve', reason_code: 'all_clear', provider: 'openai', model: 'omni-moderation-latest', policy_version: 'vmod-1', transcript: 'xin chào', actor: 'service:video-moderation' })
    expect(Number(r[0].confidence)).toBeCloseTo(0.99, 4)
    expect(r[0].evidence.visual.status).toBe('analysed')
    expect(await events(id)).toEqual([{ from_state: 'moderating', to_state: 'ready', event_type: 'moderation_approve', actor: 'service:video-moderation', reason: 'all_clear' }])
  })

  it('review_required and reject land on their own state and moderation state', async () => {
    const a = await asset('moderating'); const b = await asset('moderating')
    await auto(a, { decision: 'review_required', category: 'violence', confidence: 0.7, reason: 'category_high', priority: 'high' })
    await auto(b, { decision: 'reject', category: 'sexual', confidence: 0.97, reason: 'auto_reject_clear_violation' })
    expect(await row(a)).toMatchObject({ state: 'review_required', moderation_state: 'review_required' })
    expect(await row(b)).toMatchObject({ state: 'rejected', moderation_state: 'rejected' })
    expect((await results(a))[0]).toMatchObject({ category: 'violence', priority: 'high' })
  })

  it('🚨 running it twice (a retry, two callers) writes ONE decision and ONE event', async () => {
    const id = await asset('moderating')
    const first = await auto(id)
    const second = await auto(id, { decision: 'reject', reason: 'different' })
    expect(first.changed).toBe(true)
    expect(second).toMatchObject({ state: 'ready', changed: false })
    expect(await results(id)).toHaveLength(1)
    expect(await events(id)).toHaveLength(1)
    expect(await row(id)).toMatchObject({ state: 'ready' })
  })

  it('does nothing for a video that is not in moderating (no row, no event, state kept)', async () => {
    for (const s of ['uploaded', 'processing', 'review_required', 'ready', 'rejected']) {
      const id = await asset(s)
      expect(await auto(id)).toMatchObject({ state: s, changed: false })
      expect(await results(id)).toHaveLength(0)
      expect(await events(id)).toHaveLength(0)
    }
  })

  it('an unknown video is an error, an unknown decision is refused', async () => {
    expect(await errorAs('service_role', 'SELECT * FROM public.video_moderation_record_auto($1,$2,NULL,0.9,$3,$4,$5,$6,$7,$8,NULL,false,NULL,$9)',
      ['99999999-9999-4999-8999-999999999999', 'approve', 'x', 'normal', 'openai', 'm', 'v', '{}', 'a'])).toBe('P0002')
    const id = await asset('moderating')
    expect(await errorAs('service_role', 'SELECT * FROM public.video_moderation_record_auto($1,$2,NULL,0.9,$3,$4,$5,$6,$7,$8,NULL,false,NULL,$9)',
      [id, 'maybe', 'x', 'normal', 'openai', 'm', 'v', '{}', 'a'])).toBe('22023')
  })
})

describe('🚨 a suspected child-safety case', () => {
  beforeEach(async () => { await setup() })

  it('goes to review_required with a csam_suspected event AND a legal hold in the future; the history shows both', async () => {
    const id = await asset('moderating')
    const hold = FUTURE()
    expect(await auto(id, { decision: 'review_required', category: 'sexual/minors', confidence: 0.6, reason: 'severe_category', priority: 'urgent', csam: true, hold })).toMatchObject({ state: 'review_required', changed: true })
    const v = await row(id)
    expect(v.state).toBe('review_required')
    expect(new Date(v.legal_hold_until).getTime()).toBeGreaterThan(Date.now())
    const types = (await events(id)).map(e => e.event_type)
    expect(types).toEqual(['csam_suspected', 'hold_set', 'moderation_review_required'])
    expect((await results(id))[0]).toMatchObject({ priority: 'urgent', category: 'sexual/minors' })
  })

  it('the database itself refuses to approve or reject it, or to record it without a future hold', async () => {
    const id = await asset('moderating')
    const call = (o: Auto) => errorAs('service_role', 'SELECT * FROM public.video_moderation_record_auto($1,$2,NULL,0.9,$3,$4,$5,$6,$7,$8,NULL,true,$9,$10)',
      [id, o.decision, 'severe_category', 'urgent', 'openai', 'm', 'v', '{}', o.hold ?? null, 'a'])
    expect(await call({ decision: 'approve', hold: FUTURE() })).toBe('22023')
    expect(await call({ decision: 'reject', hold: FUTURE() })).toBe('22023')
    expect(await call({ decision: 'review_required', hold: null })).toBe('22023')
    expect(await call({ decision: 'review_required', hold: new Date(Date.now() - 1000).toISOString() })).toBe('22023')
    expect(await row(id)).toMatchObject({ state: 'moderating' })
    expect(await results(id)).toHaveLength(0)
  })

  it('while the hold is active the clean-up does not list the file (the hold works)', async () => {
    const id = await asset('moderating')
    await db.query(`UPDATE public.video_assets SET source_bucket='b', source_object_key='vsrc/x/y.mp4' WHERE id=$1`, [id])
    await auto(id, { decision: 'review_required', csam: true, hold: FUTURE(), priority: 'urgent', reason: 'severe_category', category: 'sexual/minors' })
    // The owner deletes the post: a deleted video is normally due at once, but the hold keeps its file.
    await db.query(`SELECT * FROM public.video_asset_transition($1,'deleted','owner_deleted','user:x')`, [id])
    expect((await db.query('SELECT id FROM public.video_assets_due_for_source_cleanup(24, 100)')).rows).toEqual([])
  })
})

describe('the human decision', () => {
  beforeEach(async () => { await setup() })

  it('approve: review_required -> ready WITH approved; the note, actor and decision are recorded', async () => {
    const id = await asset('review_required')
    expect(await human(id, 'approve', 'Checked all six frames and the transcript: fine.')).toMatchObject({ state: 'ready', changed: true })
    expect(await row(id)).toMatchObject({ state: 'ready', moderation_state: 'approved' })
    expect((await results(id))[0]).toMatchObject({ kind: 'human', decision: 'approve', actor: 'user:mod-1', note: 'Checked all six frames and the transcript: fine.', reason_code: 'human_approve' })
    expect((await events(id))[0]).toMatchObject({ from_state: 'review_required', to_state: 'ready', event_type: 'human_approve', actor: 'user:mod-1' })
  })

  it('reject: review_required -> rejected', async () => {
    const id = await asset('review_required')
    expect(await human(id, 'reject', 'Graphic violence at 0:12')).toMatchObject({ state: 'rejected', changed: true })
    expect(await row(id)).toMatchObject({ state: 'rejected', moderation_state: 'rejected' })
  })

  it('a note is required: empty, blank or missing is refused and nothing changes', async () => {
    const id = await asset('review_required')
    for (const note of ['', '   ', null]) {
      expect(await errorAs('service_role', 'SELECT * FROM public.video_moderation_review_decide($1,$2,$3,$4)', [id, 'approve', note, 'user:m'])).toBe('22023')
    }
    expect(await errorAs('service_role', 'SELECT * FROM public.video_moderation_review_decide($1,$2,$3,$4)', [id, 'maybe', 'note', 'user:m'])).toBe('22023')
    expect(await row(id)).toMatchObject({ state: 'review_required' })
    expect(await results(id)).toHaveLength(0)
  })

  it('🚨 idempotent: a second decision (same or the opposite) is reported unchanged and writes nothing', async () => {
    const id = await asset('review_required')
    await human(id, 'approve', 'ok')
    expect(await human(id, 'approve', 'ok again')).toMatchObject({ state: 'ready', changed: false })
    expect(await human(id, 'reject', 'changed my mind')).toMatchObject({ state: 'ready', changed: false })
    expect(await results(id)).toHaveLength(1)
    expect(await events(id)).toHaveLength(1)
  })

  it('does not touch a video that is not waiting for review', async () => {
    for (const s of ['moderating', 'processing', 'published']) {
      const id = await asset(s)
      expect(await human(id, 'approve', 'note')).toMatchObject({ state: s, changed: false })
      expect(await results(id)).toHaveLength(0)
    }
  })

  it('the table itself refuses a human row without a note, and an automated row without its audit fields', async () => {
    const id = await asset('review_required')
    expect(await errorAs('postgres', `INSERT INTO public.video_moderation_results (asset_id, kind, decision, reason_code, actor) VALUES ($1,'human','approve','x','u')`, [id])).toBe('23514')
    expect(await errorAs('postgres', `INSERT INTO public.video_moderation_results (asset_id, kind, decision, reason_code, actor) VALUES ($1,'automated','approve','x','u')`, [id])).toBe('23514')
    expect(await errorAs('postgres', `INSERT INTO public.video_moderation_results (asset_id, kind, decision, reason_code, actor, note) VALUES ($1,'human','delete','x','u','n')`, [id])).toBe('23514')
  })
})

describe('the once-only note event', () => {
  beforeEach(async () => { await setup() })
  it('writes the event the first time and never again', async () => {
    const id = await asset('moderating')
    const call = async () => (await db.query('SELECT public.video_asset_note_event_once($1,$2,$3,$4) AS w', [id, 'no_ai_consent', 'service:video-moderation', 'no_ai_consent'])).rows[0].w
    expect(await call()).toBe(true)
    expect(await call()).toBe(false)
    expect((await events(id)).filter(e => e.event_type === 'no_ai_consent')).toHaveLength(1)
    expect(await row(id)).toMatchObject({ state: 'moderating' })
  })
})

describe('access and shape', () => {
  beforeEach(async () => { await setup() })

  it('only the service role: anon and authenticated can neither read the table nor call the functions', async () => {
    const id = await asset('moderating')
    for (const role of ['anon', 'authenticated']) {
      expect(await errorAs(role, 'SELECT * FROM public.video_moderation_results')).toBe('42501')
      expect(await errorAs(role, 'SELECT * FROM public.video_moderation_review_decide($1,$2,$3,$4)', [id, 'approve', 'n', 'a'])).toBe('42501')
      expect(await errorAs(role, 'SELECT public.video_asset_note_event_once($1,$2,$3,$4)', [id, 'x', 'a', 'r'])).toBe('42501')
    }
  })

  it('🚨 append-only: the service role can read and insert but NEVER update or delete a result', async () => {
    const id = await asset('moderating')
    await auto(id)
    expect(await errorAs('service_role', 'SELECT count(*) FROM public.video_moderation_results')).toBeNull()
    expect(await errorAs('service_role', `UPDATE public.video_moderation_results SET reason_code='x'`)).toBe('42501')
    expect(await errorAs('service_role', 'DELETE FROM public.video_moderation_results')).toBe('42501')
    expect(await errorAs('service_role', 'TRUNCATE public.video_moderation_results')).toBe('42501')
  })

  it('RLS is on, and deleting the account removes its results (cascade)', async () => {
    const id = await asset('moderating')
    await auto(id)
    expect((await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname='video_moderation_results'`)).rows[0].relrowsecurity).toBe(true)
    await db.query('DELETE FROM auth.users WHERE id=$1', [A])
    expect((await db.query('SELECT count(*)::int AS c FROM public.video_moderation_results')).rows[0].c).toBe(0)
  })

  it('the lifecycle constraint still holds: ready needs approved, whatever the moderation functions do', async () => {
    const id = await asset('review_required')
    expect(await errorAs('postgres', `UPDATE public.video_assets SET state='ready' WHERE id=$1`, [id])).toBe('23514')
  })

  it('applying the migration twice changes nothing, and the rollback removes what it added and leaves the lifecycle intact', async () => {
    await db.query(MODERATION)
    const id = await asset('moderating')
    await auto(id)
    await db.query(ROLLBACK)
    expect((await db.query(`SELECT to_regclass('public.video_moderation_results') AS t`)).rows[0].t).toBeNull()
    expect((await db.query(`SELECT count(*)::int AS c FROM pg_proc WHERE proname IN ('video_moderation_record_auto','video_moderation_review_decide','video_asset_note_event_once')`)).rows[0].c).toBe(0)
    expect((await db.query(`SELECT count(*)::int AS c FROM information_schema.columns WHERE table_name='video_assets' AND column_name LIKE 'moderation_%' AND column_name <> 'moderation_state'`)).rows[0].c).toBe(0)
    expect(await row(id)).toMatchObject({ state: 'ready' })
  })
})
