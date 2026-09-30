import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// Security audit 2026-09-30 — content_reports INSERT is pinned to the caller.
//
// 20260817_content_safety_gate.sql let `authenticated` INSERT with WITH CHECK (true). Straight
// through PostgREST, one user could file N reports under N invented reporter_source_ids (N
// "distinct reporters" for the moderator), mark them VERIFIED, or close them. This suite reproduces
// that on a real PostgreSQL with the table and policy as 20260817 created them, applies the real
// migration file, and proves the route's own insert still works.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260930_content_reports_insert_check.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20260930_content_reports_insert_check_rollback.sql'), 'utf8')
const PORT = 54301

const REPORTER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const VICTIM_POST = '22222222-2222-4222-8222-222222222222'
/** Exactly what POST /api/reviews/[id]/report computes. */
const sourceId = (uid: string) => createHash('sha256').update(`content_report:${uid}`).digest('hex')

const BASELINE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

  CREATE TABLE public.reviews (id UUID PRIMARY KEY, user_id UUID NOT NULL);
  -- content_reports exactly as 20260817_content_safety_gate.sql creates it.
  CREATE TABLE public.content_reports (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id         UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    reporter_source_id TEXT NOT NULL,
    reason             TEXT NOT NULL,
    policy_id          TEXT,
    verification_state TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_state IN ('UNVERIFIED', 'VERIFIED', 'REJECTED')),
    status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'closed')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (content_id, reporter_source_id, reason)
  );
  ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users can file a content report" ON public.content_reports FOR INSERT TO authenticated WITH CHECK (true);
  -- Supabase's default table grants.
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_reports, public.reviews TO anon, authenticated;
  GRANT ALL ON public.content_reports, public.reviews TO service_role;
  INSERT INTO public.reviews (id, user_id) VALUES ('${VICTIM_POST}', 'f9077a52-b0f3-453a-a497-97da115ae386');
`

let pg: EmbeddedPostgres
let db: Client
const dataDir = mkdtempSync(join(tmpdir(), 'content-reports-'))

beforeAll(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('reports')
  db = pg.getPgClient('reports')
  await db.connect()
}, 240_000)

afterAll(async () => {
  try { await db?.end() } catch { /* already closed */ }
  try { await pg?.stop() } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

beforeEach(async () => {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE;')
  await db.query(BASELINE)
})

type Outcome = { ok: true; rows: number } | { ok: false; code: string }

/** One INSERT as a PostgREST caller would run it, in a transaction that is always rolled back. */
async function asUser(uid: string | null, sql: string, params: unknown[] = [], claims: Record<string, unknown> = {}): Promise<Outcome> {
  await db.query('BEGIN')
  try {
    await db.query(`SET LOCAL ROLE ${uid ? 'authenticated' : 'anon'}`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, ...claims })])
    const r = await db.query(sql, params)
    return { ok: true, rows: r.rowCount ?? 0 }
  } catch (e) {
    return { ok: false, code: (e as { code?: string }).code ?? 'unknown' }
  } finally {
    await db.query('ROLLBACK')
  }
}

const ROUTE_INSERT = 'INSERT INTO public.content_reports (content_id, reporter_source_id, reason) VALUES ($1, $2, $3)'

describe('before the migration — the hole, reproduced', () => {
  it('🚨 a user files a report under an invented reporter id, already VERIFIED and closed', async () => {
    const r = await asUser(REPORTER,
      `INSERT INTO public.content_reports (content_id, reporter_source_id, reason, verification_state, status, created_at)
       VALUES ($1, 'sock-puppet-7', 'spam', 'VERIFIED', 'closed', '2020-01-01')`, [VICTIM_POST])
    expect(r).toEqual({ ok: true, rows: 1 })
  })
})

describe('after the migration', () => {
  beforeEach(async () => { await db.query(MIGRATION) })

  it('the route\'s own insert still works — the SQL hash matches node:crypto', async () => {
    expect(await asUser(REPORTER, ROUTE_INSERT, [VICTIM_POST, sourceId(REPORTER), 'spam'])).toEqual({ ok: true, rows: 1 })
    const { rows } = await db.query(`SELECT encode(sha256(convert_to('content_report:' || $1::text, 'UTF8')), 'hex') AS h`, [REPORTER])
    expect(rows[0].h).toBe(sourceId(REPORTER))
  })

  it('🚨 an invented reporter id is refused', async () => {
    expect(await asUser(REPORTER, ROUTE_INSERT, [VICTIM_POST, 'sock-puppet-7', 'spam'])).toEqual({ ok: false, code: '42501' })
  })

  it('🚨 someone ELSE\'s reporter id is refused (it is derivable, so it must be bound to the caller)', async () => {
    const other = 'f9077a52-b0f3-453a-a497-97da115ae386'
    expect(await asUser(REPORTER, ROUTE_INSERT, [VICTIM_POST, sourceId(other), 'spam'])).toEqual({ ok: false, code: '42501' })
  })

  it.each([
    ['verification_state', `'VERIFIED'`],
    ['status', `'closed'`],
    ['created_at', `'2020-01-01'`],
    ['id', `'33333333-3333-4333-8333-333333333333'`],
  ])('🚨 the caller cannot set %s', async (col, value) => {
    const r = await asUser(REPORTER,
      `INSERT INTO public.content_reports (content_id, reporter_source_id, reason, ${col}) VALUES ($1, $2, 'spam', ${value})`,
      [VICTIM_POST, sourceId(REPORTER)])
    expect(r).toEqual({ ok: false, code: '42501' })
  })

  it('an anonymous session cannot file', async () => {
    expect(await asUser(REPORTER, ROUTE_INSERT, [VICTIM_POST, sourceId(REPORTER), 'spam'], { is_anonymous: true }))
      .toEqual({ ok: false, code: '42501' })
  })

  it('the anon role cannot file', async () => {
    expect(await asUser(null, ROUTE_INSERT, [VICTIM_POST, sourceId(REPORTER), 'spam'])).toEqual({ ok: false, code: '42501' })
  })

  it('a duplicate is still the UNIQUE no-op the route expects (23505)', async () => {
    await db.query('BEGIN')
    try {
      await db.query('SET LOCAL ROLE authenticated')
      await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [REPORTER])
      await db.query(ROUTE_INSERT, [VICTIM_POST, sourceId(REPORTER), 'spam'])
      await expect(db.query(ROUTE_INSERT, [VICTIM_POST, sourceId(REPORTER), 'spam'])).rejects.toMatchObject({ code: '23505' })
    } finally {
      await db.query('ROLLBACK')
    }
  })

  it('is idempotent', async () => {
    await db.query(MIGRATION)
    expect(await asUser(REPORTER, ROUTE_INSERT, [VICTIM_POST, sourceId(REPORTER), 'spam'])).toEqual({ ok: true, rows: 1 })
  })

  it('the rollback reopens exactly the old behaviour', async () => {
    await db.query(ROLLBACK)
    expect(await asUser(REPORTER, ROUTE_INSERT, [VICTIM_POST, 'sock-puppet-7', 'spam'])).toEqual({ ok: true, rows: 1 })
  })
})
