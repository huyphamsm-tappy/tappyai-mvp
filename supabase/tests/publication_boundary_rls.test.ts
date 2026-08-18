import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// PUBLICATION BOUNDARY — RLS, on a real PostgreSQL.
//
// Phase 0 of the content safety gate. Production evidence (2026-08-18): an
// anonymous PostgREST client read a row with publication_state = 'UNDER_REVIEW'
// directly, so the gate was an application convention rather than a boundary.
// This suite proves the RESTRICTIVE policy closes that, and — just as important
// — that it does not close anything else.
//
// 🚨 WHAT THIS SUITE CAN AND CANNOT PROVE.
// `public.reviews` has NO `CREATE TABLE` in this repository, and its base SELECT
// policy "Read visible reviews" `USING (NOT is_hidden)` exists only in
// production (docs/ios/05_DATABASE_CONTRACT.md:13,53). The BASELINE below
// RECONSTRUCTS that documented shape. So this suite proves the policy's
// behaviour and its interaction with a permissive base policy; it does NOT
// prove production's policy set, which nobody here has read. Production must be
// verified after the migration is applied, not inferred from this file.
//
// The reconstruction is deliberately faithful on the one property that decides
// the outcome: PERMISSIVE policies OR together, and a RESTRICTIVE policy is
// ANDed with that OR. If the real production set has MORE permissive policies
// than modelled here, the restrictive policy still narrows all of them — that
// is the property being relied on, and it is tested directly below.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/20260818_publication_boundary_rls.sql'),
  'utf8',
)

const PORT = 54346

// Identities used by the tests. Fixed so failures name a person, not a uuid.
const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const OTHER = 'f9077a52-b0f3-453a-a497-97da115ae386'

// Rows mirroring the six that exist in production on 2026-08-18: one held clip
// written by the gate, five legacy rows that predate it.
const HELD = '82ee2711-877c-4f7d-a84e-4813db2649f3'
const LEGACY = '9d4cdf3b-a93f-427c-880a-9950472e3705'
const PUBLISHED = '11111111-1111-4111-8111-111111111111'
const RESTRICTED = '22222222-2222-4222-8222-222222222222'
const HELD_BY_OTHER = '33333333-3333-4333-8333-333333333333'

/**
 * The production baseline, as documented.
 *
 * `auth.uid()` reads a session GUC so a test can become anon, an owner, or a
 * different signed-in user without a real GoTrue. That is the same mechanism
 * PostgREST uses (`request.jwt.claim.sub`), so the policy text under test is
 * exercised exactly as written.
 */
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
    id                UUID PRIMARY KEY,
    user_id           UUID NOT NULL,
    body              TEXT,
    media_url         TEXT,
    thumbnail         TEXT,
    is_hidden         BOOLEAN DEFAULT FALSE,
    created_at        TIMESTAMPTZ DEFAULT now(),
    publication_state TEXT CHECK (publication_state IN ('UNDER_REVIEW','PUBLISHED','RESTRICTED')),
    safety_state      TEXT,
    evaluated_version TEXT,
    evaluated_at      TIMESTAMPTZ
  );

  ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO anon, authenticated, service_role;

  -- Production baseline, reconstructed from docs/ios/05_DATABASE_CONTRACT.md:53.
  CREATE POLICY "Read visible reviews" ON public.reviews
    FOR SELECT USING (NOT is_hidden);
  CREATE POLICY "Owners can see own reviews" ON public.reviews
    FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "Users can update own reviews" ON public.reviews
    FOR UPDATE USING (auth.uid() = user_id);
  CREATE POLICY reviews_insert_own ON public.reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);
`

const SEED = `
  INSERT INTO public.reviews (id, user_id, body, media_url, thumbnail, is_hidden, publication_state, safety_state, evaluated_version) VALUES
    ('${HELD}',          '${OWNER}', 'held body',       'https://cdn/held.mp4',   'https://cdn/held.jpg',   false, 'UNDER_REVIEW', 'LEGAL_REVIEW_REQUIRED', 'v501327fc'),
    ('${LEGACY}',        '${OTHER}', 'legacy body',     'https://cdn/legacy.mp4', 'https://cdn/legacy.jpg', false,  NULL,          NULL,                    NULL),
    ('${PUBLISHED}',     '${OTHER}', 'published body',  'https://cdn/pub.mp4',    'https://cdn/pub.jpg',    false, 'PUBLISHED',    'SAFE',                  'vpub'),
    ('${RESTRICTED}',    '${OWNER}', 'restricted body', 'https://cdn/res.mp4',    'https://cdn/res.jpg',    false, 'RESTRICTED',   'VIOLATION',             'vres'),
    ('${HELD_BY_OTHER}', '${OTHER}', 'their held body', 'https://cdn/oth.mp4',    'https://cdn/oth.jpg',    false, 'UNDER_REVIEW', 'UNDETERMINED',          'voth');
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgboundary-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('boundary')
  db = pg.getPgClient('boundary')
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
  await db.query(SEED)
})

const applyMigration = () => db.query(MIGRATION)

/**
 * Read `reviews` as one caller.
 *
 * `SET LOCAL ROLE` + the jwt claim GUC inside a transaction, rolled back after,
 * so no test can leak an identity into the next one.
 */
async function readAs(
  role: 'anon' | 'authenticated' | 'service_role',
  uid: string | null,
  columns = 'id',
): Promise<string[]> {
  await db.query('BEGIN')
  try {
    await db.query(`SET LOCAL ROLE ${role}`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    const r = await db.query(`SELECT ${columns} FROM public.reviews ORDER BY id`)
    return r.rows.map((row) => row.id as string)
  } finally {
    await db.query('ROLLBACK')
  }
}

// ---------------------------------------------------------------------------
// RED — the production defect, reproduced
// ---------------------------------------------------------------------------

describe('RED — before the migration the gate is not a boundary', () => {
  it('anonymous reads the held row, exactly as production did on 2026-08-18', async () => {
    const ids = await readAs('anon', null)
    expect(ids, 'anon must currently see the held row — this is the defect').toContain(HELD)
    expect(ids).toContain(RESTRICTED)
  })

  it('anonymous reads the lifecycle columns themselves', async () => {
    await db.query('BEGIN')
    await db.query('SET LOCAL ROLE anon')
    const r = await db.query(
      `SELECT publication_state, safety_state, evaluated_version, media_url
         FROM public.reviews WHERE id = $1`,
      [HELD],
    )
    await db.query('ROLLBACK')
    expect(r.rows[0]).toMatchObject({
      publication_state: 'UNDER_REVIEW',
      safety_state: 'LEGAL_REVIEW_REQUIRED',
      evaluated_version: 'v501327fc',
      media_url: 'https://cdn/held.mp4',
    })
  })
})

// ---------------------------------------------------------------------------
// GREEN — the boundary
// ---------------------------------------------------------------------------

describe('GREEN — with the migration applied', () => {
  beforeEach(applyMigration)

  it('anonymous cannot SELECT UNDER_REVIEW', async () => {
    expect(await readAs('anon', null)).not.toContain(HELD)
  })

  it('anonymous cannot SELECT RESTRICTED', async () => {
    expect(await readAs('anon', null)).not.toContain(RESTRICTED)
  })

  it('anonymous CAN still SELECT PUBLISHED', async () => {
    expect(await readAs('anon', null)).toContain(PUBLISHED)
  })

  it('anonymous CAN still SELECT legacy NULL — nobody loses visibility', async () => {
    expect(await readAs('anon', null)).toContain(LEGACY)
  })

  it('an authenticated NON-owner cannot SELECT a held row', async () => {
    const ids = await readAs('authenticated', OTHER)
    expect(ids, 'held row belongs to OWNER, not OTHER').not.toContain(HELD)
    expect(ids, 'restricted row belongs to OWNER, not OTHER').not.toContain(RESTRICTED)
    expect(ids).toContain(PUBLISHED)
    expect(ids).toContain(LEGACY)
  })

  it('the OWNER can SELECT their own held and restricted rows', async () => {
    const ids = await readAs('authenticated', OWNER)
    expect(ids).toContain(HELD)
    expect(ids).toContain(RESTRICTED)
  })

  it('the owner exception is scoped to the owner — it is not a general unlock', async () => {
    // OWNER must NOT gain sight of a DIFFERENT author's held row.
    expect(await readAs('authenticated', OWNER)).not.toContain(HELD_BY_OTHER)
  })

  it('service_role is unaffected — every existing backend operation still reads everything', async () => {
    const ids = await readAs('service_role', null)
    for (const id of [HELD, LEGACY, PUBLISHED, RESTRICTED, HELD_BY_OTHER]) {
      expect(ids, `service_role must still read ${id}`).toContain(id)
    }
  })

  it('the lifecycle columns are no longer readable by anon on a held row', async () => {
    await db.query('BEGIN')
    await db.query('SET LOCAL ROLE anon')
    const r = await db.query(
      `SELECT publication_state, safety_state FROM public.reviews WHERE id = $1`,
      [HELD],
    )
    await db.query('ROLLBACK')
    expect(r.rowCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// The upload flow — the thing this migration could most easily break
// ---------------------------------------------------------------------------

describe('GREEN — posting still works', () => {
  beforeEach(applyMigration)

  it('INSERT … RETURNING id succeeds for a row the gate writes UNDER_REVIEW', async () => {
    // 🚨 The regression this guards. PostgreSQL applies SELECT policies to the
    // NEW row of an INSERT … RETURNING, and POST /api/reviews does exactly
    // `.insert(reviewData).select('id')` as the authenticated user. Without the
    // owner branch in the policy, every upload would come back empty.
    await db.query('BEGIN')
    await db.query('SET LOCAL ROLE authenticated')
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [OWNER])
    const r = await db.query(
      `INSERT INTO public.reviews (id, user_id, body, publication_state, safety_state, evaluated_version)
       VALUES (gen_random_uuid(), $1, 'new clip', 'UNDER_REVIEW', 'LEGAL_REVIEW_REQUIRED', 'vnew')
       RETURNING id`,
      [OWNER],
    )
    await db.query('ROLLBACK')
    expect(r.rowCount, 'INSERT … RETURNING must still return the new id').toBe(1)
  })

  it('the owner can still hide their own held post', async () => {
    // The 20260703 migration exists because UPDATE re-checks SELECT on the new
    // row. Setting is_hidden = true on a held row must still work.
    await db.query('BEGIN')
    await db.query('SET LOCAL ROLE authenticated')
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [OWNER])
    const r = await db.query(
      `UPDATE public.reviews SET is_hidden = true WHERE id = $1 AND user_id = $2 RETURNING id`,
      [HELD, OWNER],
    )
    await db.query('ROLLBACK')
    expect(r.rowCount, 'owner must still be able to hide a held post').toBe(1)
  })
})

// ---------------------------------------------------------------------------
// The property the design rests on
// ---------------------------------------------------------------------------

describe('the RESTRICTIVE mechanism itself', () => {
  beforeEach(applyMigration)

  it('is RESTRICTIVE, not permissive — a permissive policy would be OR-ed and change nothing', async () => {
    const r = await db.query(
      `SELECT permissive, cmd, roles::text FROM pg_policies
        WHERE schemaname='public' AND tablename='reviews' AND policyname='reviews_publication_boundary'`,
    )
    expect(r.rows[0]?.permissive).toBe('RESTRICTIVE')
    expect(r.rows[0]?.cmd).toBe('SELECT')
    expect(r.rows[0]?.roles).toContain('anon')
    expect(r.rows[0]?.roles).toContain('authenticated')
  })

  it('narrows a permissive policy it has never heard of', async () => {
    // The real production base policy is not in this repo. Prove the mechanism
    // does not depend on knowing it: add an unrelated wide-open permissive
    // policy and confirm the held row stays invisible anyway.
    await db.query(`CREATE POLICY "some policy nobody told us about" ON public.reviews
                      FOR SELECT USING (true)`)
    expect(await readAs('anon', null)).not.toContain(HELD)
    expect(await readAs('anon', null)).toContain(PUBLISHED)
  })

  it('the migration is re-runnable', async () => {
    await applyMigration()
    await applyMigration()
    expect(await readAs('anon', null)).not.toContain(HELD)
  })

  it('rollback restores the previous behaviour exactly, and deletes nothing', async () => {
    await db.query('DROP POLICY IF EXISTS reviews_publication_boundary ON public.reviews')
    expect(await readAs('anon', null)).toContain(HELD)
    const all = await db.query('SELECT count(*)::int AS n FROM public.reviews')
    expect(all.rows[0].n, 'rollback must not have removed a row').toBe(5)
  })
})
