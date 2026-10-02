import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// security-audit L3 — comments of a HELD review are not public, on a real PostgreSQL.
//
// reviews_publication_boundary (20260818) hides a review whose publication_state is UNDER_REVIEW or
// RESTRICTED from everyone but its author; review_comments kept `USING (true)`, so the comments of
// that review were readable by review_id with the anon key. This suite proves
// 20260928c_review_comments_publication_boundary.sql: outsiders lose them, the review author and
// moderators keep them, and nothing changes for published reviews.
//
// 🚨 The tables are reconstructed from their migrations (add_social_week2.sql,
// 20260720_comment_replies_reactions.sql, 20260818_publication_boundary_rls.sql,
// 20260713_backoffice_phase0.sql, 20260803_platform_owner.sql) — only the columns the policy reads.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260928c_review_comments_publication_boundary.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20260928c_review_comments_publication_boundary_rollback.sql'), 'utf8')

const PORT = 54390

const ALICE = 'a1111111-1111-4111-8111-111111111111' // author of every review below
const CAROL = 'c3333333-3333-4333-8333-333333333333' // ordinary user; commented before the reviews were held
const MOD = 'd4444444-4444-4444-8444-444444444444'
const ADMIN = 'e5555555-5555-4555-8555-555555555555'
const SUPER = 'f6666666-6666-4666-8666-666666666666'
const ANALYST = '17777777-7777-4777-8777-777777777777'
const EXPIRED_MOD = '28888888-8888-4888-8888-888888888888'
const OWNER = '39999999-9999-4999-8999-999999999999'
const FORMER_OWNER = '4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const PUBLISHED = '10000000-0000-4000-8000-000000000001'
const LEGACY = '10000000-0000-4000-8000-000000000002' // publication_state NULL
const HELD = '10000000-0000-4000-8000-000000000003' // UNDER_REVIEW
const RESTRICTED = '10000000-0000-4000-8000-000000000004'

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
    is_hidden         BOOLEAN DEFAULT FALSE,
    publication_state TEXT CHECK (publication_state IN ('UNDER_REVIEW', 'PUBLISHED', 'RESTRICTED'))
  );
  ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO anon, authenticated, service_role;
  CREATE POLICY "Read visible reviews" ON public.reviews FOR SELECT USING (NOT is_hidden);
  CREATE POLICY "Owners can see own reviews" ON public.reviews FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY reviews_publication_boundary ON public.reviews AS RESTRICTIVE FOR SELECT TO anon, authenticated
    USING (publication_state IS NULL OR publication_state = 'PUBLISHED' OR user_id = auth.uid());

  -- add_social_week2.sql + 20260720_comment_replies_reactions.sql, as shipped.
  CREATE TABLE public.review_comments (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id         uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    user_id           uuid NOT NULL,
    body              text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 300),
    created_at        timestamptz DEFAULT now(),
    parent_comment_id uuid REFERENCES public.review_comments(id) ON DELETE CASCADE
  );
  ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, DELETE ON public.review_comments TO anon, authenticated, service_role;
  CREATE POLICY "Anyone can read comments" ON public.review_comments FOR SELECT USING (true);
  CREATE POLICY "Users can comment" ON public.review_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "Users can delete own comment" ON public.review_comments FOR DELETE USING (auth.uid() = user_id);

  -- 20260713_backoffice_phase0.sql / 20260803_platform_owner.sql: deny-by-default to clients.
  CREATE TYPE admin_role AS ENUM ('super_admin', 'admin', 'moderator', 'analyst');
  CREATE TABLE public.admin_roles (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL,
    role       admin_role NOT NULL,
    expires_at TIMESTAMPTZ,
    UNIQUE (user_id, role)
  );
  ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
  CREATE TABLE public.platform_owner (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    active  BOOLEAN NOT NULL DEFAULT true
  );
  ALTER TABLE public.platform_owner ENABLE ROW LEVEL SECURITY;
`

const SEED = `
  INSERT INTO public.reviews (id, user_id, publication_state) VALUES
    ('${PUBLISHED}',  '${ALICE}', 'PUBLISHED'),
    ('${LEGACY}',     '${ALICE}', NULL),
    ('${HELD}',       '${ALICE}', 'UNDER_REVIEW'),
    ('${RESTRICTED}', '${ALICE}', 'RESTRICTED');
  INSERT INTO public.review_comments (review_id, user_id, body) VALUES
    ('${PUBLISHED}',  '${CAROL}', 'on published'),
    ('${LEGACY}',     '${CAROL}', 'on legacy'),
    ('${HELD}',       '${CAROL}', 'on held'),
    ('${RESTRICTED}', '${CAROL}', 'on restricted'),
    ('${RESTRICTED}', '${ALICE}', 'author reply on restricted');
  INSERT INTO public.admin_roles (user_id, role, expires_at) VALUES
    ('${MOD}',         'moderator',   NULL),
    ('${ADMIN}',       'admin',       NULL),
    ('${SUPER}',       'super_admin', now() + interval '1 day'),
    ('${ANALYST}',     'analyst',     NULL),
    ('${EXPIRED_MOD}', 'moderator',   now() - interval '1 minute');
  INSERT INTO public.platform_owner (user_id, active) VALUES
    ('${OWNER}', true), ('${FORMER_OWNER}', false);
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgcomments-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('comments')
  db = pg.getPgClient('comments')
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

type Role = 'anon' | 'authenticated' | 'service_role'

/** Run one statement as a caller (role + jwt sub), inside a rolled-back transaction. */
async function as<T = Record<string, unknown>>(role: Role, uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query('BEGIN')
  try {
    await db.query(`SET LOCAL ROLE ${role}`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    const r = await db.query(sql, params)
    return r.rows as T[]
  } finally {
    await db.query('ROLLBACK')
  }
}

/** What GET /api/reviews/[id]/comments asks for: the comments of one review, by id. */
const commentsOf = (role: Role, uid: string | null, reviewId: string) =>
  as<{ body: string }>(role, uid, 'SELECT body FROM public.review_comments WHERE review_id = $1 ORDER BY body', [reviewId])
    .then((r) => r.map((x) => x.body))

const HELD_BODIES = ['on held']
const RESTRICTED_BODIES = ['author reply on restricted', 'on restricted']

// ---------------------------------------------------------------------------
describe('RED — before the migration, held comments are public', () => {
  it('anon reads the comments of an UNDER_REVIEW and a RESTRICTED review by id', async () => {
    expect(await commentsOf('anon', null, HELD)).toEqual(HELD_BODIES)
    expect(await commentsOf('anon', null, RESTRICTED)).toEqual(RESTRICTED_BODIES)
  })
  it('even though the review itself is already invisible to anon', async () => {
    expect(await as('anon', null, 'SELECT id FROM public.reviews WHERE id = $1', [RESTRICTED])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
describe('GREEN — outsiders lose the comments of a held review', () => {
  beforeEach(applyMigration)

  it('anon: held and restricted comments are gone, by review id and by listing everything', async () => {
    expect(await commentsOf('anon', null, HELD)).toEqual([])
    expect(await commentsOf('anon', null, RESTRICTED)).toEqual([])
    const all = await as<{ body: string }>('anon', null, 'SELECT body FROM public.review_comments ORDER BY body')
    expect(all.map((x) => x.body)).toEqual(['on legacy', 'on published'])
  })

  it('a signed-in outsider — even the one who wrote the comment — does not see them', async () => {
    expect(await commentsOf('authenticated', CAROL, HELD)).toEqual([])
    expect(await commentsOf('authenticated', CAROL, RESTRICTED)).toEqual([])
  })

  it('no moderation rights, no exception: analyst, expired moderator, former owner', async () => {
    for (const uid of [ANALYST, EXPIRED_MOD, FORMER_OWNER]) {
      expect(await commentsOf('authenticated', uid, RESTRICTED), uid).toEqual([])
    }
  })

  it('published and legacy (NULL) reviews keep their comments public', async () => {
    expect(await commentsOf('anon', null, PUBLISHED)).toEqual(['on published'])
    expect(await commentsOf('anon', null, LEGACY)).toEqual(['on legacy'])
    expect(await commentsOf('authenticated', CAROL, PUBLISHED)).toEqual(['on published'])
  })

  it('publishing the review brings its comments back', async () => {
    await db.query(`UPDATE public.reviews SET publication_state = 'PUBLISHED' WHERE id = $1`, [RESTRICTED])
    expect(await commentsOf('anon', null, RESTRICTED)).toEqual(RESTRICTED_BODIES)
  })
})

describe('GREEN — the review author and moderators still see them', () => {
  beforeEach(applyMigration)

  it("the review author sees every comment on their held review, including other people's", async () => {
    expect(await commentsOf('authenticated', ALICE, HELD)).toEqual(HELD_BODIES)
    expect(await commentsOf('authenticated', ALICE, RESTRICTED)).toEqual(RESTRICTED_BODIES)
  })

  it('moderator, admin, super_admin (not yet expired) and the active platform owner see them', async () => {
    for (const uid of [MOD, ADMIN, SUPER, OWNER]) {
      expect(await commentsOf('authenticated', uid, HELD), uid).toEqual(HELD_BODIES)
      expect(await commentsOf('authenticated', uid, RESTRICTED), uid).toEqual(RESTRICTED_BODIES)
    }
  })

  it('service_role (back office) is untouched', async () => {
    expect(await commentsOf('service_role', null, RESTRICTED)).toEqual(RESTRICTED_BODIES)
  })
})

describe('GREEN — writes', () => {
  beforeEach(applyMigration)

  const insertReturning = `INSERT INTO public.review_comments (review_id, user_id, body) VALUES ($1, $2, 'new') RETURNING id`

  it('an outsider cannot comment on a held review the way the route does (INSERT … RETURNING): it fails, nothing is written', async () => {
    await expect(as('authenticated', CAROL, insertReturning, [RESTRICTED, CAROL])).rejects.toMatchObject({ code: '42501' })
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM public.review_comments WHERE body = 'new'`)
    expect(rows[0].n).toBe(0)
  })

  it('the author can still comment on their own held review, and anyone on a published one', async () => {
    expect(await as('authenticated', ALICE, insertReturning, [RESTRICTED, ALICE])).toHaveLength(1)
    expect(await as('authenticated', CAROL, insertReturning, [PUBLISHED, CAROL])).toHaveLength(1)
  })

  it("deleting one's own comment on a published review still works", async () => {
    const r = await as('authenticated', CAROL, 'DELETE FROM public.review_comments WHERE review_id = $1 AND user_id = $2 RETURNING id', [PUBLISHED, CAROL])
    expect(r).toHaveLength(1)
  })
})

describe('shape of the migration', () => {
  it('adds one RESTRICTIVE policy and keeps the existing permissive one', async () => {
    await applyMigration()
    const { rows } = await db.query(
      `SELECT policyname, permissive, roles::text[] AS roles FROM pg_policies
        WHERE tablename = 'review_comments' AND cmd = 'SELECT' ORDER BY policyname`)
    expect(rows).toEqual([
      { policyname: 'Anyone can read comments', permissive: 'PERMISSIVE', roles: ['public'] },
      { policyname: 'review_comments_publication_boundary', permissive: 'RESTRICTIVE', roles: ['anon', 'authenticated'] },
    ])
  })

  it('the helpers are SECURITY DEFINER with a pinned search_path, and not executable by PUBLIC', async () => {
    await applyMigration()
    const { rows } = await db.query(
      `SELECT p.proname, p.prosecdef, p.proconfig,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
              EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0) AS public_grant
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN ('is_content_moderator', 'review_comments_readable')
        ORDER BY p.proname`)
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.prosecdef, r.proname).toBe(true)
      expect(r.proconfig, r.proname).toEqual(['search_path=public, pg_temp'])
      expect(r.anon, r.proname).toBe(true)
      expect(r.public_grant, r.proname).toBe(false)
    }
  })

  it('is idempotent', async () => {
    await applyMigration()
    await applyMigration()
    expect(await commentsOf('anon', null, RESTRICTED)).toEqual([])
  })

  it('refuses to run on a database without publication_state (pre-flight)', async () => {
    await db.query('ALTER TABLE public.reviews DROP COLUMN publication_state CASCADE')
    await expect(applyMigration()).rejects.toThrow(/publication_state is missing/)
  })

  it('the rollback restores the prior behaviour exactly', async () => {
    await applyMigration()
    await db.query(ROLLBACK)
    expect(await commentsOf('anon', null, RESTRICTED)).toEqual(RESTRICTED_BODIES)
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('is_content_moderator', 'review_comments_readable')`)
    expect(rows[0].n).toBe(0)
  })
})
