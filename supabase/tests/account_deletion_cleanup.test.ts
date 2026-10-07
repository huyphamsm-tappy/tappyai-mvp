import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ---------------------------------------------------------------------------------------------------------------------------------
// Account deletion clean-up (Apple 5.1.1(v)) - migration 20261005_account_deletion_cleanup.sql, run on a REAL Postgres.
//
// The tables are minimal shapes carrying the SAME foreign keys production has (measured on the production catalog 2026-10-05):
//   cascade from auth.users  : groups.creator_id, user_integrations.user_id, notifications.user_id, profiles.id
//   cascade through profiles : subscriptions.user_id (the control: "most tables already cascade")
//   SET NULL                 : notifications.actor_id, chat_messages.sender_id
//   NO foreign key at all    : user_memory.user_id (TEXT), decision_evidence.owner_id, anon_chat_usage.user_id
// Synthetic users only.
// ---------------------------------------------------------------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const MIGRATION = read('supabase/migrations/20261005_account_deletion_cleanup.sql')
const ROLLBACK = read('supabase/migrations/rollback/20261005_account_deletion_cleanup_rollback.sql')

const PORT = 54310 // 54379 belongs to plan_shares_boundary (RC); unique per suite, see portAllocation.test.ts
const U = '11111111-1111-4111-8111-111111111111'      // the account being deleted
const OTHER = '22222222-2222-4222-8222-222222222222'  // someone who must be untouched
const BARE = '44444444-4444-4444-8444-444444444444'   // no groups, no integration, no leftovers
const BOOM = '55555555-5555-4555-8555-555555555555'   // a deletion that fails halfway
const G1 = 'aaaaaaaa-0000-4000-8000-000000000001'     // created by U
const G2 = 'aaaaaaaa-0000-4000-8000-000000000002'     // created by OTHER

const SHAPE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  -- The platform fact the migration must defend against: new tables are born fully open.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);

  CREATE TABLE public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, full_name TEXT);
  CREATE TABLE public.subscriptions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, plan TEXT);
  CREATE TABLE public.groups (id UUID PRIMARY KEY, creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, name TEXT NOT NULL);
  CREATE TABLE public.user_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, access_token TEXT, refresh_token TEXT, UNIQUE (user_id, provider));
  CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT, body TEXT);
  CREATE TABLE public.chat_messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, body TEXT NOT NULL);
  -- the three stores with NO foreign key (user_memory.user_id is TEXT in production)
  CREATE TABLE public.user_memory (user_id TEXT PRIMARY KEY, memory JSONB NOT NULL DEFAULT '{}');
  CREATE TABLE public.decision_evidence (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_id UUID NOT NULL, payload JSONB NOT NULL DEFAULT '{}');
  CREATE TABLE public.anon_chat_usage (user_id UUID NOT NULL, day DATE NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));
`

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${U}', 'u@example.test'), ('${OTHER}', 'o@example.test'), ('${BARE}', 'b@example.test'), ('${BOOM}', 'x@example.test');
  INSERT INTO public.profiles (id, full_name) VALUES ('${U}', 'U'), ('${OTHER}', 'Other'), ('${BARE}', 'Bare'), ('${BOOM}', 'Boom');
  INSERT INTO public.subscriptions (user_id, plan) VALUES ('${U}', 'pip'), ('${OTHER}', 'momo');
  INSERT INTO public.groups (id, creator_id, name) VALUES ('${G1}', '${U}', 'U group'), ('${G2}', '${OTHER}', 'Other group');
  INSERT INTO public.user_integrations (user_id, provider, access_token, refresh_token) VALUES
    ('${U}', 'google_calendar', 'ya29.access-U', '1//refresh-U'),
    ('${U}', 'zalo', 'zalo-access-U', NULL),
    ('${OTHER}', 'google_calendar', 'ya29.access-O', '1//refresh-O');
  INSERT INTO public.notifications (user_id, actor_id, title, body) VALUES
    ('${OTHER}', '${U}', 'Uyen binh luan review cua ban', '"quan nay ngon"'),
    ('${U}', '${OTHER}', 'Other thich review cua ban', NULL),
    ('${OTHER}', '${BARE}', 'Bare thich review cua ban', NULL);
  INSERT INTO public.chat_messages (sender_id, body) VALUES ('${U}', 'hen gap o quan 1'), ('${OTHER}', 'ok');
  INSERT INTO public.user_memory (user_id, memory) VALUES ('${U}', '{"likes":"pho"}'), ('${OTHER}', '{"likes":"bun"}'), ('${BOOM}', '{"likes":"x"}');
  INSERT INTO public.decision_evidence (owner_id) VALUES ('${U}'), ('${U}'), ('${OTHER}'), ('${BOOM}');
  INSERT INTO public.anon_chat_usage (user_id, day, n) VALUES ('${U}', '2026-10-01', 3), ('${U}', '2026-10-02', 1), ('${OTHER}', '2026-10-01', 2);
`

let pg: EmbeddedPostgres
let dataDir: string
let before: Client   // production shape, migration NOT applied
let after: Client    // migration applied
let rolled: Client   // migration applied, then rolled back

async function newClient(database: string): Promise<Client> {
  const { Client: PgClient } = await import('pg')
  const c = new PgClient({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database })
  await c.connect()
  return c
}
const count = async (db: Client, sql: string) => Number((await db.query(sql)).rows[0].c)
const sqlstate = async (db: Client, sql: string): Promise<string | null> => {
  try { await db.query(sql); return null } catch (e) { return (e as { code?: string }).code ?? 'unknown' }
}
async function asRole(db: Client, role: string, sql: string): Promise<{ code: string | null; rows: unknown[] }> {
  try { await db.query(`SET ROLE ${role}`); const r = await db.query(sql); return { code: null, rows: r.rows } }
  catch (e) { return { code: (e as { code?: string }).code ?? 'unknown', rows: [] } }
  finally { await db.query('RESET ROLE') }
}
const priv = async (db: Client, role: string, table: string, p: string) =>
  (await db.query(`SELECT has_table_privilege($1, $2, $3) AS ok`, [role, table, p])).rows[0].ok as boolean
const constraints = async (db: Client) => (await db.query(`
  SELECT c.conrelid::regclass::text AS tbl, c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
   WHERE (c.connamespace = 'public'::regnamespace OR c.conrelid = 'auth.users'::regclass) AND c.conrelid::regclass::text <> 'account_deletion_jobs' AND c.conrelid::regclass::text <> 'public.account_deletion_jobs'
   ORDER BY 1, 2`)).rows

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'account-deletion-cleanup-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
  await pg.initialise()
  await pg.start()
  for (const name of ['before', 'after', 'rolled']) {
    await pg.createDatabase(name)
    const db = await newClient(name)
    await db.query(SHAPE)
    await db.query(SEED)
    if (name === 'after') { await db.query(MIGRATION); after = db }
    else if (name === 'rolled') { await db.query(MIGRATION); await db.query(ROLLBACK); rolled = db }
    else before = db
  }
}, 240_000)

afterAll(async () => {
  for (const c of [before, after, rolled]) { try { await c?.end() } catch { /* closed */ } }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* file locks */ }
})

describe('the defect, reproduced on the production shape', () => {
  it('deleting the account leaves the AI memory, decision evidence, anon usage and a notification carrying the name', async () => {
    await before.query(`DELETE FROM auth.users WHERE id = '${U}'`)
    expect(await count(before, `SELECT count(*) c FROM public.user_memory WHERE user_id = '${U}'`)).toBe(1)
    expect(await count(before, `SELECT count(*) c FROM public.decision_evidence WHERE owner_id = '${U}'`)).toBe(2)
    expect(await count(before, `SELECT count(*) c FROM public.anon_chat_usage WHERE user_id = '${U}'`)).toBe(2)
    expect(await count(before, `SELECT count(*) c FROM public.notifications WHERE title LIKE 'Uyen%' AND actor_id IS NULL`)).toBe(1)
  })
})

describe('after the migration', () => {
  it('deleting the account removes every store that had no cascade path, scoped to exactly that user', async () => {
    await after.query(`DELETE FROM auth.users WHERE id = '${U}'`)
    expect(await count(after, `SELECT count(*) c FROM public.user_memory WHERE user_id = '${U}'`)).toBe(0)
    expect(await count(after, `SELECT count(*) c FROM public.decision_evidence WHERE owner_id = '${U}'`)).toBe(0)
    expect(await count(after, `SELECT count(*) c FROM public.anon_chat_usage WHERE user_id = '${U}'`)).toBe(0)
    expect(await count(after, `SELECT count(*) c FROM public.notifications WHERE title LIKE 'Uyen%'`)).toBe(0)
  })

  it('other people are untouched: their memory, evidence, usage, subscription, groups, integrations and notifications', async () => {
    expect(await count(after, `SELECT count(*) c FROM public.user_memory WHERE user_id = '${OTHER}'`)).toBe(1)
    expect(await count(after, `SELECT count(*) c FROM public.decision_evidence WHERE owner_id = '${OTHER}'`)).toBe(1)
    expect(await count(after, `SELECT count(*) c FROM public.anon_chat_usage WHERE user_id = '${OTHER}'`)).toBe(1)
    expect(await count(after, `SELECT count(*) c FROM public.subscriptions WHERE user_id = '${OTHER}'`)).toBe(1)
    expect(await count(after, `SELECT count(*) c FROM public.groups WHERE creator_id = '${OTHER}'`)).toBe(1)
    expect(await count(after, `SELECT count(*) c FROM public.user_integrations WHERE user_id = '${OTHER}'`)).toBe(1)
    // a notification OTHER caused for U is gone with U's inbox (cascade); one BARE caused for OTHER stays
    expect(await count(after, `SELECT count(*) c FROM public.notifications WHERE title LIKE 'Bare%'`)).toBe(1)
  })

  it('the tables that already cascade still do (the control), and messages to other people are anonymised, not deleted', async () => {
    expect(await count(after, `SELECT count(*) c FROM public.subscriptions WHERE user_id = '${U}'`)).toBe(0)
    expect(await count(after, `SELECT count(*) c FROM public.user_integrations WHERE user_id = '${U}'`)).toBe(0)
    expect(await count(after, `SELECT count(*) c FROM public.groups WHERE id = '${G1}'`)).toBe(0)
    expect(await count(after, `SELECT count(*) c FROM public.chat_messages WHERE body = 'hen gap o quan 1' AND sender_id IS NULL`)).toBe(1)
  })

  it('queues exactly one job for the deleted user: the groups they created and the Google token (refresh preferred), not Zalo, not others', async () => {
    const jobs = (await after.query(`SELECT user_id, group_ids, google_tokens, attempts, done_at FROM public.account_deletion_jobs WHERE user_id = '${U}'`)).rows
    expect(jobs).toHaveLength(1)
    expect(jobs[0].group_ids).toEqual([G1])
    expect(jobs[0].google_tokens).toEqual(['1//refresh-U'])
    expect(jobs[0].attempts).toBe(0)
    expect(jobs[0].done_at).toBeNull()
    expect(await count(after, `SELECT count(*) c FROM public.account_deletion_jobs WHERE user_id = '${OTHER}'`)).toBe(0)
  })

  it('a user with no groups, no integration and no leftovers is deleted cleanly with an empty job', async () => {
    await after.query(`DELETE FROM auth.users WHERE id = '${BARE}'`)
    const job = (await after.query(`SELECT group_ids, google_tokens FROM public.account_deletion_jobs WHERE user_id = '${BARE}'`)).rows[0]
    expect(job.group_ids).toEqual([])
    expect(job.google_tokens).toEqual([])
  })

  it('🚨 ATOMIC: if any step fails the deletion rolls back completely - the account, its data and its job are all still there', async () => {
    await after.query(`
      CREATE FUNCTION public.boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated failure'; END $$;
      CREATE TRIGGER trg_boom BEFORE DELETE ON public.decision_evidence FOR EACH ROW EXECUTE FUNCTION public.boom();`)
    const code = await sqlstate(after, `DELETE FROM auth.users WHERE id = '${BOOM}'`)
    expect(code).toBe('P0001')
    expect(await count(after, `SELECT count(*) c FROM auth.users WHERE id = '${BOOM}'`)).toBe(1)
    expect(await count(after, `SELECT count(*) c FROM public.user_memory WHERE user_id = '${BOOM}'`)).toBe(1)
    expect(await count(after, `SELECT count(*) c FROM public.decision_evidence WHERE owner_id = '${BOOM}'`)).toBe(1)
    expect(await count(after, `SELECT count(*) c FROM public.account_deletion_jobs WHERE user_id = '${BOOM}'`)).toBe(0)
    await after.query(`DROP TRIGGER trg_boom ON public.decision_evidence; DROP FUNCTION public.boom();`)
    await after.query(`DELETE FROM auth.users WHERE id = '${BOOM}'`)   // retry succeeds once the cause is gone
    expect(await count(after, `SELECT count(*) c FROM public.account_deletion_jobs WHERE user_id = '${BOOM}'`)).toBe(1)
  })
})

describe('what the migration is allowed to change', () => {
  it('ADDS only: every existing constraint is identical before and after (no FK swapped, no column changed)', async () => {
    const fresh = await newClient('before')
    try {
      const a = await constraints(fresh)
      const b = await constraints(after)
      expect(b).toEqual(a)
    } finally { await fresh.end() }
  })

  it('applying it twice is a no-op: one trigger, one queue table, both functions, no error', async () => {
    expect(await sqlstate(after, MIGRATION)).toBeNull()
    expect(await sqlstate(after, MIGRATION)).toBeNull()
    expect(await count(after, `SELECT count(*) c FROM pg_trigger WHERE tgname = 'trg_enqueue_account_deletion' AND NOT tgisinternal`)).toBe(1)
    expect(await count(after, `SELECT count(*) c FROM pg_proc WHERE proname IN ('fn_enqueue_account_deletion','account_deletion_ready')`)).toBe(2)
  })

  it('the SQL file itself cannot widen: no column/type change, no DROP TABLE/COLUMN, no TRUNCATE, nothing about shared_results', () => {
    const code = MIGRATION.replace(/^\s*--.*$/gm, '')
    expect(code).not.toMatch(/ALTER\s+TABLE[^;]*\b(ALTER\s+COLUMN|DROP\s+COLUMN|DROP\s+CONSTRAINT|ADD\s+CONSTRAINT)\b/i)
    expect(code).not.toMatch(/DROP\s+TABLE|TRUNCATE|DROP\s+COLUMN/i)
    expect(code).not.toMatch(/shared_results/i)
    // the only DELETEs are the four scoped to the user being deleted
    const deletes = code.match(/DELETE\s+FROM[^;]*;/gi) ?? []
    expect(deletes).toHaveLength(4)
    for (const d of deletes) expect(d).toMatch(/=\s*OLD\.id/)
  })
})

describe('access and privileges', () => {
  it('the queue table is locked down: RLS on; anon and authenticated can do nothing; service_role may only SELECT and UPDATE', async () => {
    expect((await after.query(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.account_deletion_jobs'::regclass`)).rows[0].relrowsecurity).toBe(true)
    for (const role of ['anon', 'authenticated']) {
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) expect(await priv(after, role, 'public.account_deletion_jobs', p), `${role} ${p}`).toBe(false)
    }
    expect(await priv(after, 'service_role', 'public.account_deletion_jobs', 'SELECT')).toBe(true)
    expect(await priv(after, 'service_role', 'public.account_deletion_jobs', 'UPDATE')).toBe(true)
    expect(await priv(after, 'service_role', 'public.account_deletion_jobs', 'INSERT')).toBe(false)
    expect(await priv(after, 'service_role', 'public.account_deletion_jobs', 'DELETE')).toBe(false)
    expect((await asRole(after, 'anon', `SELECT * FROM public.account_deletion_jobs`)).code).toBe('42501')
    expect((await asRole(after, 'authenticated', `SELECT * FROM public.account_deletion_jobs`)).code).toBe('42501')
  })

  it('the enqueue function cannot be called by clients; the readiness probe can (and reveals only a boolean)', async () => {
    for (const role of ['anon', 'authenticated']) {
      expect((await asRole(after, role, `SELECT public.fn_enqueue_account_deletion()`)).code, role).toBe('42501')
      const ready = await asRole(after, role, `SELECT public.account_deletion_ready() AS r`)
      expect(ready.code).toBeNull()
      expect(ready.rows).toEqual([{ r: true }])
    }
  })

  it('both SECURITY DEFINER functions pin their search_path', async () => {
    const rows = (await after.query(`SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname IN ('fn_enqueue_account_deletion','account_deletion_ready')`)).rows
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.prosecdef).toBe(true)
      expect(r.proconfig).toEqual(['search_path=public, pg_temp'])
    }
  })
})

describe('the readiness gate follows the database, not an environment variable', () => {
  it('false before the migration (the function does not exist), true after, false while the trigger is disabled, true again when re-enabled', async () => {
    expect(await sqlstate(before, `SELECT public.account_deletion_ready()`)).toBe('42883')   // undefined_function -> PostgREST 404 -> the app reads "not ready"
    const ready = async () => (await after.query(`SELECT public.account_deletion_ready() AS r`)).rows[0].r
    expect(await ready()).toBe(true)
    await after.query(`ALTER TABLE auth.users DISABLE TRIGGER trg_enqueue_account_deletion`)
    expect(await ready()).toBe(false)
    await after.query(`ALTER TABLE auth.users ENABLE TRIGGER trg_enqueue_account_deletion`)
    expect(await ready()).toBe(true)
  })
})

describe('rollback', () => {
  it('removes the trigger and both functions but KEEPS the queue (and any jobs in it)', async () => {
    expect(await count(rolled, `SELECT count(*) c FROM pg_trigger WHERE tgname = 'trg_enqueue_account_deletion'`)).toBe(0)
    expect(await count(rolled, `SELECT count(*) c FROM pg_proc WHERE proname IN ('fn_enqueue_account_deletion','account_deletion_ready')`)).toBe(0)
    expect(await count(rolled, `SELECT count(*) c FROM pg_class WHERE oid = 'public.account_deletion_jobs'::regclass`)).toBe(1)
    expect(await sqlstate(rolled, `SELECT public.account_deletion_ready()`)).toBe('42883')
  })
  it('after a rollback deletion no longer queues or cleans (back to the baseline), and nothing else is affected', async () => {
    await rolled.query(`DELETE FROM auth.users WHERE id = '${U}'`)
    expect(await count(rolled, `SELECT count(*) c FROM public.account_deletion_jobs`)).toBe(0)
    expect(await count(rolled, `SELECT count(*) c FROM public.user_memory WHERE user_id = '${U}'`)).toBe(1)
    expect(await count(rolled, `SELECT count(*) c FROM public.user_memory WHERE user_id = '${OTHER}'`)).toBe(1)
  })
  it('the rollback is itself idempotent', async () => {
    expect(await sqlstate(rolled, ROLLBACK)).toBeNull()
  })
})
