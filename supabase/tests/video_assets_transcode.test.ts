import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Explore video part 4 (20261113_video_transcode.sql): the three columns the transcoding step needs, and the owner column the clean-up function now returns.
const REPO = join(__dirname, '..', '..')
const mig = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')
const BASE = mig('20261111_video_assets.sql')
const CLEANUP = mig('20261112_video_asset_cleanup.sql')
const TRANSCODE = mig('20261113_video_transcode.sql')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261113_video_transcode_rollback.sql'), 'utf8')

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
const PORT = 54318 // unique across supabase/tests (portAllocation.test.ts)

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

async function setup() {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(BASE); await db.query(CLEANUP); await db.query(TRANSCODE)
  await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [A, 'a@example.com'])
}
async function errorOf(sql: string, params: unknown[] = []): Promise<string | null> {
  try { await db.query(sql, params as never[]); return null } catch (e) { return (e as { code?: string }).code ?? 'unknown' }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgvideotranscode-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

describe('transcoding columns', () => {
  beforeEach(async () => { await setup() })

  it('start empty: has_audio unknown, no attempts, no error', async () => {
    await db.query(`INSERT INTO public.video_assets (owner_id, idempotency_key) VALUES ($1,'transcode-key-0001')`, [A])
    const r = (await db.query('SELECT has_audio, transcode_attempts, transcode_error FROM public.video_assets')).rows[0]
    expect(r).toEqual({ has_audio: null, transcode_attempts: 0, transcode_error: null })
  })

  it('attempts cannot go negative, and the error is a short code (<= 64 characters)', async () => {
    await db.query(`INSERT INTO public.video_assets (owner_id, idempotency_key) VALUES ($1,'transcode-key-0002')`, [A])
    expect(await errorOf(`UPDATE public.video_assets SET transcode_attempts = -1`)).toBe('23514')
    expect(await errorOf(`UPDATE public.video_assets SET transcode_error = $1`, ['x'.repeat(65)])).toBe('23514')
    expect(await errorOf(`UPDATE public.video_assets SET transcode_error = 'transcode_failed', transcode_attempts = 2, has_audio = true`)).toBeNull()
  })

  it('the stuck-processing index exists and is partial (only rows being processed)', async () => {
    const r = await db.query(`SELECT indexdef FROM pg_indexes WHERE indexname='video_assets_processing_idx'`)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].indexdef).toMatch(/processing/)
  })

  it('the clean-up function now says WHOSE file each row is (the staging folder is per owner)', async () => {
    await db.query(`INSERT INTO public.video_assets (owner_id, idempotency_key, state, deleted_at, source_bucket, source_object_key) VALUES ($1,'transcode-key-0003','deleted', now(), 'b', 'vsrc/o/k.mp4')`, [A])
    const r = await db.query('SELECT id, owner_id FROM public.video_assets_due_for_source_cleanup(24, 10)')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].owner_id).toBe(A)
  })

  it('service role can write the new columns; signed-in users still have no access to the table', async () => {
    await db.query(`INSERT INTO public.video_assets (owner_id, idempotency_key) VALUES ($1,'transcode-key-0004')`, [A])
    await db.query('SET ROLE service_role')
    try { expect(await errorOf(`UPDATE public.video_assets SET has_audio = false`)).toBeNull() } finally { await db.query('RESET ROLE') }
    await db.query('SET ROLE authenticated')
    try { expect(await errorOf(`SELECT has_audio FROM public.video_assets`)).toBe('42501') } finally { await db.query('RESET ROLE') }
  })
})

describe('rollback', () => {
  it('drops the columns and index and restores the clean-up function without the owner column', async () => {
    await setup()
    await db.query(ROLLBACK)
    const cols = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='video_assets' AND column_name IN ('has_audio','transcode_attempts','transcode_error')`)
    expect(cols.rows).toEqual([])
    const f = await db.query(`SELECT pg_get_function_result(p.oid) AS res FROM pg_proc p WHERE proname='video_assets_due_for_source_cleanup'`)
    expect(f.rows[0].res).not.toMatch(/owner_id/)
    await db.query(TRANSCODE) // and it can be applied again
  })
})
