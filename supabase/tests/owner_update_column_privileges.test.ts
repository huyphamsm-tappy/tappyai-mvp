import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// security-audit H1 + M1 — owners may UPDATE only the columns the app lets them edit.
//
// RLS picks the ROWS; it cannot pick COLUMNS. With "Users can update own reviews" alone, a
// signed-in user could PATCH publication_state 'RESTRICTED' -> 'PUBLISHED' on their own post
// straight through PostgREST. This suite reproduces that on a real PostgreSQL, applies the real
// migration file, and proves (a) the escalations are refused, (b) every write the app actually
// makes still works — including the avatar UPSERT and a SECURITY DEFINER counter trigger.
//
// Like publication_boundary_rls.test.ts, `reviews` and `profiles` have no CREATE TABLE in this
// repository, so their shape is RECONSTRUCTED (columns from the migrations that ADD them, grants
// and policies as Supabase + this repo define them). It proves the privilege model; production
// must be re-checked after the migration is applied (the SQL is in the migration header).
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION_FILE = 'supabase/migrations/20260927_owner_update_column_privileges.sql'
const MIGRATION = readFileSync(join(REPO, MIGRATION_FILE), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20260927_owner_update_column_privileges_rollback.sql'), 'utf8')
const PORT = 54397

const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const OTHER = 'f9077a52-b0f3-453a-a497-97da115ae386'
const RESTRICTED_POST = '22222222-2222-4222-8222-222222222222'
const OTHERS_POST = '33333333-3333-4333-8333-333333333333'

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
    id UUID PRIMARY KEY, user_id UUID NOT NULL, body TEXT, is_hidden BOOLEAN DEFAULT FALSE,
    publication_state TEXT CHECK (publication_state IN ('UNDER_REVIEW','PUBLISHED','RESTRICTED')),
    safety_state TEXT, is_verified BOOLEAN DEFAULT FALSE,
    like_count INT DEFAULT 0, view_count INT DEFAULT 0, save_count INT DEFAULT 0, comment_count INT DEFAULT 0,
    watch_time_avg REAL DEFAULT 0, completion_rate REAL DEFAULT 0
  );
  CREATE TABLE public.profiles (
    id UUID PRIMARY KEY, email TEXT, full_name TEXT, avatar_url TEXT, bio TEXT, cover_url TEXT, language TEXT,
    onboarded BOOLEAN DEFAULT FALSE, stripe_customer_id TEXT,
    follower_count INT DEFAULT 0, following_count INT DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE TABLE public.review_comments (
    id BIGSERIAL PRIMARY KEY, review_id UUID NOT NULL, user_id UUID NOT NULL, body TEXT
  );
  ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;
  -- Supabase's default table grants.
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews, public.profiles, public.review_comments TO anon, authenticated;
  GRANT ALL ON public.reviews, public.profiles, public.review_comments TO service_role;
  GRANT USAGE ON SEQUENCE public.review_comments_id_seq TO authenticated;

  CREATE POLICY "Read visible reviews" ON public.reviews FOR SELECT USING (NOT is_hidden);
  CREATE POLICY "Owners can see own reviews" ON public.reviews FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "Users can update own reviews" ON public.reviews FOR UPDATE USING (auth.uid() = user_id);
  CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
  CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
  CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
  CREATE POLICY "Anyone can read comments" ON public.review_comments FOR SELECT USING (true);
  CREATE POLICY "Users can comment" ON public.review_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

  -- The comment counter, SECURITY DEFINER as in add_counter_security_definer.sql.
  CREATE OR REPLACE FUNCTION public.update_review_comment_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    UPDATE public.reviews SET comment_count = comment_count + 1 WHERE id = NEW.review_id;
    RETURN NEW;
  END $$;
  CREATE TRIGGER trg_review_comment_count AFTER INSERT ON public.review_comments
    FOR EACH ROW EXECUTE FUNCTION public.update_review_comment_count();
`
const SEED = `
  INSERT INTO public.reviews (id, user_id, body, publication_state) VALUES
    ('${RESTRICTED_POST}', '${OWNER}', 'moderated', 'RESTRICTED'),
    ('${OTHERS_POST}',     '${OTHER}', 'someone else', 'PUBLISHED');
  INSERT INTO public.profiles (id, full_name) VALUES ('${OWNER}', 'Owner'), ('${OTHER}', 'Other');
`

let pg: EmbeddedPostgres
let db: Client
const dataDir = mkdtempSync(join(tmpdir(), 'owner-update-cols-'))

beforeAll(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('ownercols')
  db = pg.getPgClient('ownercols')
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

type Outcome = { ok: true; rows: number } | { ok: false; code: string }

/** Run one statement as a caller, inside a transaction that is always rolled back. */
async function as(role: 'anon' | 'authenticated' | 'service_role', uid: string | null, sql: string, params: unknown[] = []): Promise<Outcome> {
  await db.query('BEGIN')
  try {
    await db.query(`SET LOCAL ROLE ${role}`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    const r = await db.query(sql, params)
    return { ok: true, rows: r.rowCount ?? 0 }
  } catch (e) {
    return { ok: false, code: (e as { code?: string }).code ?? 'unknown' }
  } finally {
    await db.query('ROLLBACK')
  }
}
const setReview = (col: string, value: string) => `UPDATE public.reviews SET ${col} = ${value} WHERE id = '${RESTRICTED_POST}'`
const setProfile = (col: string, value: string) => `UPDATE public.profiles SET ${col} = ${value} WHERE id = '${OWNER}'`
const DENIED = { ok: false, code: '42501' }

describe('RED — before the migration, RLS alone lets an owner rewrite any column', () => {
  it('a moderated post is re-published by its owner, and counters are forged', async () => {
    expect(await as('authenticated', OWNER, setReview('publication_state', `'PUBLISHED'`))).toEqual({ ok: true, rows: 1 })
    expect(await as('authenticated', OWNER, setReview('is_verified', 'true'))).toEqual({ ok: true, rows: 1 })
    expect(await as('authenticated', OWNER, setProfile('follower_count', '1000000'))).toEqual({ ok: true, rows: 1 })
  })
})

describe('PRE-FLIGHT — a counter function running as INVOKER stops the migration', () => {
  it('aborts with a clear message and changes no privilege', async () => {
    // What a database looks like if add_social_week2.sql was applied after add_counter_security_definer.sql.
    await db.query('ALTER FUNCTION public.update_review_comment_count() SECURITY INVOKER')
    await expect(db.query(MIGRATION)).rejects.toThrow(/update_review_comment_count is SECURITY INVOKER/)
    // Nothing was revoked: the owner still has table-wide UPDATE, and commenting still works.
    expect(await as('authenticated', OWNER, setReview('publication_state', `'PUBLISHED'`))).toEqual({ ok: true, rows: 1 })
    expect(await as('authenticated', OTHER, `INSERT INTO public.review_comments (review_id, user_id, body) VALUES ('${RESTRICTED_POST}', '${OTHER}', 'x')`)).toEqual({ ok: true, rows: 1 })
  })
})

describe('GREEN — after the migration', () => {
  beforeEach(async () => { await db.query(MIGRATION) })

  it('reviews: the owner can still hide / unhide their post (the only field the API accepts)', async () => {
    expect(await as('authenticated', OWNER, setReview('is_hidden', 'true'))).toEqual({ ok: true, rows: 1 })
  })

  it('reviews: moderation state, verification and every counter are refused', async () => {
    for (const [col, v] of [
      ['publication_state', `'PUBLISHED'`], ['publication_state', 'NULL'], ['safety_state', `'OK'`],
      ['is_verified', 'true'], ['like_count', '999'], ['view_count', '999'], ['save_count', '999'],
      ['comment_count', '999'], ['watch_time_avg', '999'], ['completion_rate', '1'], ['user_id', `'${OTHER}'`],
    ]) {
      expect(await as('authenticated', OWNER, setReview(col, v)), col).toEqual(DENIED)
    }
  })

  it('reviews: another user\'s post is still out of reach, and anon cannot update at all', async () => {
    expect(await as('authenticated', OWNER, `UPDATE public.reviews SET is_hidden = true WHERE id = '${OTHERS_POST}'`)).toEqual({ ok: true, rows: 0 })
    expect(await as('anon', null, setReview('is_hidden', 'true'))).toEqual(DENIED)
  })

  it('profiles: every field PATCH /api/profile writes still works', async () => {
    for (const [col, v] of [['full_name', `'New'`], ['bio', `'hi'`], ['language', `'en'`], ['cover_url', 'NULL'], ['cover_url', `'https://cdn/c.jpg'`]]) {
      expect(await as('authenticated', OWNER, setProfile(col, v)), col).toEqual({ ok: true, rows: 1 })
    }
  })

  it('profiles: the avatar UPSERT the API sends still works (ON CONFLICT DO UPDATE sets id too)', async () => {
    // What supabase-js .upsert({ id, avatar_url }, { onConflict: 'id' }) becomes in PostgREST.
    const upsert = `INSERT INTO public.profiles (id, avatar_url) VALUES ($1, $2)
                    ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, avatar_url = EXCLUDED.avatar_url`
    expect(await as('authenticated', OWNER, upsert, [OWNER, 'https://cdn/a.jpg'])).toEqual({ ok: true, rows: 1 })
  })

  it('profiles: counters, email, stripe_customer_id and onboarded are refused', async () => {
    for (const [col, v] of [['follower_count', '1000000'], ['following_count', '1000000'], ['email', `'x@y.z'`], ['stripe_customer_id', `'cus_victim'`], ['onboarded', 'true'], ['updated_at', 'now()']]) {
      expect(await as('authenticated', OWNER, setProfile(col, v)), col).toEqual(DENIED)
    }
  })

  it('profiles: id is granted for the upsert, but RLS still pins it to the caller', async () => {
    expect(await as('authenticated', OWNER, setProfile('id', `'${OTHER}'`))).toMatchObject({ ok: false })
  })

  it('the service role keeps full update rights (moderation, onboarding)', async () => {
    expect(await as('service_role', null, setReview('publication_state', `'PUBLISHED'`))).toEqual({ ok: true, rows: 1 })
    expect(await as('service_role', null, setProfile('onboarded', 'true'))).toEqual({ ok: true, rows: 1 })
  })

  it('a SECURITY DEFINER counter trigger still updates reviews when a user comments', async () => {
    await db.query('BEGIN')
    try {
      await db.query('SET LOCAL ROLE authenticated')
      await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [OTHER])
      await db.query(`INSERT INTO public.review_comments (review_id, user_id, body) VALUES ($1, $2, 'nice')`, [RESTRICTED_POST, OTHER])
      await db.query('RESET ROLE')
      const r = await db.query(`SELECT comment_count FROM public.reviews WHERE id = $1`, [RESTRICTED_POST])
      expect(r.rows[0].comment_count).toBe(1)
    } finally {
      await db.query('ROLLBACK')
    }
  })

  it('is idempotent', async () => {
    await db.query(MIGRATION)
    expect(await as('authenticated', OWNER, setReview('publication_state', `'PUBLISHED'`))).toEqual(DENIED)
    expect(await as('authenticated', OWNER, setReview('is_hidden', 'true'))).toEqual({ ok: true, rows: 1 })
  })

  it('the rollback restores the previous grants (and so reopens the hole)', async () => {
    await db.query(ROLLBACK)
    expect(await as('authenticated', OWNER, setReview('publication_state', `'PUBLISHED'`))).toEqual({ ok: true, rows: 1 })
  })
})

// ── Static guards: the migration and the code must not drift apart ──────────────────────────────
describe('guards — the grants match what the app writes with the user client', () => {
  const granted = (table: string) => {
    const m = MIGRATION.match(new RegExp(`GRANT\\s+UPDATE\\s*\\(([^)]+)\\)\\s*ON TABLE public\\.${table}`, 'i'))
    return new Set((m?.[1] ?? '').split(',').map((c) => c.trim()))
  }

  it('every profiles column the API route writes with the user client is granted', () => {
    const route = readFileSync(join(REPO, 'src/app/api/profile/route.ts'), 'utf8')
    const written = new Set<string>()
    for (const m of route.matchAll(/updates\.(\w+)\s*=/g)) written.add(m[1])
    for (const m of route.matchAll(/supabase\s*\.from\('profiles'\)\s*\.(?:update|upsert)\(\{([^}]*)\}/g)) {
      for (const k of m[1].matchAll(/(\w+)\s*:/g)) written.add(k[1])
    }
    expect(written.size).toBeGreaterThanOrEqual(5) // the parser still sees the route's writes
    const profileCols = granted('profiles')
    for (const col of written) expect(profileCols.has(col), `profiles.${col} is written by the API but not granted`).toBe(true)
  })

  it('PATCH /api/reviews/[id] writes is_hidden only — the one granted reviews column', () => {
    const route = readFileSync(join(REPO, 'src/app/api/reviews/[id]/route.ts'), 'utf8')
    const writes = [...route.matchAll(/\.from\('reviews'\)\s*\.update\(\{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/(\w+)\s*:/g)].map((k) => k[1]))
    expect(writes).toEqual(['is_hidden'])
    expect([...granted('reviews')]).toEqual(['is_hidden'])
  })

  it('every function that UPDATEs reviews/profiles is in the pre-flight list and has a SECURITY DEFINER version', () => {
    // Order-independent on purpose: which definition is live depends on the order migrations were
    // applied (add_social_week2.sql's INVOKER update_review_comment_count sorts AFTER the DEFINER
    // one by file name). The migration's pre-flight checks the LIVE database instead; this guard
    // makes sure it checks every writer, and that a DEFINER version exists to re-apply.
    const dir = join(REPO, 'supabase/migrations')
    const files = ['supabase-schema.sql', ...readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => `supabase/migrations/${f}`)]
    const defs = new Map<string, boolean[]>() // name -> SECURITY DEFINER flag of each definition
    for (const f of files) {
      const sql = readFileSync(join(REPO, f), 'utf8').replace(/--[^\n]*/g, ' ')
      for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)(\$\w*\$)([\s\S]*?)\3([^;]*);/gi)) {
        if (!/update\s+(?:public\.)?(reviews|profiles)\b/i.test(m[4])) continue
        const name = m[1].toLowerCase()
        defs.set(name, [...(defs.get(name) ?? []), /security\s+definer/i.test(`${m[2]} ${m[5]}`)])
      }
    }
    expect(defs.size).toBeGreaterThanOrEqual(6)
    const preflight = MIGRATION.match(/p\.proname IN \(([^)]*)\)/)?.[1] ?? ''
    for (const [name, flags] of defs) {
      expect(preflight, `${name} writes reviews/profiles but the pre-flight does not check it`).toContain(`'${name}'`)
      expect(flags.includes(true), `${name} has no SECURITY DEFINER definition to re-apply`).toBe(true)
    }
  })
})
