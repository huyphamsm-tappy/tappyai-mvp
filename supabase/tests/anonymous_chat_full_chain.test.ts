import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// Anonymous Chat V1 — THE COMPLETE PRODUCTION CHAIN, in one database, in the
// order production will actually see:
//
//   20260711_anon_chat_usage.sql              (table + quota RPC)
//   20260808_anon_chat_usage_acl_hardening.sql (ACL + search_path)
//   20260808b_anon_claim_conversations.sql     (claim RPC)
//   20260808c_handle_new_user_skip_anonymous.sql (profile guard)
//
// WHY THIS EXISTS ALONGSIDE THE TWO FOCUSED SUITES
//
// anonymous_chat.test.ts and anonymous_profile_guard.test.ts each build their own
// schema and each apply a SUBSET of the chain. Neither can catch anything that only
// appears when all four are combined. Two such things are proven here and nowhere
// else:
//
//   1. ORDER DEPENDENCY. 20260808 opens with REVOKE EXECUTE ON FUNCTION
//      anon_chat_usage_increment(). If 20260711 has not been applied, that function
//      does not exist and the migration ABORTS. Production is currently in exactly
//      that state — measured 2026-08-08: the table and the RPC are absent from the
//      live project (PostgREST PGRST205/PGRST202). Test A2 pins it.
//
//   2. THE FOREIGN KEY. In production public.conversations.user_id REFERENCES
//      auth.users(id). anonymous_chat.test.ts creates conversations WITHOUT that FK,
//      so its claim tests cannot see that the claim target must be a real auth.users
//      row. Here the FK is present, so the claim is exercised under the production
//      constraint (C1/C2).
//
// The schema below is the union of what the two suites model, which is what
// production actually has: auth.users with is_anonymous, an anon-readable profiles
// table, the on_auth_user_created trigger, and conversations with its real FK and
// its single RLS policy (ALL / roles=public / USING (auth.uid() = user_id), no
// separate WITH CHECK).
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const M = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')

const USAGE = M('20260711_anon_chat_usage.sql')
const USAGE_ACL = M('20260808_anon_chat_usage_acl_hardening.sql')
const CLAIM = M('20260808b_anon_claim_conversations.sql')
const PROFILE_GUARD = M('20260808c_handle_new_user_skip_anonymous.sql')

/** The production definition of handle_new_user as it stands BEFORE 20260808c —
 *  captured via pg_get_functiondef() on 2026-08-08 and identical to the newest
 *  definition in git (add_profiles_email_isolation.sql). Installing it first is what
 *  makes the profile-guard assertions non-vacuous: without it, "no profile row for an
 *  anonymous user" would also pass on a schema where no trigger fires at all. */
const BASELINE_HANDLE_NEW_USER = `
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

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;

  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

  -- This Supabase project grants EXECUTE on every NEW function in public to anon,
  -- authenticated and service_role EXPLICITLY (pg_default_acl, measured 2026-08-08).
  -- Without this the ACL assertions would be green against a platform on which the
  -- defect being guarded cannot occur — the F-04 / BL-C7-01 failure mode.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $fn$;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
    SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
  $fn$;
  GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;

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

  -- The production shape: user_id FKs auth.users, NOT profiles. That is precisely why
  -- an anonymous identity can own history while having no profile row.
  CREATE TABLE public.conversations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES auth.users(id),
    title      TEXT,
    messages   JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users can manage own conversations" ON public.conversations
    FOR ALL TO public USING (auth.uid() = user_id);
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO anon, authenticated, service_role;

  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`

const ANON_A = '11111111-1111-1111-1111-111111111111'
const ANON_B = '22222222-2222-2222-2222-222222222222'
const ACCOUNT = '33333333-3333-3333-3333-333333333333'
const ACCOUNT_2 = '44444444-4444-4444-4444-444444444444'
const ANON_DAILY_LIMIT = 5 // mirrors ANON_DAILY_LIMIT in src/lib/config/product.ts
const PORT = 54341

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

/** Impersonate a session. is_local MUST be false: each db.query() is its own implicit
 *  transaction, so a transaction-scoped setting would vanish before the next statement. */
async function asSession(uid: string | null, isAnonymous: boolean) {
  if (uid === null) {
    await db.query(`SELECT set_config('request.jwt.claims', '', false)`)
    return
  }
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: uid, role: 'authenticated', is_anonymous: isAnonymous })])
}

/** Runs `sql` as `role`, returning the PostgreSQL error code, or null on success. */
async function asRole(role: string, sql: string): Promise<string | null> {
  try {
    await db.query(`SET ROLE ${role}`)
    await db.query(sql)
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  } finally {
    await db.query('RESET ROLE')
  }
}

/** GoTrue inserting a new identity — the only thing that fires on_auth_user_created. */
async function signUp(id: string, isAnon: boolean, fullName: string | null = null) {
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data, is_anonymous) VALUES ($1,$2,$3,$4)`,
    [id, isAnon ? null : 'u@example.com',
      fullName ? JSON.stringify({ full_name: fullName, avatar_url: 'https://img/a.png' }) : '{}',
      isAnon])
}

const profileCount = async (id: string) =>
  (await db.query('SELECT count(*)::int AS n FROM public.profiles WHERE id=$1', [id])).rows[0].n

/** Applies the chain in production order. Split out so A2 can apply a PREFIX of it. */
async function applyChain(...steps: string[]) {
  for (const sql of steps) await db.query(sql)
}

async function resetSchema() {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  // The baseline function must exist before PRELUDE's CREATE TRIGGER references it,
  // but its body references public.profiles, which PRELUDE creates. Postgres resolves
  // a plpgsql body lazily, so declaring it first is fine.
  await db.query(BASELINE_HANDLE_NEW_USER).catch(() => { /* rebound after PRELUDE */ })
  await db.query(PRELUDE)
  await db.query(BASELINE_HANDLE_NEW_USER)
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgchain-'))
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
  await resetSchema()
  await applyChain(USAGE, USAGE_ACL, CLAIM, PROFILE_GUARD)
  await asSession(null, false)
})

// ═══════════════ A. the chain itself ═══════════════

describe('A. migration chain', () => {
  it('A1. applies cleanly in production order, and every object exists afterwards', async () => {
    const { rows } = await db.query(`
      SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
        AND p.proname IN ('anon_chat_usage_increment','fn_claim_anonymous_conversations','handle_new_user')
      ORDER BY 1`)
    expect(rows.map(r => r.proname)).toEqual(
      ['anon_chat_usage_increment', 'fn_claim_anonymous_conversations', 'handle_new_user'])

    const t = await db.query(
      `SELECT to_regclass('public.anon_chat_usage') IS NOT NULL AS present`)
    expect(t.rows[0].present).toBe(true)
  })

  it('A2. 20260808 CANNOT be applied before 20260711 — this is production\'s current state', async () => {
    // Evidence for the ordering finding: the live project has neither the table nor the
    // RPC, so applying the corrective migration first aborts instead of silently
    // "succeeding" and leaving anon holding EXECUTE.
    await resetSchema()
    await expect(db.query(USAGE_ACL)).rejects.toThrow(/does not exist/i)
  })

  it('A3. the whole chain is idempotent — re-running it changes nothing', async () => {
    await signUp(ACCOUNT, false, 'Keep Me')
    await signUp(ANON_A, true)
    await asSession(ANON_A, true)
    await db.query('SELECT public.anon_chat_usage_increment()')

    await applyChain(USAGE, USAGE_ACL, CLAIM, PROFILE_GUARD) // second pass

    expect(await profileCount(ACCOUNT)).toBe(1)
    expect(await profileCount(ANON_A)).toBe(0)
    const { rows } = await db.query('SELECT count FROM public.anon_chat_usage WHERE user_id=$1', [ANON_A])
    expect(rows[0].count).toBe(1) // usage preserved, not reset
  })

  it('A4. every SECURITY DEFINER function in the chain pins search_path with pg_temp last', async () => {
    const { rows } = await db.query(`
      SELECT p.proname, array_to_string(p.proconfig, ',') AS cfg
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prosecdef
        AND p.proname IN ('anon_chat_usage_increment','fn_claim_anonymous_conversations')
      ORDER BY 1`)
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.cfg, `${r.proname} must pin search_path`).toMatch(/search_path=public, ?pg_temp/)
    }
  })
})

// ═══════════════ B. the end-to-end lifecycle ═══════════════

describe('B. anonymous → account lifecycle', () => {
  it('B1. full journey: anonymous signs up, chats, signs in, claims — history preserved, no duplicates', async () => {
    // 1. Anonymous identity appears. The guard must suppress its profile.
    await signUp(ANON_A, true)
    expect(await profileCount(ANON_A)).toBe(0)

    // 2. It chats. Quota is metered server-side against its own uid.
    await asSession(ANON_A, true)
    for (let i = 0; i < 3; i++) await db.query('SELECT public.anon_chat_usage_increment()')
    await db.query(
      `INSERT INTO public.conversations (user_id, title) VALUES ($1,'Đà Nẵng 3 ngày'), ($1,'Quán chay')`,
      [ANON_A])

    // 3. The user signs in with Google — a NEW, non-anonymous auth.users row, which
    //    does get a profile.
    await signUp(ACCOUNT, false, 'Huy Pham')
    expect(await profileCount(ACCOUNT)).toBe(1)

    // 4. The route (service_role) performs the carry-over.
    await db.query('SET ROLE service_role')
    const { rows: claim } = await db.query(
      'SELECT public.fn_claim_anonymous_conversations($1,$2) AS moved', [ANON_A, ACCOUNT])
    await db.query('RESET ROLE')
    expect(claim[0].moved).toBe(2)

    // 5. The account now owns exactly those conversations — moved, not copied.
    const total = await db.query('SELECT count(*)::int AS n FROM public.conversations')
    expect(total.rows[0].n).toBe(2)

    await asSession(ACCOUNT, false)
    await db.query('SET ROLE authenticated')
    const mine = await db.query('SELECT title FROM public.conversations ORDER BY title')
    await db.query('RESET ROLE')
    expect(mine.rows.map(r => r.title)).toEqual(['Quán chay', 'Đà Nẵng 3 ngày'])

    // 6. The anonymous identity keeps no profile and no longer sees the history.
    expect(await profileCount(ANON_A)).toBe(0)
    await asSession(ANON_A, true)
    await db.query('SET ROLE authenticated')
    const stale = await db.query('SELECT count(*)::int AS n FROM public.conversations')
    await db.query('RESET ROLE')
    expect(stale.rows[0].n).toBe(0)
  })

  it('B2. replaying the claim is idempotent end-to-end — no duplicate history', async () => {
    await signUp(ANON_A, true)
    await signUp(ACCOUNT, false, 'Huy')
    await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1,'one'), ($1,'two')`, [ANON_A])

    await db.query('SET ROLE service_role')
    const first = await db.query('SELECT public.fn_claim_anonymous_conversations($1,$2) AS m', [ANON_A, ACCOUNT])
    const second = await db.query('SELECT public.fn_claim_anonymous_conversations($1,$2) AS m', [ANON_A, ACCOUNT])
    const third = await db.query('SELECT public.fn_claim_anonymous_conversations($1,$2) AS m', [ANON_A, ACCOUNT])
    await db.query('RESET ROLE')

    expect([first.rows[0].m, second.rows[0].m, third.rows[0].m]).toEqual([2, 0, 0])
    const { rows } = await db.query('SELECT count(*)::int AS n FROM public.conversations WHERE user_id=$1', [ACCOUNT])
    expect(rows[0].n).toBe(2)
  })

  it('B3. a second anonymous session claimed into the SAME account accumulates, never overwrites', async () => {
    await signUp(ANON_A, true); await signUp(ANON_B, true)
    await signUp(ACCOUNT, false, 'Huy')
    await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1,'from A')`, [ANON_A])
    await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1,'from B')`, [ANON_B])

    await db.query('SET ROLE service_role')
    await db.query('SELECT public.fn_claim_anonymous_conversations($1,$2)', [ANON_A, ACCOUNT])
    await db.query('SELECT public.fn_claim_anonymous_conversations($1,$2)', [ANON_B, ACCOUNT])
    await db.query('RESET ROLE')

    const { rows } = await db.query(
      'SELECT title FROM public.conversations WHERE user_id=$1 ORDER BY title', [ACCOUNT])
    expect(rows.map(r => r.title)).toEqual(['from A', 'from B'])
  })
})

// ═══════════════ C. the production foreign key ═══════════════

describe('C. conversations.user_id FK auth.users', () => {
  it('C1. claiming into a target that is not a real auth user fails — FK, not silent success', async () => {
    // Only reachable with the FK present. The route can never trigger this (it derives
    // the target from a verified token), but the constraint is what makes that
    // guarantee structural rather than procedural.
    await signUp(ANON_A, true)
    await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1,'x')`, [ANON_A])

    await db.query('SET ROLE service_role')
    const err = await db.query('SELECT public.fn_claim_anonymous_conversations($1,$2)', [ANON_A, ACCOUNT_2])
      .then(() => null, (e: { code?: string }) => e.code)
    await db.query('RESET ROLE')
    expect(err).toBe('23503') // foreign_key_violation
  })

  it('C2. a claim to a real account satisfies the FK and the rows survive', async () => {
    await signUp(ANON_A, true)
    await signUp(ACCOUNT, false, 'Huy')
    await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1,'x')`, [ANON_A])

    await db.query('SET ROLE service_role')
    const { rows } = await db.query('SELECT public.fn_claim_anonymous_conversations($1,$2) AS m', [ANON_A, ACCOUNT])
    await db.query('RESET ROLE')
    expect(rows[0].m).toBe(1)
  })
})

// ═══════════════ D. isolation across the whole chain ═══════════════

describe('D. cross-user isolation', () => {
  beforeEach(async () => {
    await signUp(ANON_A, true); await signUp(ANON_B, true)
    await signUp(ACCOUNT, false, 'Owner')
    await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1,'A private')`, [ANON_A])
    await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1,'account private')`, [ACCOUNT])
  })

  it('D1. an anonymous session cannot READ another identity\'s conversations', async () => {
    await asSession(ANON_B, true)
    await db.query('SET ROLE authenticated')
    const { rows } = await db.query('SELECT title FROM public.conversations')
    await db.query('RESET ROLE')
    expect(rows).toEqual([])
  })

  it('D2. an anonymous session cannot MODIFY or DELETE another identity\'s conversations', async () => {
    await asSession(ANON_B, true)
    await db.query('SET ROLE authenticated')
    await db.query(`UPDATE public.conversations SET title='hijacked'`)
    await db.query(`DELETE FROM public.conversations`)
    await db.query('RESET ROLE')

    const { rows } = await db.query('SELECT title FROM public.conversations ORDER BY title')
    expect(rows.map(r => r.title)).toEqual(['A private', 'account private'])
  })

  it('D3. an anonymous session cannot spend or reset another identity\'s quota', async () => {
    await asSession(ANON_A, true)
    for (let i = 0; i < 4; i++) await db.query('SELECT public.anon_chat_usage_increment()')

    // B's own counter is independent…
    await asSession(ANON_B, true)
    const { rows } = await db.query('SELECT public.anon_chat_usage_increment() AS n')
    expect(rows[0].n).toBe(1)

    // …and B cannot reach the table to tamper with A's row.
    expect(await asRole('authenticated',
      `UPDATE public.anon_chat_usage SET count = 0 WHERE user_id='${ANON_A}'`)).not.toBeNull()

    await db.query('RESET ROLE')
    const a = await db.query('SELECT count FROM public.anon_chat_usage WHERE user_id=$1', [ANON_A])
    expect(a.rows[0].count).toBe(4)
  })

  it('D4. an anonymous session cannot create a profile for itself or anyone else', async () => {
    await asSession(ANON_A, true)
    // No INSERT grant on profiles for anon/authenticated at all — the guard is not the
    // only thing keeping anonymous identities out of the table.
    expect(await asRole('authenticated',
      `INSERT INTO public.profiles (id) VALUES ('${ANON_A}')`)).toBe('42501')
    expect(await asRole('anon',
      `INSERT INTO public.profiles (id) VALUES ('${ANON_A}')`)).toBe('42501')
    expect(await profileCount(ANON_A)).toBe(0)
  })

  it('D5. the claim RPC is unreachable by every client-facing role', async () => {
    for (const role of ['anon', 'authenticated']) {
      expect(await asRole(role,
        `SELECT public.fn_claim_anonymous_conversations('${ANON_A}','${ACCOUNT}')`),
      `${role} must not hold EXECUTE`).toBe('42501')
    }
  })

  it('D6. no anon/PUBLIC EXECUTE survives anywhere in the chain', async () => {
    const { rows } = await db.query(`
      SELECT p.proname, CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS grantee
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE n.nspname='public' AND a.privilege_type='EXECUTE'
        AND p.proname IN ('anon_chat_usage_increment','fn_claim_anonymous_conversations')
        AND (a.grantee=0 OR a.grantee::regrole::text='anon')
      ORDER BY 1`)
    expect(rows).toEqual([])
  })
})

// ═══════════════ E. authenticated regression ═══════════════

describe('E. real accounts are unaffected by the whole chain', () => {
  it('E1. signup still creates a profile with metadata mapped as before', async () => {
    await signUp(ACCOUNT, false, 'Huy Pham')
    const { rows } = await db.query('SELECT full_name, avatar_url FROM public.profiles WHERE id=$1', [ACCOUNT])
    expect(rows[0].full_name).toBe('Huy Pham')
    expect(rows[0].avatar_url).toBe('https://img/a.png')
  })

  it('E2. a signed-in account still owns and reads its own conversations', async () => {
    await signUp(ACCOUNT, false, 'Huy')
    await asSession(ACCOUNT, false)
    await db.query('SET ROLE authenticated')
    await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ('${ACCOUNT}','mine')`)
    const { rows } = await db.query('SELECT title FROM public.conversations')
    await db.query('RESET ROLE')
    expect(rows.map(r => r.title)).toEqual(['mine'])
  })

  it('E3. a real account is still refused by the anonymous quota RPC', async () => {
    await signUp(ACCOUNT, false, 'Huy')
    await asSession(ACCOUNT, false)
    await expect(db.query('SELECT public.anon_chat_usage_increment()'))
      .rejects.toThrow(/not an anonymous session/i)
  })

  it('E4. profiles of real accounts remain publicly viewable; anonymous ones never appear', async () => {
    await signUp(ACCOUNT, false, 'Visible')
    await signUp(ANON_A, true)
    await db.query('SET ROLE anon')
    const { rows } = await db.query('SELECT id FROM public.profiles')
    await db.query('RESET ROLE')
    expect(rows.map(r => r.id)).toEqual([ACCOUNT])
  })

  it('E5. quota accounting survives the claim — spending is per identity, not per profile', async () => {
    await signUp(ANON_A, true); await signUp(ACCOUNT, false, 'Huy')
    await asSession(ANON_A, true)
    for (let i = 0; i < ANON_DAILY_LIMIT; i++) await db.query('SELECT public.anon_chat_usage_increment()')
    await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1,'c')`, [ANON_A])

    await db.query('SET ROLE service_role')
    await db.query('SELECT public.fn_claim_anonymous_conversations($1,$2)', [ANON_A, ACCOUNT])
    await db.query('RESET ROLE')

    // The account is NOT governed by the anonymous counter — it has its own tier logic
    // in /api/chat — so claiming must not import a spent anonymous quota onto it.
    const { rows } = await db.query('SELECT count(*)::int AS n FROM public.anon_chat_usage WHERE user_id=$1', [ACCOUNT])
    expect(rows[0].n).toBe(0)
  })
})
