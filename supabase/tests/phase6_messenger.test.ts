import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6 — MESSENGER, proven at the DATABASE
//
// The Messenger is `public.chat_*`. It is NOT the Inbox: the Inbox is
// `public.notifications`, a notification centre. Phase 6 briefly carried a
// second messenger under an `inbox_*` prefix; it was retired so exactly one
// messenger data model exists, and this suite guards that one.
//
// Four properties, asserted against the REAL migrations from disk:
//
//   1. MEMBERSHIP — a thread id is not a capability. Changing it in a request
//      buys nothing, in either direction, for reads or writes.
//   2. REACHABILITY — who may open a conversation. Conservative by default and
//      enforced in the RPC, because `authenticated` can call the RPC directly
//      and would bypass any check written in TypeScript.
//   3. ENUMERATION — "no such account" and "that account will not hear from
//      you" must be indistinguishable.
//   4. BLOCKS — stop new contact and new messages, without erasing history.
//
// A test that built its own schema would prove the author's intent rather than
// the migration's behaviour, so the migrations are executed verbatim.
// ═══════════════════════════════════════════════════════════════════════════

const REPO = join(__dirname, '..', '..')
const mig = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')

const CHAT = mig('20260905_chat_messaging_phase1.sql')
const REACH = mig('20260906_phase6_messenger_reachability.sql')

/**
 * Platform facts, not conveniences.
 *
 * The ALTER DEFAULT PRIVILEGES lines reproduce what Supabase does to schema
 * `public`: grant `anon` and `authenticated` EVERYTHING on new objects. Without
 * them every "the client role cannot do X" assertion passes vacuously, because
 * X was never granted. `user_follows` is a minimal existence scaffold (ADR-020),
 * since the reachability rule reads it and its own migration drags in the whole
 * reviews graph.
 */
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
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE (follower_id, following_id),
    CHECK (follower_id <> following_id)
  );

  -- The publication the chat migration adds chat_messages to.
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END $$;
`

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const C = '33333333-3333-3333-3333-333333333333'
const GHOST = '99999999-9999-9999-9999-999999999999'
// Unique across supabase/tests — portAllocation.test.ts enforces it. Suites run
// in parallel, and a shared port fails one of them intermittently in a way that
// reads as a broken SQL suite rather than a port clash. 54351 was taken by
// music_tracks_boundary_rls.
const PORT = 54377

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

/** Impersonate a session. is_local=false so it survives to the next statement. */
async function asSession(uid: string | null, isAnonymous = false) {
  await db.query(
    `SELECT set_config('request.jwt.claims', $1, false)`,
    [uid === null ? '' : JSON.stringify({ sub: uid, role: 'authenticated', is_anonymous: isAnonymous })],
  )
}

/** Run `sql` as `role`; returns the PostgreSQL error CODE, or null on success. */
async function errorAs(role: string, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(`SET ROLE ${role}`)
    await db.query(sql, params as never[])
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  } finally {
    await db.query('RESET ROLE')
  }
}

/** Run `sql` as `role`; returns the full error, so message equality can be asserted. */
async function failureAs(role: string, sql: string, params: unknown[] = []) {
  try {
    await db.query(`SET ROLE ${role}`)
    await db.query(sql, params as never[])
    return null
  } catch (e) {
    const err = e as { code?: string; message?: string }
    return { code: err.code ?? 'unknown', message: err.message ?? '' }
  } finally {
    await db.query('RESET ROLE')
  }
}

async function rowsAs<T = Record<string, unknown>>(
  role: string, sql: string, params: unknown[] = [],
): Promise<T[]> {
  try {
    await db.query(`SET ROLE ${role}`)
    return (await db.query(sql, params as never[])).rows as T[]
  } finally {
    await db.query('RESET ROLE')
  }
}

const scalar = async (sql: string, params: unknown[] = []) =>
  (await db.query(sql, params as never[])).rows[0]

/** Start a direct thread as `me`, returning the id, or null if refused. */
async function startDirect(me: string, target: string): Promise<string | null> {
  await asSession(me)
  try {
    const rows = await rowsAs<{ chat_start_direct: string }>(
      'authenticated', 'SELECT public.chat_start_direct($1)', [target])
    return rows[0]?.chat_start_direct ?? null
  } catch {
    return null
  }
}

const follow = (from: string, to: string) =>
  db.query('INSERT INTO public.user_follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [from, to])

const mutualFollow = async (x: string, y: string) => { await follow(x, y); await follow(y, x) }

const setPolicy = (p: string) =>
  db.query('UPDATE public.chat_settings SET reachability = $1 WHERE id', [p])

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgmsgr-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--locale=C'],
  })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)

// Explicit timeout: vitest's default hook timeout is 10s and `pg.stop()` can
// exceed it under load. A timed-out teardown orphans a postgres still holding
// this port, which then fails this file on the next run.
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

beforeEach(async () => {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query('DROP PUBLICATION IF EXISTS supabase_realtime')
  await db.query(PRELUDE)
  await db.query(CHAT)
  await db.query(REACH)
  for (const id of [A, B, C]) {
    await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [id, `${id}@example.com`])
  }
  await asSession(null)
})

// ── S-00 ────────────────────────────────────────────────────────────────────

describe('S-00 · the suite is not vacuous', () => {
  it('both migrations applied and created the objects under test', async () => {
    const { n } = await scalar(`SELECT count(*)::int AS n FROM pg_tables
      WHERE schemaname='public'
        AND tablename IN ('chat_threads','chat_participants','chat_messages','chat_reads','chat_blocks','chat_settings')`) as { n: number }
    expect(n).toBe(6)
  })

  it('default privileges really do grant anon everything on a NEW public table', async () => {
    // Without this, every "anon cannot" assertion below is meaningless.
    await db.query('CREATE TABLE public.canary (id int)')
    expect(await scalar(`SELECT has_table_privilege('anon','public.canary','SELECT') AS ok`)).toEqual({ ok: true })
    await db.query('DROP TABLE public.canary')
  })

  it('the reachability default is the conservative one', async () => {
    expect(await scalar('SELECT reachability FROM public.chat_settings')).toEqual({ reachability: 'mutual_follow' })
  })

  it('a mutual follow really does open a thread — the happy path exists', async () => {
    await mutualFollow(A, B)
    expect(await startDirect(A, B)).toBeTruthy()
  })
})

// ── 1. MEMBERSHIP ───────────────────────────────────────────────────────────

describe('1 · a thread id is not a capability', () => {
  let thread: string

  beforeEach(async () => {
    await mutualFollow(A, B)
    thread = (await startDirect(A, B))!
    await asSession(A)
    await rowsAs('authenticated',
      `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1,$2,'hello B')`, [thread, A])
  })

  it('a participant reads the thread, the roster and the messages', async () => {
    await asSession(B)
    expect(await rowsAs('authenticated', 'SELECT id FROM public.chat_threads')).toHaveLength(1)
    expect(await rowsAs('authenticated', 'SELECT user_id FROM public.chat_participants')).toHaveLength(2)
    expect(await rowsAs('authenticated', 'SELECT body FROM public.chat_messages')).toHaveLength(1)
  })

  it('a stranger who KNOWS the thread id sees nothing', async () => {
    await asSession(C)
    expect(await rowsAs('authenticated', 'SELECT id FROM public.chat_threads WHERE id=$1', [thread])).toEqual([])
    expect(await rowsAs('authenticated', 'SELECT body FROM public.chat_messages WHERE thread_id=$1', [thread])).toEqual([])
    expect(await rowsAs('authenticated', 'SELECT user_id FROM public.chat_participants WHERE thread_id=$1', [thread])).toEqual([])
  })

  it('a stranger cannot post into it', async () => {
    await asSession(C)
    expect(await errorAs('authenticated',
      `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1,$2,'intrusion')`,
      [thread, C])).toBe('42501')
  })

  it('a participant cannot forge a message from the other participant', async () => {
    await asSession(B)
    expect(await errorAs('authenticated',
      `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1,$2,'forged')`,
      [thread, A])).toBe('42501')
  })

  it('no client role may mint membership directly', async () => {
    // Membership exists only through the RPCs. An INSERT policy permissive
    // enough to add a second person to a new thread is also permissive enough
    // to add yourself to someone else's.
    await asSession(C)
    expect(await errorAs('authenticated',
      `INSERT INTO public.chat_participants (thread_id, user_id) VALUES ($1,$2)`, [thread, C])).toBe('42501')
    expect(await errorAs('authenticated',
      `INSERT INTO public.chat_threads (kind, direct_key) VALUES ('direct','x:y')`)).toBe('42501')
  })

  it('anon gets nothing at all', async () => {
    await asSession(null)
    for (const t of ['chat_threads', 'chat_participants', 'chat_messages', 'chat_reads']) {
      expect(await errorAs('anon', `SELECT * FROM public.${t}`), t).toBe('42501')
    }
  })

  it('a read cursor belongs to exactly one person', async () => {
    await asSession(B)
    await rowsAs('authenticated',
      `INSERT INTO public.chat_reads (thread_id, user_id, last_read_at) VALUES ($1,$2,now())`, [thread, B])
    // A cannot see B's cursor, and cannot move it.
    await asSession(A)
    expect(await rowsAs('authenticated', 'SELECT user_id FROM public.chat_reads')).toEqual([])
    expect(await rowsAs('authenticated',
      `UPDATE public.chat_reads SET last_read_at=now() WHERE user_id=$1 RETURNING user_id`, [B])).toEqual([])
  })

  it('chat_is_participant answers only about the caller', async () => {
    await asSession(C)
    expect(await rowsAs('authenticated', 'SELECT public.chat_is_participant($1) AS m', [thread]))
      .toEqual([{ m: false }])
    await asSession(A)
    expect(await rowsAs('authenticated', 'SELECT public.chat_is_participant($1) AS m', [thread]))
      .toEqual([{ m: true }])
  })
})

// ── 2. REACHABILITY ─────────────────────────────────────────────────────────

describe('2 · reachability is conservative by default and enforced in the RPC', () => {
  it('a stranger cannot open a conversation', async () => {
    expect(await startDirect(A, B)).toBeNull()
  })

  it('a one-way follow is not enough, in either direction', async () => {
    await follow(A, B)
    expect(await startDirect(A, B)).toBeNull()
    await db.query('DELETE FROM public.user_follows')
    await follow(B, A)
    expect(await startDirect(A, B)).toBeNull()
  })

  it('a mutual follow opens it', async () => {
    await mutualFollow(A, B)
    expect(await startDirect(A, B)).toBeTruthy()
  })

  it('an existing conversation survives an unfollow', async () => {
    await mutualFollow(A, B)
    const thread = await startDirect(A, B)
    await db.query('DELETE FROM public.user_follows')
    // Re-opening returns the SAME thread rather than being refused: once two
    // people are talking, a later unfollow must not break the conversation.
    expect(await startDirect(A, B)).toBe(thread)
    // …and messages still flow.
    await asSession(A)
    expect(await errorAs('authenticated',
      `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1,$2,'still here')`,
      [thread, A])).toBeNull()
  })

  it('policy `anyone` opens messaging, and it is not the default', async () => {
    await setPolicy('anyone')
    expect(await startDirect(A, B)).toBeTruthy()
  })

  it('policy `recipient_follows_sender` means "people who follow you may write"', async () => {
    await setPolicy('recipient_follows_sender')
    expect(await startDirect(A, B)).toBeNull()
    await follow(B, A)              // B follows A …
    expect(await startDirect(A, B)).toBeTruthy()  // … so A may write to B
  })

  it('the policy is a database row, so a client cannot change it', async () => {
    await asSession(A)
    expect(await errorAs('authenticated',
      `UPDATE public.chat_settings SET reachability='anyone' WHERE id`)).toBe('42501')
    expect(await scalar('SELECT reachability FROM public.chat_settings'))
      .toEqual({ reachability: 'mutual_follow' })
  })

  it('the gate lives in the RPC, so calling the RPC directly cannot bypass it', async () => {
    // This is the whole reason the rule is SQL and not TypeScript: `authenticated`
    // holds EXECUTE on chat_start_direct and can call it without the route.
    expect(await scalar(
      `SELECT has_function_privilege('authenticated','public.chat_start_direct(uuid)','EXECUTE') AS ok`))
      .toEqual({ ok: true })
    expect(await startDirect(A, B)).toBeNull()
  })

  it('an anonymous session is refused by the database, not only by the route', async () => {
    await mutualFollow(A, B)
    await asSession(A, true)
    expect(await errorAs('authenticated', 'SELECT public.chat_start_direct($1)', [B])).toBe('42501')
  })

  it('nobody can open a thread with themselves', async () => {
    expect(await startDirect(A, A)).toBeNull()
  })
})

// ── 3. ENUMERATION ──────────────────────────────────────────────────────────

describe('3 · the RPC is not a user-existence oracle', () => {
  it('an unreachable REAL account and a NON-EXISTENT id fail identically', async () => {
    await asSession(A)
    const real = await failureAs('authenticated', 'SELECT public.chat_start_direct($1)', [B])
    const ghost = await failureAs('authenticated', 'SELECT public.chat_start_direct($1)', [GHOST])

    expect(real, 'an unreachable account must be refused').not.toBeNull()
    expect(ghost, 'a non-existent account must be refused').not.toBeNull()
    // Same code AND same message. Either one differing is the oracle.
    expect(real!.code).toBe(ghost!.code)
    expect(real!.message).toBe(ghost!.message)
  })

  it('a blocked account is also indistinguishable from a non-existent one', async () => {
    await mutualFollow(A, B)
    await asSession(B)
    await rowsAs('authenticated',
      `INSERT INTO public.chat_blocks (blocker_id, blocked_id) VALUES ($1,$2)`, [B, A])

    await asSession(A)
    const blocked = await failureAs('authenticated', 'SELECT public.chat_start_direct($1)', [B])
    const ghost = await failureAs('authenticated', 'SELECT public.chat_start_direct($1)', [GHOST])
    expect(blocked!.message).toBe(ghost!.message)
  })

  it('chat_can_reach answers about the caller only — there is no "as whom" argument', async () => {
    const { n } = await scalar(
      `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
        WHERE ns.nspname='public' AND p.proname='chat_can_reach' AND p.pronargs = 1`) as { n: number }
    expect(n, 'a second argument would let a caller probe other people').toBe(1)
  })
})

// ── 4. BLOCKS ───────────────────────────────────────────────────────────────

describe('4 · blocks stop contact without erasing history', () => {
  let thread: string

  beforeEach(async () => {
    await mutualFollow(A, B)
    thread = (await startDirect(A, B))!
    await asSession(A)
    await rowsAs('authenticated',
      `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1,$2,'before the block')`, [thread, A])
  })

  const blockAB = async () => {
    await asSession(B)
    await rowsAs('authenticated',
      `INSERT INTO public.chat_blocks (blocker_id, blocked_id) VALUES ($1,$2)`, [B, A])
  }

  it('the blocked user can no longer send into an EXISTING thread', async () => {
    // The thread already exists, so gating only thread creation would stop
    // nothing — every later message rides the existing membership.
    await blockAB()
    await asSession(A)
    expect(await errorAs('authenticated',
      `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1,$2,'after')`,
      [thread, A])).toBe('42501')
  })

  it('the blocker cannot send either — a block is not a one-way mute', async () => {
    await blockAB()
    await asSession(B)
    expect(await errorAs('authenticated',
      `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1,$2,'from B')`,
      [thread, B])).toBe('42501')
  })

  it('history stays readable to both — blocking is not deletion', async () => {
    await blockAB()
    for (const who of [A, B]) {
      await asSession(who)
      expect(await rowsAs('authenticated', 'SELECT body FROM public.chat_messages'), who).toHaveLength(1)
    }
  })

  it('unblocking restores sending', async () => {
    await blockAB()
    await asSession(B)
    await rowsAs('authenticated', `DELETE FROM public.chat_blocks WHERE blocked_id=$1`, [A])
    await asSession(A)
    expect(await errorAs('authenticated',
      `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1,$2,'again')`,
      [thread, A])).toBeNull()
  })

  it('you cannot learn who blocked YOU', async () => {
    // A safety feature that notifies the person being avoided is not a safety
    // feature. B's block is visible to B and to nobody else.
    await blockAB()
    await asSession(A)
    expect(await rowsAs('authenticated', 'SELECT blocker_id FROM public.chat_blocks')).toEqual([])
    await asSession(B)
    expect(await rowsAs('authenticated', 'SELECT blocker_id FROM public.chat_blocks')).toHaveLength(1)
  })

  it('you cannot block on someone else’s behalf', async () => {
    await asSession(C)
    expect(await errorAs('authenticated',
      `INSERT INTO public.chat_blocks (blocker_id, blocked_id) VALUES ($1,$2)`, [A, B])).toBe('42501')
  })
})

// ── 5. REALTIME ─────────────────────────────────────────────────────────────

describe('5 · realtime is the existing publication, authorised per subscriber', () => {
  it('chat_messages is published, and no second publication was created', async () => {
    expect(await scalar(
      `SELECT count(*)::int AS n FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_messages'`))
      .toEqual({ n: 1 })
    expect(await scalar(`SELECT count(*)::int AS n FROM pg_publication`)).toEqual({ n: 1 })
  })

  it('the stream carries the same SELECT policy the table does', async () => {
    // Realtime re-evaluates the SELECT policy per subscriber, so "subscribe with
    // no filter" is safe precisely because this policy exists.
    const { n } = await scalar(
      `SELECT count(*)::int AS n FROM pg_policies
        WHERE tablename='chat_messages' AND cmd='SELECT'`) as { n: number }
    expect(n).toBe(1)
  })
})
