import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// Security audit 2026-09-30 — review_interactions values stay in the range the route clamps to.
// Reproduces the ranking skew (owner writes completion_rate = 1e9 through PostgREST, then calls
// the definer sync) on a real PostgreSQL, applies the migration, proves it is closed and that the
// route's own writes still pass.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260930b_review_interactions_bounds.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20260930b_review_interactions_bounds_rollback.sql'), 'utf8')
const PORT = 54304
const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const CLIP = '22222222-2222-4222-8222-222222222222'

const BASELINE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  CREATE TABLE public.reviews (id UUID PRIMARY KEY, watch_time_avg DOUBLE PRECISION DEFAULT 0, completion_rate DOUBLE PRECISION DEFAULT 0);
  GRANT SELECT ON public.reviews TO anon, authenticated;
  -- as add_explore_upgrade.sql creates it (FKs omitted)
  CREATE TABLE public.review_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, review_id UUID,
    watch_seconds FLOAT DEFAULT 0, completion_rate FLOAT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, review_id));
  ALTER TABLE public.review_interactions ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users manage own interactions" ON public.review_interactions FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_interactions TO anon, authenticated;
  -- as add_counter_security_definer.sql defines it
  CREATE OR REPLACE FUNCTION public.sync_review_watch_stats(p_review_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    UPDATE public.reviews r SET
      watch_time_avg = COALESCE((SELECT round(avg(watch_seconds)::numeric, 1) FROM public.review_interactions WHERE review_id = p_review_id), 0),
      completion_rate = COALESCE((SELECT round(avg(completion_rate)::numeric, 3) FROM public.review_interactions WHERE review_id = p_review_id), 0)
    WHERE r.id = p_review_id;
  END $$;
  GRANT EXECUTE ON FUNCTION public.sync_review_watch_stats(uuid) TO authenticated;
  INSERT INTO public.reviews (id) VALUES ('${CLIP}');
  -- an existing out-of-range row: NOT VALID must leave it alone
  INSERT INTO public.review_interactions (user_id, review_id, watch_seconds, completion_rate)
    VALUES ('f9077a52-b0f3-453a-a497-97da115ae386', '${CLIP}', 100000, 5);
`

let pg: EmbeddedPostgres
let db: Client
const dataDir = mkdtempSync(join(tmpdir(), 'interactions-'))

beforeAll(async () => {
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('interactions')
  db = pg.getPgClient('interactions')
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

/** Writes as the owner through PostgREST's role, then returns the clip's resulting average (rolled back). */
async function ownerWrites(watch: string, rate: string): Promise<{ ok: true; avgRate: number } | { ok: false; code: string }> {
  await db.query('BEGIN')
  try {
    await db.query('SET LOCAL ROLE authenticated')
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [OWNER])
    await db.query(`INSERT INTO public.review_interactions (user_id, review_id, watch_seconds, completion_rate) VALUES ($1, $2, ${watch}, ${rate})`, [OWNER, CLIP])
    await db.query('SELECT public.sync_review_watch_stats($1)', [CLIP])
    const r = await db.query('SELECT completion_rate FROM public.reviews WHERE id = $1', [CLIP])
    return { ok: true, avgRate: Number(r.rows[0].completion_rate) }
  } catch (e) {
    return { ok: false, code: (e as { code?: string }).code ?? 'unknown' }
  } finally {
    await db.query('ROLLBACK')
  }
}

describe('review_interactions bounds', () => {
  it('🚨 before: one owner row of completion_rate 1e9 skews the clip average', async () => {
    const r = await ownerWrites('10', '1e9')
    expect(r.ok && r.avgRate > 1e8).toBe(true)
  })

  describe('after the migration', () => {
    beforeEach(async () => { await db.query(MIGRATION) })

    it.each([
      ['1e9 completion', '10', '1e9'],
      ['negative watch', '-5', '0.5'],
      ['absurd watch', '1e12', '0.5'],
      ['NaN', `'NaN'`, '0.5'],
      ['Infinity', '10', `'Infinity'`],
    ])('🚨 refuses %s (23514)', async (_l, watch, rate) => {
      expect(await ownerWrites(watch, rate)).toEqual({ ok: false, code: '23514' })
    })

    it('what the route writes (clamped values) still passes', async () => {
      expect((await ownerWrites('86400', '1')).ok).toBe(true)
      expect((await ownerWrites('0', '0')).ok).toBe(true)
    })

    it('NOT VALID: the existing out-of-range row is left alone (nothing rewritten)', async () => {
      const { rows } = await db.query('SELECT count(*)::int AS n FROM public.review_interactions WHERE completion_rate > 1')
      expect(rows[0].n).toBe(1)
    })

    it('is idempotent, and the rollback removes both constraints', async () => {
      await db.query(MIGRATION)
      await db.query(ROLLBACK)
      expect((await ownerWrites('10', '1e9')).ok).toBe(true)
    })
  })
})
