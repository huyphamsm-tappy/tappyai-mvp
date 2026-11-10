import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Explore video, publishing + delivery slice (20261116_video_publish_delivery.sql) proven at the DATABASE: publishing is atomic and idempotent per (video, post), a video cannot
// be handed to a second post, and the takedown list names exactly the videos that must not be served. The real migrations, executed verbatim in production order.
const REPO = join(__dirname, '..', '..')
const mig = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')
const BASE = mig('20261111_video_assets.sql')
const CLEANUP = mig('20261112_video_asset_cleanup.sql')
const TRANSCODE = mig('20261113_video_transcode.sql')
const PUBLISH = mig('20261116_video_publish_delivery.sql')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261116_video_publish_delivery_rollback.sql'), 'utf8')

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
// `reviews` is NOT under migrations: this is the minimum the takedown list reads (and a variant WITHOUT the optional columns is used below).
const REVIEWS = `CREATE TABLE public.reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, is_hidden boolean NOT NULL DEFAULT false, publication_state text);`
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const R1 = '33333333-3333-4333-8333-333333333331'
const R2 = '33333333-3333-4333-8333-333333333332'
const PORT = 54324 // unique across supabase/tests (portAllocation.test.ts)

let pg: EmbeddedPostgres
let db: Client
let dataDir: string
let n = 0

async function setup(reviews: string | null = REVIEWS) {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(BASE); await db.query(CLEANUP); await db.query(TRANSCODE)
  if (reviews) await db.query(reviews)
  await db.query(PUBLISH)
  await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2), ($3,$4)', [A, 'a@example.com', B, 'b@example.com'])
}
async function errorOf(sql: string, params: unknown[] = []): Promise<string | null> {
  try { await db.query(sql, params); return null } catch (e) { return (e as { code?: string }).code ?? 'unknown' }
}
async function errorAs(role: string, sql: string, params: unknown[] = []): Promise<string | null> {
  try { await db.query(`SET ROLE ${role}`); await db.query(sql, params); return null }
  catch (e) { return (e as { code?: string }).code ?? 'unknown' } finally { await db.query('RESET ROLE') }
}
async function asset(o: { owner?: string; state?: string; moderation?: string; delivery?: boolean; removed?: boolean; review?: string | null; attempts?: number; ageMin?: number } = {}): Promise<string> {
  const state = o.state ?? 'ready'
  const mod = state === 'ready' || state === 'published' ? 'approved' : (o.moderation ?? 'pending')
  const r = await db.query(
    `INSERT INTO public.video_assets (owner_id, idempotency_key, state, moderation_state, delivery_manifest_key, delivery_removed_at, review_id, delivery_takedown_attempts, updated_at, deleted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() - make_interval(mins => $9), $10) RETURNING id`,
    [o.owner ?? A, `publish-key-${++n}-xx`, state, mod, o.delivery === false ? null : `vdel/${A}/x${n}/manifest.m3u8`, o.removed ? new Date().toISOString() : null, o.review ?? null, o.attempts ?? 0, o.ageMin ?? 0,
      state === 'deleted' ? new Date().toISOString() : null])
  return r.rows[0].id as string
}
const publish = async (id: string, owner = A, review = R1) =>
  (await db.query('SELECT * FROM public.video_asset_publish($1,$2,$3,$4)', [id, owner, review, `user:${owner}`])).rows[0] as { asset_id: string; state: string; review_id: string | null; changed: boolean }
const events = async (id: string) => (await db.query('SELECT from_state, to_state, event_type, actor, correlation_id FROM public.video_asset_events WHERE asset_id=$1 ORDER BY id', [id])).rows
const dueIds = async (limit = 100, max = 8) => (await db.query('SELECT id, takedown_reason FROM public.video_assets_due_for_takedown($1,$2)', [limit, max])).rows as Array<{ id: string; takedown_reason: string }>
const review = (id: string, over: { hidden?: boolean; state?: string | null } = {}) =>
  db.query('INSERT INTO public.reviews (id, user_id, is_hidden, publication_state) VALUES ($1,$2,$3,$4)', [id, A, over.hidden ?? false, over.state === undefined ? 'PUBLISHED' : over.state])

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgvideopublish-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

describe('video_asset_publish', () => {
  beforeEach(async () => { await setup() })

  it('ready + approved + a live delivery copy -> published, stamping the post, through the transition path (one history event)', async () => {
    const id = await asset()
    expect(await publish(id)).toMatchObject({ asset_id: id, state: 'published', review_id: R1, changed: true })
    const row = (await db.query('SELECT state, moderation_state, review_id FROM public.video_assets WHERE id=$1', [id])).rows[0]
    expect(row).toEqual({ state: 'published', moderation_state: 'approved', review_id: R1 })
    expect(await events(id)).toEqual([{ from_state: 'ready', to_state: 'published', event_type: 'post_published', actor: `user:${A}`, correlation_id: R1 }])
  })

  it('is IDEMPOTENT per (video, post): a retry changes nothing and writes no second event', async () => {
    const id = await asset()
    await publish(id)
    expect(await publish(id)).toMatchObject({ state: 'published', review_id: R1, changed: false })
    expect(await events(id)).toHaveLength(1)
  })

  it('🚨 a video that belongs to a post is NEVER given to a second post (published or ready): the first post\'s id comes back', async () => {
    const id = await asset()
    await publish(id, A, R1)
    expect(await publish(id, A, R2)).toMatchObject({ state: 'published', review_id: R1, changed: false })
    const R3 = '33333333-3333-4333-8333-333333333333'
    const reready = await asset({ review: R3 })
    expect(await publish(reready, A, R2)).toMatchObject({ state: 'ready', review_id: R3, changed: false })
  })

  it('a ready video that already carries THIS post (it was restored after a takedown) can be published again', async () => {
    const id = await asset({ review: R1 })
    expect(await publish(id, A, R1)).toMatchObject({ state: 'published', review_id: R1, changed: true })
  })

  it('🚨 refuses everything that is not ready AND approved (23514), a video without a live delivery copy (55000), someone else\'s (42501), an unknown one (P0002)', async () => {
    for (const state of ['draft', 'uploading', 'uploaded', 'processing', 'moderating', 'review_required', 'rejected', 'failed', 'deleted']) {
      const id = await asset({ state })
      expect(await errorOf('SELECT * FROM public.video_asset_publish($1,$2,$3,$4)', [id, A, R1, 'user:a']), state).toBe('23514')
      expect((await db.query('SELECT state FROM public.video_assets WHERE id=$1', [id])).rows[0].state).toBe(state)
    }
    expect(await errorOf('SELECT * FROM public.video_asset_publish($1,$2,$3,$4)', [await asset({ delivery: false }), A, R1, 'user:a'])).toBe('55000')
    expect(await errorOf('SELECT * FROM public.video_asset_publish($1,$2,$3,$4)', [await asset({ removed: true }), A, R1, 'user:a'])).toBe('55000')
    expect(await errorOf('SELECT * FROM public.video_asset_publish($1,$2,$3,$4)', [await asset(), B, R1, 'user:b'])).toBe('42501')
    expect(await errorOf('SELECT * FROM public.video_asset_publish($1,$2,$3,$4)', ['99999999-9999-4999-8999-999999999999', A, R1, 'user:a'])).toBe('P0002')
    expect(await errorOf('SELECT * FROM public.video_asset_publish($1,$2,$3,$4)', [await asset(), A, null, 'user:a'])).toBe('22023')
  })

  it('one video per post at the database too: two assets cannot carry the same post', async () => {
    await publish(await asset(), A, R1)
    expect(await errorOf('UPDATE public.video_assets SET review_id=$1 WHERE id=$2', [R1, await asset()])).toBe('23505')
  })

  it('only the service role can call it', async () => {
    const id = await asset()
    for (const role of ['anon', 'authenticated']) expect(await errorAs(role, 'SELECT * FROM public.video_asset_publish($1,$2,$3,$4)', [id, A, R1, 'user:a']), role).toBe('42501')
    expect(await errorAs('service_role', 'SELECT * FROM public.video_asset_publish($1,$2,$3,$4)', [id, A, R1, 'user:a'])).toBeNull()
  })
})

describe('video_asset_record_takedown', () => {
  beforeEach(async () => { await setup() })

  it('a failed attempt is counted with its code; a success stamps delivery_removed_at once and appends ONE event', async () => {
    const id = await asset({ state: 'rejected' })
    await db.query('SELECT public.video_asset_record_takedown($1,false,$2)', [id, 'cdn_failed'])
    expect((await db.query('SELECT delivery_takedown_attempts a, delivery_takedown_error e, delivery_removed_at r FROM public.video_assets WHERE id=$1', [id])).rows[0]).toEqual({ a: 1, e: 'cdn_failed', r: null })
    await db.query('SELECT public.video_asset_record_takedown($1,true,NULL)', [id])
    await db.query('SELECT public.video_asset_record_takedown($1,true,NULL)', [id])
    const row = (await db.query('SELECT delivery_takedown_attempts a, delivery_takedown_error e, delivery_removed_at r FROM public.video_assets WHERE id=$1', [id])).rows[0]
    expect(row.a).toBe(3); expect(row.e).toBeNull(); expect(row.r).not.toBeNull()
    expect((await events(id)).filter(e => e.event_type === 'delivery_removed')).toHaveLength(1)
  })

  it('an over-long error code is cut to the constraint; only the service role may call it', async () => {
    const id = await asset({ state: 'rejected' })
    await db.query('SELECT public.video_asset_record_takedown($1,false,$2)', [id, 'x'.repeat(200)])
    expect((await db.query('SELECT char_length(delivery_takedown_error) l FROM public.video_assets WHERE id=$1', [id])).rows[0].l).toBe(64)
    expect(await errorAs('authenticated', 'SELECT public.video_asset_record_takedown($1,true,NULL)', [id])).toBe('42501')
  })
})

describe('video_assets_due_for_takedown', () => {
  beforeEach(async () => { await setup() })

  it('every video that left published/ready and still has a delivery copy is due; ready and healthy published videos are not', async () => {
    await review(R1)
    const due: string[] = []
    for (const state of ['rejected', 'review_required', 'deleted', 'failed', 'moderating']) due.push(await asset({ state, moderation: state === 'rejected' ? 'rejected' : 'pending' }))
    const ready = await asset({ state: 'ready' })
    const healthy = await asset({ state: 'published', review: R1 })
    const ids = (await dueIds()).map(r => r.id)
    expect(ids.sort()).toEqual(due.sort())
    expect(ids).not.toContain(ready)
    expect(ids).not.toContain(healthy)
  })

  it('🚨 a published video whose POST is hidden, held or restricted is due (reason post_not_public); a legacy post (publication_state null) is not', async () => {
    await review(R1, { hidden: true })
    await review(R2, { state: 'UNDER_REVIEW' })
    const R3 = '33333333-3333-4333-8333-333333333333'; const R4 = '33333333-3333-4333-8333-333333333334'
    await review(R3, { state: 'RESTRICTED' }); await review(R4, { state: null })
    const hidden = await asset({ state: 'published', review: R1 })
    const held = await asset({ state: 'published', review: R2 })
    const restricted = await asset({ state: 'published', review: R3 })
    const legacy = await asset({ state: 'published', review: R4 })
    const due = await dueIds()
    expect(due.map(r => r.id).sort()).toEqual([hidden, held, restricted].sort())
    expect(new Set(due.map(r => r.takedown_reason))).toEqual(new Set(['post_not_public']))
    expect(due.map(r => r.id)).not.toContain(legacy)
  })

  it('a published video whose post row is MISSING is due only after the 15 minute grace (the post is written just after the claim)', async () => {
    const fresh = await asset({ state: 'published', review: R1, ageMin: 1 })
    const stale = await asset({ state: 'published', review: R2, ageMin: 30 })
    expect((await dueIds()).map(r => r.id)).toEqual([stale])
    expect((await dueIds()).map(r => r.id)).not.toContain(fresh)
  })

  it('already removed, no delivery copy, or past the attempt ceiling: not listed; ordered oldest first and limited', async () => {
    await asset({ state: 'rejected', removed: true })
    await asset({ state: 'rejected', delivery: false })
    await asset({ state: 'rejected', attempts: 8 })
    const old = await asset({ state: 'rejected', ageMin: 50 })
    const mid = await asset({ state: 'rejected', ageMin: 20 })
    await asset({ state: 'rejected', ageMin: 5 })
    expect((await dueIds(2)).map(r => r.id)).toEqual([old, mid])
    expect((await dueIds(100, 8)).length).toBe(3)
    expect((await dueIds(100, 9)).length).toBe(4)
  })

  it('works when `reviews` lacks the optional columns (to_jsonb read), and only the service role may call it', async () => {
    await setup('CREATE TABLE public.reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL);')
    await db.query('INSERT INTO public.reviews (id, user_id) VALUES ($1,$2)', [R1, A])
    const healthy = await asset({ state: 'published', review: R1 })
    expect((await dueIds()).map(r => r.id)).not.toContain(healthy)
    expect(await errorAs('anon', 'SELECT * FROM public.video_assets_due_for_takedown(10, 8)')).toBe('42501')
    expect(await errorAs('authenticated', 'SELECT * FROM public.video_assets_due_for_takedown(10, 8)')).toBe('42501')
  })

  it('the migration applies even where `reviews` does not exist yet (the function is late-bound; it only needs the table when it RUNS)', async () => {
    await setup(null)
    expect(await errorOf('SELECT * FROM public.video_assets_due_for_takedown(10, 8)')).toBe('42P01')
    expect(await errorOf('SELECT * FROM public.video_asset_publish($1,$2,$3,$4)', [A, A, R1, 'x'])).toBe('P0002')
  })
})

describe('rollback', () => {
  it('removes exactly what the migration added, and the earlier migrations still work', async () => {
    await setup()
    await db.query(ROLLBACK)
    expect(await errorOf('SELECT * FROM public.video_asset_publish($1,$2,$3,$4)', [A, A, R1, 'x'])).toBe('42883')
    const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='video_assets' AND column_name LIKE 'delivery_%' ORDER BY 1`)).rows.map(r => r.column_name)
    expect(cols).toEqual(['delivery_manifest_key'])
    const id = (await db.query(`INSERT INTO public.video_assets (owner_id, idempotency_key) VALUES ($1,'rollback-key-0001') RETURNING id`, [A])).rows[0].id
    expect((await db.query('SELECT state FROM public.video_asset_transition($1,$2,$3,$4)', [id, 'uploading', 'x', 'y'])).rows[0].state).toBe('uploading')
  })
})
