import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// security-audit H1 (INSERT half) — only the server creates review rows.
//
// Before: `authenticated` held INSERT on reviews (production policy WITH CHECK auth.uid() =
// user_id), so a signed-in user could create a row with publication_state 'PUBLISHED' and
// is_verified true straight through PostgREST. After 20260928_revoke_reviews_insert.sql only the
// service role inserts; POST /api/reviews does so (src/app/api/reviews/insertBoundary.test.ts).
//
// `reviews` has no CREATE TABLE in this repository, so the table and its policies are
// RECONSTRUCTED from docs/ios/05_DATABASE_CONTRACT.md and the migrations that alter it, as in
// publication_boundary_rls.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260928_revoke_reviews_insert.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20260928_revoke_reviews_insert_rollback.sql'), 'utf8')
const UPDATE_MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260927_owner_update_column_privileges.sql'), 'utf8')
const PORT = 54398

const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const EXISTING = '11111111-1111-4111-8111-111111111111'

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
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

  CREATE TABLE public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, body TEXT, is_hidden BOOLEAN DEFAULT FALSE,
    publication_state TEXT CHECK (publication_state IN ('UNDER_REVIEW','PUBLISHED','RESTRICTED')),
    safety_state TEXT, is_verified BOOLEAN DEFAULT FALSE, like_count INT DEFAULT 0
  );
  CREATE TABLE public.profiles (id UUID PRIMARY KEY, full_name TEXT, bio TEXT, language TEXT, avatar_url TEXT, cover_url TEXT);
  ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews, public.profiles TO anon, authenticated;
  GRANT ALL ON public.reviews, public.profiles TO service_role;

  CREATE POLICY "Read visible reviews" ON public.reviews FOR SELECT USING (NOT is_hidden);
  CREATE POLICY "Owners can see own reviews" ON public.reviews FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "Users can update own reviews" ON public.reviews FOR UPDATE USING (auth.uid() = user_id);
  -- Production's INSERT policy (docs/ios/05_DATABASE_CONTRACT.md): owner only, any columns.
  CREATE POLICY reviews_insert_own ON public.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

  INSERT INTO public.reviews (id, user_id, body, publication_state) VALUES ('${EXISTING}', '${OWNER}', 'mine', 'RESTRICTED');
`

let pg: EmbeddedPostgres
let db: Client
const dataDir = mkdtempSync(join(tmpdir(), 'reviews-insert-revoke-'))

beforeAll(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('reviewsinsert')
  db = pg.getPgClient('reviewsinsert')
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
async function as(role: 'anon' | 'authenticated' | 'service_role', uid: string | null, sql: string): Promise<Outcome> {
  await db.query('BEGIN')
  try {
    await db.query(`SET LOCAL ROLE ${role}`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    const r = await db.query(sql)
    return { ok: true, rows: r.rowCount ?? 0 }
  } catch (e) {
    return { ok: false, code: (e as { code?: string }).code ?? 'unknown' }
  } finally {
    await db.query('ROLLBACK')
  }
}
const forged = `INSERT INTO public.reviews (user_id, body, publication_state, is_verified, like_count)
                VALUES ('${OWNER}', 'forged', 'PUBLISHED', true, 999)`
const plain = `INSERT INTO public.reviews (user_id, body) VALUES ('${OWNER}', 'plain')`
const DENIED = { ok: false, code: '42501' }

describe('RED — before the migration', () => {
  it('a signed-in user creates a PUBLISHED, verified row with forged counters through PostgREST', async () => {
    expect(await as('authenticated', OWNER, forged)).toEqual({ ok: true, rows: 1 })
  })
})

describe('GREEN — after the migration', () => {
  beforeEach(async () => { await db.query(MIGRATION) })

  it('authenticated can no longer insert at all — forged or plain', async () => {
    expect(await as('authenticated', OWNER, forged)).toEqual(DENIED)
    expect(await as('authenticated', OWNER, plain)).toEqual(DENIED)
  })

  it('anon cannot insert', async () => {
    expect(await as('anon', null, plain)).toEqual(DENIED)
  })

  it('the service role (POST /api/reviews) still creates rows, lifecycle columns included', async () => {
    expect(await as('service_role', null, `INSERT INTO public.reviews (user_id, body, publication_state, safety_state, is_verified)
                                            VALUES ('${OWNER}', 'via api', 'UNDER_REVIEW', 'LEGAL_REVIEW_REQUIRED', false)`)).toEqual({ ok: true, rows: 1 })
  })

  it('reading is unchanged: the owner still sees their own row', async () => {
    expect(await as('authenticated', OWNER, `SELECT id FROM public.reviews WHERE id = '${EXISTING}'`)).toEqual({ ok: true, rows: 1 })
  })

  it('is idempotent', async () => {
    await db.query(MIGRATION)
    expect(await as('authenticated', OWNER, plain)).toEqual(DENIED)
  })

  it('the rollback restores INSERT (and so reopens the hole)', async () => {
    await db.query(ROLLBACK)
    expect(await as('authenticated', OWNER, forged)).toEqual({ ok: true, rows: 1 })
  })
})

describe('PRE-FLIGHT — an INVOKER function that inserts into reviews stops the migration', () => {
  it('aborts with a clear message and changes nothing', async () => {
    await db.query(`CREATE FUNCTION public.legacy_create_review(b TEXT) RETURNS void LANGUAGE sql AS $$
                      INSERT INTO public.reviews (user_id, body) VALUES (auth.uid(), b) $$`)
    await expect(db.query(MIGRATION)).rejects.toThrow(/legacy_create_review/)
    expect(await as('authenticated', OWNER, plain)).toEqual({ ok: true, rows: 1 }) // nothing was revoked
  })

  it('a SECURITY DEFINER function that inserts into reviews does not block it', async () => {
    await db.query(`CREATE FUNCTION public.server_create_review(b TEXT) RETURNS void LANGUAGE sql SECURITY DEFINER
                      SET search_path = public AS $$ INSERT INTO public.reviews (user_id, body) VALUES (auth.uid(), b) $$`)
    await db.query(MIGRATION)
    expect(await as('authenticated', OWNER, plain)).toEqual(DENIED)
  })
})

describe('both H1 migrations together (20260927 then 20260928)', () => {
  it('owners can hide their post and nothing else: no INSERT, no other column', async () => {
    await db.query(UPDATE_MIGRATION)
    await db.query(MIGRATION)
    expect(await as('authenticated', OWNER, `UPDATE public.reviews SET is_hidden = true WHERE id = '${EXISTING}'`)).toEqual({ ok: true, rows: 1 })
    expect(await as('authenticated', OWNER, `UPDATE public.reviews SET publication_state = 'PUBLISHED' WHERE id = '${EXISTING}'`)).toEqual(DENIED)
    expect(await as('authenticated', OWNER, forged)).toEqual(DENIED)
  })
})
