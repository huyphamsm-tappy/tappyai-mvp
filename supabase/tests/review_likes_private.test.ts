import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW LIKES — the per-user liked collection is PRIVATE, on a real PostgreSQL.
//
// Production evidence (2026-09-15, anon key): `review_likes?user_id=eq.<author>`
// returned that author's whole liked collection — the table's SELECT policy was
// `USING (true)` (add_review_social.sql). The product shows "Đã thích" only to
// its owner; the database did not enforce that.
//
// This suite proves `20260915b_review_likes_private.sql`:
//   A. the collection — "which reviews did X like" — is readable by X alone,
//      whether asked by anon, by another signed-in user, or by X with someone
//      else's id in the filter;
//   B. the public per-review reads still work through the two SECURITY DEFINER
//      functions, return only what they say, and cannot be turned back into A;
//   C. like / unlike (INSERT / DELETE own row) is untouched, and the like-count
//      trigger still fires for an ordinary user.
//
// 🚨 `public.reviews` and `public.review_likes` are reconstructed from their
// migrations (add_review_social.sql, 20260703_fix_like_count_trigger.sql,
// 20260818_publication_boundary_rls.sql) — the shape the policy text depends on.
// Production must be verified after the migration is applied, not inferred.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260915b_review_likes_private.sql'), 'utf8')

const PORT = 54381

const ALICE = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const BOB = 'f9077a52-b0f3-453a-a497-97da115ae386'
const CAROL = '77777777-7777-4777-8777-777777777777'

const PUB_A = '11111111-1111-4111-8111-111111111111' // Alice's published clip
const PUB_B = '22222222-2222-4222-8222-222222222222' // Bob's published clip
const HIDDEN_B = '33333333-3333-4333-8333-333333333333' // Bob's hidden clip
const HELD_A = '44444444-4444-4444-8444-444444444444' // Alice's held clip

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
    place_name        TEXT,
    is_hidden         BOOLEAN DEFAULT FALSE,
    like_count        INTEGER DEFAULT 0,
    publication_state TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO anon, authenticated, service_role;
  CREATE POLICY "Read visible reviews" ON public.reviews FOR SELECT USING (NOT is_hidden);
  CREATE POLICY "Owners can see own reviews" ON public.reviews FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY reviews_publication_boundary ON public.reviews AS RESTRICTIVE FOR SELECT TO anon, authenticated
    USING (publication_state IS NULL OR publication_state = 'PUBLISHED' OR user_id = auth.uid());

  -- add_review_social.sql, as shipped: the open SELECT policy is the defect.
  CREATE TABLE public.review_likes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id   UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (review_id, user_id)
  );
  ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, DELETE ON public.review_likes TO anon, authenticated, service_role;
  CREATE POLICY "Anyone can read likes" ON public.review_likes FOR SELECT USING (true);
  CREATE POLICY "Users can like"   ON public.review_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "Users can unlike" ON public.review_likes FOR DELETE USING (auth.uid() = user_id);

  -- 20260703_fix_like_count_trigger.sql
  CREATE OR REPLACE FUNCTION public.update_review_like_count()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      UPDATE public.reviews SET like_count = like_count + 1 WHERE id = NEW.review_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.reviews SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.review_id;
    END IF;
    RETURN NULL;
  END;
  $$;
  CREATE TRIGGER trg_review_like_count AFTER INSERT OR DELETE ON public.review_likes
    FOR EACH ROW EXECUTE FUNCTION public.update_review_like_count();

  -- Supabase's default privileges: every new function is granted to anon/authenticated.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`

const SEED = `
  INSERT INTO public.reviews (id, user_id, place_name, is_hidden, publication_state, like_count) VALUES
    ('${PUB_A}',    '${ALICE}', 'Phở Lệ',        false, 'PUBLISHED',    0),
    ('${PUB_B}',    '${BOB}',   'The Workshop',  false, NULL,           0),
    ('${HIDDEN_B}', '${BOB}',   'Quán ẩn',       true,  'PUBLISHED',    0),
    ('${HELD_A}',   '${ALICE}', 'Bún chả held',  false, 'UNDER_REVIEW', 0);
  -- Bob liked Alice's clip and his own hidden one; Carol liked both public clips; Alice liked her held clip.
  INSERT INTO public.review_likes (review_id, user_id, created_at) VALUES
    ('${PUB_A}',    '${BOB}',   now() - interval '1 hour'),
    ('${HIDDEN_B}', '${BOB}',   now() - interval '2 hours'),
    ('${PUB_A}',    '${CAROL}', now() - interval '3 hours'),
    ('${PUB_B}',    '${CAROL}', now() - interval '4 hours'),
    ('${HELD_A}',   '${ALICE}', now() - interval '5 hours'),
    ('${PUB_B}',    '${ALICE}', now() - interval '30 hours');
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pglikes-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('likes')
  db = pg.getPgClient('likes')
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

/** Same, but committed — for the like/unlike writes whose trigger effect is checked afterwards. */
async function doAs(role: Role, uid: string | null, sql: string, params: unknown[] = []): Promise<void> {
  await db.query('BEGIN')
  try {
    await db.query(`SET LOCAL ROLE ${role}`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    await db.query(sql, params)
    await db.query('COMMIT')
  } catch (e) {
    await db.query('ROLLBACK')
    throw e
  }
}

const collectionOf = (role: Role, caller: string | null, target: string) =>
  as<{ review_id: string }>(role, caller, 'SELECT review_id FROM public.review_likes WHERE user_id = $1 ORDER BY review_id', [target]).then(r => r.map(x => x.review_id).sort())

// ---------------------------------------------------------------------------
// RED — the production defect, reproduced
// ---------------------------------------------------------------------------
describe('RED — before the migration the collection is public', () => {
  it("anonymous reads Bob's whole liked collection with a user_id filter — exactly what production answered", async () => {
    expect(await collectionOf('anon', null, BOB)).toEqual([PUB_A, HIDDEN_B].sort())
  })
  it("another signed-in user reads Bob's collection too", async () => {
    expect(await collectionOf('authenticated', CAROL, BOB)).toEqual([PUB_A, HIDDEN_B].sort())
  })
})

// ---------------------------------------------------------------------------
// GREEN — A. the collection is the owner's
// ---------------------------------------------------------------------------
describe('GREEN A — the per-user liked collection is owner-only', () => {
  beforeEach(applyMigration)

  it('exactly one SELECT policy remains, and it is the owner predicate', async () => {
    const r = await db.query(`SELECT policyname, qual FROM pg_policies WHERE tablename = 'review_likes' AND cmd = 'SELECT'`)
    expect(r.rows.map(x => x.policyname)).toEqual(['review_likes_select_own'])
    expect(String(r.rows[0].qual)).toMatch(/auth\.uid\(\) = user_id/)
  })

  it('the owner reads their own collection', async () => {
    expect(await collectionOf('authenticated', BOB, BOB)).toEqual([PUB_A, HIDDEN_B].sort())
  })

  it("the owner cannot substitute another user's id — the filter yields nothing, not someone else's rows", async () => {
    expect(await collectionOf('authenticated', BOB, CAROL)).toEqual([])
    expect(await collectionOf('authenticated', BOB, ALICE)).toEqual([])
  })

  it("anonymous cannot enumerate anyone's collection, with or without a filter", async () => {
    expect(await collectionOf('anon', null, BOB)).toEqual([])
    const all = await as('anon', null, 'SELECT review_id FROM public.review_likes')
    expect(all).toEqual([])
  })

  it("another signed-in user cannot read Bob's collection, even by filtering on a review Bob liked", async () => {
    expect(await collectionOf('authenticated', CAROL, BOB)).toEqual([])
    const byReview = await as('authenticated', CAROL, 'SELECT user_id FROM public.review_likes WHERE review_id = $1', [PUB_A])
    // Carol sees only her own like of that review — never Bob's row.
    expect(byReview.map(r => r.user_id)).toEqual([CAROL])
  })

  it('the service role (server-side jobs such as the notifications backfill) still reads everything', async () => {
    const all = await as('service_role', null, 'SELECT count(*)::int AS n FROM public.review_likes')
    expect(all[0].n).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// GREEN — B. per-review public reads survive, narrowly
// ---------------------------------------------------------------------------
describe('GREEN B — who likes THIS review, and the hot panel, are still public', () => {
  beforeEach(applyMigration)

  it('anonymous lists the likers of a public clip, newest first, and only (user_id, created_at)', async () => {
    const rows = await as<{ user_id: string; created_at: string }>('anon', null, 'SELECT * FROM public.review_likers($1)', [PUB_A])
    expect(rows.map(r => r.user_id)).toEqual([BOB, CAROL])
    expect(Object.keys(rows[0]).sort()).toEqual(['created_at', 'user_id'])
  })

  it('a signed-in visitor gets the same list; the cursor and the cap work', async () => {
    const rows = await as<{ user_id: string }>('authenticated', ALICE, 'SELECT user_id FROM public.review_likers($1, 1)', [PUB_A])
    expect(rows.map(r => r.user_id)).toEqual([BOB])
    const older = await as<{ user_id: string; created_at: string }>('authenticated', ALICE, 'SELECT user_id FROM public.review_likers($1, 30, now() - interval \'90 minutes\')', [PUB_A])
    expect(older.map(r => r.user_id)).toEqual([CAROL])
    const capped = await as<{ n: number }>('anon', null, 'SELECT count(*)::int AS n FROM public.review_likers($1, 5000)', [PUB_A])
    expect(capped[0].n).toBe(2)
  })

  it("a hidden clip's likers are listed for nobody — not even its author", async () => {
    expect(await as('anon', null, 'SELECT user_id FROM public.review_likers($1)', [HIDDEN_B])).toEqual([])
    expect(await as('authenticated', CAROL, 'SELECT user_id FROM public.review_likers($1)', [HIDDEN_B])).toEqual([])
    expect(await as('authenticated', BOB, 'SELECT user_id FROM public.review_likers($1)', [HIDDEN_B])).toEqual([])
  })

  it("a held clip's likers are listed only for its author — the single-review gate, inside the database", async () => {
    expect(await as('anon', null, 'SELECT user_id FROM public.review_likers($1)', [HELD_A])).toEqual([])
    expect(await as('authenticated', BOB, 'SELECT user_id FROM public.review_likers($1)', [HELD_A])).toEqual([])
    const own = await as<{ user_id: string }>('authenticated', ALICE, 'SELECT user_id FROM public.review_likers($1)', [HELD_A])
    expect(own.map(r => r.user_id)).toEqual([ALICE])
  })

  it('🚨 the per-review function cannot be turned into a per-user collection', async () => {
    // The only input is a review id. Enumerating every public clip and collecting a target's
    // presence is the residual, and it is exactly the information the ❤️ list already shows
    // on each clip — one clip at a time. There is no argument that takes a user.
    const sig = await db.query(`SELECT pg_get_function_arguments(oid) AS a FROM pg_proc WHERE proname = 'review_likers'`)
    expect(sig.rows[0].a).toBe('p_review_id uuid, p_limit integer DEFAULT 30, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone')
    const hot = await db.query(`SELECT pg_get_function_arguments(oid) AS a FROM pg_proc WHERE proname = 'hot_places_24h'`)
    expect(hot.rows[0].a).toBe('p_limit integer DEFAULT 10')
  })

  it('hot places: place names with like counts over visible clips in the last 24h — no user ids, hidden and held clips excluded', async () => {
    const rows = await as<{ place_name: string; like_count: string | number }>('anon', null, 'SELECT * FROM public.hot_places_24h(10)')
    expect(rows.map(r => [r.place_name, Number(r.like_count)])).toEqual([['Phở Lệ', 2], ['The Workshop', 1]])
    expect(Object.keys(rows[0]).sort()).toEqual(['like_count', 'place_name'])
  })

  it('both functions are SECURITY DEFINER with a pinned search_path, closed to PUBLIC, granted to anon + authenticated', async () => {
    const r = await db.query(`
      SELECT proname, prosecdef, proconfig,
             has_function_privilege('anon', oid, 'EXECUTE') AS anon_ok,
             has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_ok,
             has_function_privilege('service_role', oid, 'EXECUTE') AS svc_ok
      FROM pg_proc WHERE proname IN ('review_likers', 'hot_places_24h') ORDER BY proname`)
    expect(r.rows).toHaveLength(2)
    for (const row of r.rows) {
      expect(row.prosecdef, `${row.proname} must be SECURITY DEFINER`).toBe(true)
      expect(row.proconfig.join(' ')).toMatch(/search_path=public, pg_temp/)
      expect(row.anon_ok).toBe(true)
      expect(row.auth_ok).toBe(true)
      expect(row.svc_ok).toBe(true)
    }
    // PUBLIC (any other role) is closed: a fresh role with no grants cannot execute.
    await db.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stranger') THEN CREATE ROLE stranger NOLOGIN; END IF; END $$;`)
    const pub = await db.query(`SELECT has_function_privilege('stranger', 'public.review_likers(uuid,integer,timestamptz)', 'EXECUTE') AS ok`)
    expect(pub.rows[0].ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// GREEN — C. like / unlike and the count are untouched
// ---------------------------------------------------------------------------
describe('GREEN C — liking still works for an ordinary user', () => {
  beforeEach(applyMigration)

  const likeCount = async (id: string) => (await db.query('SELECT like_count FROM public.reviews WHERE id = $1', [id])).rows[0].like_count as number

  it('like: INSERT own row succeeds, the trigger increments like_count, and the row is visible to its owner', async () => {
    const before = await likeCount(PUB_B) // the seed's own likes already went through the trigger
    await doAs('authenticated', BOB, 'INSERT INTO public.review_likes (review_id, user_id) VALUES ($1, $2)', [PUB_B, BOB])
    expect(await likeCount(PUB_B)).toBe(before + 1)
    expect(await collectionOf('authenticated', BOB, BOB)).toEqual([PUB_A, PUB_B, HIDDEN_B].sort())
    // …and the public per-review list reflects it, for anyone.
    const likers = await as<{ user_id: string }>('anon', null, 'SELECT user_id FROM public.review_likers($1)', [PUB_B])
    expect(likers.map(r => r.user_id)).toContain(BOB)
  })

  it("like on someone else's behalf is refused (unchanged INSERT policy)", async () => {
    await expect(doAs('authenticated', CAROL, 'INSERT INTO public.review_likes (review_id, user_id) VALUES ($1, $2)', [PUB_B, BOB])).rejects.toThrow(/row-level security/)
  })

  it('unlike: DELETE own row succeeds and decrements; another user cannot delete it', async () => {
    await doAs('authenticated', ALICE, 'DELETE FROM public.review_likes WHERE review_id = $1 AND user_id = $2', [PUB_A, BOB]) // not hers → 0 rows
    expect(await collectionOf('authenticated', BOB, BOB)).toContain(PUB_A)
    await doAs('authenticated', BOB, 'INSERT INTO public.review_likes (review_id, user_id) VALUES ($1, $2)', [PUB_B, BOB])
    const withBob = await likeCount(PUB_B)
    await doAs('authenticated', BOB, 'DELETE FROM public.review_likes WHERE review_id = $1 AND user_id = $2', [PUB_B, BOB])
    expect(await likeCount(PUB_B)).toBe(withBob - 1)
    expect(await collectionOf('authenticated', BOB, BOB)).not.toContain(PUB_B)
  })

  it('liked_by_me — the single-review read of ONE own row by (review_id, user_id) — still answers', async () => {
    const mine = await as('authenticated', BOB, 'SELECT id FROM public.review_likes WHERE review_id = $1 AND user_id = $2', [PUB_A, BOB])
    expect(mine).toHaveLength(1)
    const notMine = await as('authenticated', CAROL, 'SELECT id FROM public.review_likes WHERE review_id = $1 AND user_id = $2', [PUB_A, BOB])
    expect(notMine).toHaveLength(0)
  })
})
