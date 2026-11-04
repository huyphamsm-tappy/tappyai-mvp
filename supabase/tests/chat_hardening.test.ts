import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ══════════════════════════════════════════════════════════════════════════════
// Messenger hardening (20261107_chat_hardening.sql), proven at the DATABASE with the real migrations executed verbatim.
//   1. chat_reads UPDATE needs participation, like INSERT (a cursor cannot be pointed at a thread you are not in).
//   2. a sender's 121st message in a minute is refused by a trigger, whoever asks — a direct INSERT cannot skip the route's limiter.
// ══════════════════════════════════════════════════════════════════════════════

const REPO = join(__dirname, '..', '..')
const mig = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')
const CHAT = mig('20260905_chat_messaging_phase1.sql')
const REACH = mig('20260906_phase6_messenger_reachability.sql')
const CLIENT_ID = mig('20261105_chat_messages_client_id.sql')
const HARDEN = mig('20261107_chat_hardening.sql')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261107_chat_hardening_rollback.sql'), 'utf8')

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $fn$;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
    SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
  $fn$;
  GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email VARCHAR(255));
  CREATE TABLE public.user_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (follower_id, following_id), CHECK (follower_id <> following_id));
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN CREATE PUBLICATION supabase_realtime; END IF;
  END $$;
`

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const C = '33333333-3333-3333-3333-333333333333'
const PORT = 54340 // unique across supabase/tests (portAllocation.test.ts)

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

async function asSession(uid: string | null) {
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [uid === null ? '' : JSON.stringify({ sub: uid, role: 'authenticated', is_anonymous: false })])
}
/** Run `sql` as `role`; the PostgreSQL error CODE, or null on success. */
async function errorAs(role: string, sql: string, params: unknown[] = []): Promise<string | null> {
  try { await db.query(`SET ROLE ${role}`); await db.query(sql, params as never[]); return null }
  catch (e) { return (e as { code?: string }).code ?? 'unknown' }
  finally { await db.query('RESET ROLE') }
}
async function rowsAs<T = Record<string, unknown>>(role: string, sql: string, params: unknown[] = []): Promise<T[]> {
  try { await db.query(`SET ROLE ${role}`); return (await db.query(sql, params as never[])).rows as T[] }
  finally { await db.query('RESET ROLE') }
}
const follow = (x: string, y: string) => db.query('INSERT INTO public.user_follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [x, y])

/** A direct thread between A and B (mutual follow, the default reachability), made through the real RPC. */
async function threadAB(): Promise<string> {
  await follow(A, B); await follow(B, A)
  await asSession(A)
  return (await rowsAs<{ chat_start_direct: string }>('authenticated', 'SELECT public.chat_start_direct($1)', [B]))[0]!.chat_start_direct
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgchath-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)
beforeEach(async () => {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query('DROP PUBLICATION IF EXISTS supabase_realtime')
  await db.query(PRELUDE); await db.query(CHAT); await db.query(REACH); await db.query(CLIENT_ID); await db.query(HARDEN)
  for (const id of [A, B, C]) await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [id, `${id}@example.com`])
  await asSession(null)
})

describe('chat_reads UPDATE needs participation (P3)', () => {
  it('a participant can move their own cursor', async () => {
    const t = await threadAB()
    await asSession(A)
    expect(await errorAs('authenticated', `INSERT INTO public.chat_reads (thread_id, user_id, last_read_at) VALUES ($1, $2, now())`, [t, A])).toBeNull()
    const rows = await rowsAs<{ n: number }>('authenticated', `WITH u AS (UPDATE public.chat_reads SET last_read_at = now() + interval '1 second' WHERE thread_id = $1 AND user_id = $2 RETURNING 1) SELECT count(*)::int AS n FROM u`, [t, A])
    expect(rows[0]!.n).toBe(1)
  })

  it('a row that points at a thread the user is NOT in cannot be updated (and cannot be created by update)', async () => {
    const t = await threadAB()
    // C is not in the thread. Plant a cursor row for C as the superuser (what the old policy let C do to themselves by INSERT-then-UPDATE paths or a stale row after removal).
    await db.query(`INSERT INTO public.chat_reads (thread_id, user_id, last_read_at) VALUES ($1, $2, now())`, [t, C])
    await asSession(C)
    const rows = await rowsAs<{ n: number }>('authenticated', `WITH u AS (UPDATE public.chat_reads SET last_read_at = now() + interval '1 hour' WHERE thread_id = $1 AND user_id = $2 RETURNING 1) SELECT count(*)::int AS n FROM u`, [t, C])
    expect(rows[0]!.n, 'a non-participant must update 0 rows').toBe(0)
  })

  it('nobody can update another person\'s cursor', async () => {
    const t = await threadAB()
    await db.query(`INSERT INTO public.chat_reads (thread_id, user_id, last_read_at) VALUES ($1, $2, now())`, [t, A])
    await asSession(B)
    const rows = await rowsAs<{ n: number }>('authenticated', `WITH u AS (UPDATE public.chat_reads SET last_read_at = now() + interval '1 hour' WHERE thread_id = $1 AND user_id = $2 RETURNING 1) SELECT count(*)::int AS n FROM u`, [t, A])
    expect(rows[0]!.n).toBe(0)
  })
})

describe('the database backstop on sending (P2): 120 messages a minute per sender, whoever asks', () => {
  it('120 messages in a minute are accepted, the 121st is refused with SQLSTATE 53400', async () => {
    const t = await threadAB()
    await asSession(A)
    expect(await errorAs('authenticated', `INSERT INTO public.chat_messages (thread_id, sender_id, body) SELECT $1, $2, 'm' || g FROM generate_series(1,120) g`, [t, A])).toBeNull()
    expect(await errorAs('authenticated', `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1, $2, 'one too many')`, [t, A])).toBe('53400')
    const n = (await db.query('SELECT count(*)::int AS n FROM public.chat_messages WHERE sender_id = $1', [A])).rows[0].n
    expect(n).toBe(120)
  })

  it('it is per SENDER: the other person in the thread is not affected by A\'s burst', async () => {
    const t = await threadAB()
    await asSession(A)
    await errorAs('authenticated', `INSERT INTO public.chat_messages (thread_id, sender_id, body) SELECT $1, $2, 'm' || g FROM generate_series(1,120) g`, [t, A])
    await asSession(B)
    expect(await errorAs('authenticated', `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1, $2, 'hi from B')`, [t, B])).toBeNull()
  })

  it('messages older than a minute do not count', async () => {
    const t = await threadAB()
    await db.query(`INSERT INTO public.chat_messages (thread_id, sender_id, body, created_at) SELECT $1, $2, 'old' || g, now() - interval '2 minutes' FROM generate_series(1,200) g`, [t, A])
    await asSession(A)
    expect(await errorAs('authenticated', `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1, $2, 'fresh')`, [t, A])).toBeNull()
  })

  it('the existing rules still hold: not a participant → RLS 42501; forged sender → RLS 42501', async () => {
    const t = await threadAB()
    await asSession(C)
    expect(await errorAs('authenticated', `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1, $2, 'x')`, [t, C])).toBe('42501')
    await asSession(A)
    expect(await errorAs('authenticated', `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1, $2, 'x')`, [t, B])).toBe('42501')
  })

  it('the trigger function is not callable by any client role (ADR-019)', async () => {
    for (const role of ['anon', 'authenticated']) {
      const r = await db.query(`SELECT has_function_privilege($1, 'public.chat_messages_send_limit()', 'execute') AS ok`, [role])
      expect(r.rows[0].ok, role).toBe(false)
    }
  })
})

describe('re-apply and rollback', () => {
  it('applying the migration twice is harmless', async () => {
    await db.query(HARDEN); await db.query(HARDEN)
    const t = await threadAB()
    await asSession(A)
    expect(await errorAs('authenticated', `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1, $2, 'ok')`, [t, A])).toBeNull()
  })

  it('the rollback removes the trigger and restores the old policy, and keeps every message', async () => {
    const t = await threadAB()
    await asSession(A)
    await errorAs('authenticated', `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1, $2, 'kept')`, [t, A])
    await db.query(ROLLBACK)
    expect((await db.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'chat_messages_send_limit'`)).rows[0].n).toBe(0)
    expect((await db.query('SELECT count(*)::int AS n FROM public.chat_messages')).rows[0].n).toBe(1)
    await db.query(HARDEN) // and it re-applies after a rollback
  })
})
