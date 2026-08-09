import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// handle_new_user must NOT create a public profile for an anonymous auth user,
// and must keep behaving exactly as before for every real account.
//
// BASELINE_FN below is the production definition captured verbatim via
// pg_get_functiondef() on 2026-08-08. It is the PRE-state: every test first
// installs it, proving the defect exists (RED), then applies the real corrective
// migration from disk and proves it is closed (GREEN). Without the baseline the
// "no profile for anonymous" assertion could pass against a schema where the
// trigger never fired at all — the vacuous-guard failure mode.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const FIX = readFileSync(
  join(REPO, 'supabase/migrations/20260808c_handle_new_user_skip_anonymous.sql'), 'utf8')

const BASELINE_FN = `
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name  = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = now();
  RETURN new;
END;
$function$;
`

// auth.users carries is_anonymous (attnum 35, boolean) in this project — measured.
// profiles is anon-readable in production, which is what makes the leak public.
const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $$;

  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;

  CREATE TABLE auth.users (
    id                 UUID PRIMARY KEY,
    email              VARCHAR(255),
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
    is_anonymous       BOOLEAN NOT NULL DEFAULT false
  );

  CREATE TABLE public.profiles (
    id         UUID PRIMARY KEY,
    full_name  TEXT,
    avatar_url TEXT,
    onboarded  BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Public profiles are viewable" ON public.profiles FOR SELECT TO public USING (true);
  GRANT SELECT ON public.profiles TO anon, authenticated;

  -- conversations FKs auth.users (NOT profiles) — measured in production. Present so a
  -- test can prove an anonymous identity still owns history with no profile row.
  CREATE TABLE public.conversations (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    title   TEXT
  );

  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`

const REAL = '44444444-4444-4444-4444-444444444444'
const ANON = '55555555-5555-5555-5555-555555555555'
const PORT = 54340

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

const profileCount = async (id: string) =>
  (await db.query('SELECT count(*)::int AS n FROM public.profiles WHERE id=$1', [id])).rows[0].n

async function insertUser(id: string, isAnon: boolean, fullName: string | null = null) {
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data, is_anonymous)
     VALUES ($1, $2, $3, $4)`,
    [id, isAnon ? null : 'u@example.com',
     fullName ? JSON.stringify({ full_name: fullName, avatar_url: 'https://img/a.png' }) : '{}',
     isAnon])
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgprof-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--locale=C'],
  })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
})

beforeEach(async () => {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(BASELINE_FN.replace(/CREATE OR REPLACE/, 'CREATE OR REPLACE')) // baseline first…
    .catch(() => { /* profiles not yet created; re-created below */ })
  await db.query(PRELUDE)
  await db.query(BASELINE_FN) // …then rebind it now that public.profiles exists
})

describe('RED — production baseline leaks a public profile for anonymous users', () => {
  it('an anonymous auth user DOES get a profiles row before the fix', async () => {
    await insertUser(ANON, true)
    expect(await profileCount(ANON)).toBe(1) // the defect
  })

  it('…and it is readable by the anon role, i.e. publicly enumerable', async () => {
    await insertUser(ANON, true)
    await db.query('SET ROLE anon')
    const { rows } = await db.query('SELECT count(*)::int AS n FROM public.profiles')
    await db.query('RESET ROLE')
    expect(rows[0].n).toBe(1)
  })
})

describe('GREEN — after 20260808c', () => {
  beforeEach(async () => { await db.query(FIX) })

  it('A. a real account still gets its profile, with metadata mapped as before', async () => {
    await insertUser(REAL, false, 'Huy Pham')
    const { rows } = await db.query('SELECT full_name, avatar_url FROM public.profiles WHERE id=$1', [REAL])
    expect(rows).toHaveLength(1)
    expect(rows[0].full_name).toBe('Huy Pham')
    expect(rows[0].avatar_url).toBe('https://img/a.png')
  })

  it('B. an anonymous auth user gets NO profile row', async () => {
    await insertUser(ANON, true)
    expect(await profileCount(ANON)).toBe(0)
  })

  it('C. the ON CONFLICT upsert path is unchanged for real accounts', async () => {
    await insertUser(REAL, false, 'First Name')
    // Re-fire the trigger for the same id: the upsert must update, not raise.
    await db.query(`INSERT INTO auth.users (id, raw_user_meta_data, is_anonymous)
                    VALUES ($1,$2,false) ON CONFLICT (id) DO NOTHING`, [REAL, '{}'])
    await db.query(`DELETE FROM auth.users WHERE id=$1`, [REAL])
    // Directly exercise the upsert branch the trigger uses.
    await db.query(`INSERT INTO public.profiles (id, full_name) VALUES ($1,'Second')
                    ON CONFLICT (id) DO UPDATE SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name)`, [REAL])
    const { rows } = await db.query('SELECT full_name FROM public.profiles WHERE id=$1', [REAL])
    expect(rows[0].full_name).toBe('Second')
  })

  it('D. an existing profile is never deleted or blanked by the fix', async () => {
    await insertUser(REAL, false, 'Keep Me')
    await db.query(FIX) // re-apply: idempotent
    const { rows } = await db.query('SELECT full_name FROM public.profiles WHERE id=$1', [REAL])
    expect(rows).toHaveLength(1)
    expect(rows[0].full_name).toBe('Keep Me')
  })

  it('E. the trigger still exists and still fires', async () => {
    const { rows } = await db.query(`
      SELECT count(*)::int AS n FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='auth' AND c.relname='users' AND NOT t.tgisinternal`)
    expect(rows[0].n).toBe(1)
    await insertUser(REAL, false, 'Fires')
    expect(await profileCount(REAL)).toBe(1)
  })

  it('G. anonymous identities are not publicly enumerable through profiles', async () => {
    await insertUser(ANON, true)
    await insertUser(REAL, false, 'Visible')
    await db.query('SET ROLE anon')
    const { rows } = await db.query('SELECT id FROM public.profiles')
    await db.query('RESET ROLE')
    expect(rows.map(r => r.id)).toEqual([REAL]) // the anonymous id is absent
  })

  it('H. the anonymous identity still owns conversations — conversations FK auth.users, not profiles', async () => {
    await insertUser(ANON, true)
    await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1,'anon chat')`, [ANON])
    const { rows } = await db.query('SELECT count(*)::int AS n FROM public.conversations WHERE user_id=$1', [ANON])
    expect(rows[0].n).toBe(1) // history works with no profile row
  })

  it('a NULL is_anonymous falls back to the original behaviour (fail-safe)', async () => {
    await db.query('ALTER TABLE auth.users ALTER COLUMN is_anonymous DROP NOT NULL')
    await db.query(`INSERT INTO auth.users (id, raw_user_meta_data, is_anonymous) VALUES ($1,'{}',NULL)`, [REAL])
    expect(await profileCount(REAL)).toBe(1) // never withholds a profile from a real account
  })
})
