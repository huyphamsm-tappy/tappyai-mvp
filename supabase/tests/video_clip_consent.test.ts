import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Explore video: the per-account acceptance of the clip conditions (20261117_video_clip_consent.sql), proven at the DATABASE.
const REPO = join(__dirname, '..', '..')
const MIG = readFileSync(join(REPO, 'supabase/migrations/20261117_video_clip_consent.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261117_video_clip_consent_rollback.sql'), 'utf8')

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    -- Supabase's service role bypasses row level security; the stand-in must too, or its writes would be refused by RLS (no policy) and the test would prove nothing.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email VARCHAR(255));
`
const A = '11111111-1111-4111-8111-111111111111'
const PORT = 54323 // unique across supabase/tests (portAllocation.test.ts)

let pg: EmbeddedPostgres
let db: Client
let dataDir: string
async function setup() {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE); await db.query(MIG)
  await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [A, 'a@example.com'])
}
async function errorAs(role: string, sql: string): Promise<string | null> {
  try { await db.query(`SET ROLE ${role}`); await db.query(sql); return null } catch (e) { return (e as { code?: string }).code ?? 'unknown' } finally { await db.query('RESET ROLE') }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgclipconsent-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

describe('video_clip_consents', () => {
  beforeEach(async () => { await setup() })

  it('one row per account, version at least 1, withdrawn_at empty while in force', async () => {
    await db.query(`INSERT INTO public.video_clip_consents (user_id, version) VALUES ($1, 1)`, [A])
    const r = (await db.query('SELECT version, accepted_at, withdrawn_at FROM public.video_clip_consents')).rows[0]
    expect(r.version).toBe(1)
    expect(r.accepted_at).toBeInstanceOf(Date)
    expect(r.withdrawn_at).toBeNull()
    expect(await errorAs('postgres', `INSERT INTO public.video_clip_consents (user_id, version) VALUES ('${A}', 1)`)).toBe('23505')
    expect(await errorAs('postgres', `UPDATE public.video_clip_consents SET version = 0`)).toBe('23514')
  })

  it('deleting the account removes its record', async () => {
    await db.query(`INSERT INTO public.video_clip_consents (user_id, version) VALUES ($1, 1)`, [A])
    await db.query('DELETE FROM auth.users WHERE id=$1', [A])
    expect((await db.query('SELECT count(*)::int AS c FROM public.video_clip_consents')).rows[0].c).toBe(0)
  })

  it('RLS is on; anon and signed-in users can read and write nothing; the service role can', async () => {
    expect((await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname='video_clip_consents'`)).rows[0].relrowsecurity).toBe(true)
    for (const role of ['anon', 'authenticated']) {
      expect(await errorAs(role, 'SELECT * FROM public.video_clip_consents'), role).toBe('42501')
      expect(await errorAs(role, `INSERT INTO public.video_clip_consents (user_id, version) VALUES ('${A}', 1)`), role).toBe('42501')
      expect(await errorAs(role, 'UPDATE public.video_clip_consents SET version = 2'), role).toBe('42501')
    }
    expect(await errorAs('service_role', `INSERT INTO public.video_clip_consents (user_id, version) VALUES ('${A}', 1)`)).toBeNull()
  })

  it('rollback drops the table and can be applied again', async () => {
    await db.query(ROLLBACK)
    expect((await db.query(`SELECT to_regclass('public.video_clip_consents') AS t`)).rows[0].t).toBeNull()
    await db.query(MIG)
  })
})
