import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Explore video VID-02 / VID-04 (20261115_video_overlays.sql): the overlay document with optimistic versions, and the download render claim.
const REPO = join(__dirname, '..', '..')
const mig = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')
const BASE = mig('20261111_video_assets.sql')
const OVERLAYS = mig('20261115_video_overlays.sql')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261115_video_overlays_rollback.sql'), 'utf8')

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
const KEY = 'a'.repeat(64)
const KEY2 = 'b'.repeat(64)
const PORT = 54320 // unique across supabase/tests (portAllocation.test.ts)

let pg: EmbeddedPostgres
let db: Client
let dataDir: string
let asset: string

async function setup() {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(BASE); await db.query(OVERLAYS)
  await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2),($3,$4)', [A, 'a@example.com', B, 'b@example.com'])
  asset = (await db.query(`INSERT INTO public.video_assets (owner_id, idempotency_key) VALUES ($1,'overlay-key-0001') RETURNING id`, [A])).rows[0].id
}
async function errorOf(sql: string, params: unknown[] = []): Promise<string | null> {
  try { await db.query(sql, params as never[]); return null } catch (e) { return (e as { code?: string }).code ?? 'unknown' }
}
const save = async (a: string, owner: string, expected: number, doc: unknown = { schema_version: 1, layers: [] }) =>
  (await db.query('SELECT status, version FROM public.video_overlay_save($1,$2,$3,$4::jsonb)', [a, owner, expected, JSON.stringify(doc)])).rows[0] as { status: string; version: number }
const claim = async (key = KEY, max = 3, grace = 120, cooldown = 3600) =>
  (await db.query('SELECT * FROM public.video_download_claim($1,$2,$3,$4,$5)', [asset, key, max, grace, cooldown])).rows[0] as {
    claimed: boolean; state: string; attempts: number; job_name: string | null; object_key: string | null; error_code: string | null
  }
const backdate = async (seconds: number) => {
  // The stamp trigger rewrites updated_at on every UPDATE, so the test switches it off to age a row.
  await db.query('ALTER TABLE public.video_download_renders DISABLE TRIGGER video_download_renders_stamp')
  await db.query(`UPDATE public.video_download_renders SET updated_at = now() - make_interval(secs => $1)`, [seconds])
  await db.query('ALTER TABLE public.video_download_renders ENABLE TRIGGER video_download_renders_stamp')
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgvideooverlay-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

describe('video_overlay_save', () => {
  beforeEach(async () => { await setup() })

  it('the first save is version 1 (expected 0), each next save is +1, and the document is stored', async () => {
    expect(await save(asset, A, 0, { schema_version: 1, layers: [{ id: 'a' }] })).toEqual({ status: 'saved', version: 1 })
    expect(await save(asset, A, 1)).toEqual({ status: 'saved', version: 2 })
    const row = (await db.query('SELECT version, doc FROM public.video_overlays WHERE asset_id=$1', [asset])).rows[0]
    expect(row.version).toBe(2)
    expect(row.doc).toEqual({ schema_version: 1, layers: [] })
  })

  it('🚨 a stale editor gets `conflict` and the stored document is NOT overwritten', async () => {
    await save(asset, A, 0, { schema_version: 1, layers: [{ id: 'first' }] })
    await save(asset, A, 1, { schema_version: 1, layers: [{ id: 'second' }] })
    expect(await save(asset, A, 1, { schema_version: 1, layers: [{ id: 'stale' }] })).toEqual({ status: 'conflict', version: 2 })
    expect(await save(asset, A, 0)).toEqual({ status: 'conflict', version: 2 })
    expect((await db.query('SELECT doc FROM public.video_overlays')).rows[0].doc.layers[0].id).toBe('second')
  })

  it('🚨 somebody else\'s asset and an unknown asset answer the same `not_found`, and nothing is written', async () => {
    expect(await save(asset, B, 0)).toEqual({ status: 'not_found', version: 0 })
    expect(await save('99999999-9999-4999-8999-999999999999', A, 0)).toEqual({ status: 'not_found', version: 0 })
    expect((await db.query('SELECT count(*)::int AS n FROM public.video_overlays')).rows[0].n).toBe(0)
  })

  it('🚨 a deleted asset cannot be edited', async () => {
    await db.query(`SELECT * FROM public.video_asset_transition($1, 'deleted', 'test', 'test', NULL, NULL, NULL)`, [asset])
    expect(await save(asset, A, 0)).toEqual({ status: 'deleted', version: 0 })
  })

  it('a document must be a JSON object within the size bound', async () => {
    expect(await errorOf(`INSERT INTO public.video_overlays (asset_id, version, doc) VALUES ($1, 1, '[]'::jsonb)`, [asset])).toBe('23514')
    expect(await errorOf(`INSERT INTO public.video_overlays (asset_id, version, doc) VALUES ($1, 1, jsonb_build_object('x', repeat('y', 70000)))`, [asset])).toBe('23514')
    expect(await errorOf(`INSERT INTO public.video_overlays (asset_id, version, doc) VALUES ($1, 0, '{}'::jsonb)`, [asset])).toBe('23514')
  })

  it('two concurrent saves of the same version: exactly one wins', async () => {
    await save(asset, A, 0)
    const c2 = pg.getPgClient('test'); await c2.connect()
    try {
      const run = (c: Client) => c.query('SELECT status FROM public.video_overlay_save($1,$2,$3,$4::jsonb)', [asset, A, 1, JSON.stringify({ schema_version: 1, layers: [] })]).then(r => r.rows[0].status as string)
      const results = await Promise.all([run(db), run(c2)])
      expect(results.sort()).toEqual(['conflict', 'saved'])
    } finally { await c2.end() }
  })

  it('the overlay goes away with its asset', async () => {
    await save(asset, A, 0)
    await db.query('DELETE FROM public.video_assets WHERE id=$1', [asset])
    expect((await db.query('SELECT count(*)::int AS n FROM public.video_overlays')).rows[0].n).toBe(0)
  })
})

describe('video_download_claim', () => {
  beforeEach(async () => { await setup() })

  it('the first caller claims, the second sees it rendering and does not', async () => {
    expect(await claim()).toMatchObject({ claimed: true, state: 'rendering', attempts: 0, job_name: null })
    expect(await claim()).toMatchObject({ claimed: false, state: 'rendering' })
  })

  it('🚨 concurrent callers: exactly ONE claims', async () => {
    const clients = await Promise.all([1, 2, 3, 4].map(async () => { const c = pg.getPgClient('test'); await c.connect(); return c }))
    try {
      const out = await Promise.all(clients.map(c => c.query('SELECT claimed FROM public.video_download_claim($1,$2,3,120,3600)', [asset, KEY]).then(r => r.rows[0].claimed as boolean)))
      expect(out.filter(Boolean)).toHaveLength(1)
    } finally { await Promise.all(clients.map(c => c.end())) }
  })

  it('a different cache key is a different render (a changed overlay or username re-renders)', async () => {
    expect((await claim(KEY)).claimed).toBe(true)
    expect((await claim(KEY2)).claimed).toBe(true)
    expect((await db.query('SELECT count(*)::int AS n FROM public.video_download_renders')).rows[0].n).toBe(2)
  })

  it('a render whose creator died before recording a job is taken over only after the grace period', async () => {
    await claim()
    expect((await claim()).claimed).toBe(false)
    await backdate(300)
    expect((await claim()).claimed).toBe(true)
    // Having just been taken over, it is "fresh" again.
    expect((await claim()).claimed).toBe(false)
  })

  it('a render that HAS a job is never taken over by the claim (the poller owns it)', async () => {
    await claim()
    await db.query(`UPDATE public.video_download_renders SET job_name='projects/1/locations/x/jobs/j', attempts=1`)
    await backdate(99999)
    expect((await claim()).claimed).toBe(false)
  })

  it('a ready render is returned as is, with its file', async () => {
    await claim()
    await db.query(`UPDATE public.video_download_renders SET state='ready', object_key='vdl/x/y/z/download.mp4'`)
    expect(await claim()).toMatchObject({ claimed: false, state: 'ready', object_key: 'vdl/x/y/z/download.mp4' })
  })

  it('a failed render is retried while attempts remain, then left alone until the cool-down, then given a fresh budget', async () => {
    await claim()
    await db.query(`UPDATE public.video_download_renders SET state='failed', attempts=2, error_code='render_failed'`)
    expect(await claim(KEY, 3)).toMatchObject({ claimed: true, state: 'rendering', attempts: 2, error_code: null })
    await db.query(`UPDATE public.video_download_renders SET state='failed', attempts=3, error_code='render_failed'`)
    expect(await claim(KEY, 3)).toMatchObject({ claimed: false, state: 'failed', error_code: 'render_failed' })
    await backdate(4000)
    expect(await claim(KEY, 3, 120, 3600)).toMatchObject({ claimed: true, state: 'rendering', attempts: 0 })
  })

  it('constraints: state is a closed set, the key is 64 hex, a ready row has a file, the error is a short code', async () => {
    expect(await errorOf(`INSERT INTO public.video_download_renders (asset_id, cache_key) VALUES ($1,'xyz')`, [asset])).toBe('23514')
    expect(await errorOf(`INSERT INTO public.video_download_renders (asset_id, cache_key, state) VALUES ($1,$2,'weird')`, [asset, KEY])).toBe('23514')
    expect(await errorOf(`INSERT INTO public.video_download_renders (asset_id, cache_key, state) VALUES ($1,$2,'ready')`, [asset, KEY])).toBe('23514')
    expect(await errorOf(`INSERT INTO public.video_download_renders (asset_id, cache_key, error_code) VALUES ($1,$2,$3)`, [asset, KEY, 'x'.repeat(65)])).toBe('23514')
  })
})

describe('access control', () => {
  beforeEach(async () => { await setup() })

  it('🚨 anon and authenticated can touch neither table nor call either function; the service role can', async () => {
    await claim()
    for (const role of ['anon', 'authenticated']) {
      await db.query(`SET ROLE ${role}`)
      try {
        expect(await errorOf('SELECT * FROM public.video_overlays')).toBe('42501')
        expect(await errorOf('SELECT * FROM public.video_download_renders')).toBe('42501')
        expect(await errorOf(`SELECT * FROM public.video_overlay_save($1,$2,0,'{}'::jsonb)`, [asset, A])).toBe('42501')
        expect(await errorOf('SELECT * FROM public.video_download_claim($1,$2,3,120,3600)', [asset, KEY])).toBe('42501')
      } finally { await db.query('RESET ROLE') }
    }
    await db.query('SET ROLE service_role')
    try {
      expect(await errorOf('SELECT * FROM public.video_overlays')).toBeNull()
      expect(await errorOf('SELECT * FROM public.video_download_renders')).toBeNull()
    } finally { await db.query('RESET ROLE') }
  })

  it('row level security is on for both tables', async () => {
    const r = (await db.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('video_overlays','video_download_renders') ORDER BY relname`)).rows
    expect(r).toEqual([{ relname: 'video_download_renders', relrowsecurity: true }, { relname: 'video_overlays', relrowsecurity: true }])
  })
})

describe('rollback', () => {
  it('removes everything the migration added and leaves the video table alone', async () => {
    await setup()
    await db.query(ROLLBACK)
    const left = (await db.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('video_overlay_save','video_download_claim','video_overlays_stamp')`)).rows[0].n
    const tables = (await db.query(`SELECT count(*)::int AS n FROM pg_tables WHERE tablename IN ('video_overlays','video_download_renders')`)).rows[0].n
    expect([left, tables]).toEqual([0, 0])
    expect((await db.query(`SELECT count(*)::int AS n FROM public.video_assets`)).rows[0].n).toBe(1)
    // And it can be applied again.
    await db.query(OVERLAYS)
  })
})
