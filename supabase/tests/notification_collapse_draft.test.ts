import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// DRAFT-SQL TEST — NOT A MIGRATION TEST. Nothing here is applied anywhere.
//
// Loads supabase/migrations/20261106_messenger_notification_collapse.sql (was docs/phase8/drafts/messenger-collapse/…DRAFT.sql) VERBATIM into a real embedded PostgreSQL that has a production-SHAPED fixture:
// roles anon / authenticated / service_role, auth.users + auth.uid() (read from request.jwt.claim.sub, as PostgREST sets it), the exact columns of public.notifications
// (20260725) with RLS (select_own / update_own + a SIMPLIFIED stand-in for the RESTRICTIVE user_blocks policy of 20261001), chat_* tables with a NULLABLE sender_id and the real
// default cursor '-infinity', and chat_is_participant(). It checks design decisions D7–D10 of docs/phase8/MESSENGER-NOTIFICATION-COLLAPSE-PROPOSAL.md §7g.
// NOT proven here: PostgREST itself, the real chat_* RLS, the real safety_private.blocked_ids(), Supabase's default role privileges, production data, the Web route (see the
// route tests), Android/iOS. The older inline spike (notification_collapse_spike.test.ts) is kept as history; this file supersedes it for the draft.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const PORT = 54353
const DB = 'collapsedraft'
// 05/11: the draft became the real migration (owner approved D1–D10 on 04/11); this suite now loads that file verbatim.
const DRAFT = process.env.COLLAPSE_DRAFT_SQL ?? 'supabase/migrations/20261106_messenger_notification_collapse.sql'
const ROLLBACK = 'supabase/migrations/rollback/20261106_messenger_notification_collapse_rollback.sql'

const FIXTURE_SQL = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL, category text NOT NULL, title text NOT NULL, body text NOT NULL,
  actor_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_url text NULL, image_url text NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz NULL,
  push_status text NOT NULL DEFAULT 'pending' CHECK (push_status IN ('pending','sent','failed','skipped')),
  push_sent_at timestamptz NULL, push_attempts int NOT NULL DEFAULT 0, push_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE TABLE public.user_blocks (blocker_id uuid NOT NULL, blocked_id uuid NOT NULL);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- SIMPLIFIED stand-in for 20261001's RESTRICTIVE policy (the real one uses safety_private.blocked_ids()).
CREATE POLICY user_blocks_notifications_select ON public.notifications AS RESTRICTIVE FOR SELECT
  USING (actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE (b.blocker_id = auth.uid() AND b.blocked_id = actor_id) OR (b.blocker_id = actor_id AND b.blocked_id = auth.uid())));
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT ON public.user_blocks TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

CREATE TABLE public.chat_threads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL DEFAULT 'direct', last_message_at timestamptz);
CREATE TABLE public.chat_participants (thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, PRIMARY KEY (thread_id, user_id));
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.chat_reads (
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT '-infinity', PRIMARY KEY (thread_id, user_id));
CREATE FUNCTION public.chat_is_participant(p_thread uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT EXISTS (SELECT 1 FROM public.chat_participants WHERE thread_id = p_thread AND user_id = auth.uid()) $$;
REVOKE EXECUTE ON FUNCTION public.chat_is_participant(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.chat_is_participant(uuid) TO authenticated, service_role;
`

const R = '11111111-1111-4111-8111-111111111111' // recipient
const S = '22222222-2222-4222-8222-222222222222' // sender
const S2 = '33333333-3333-4333-8333-333333333333'
const S3 = '44444444-4444-4444-8444-444444444444'
const X = '55555555-5555-4555-8555-555555555555' // not in any thread
const T1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const T2 = 'aaaaaaaa-0000-4000-8000-000000000002'
const BODY = 'Đã gửi cho bạn một tin nhắn'
const BASE = Date.now() - 3_600_000
const iso = (s: number) => new Date(BASE + s * 1000).toISOString()

let pg: EmbeddedPostgres
let dataDir: string
const clients: Client[] = []
let main: Client
async function newClient(): Promise<Client> { const c = pg.getPgClient(DB) as unknown as Client; await c.connect(); clients.push(c); return c }
const q = (c: Client, sql: string, p: unknown[] = []) => c.query(sql, p)
const settles = <T,>(p: Promise<T>, ms: number) => Promise.race([p.then(() => 'settled' as const, () => 'settled' as const), new Promise<'pending'>((r) => setTimeout(() => r('pending'), ms))])

async function msg(c: Client, thread: string, sender: string | null, at?: string, body = 'SECRET-BODY-should-never-leak'): Promise<string> {
  const r = at
    ? await q(c, `INSERT INTO chat_messages (thread_id, sender_id, body, created_at) VALUES ($1,$2,$3,$4) RETURNING created_at::text AS at`, [thread, sender, body, at])
    : await q(c, `INSERT INTO chat_messages (thread_id, sender_id, body) VALUES ($1,$2,$3) RETURNING created_at::text AS at`, [thread, sender, body])
  return r.rows[0].at as string
}
interface EmitOpts { user?: string; thread?: string; actor?: string | null; title?: string; window?: string; now?: string | null }
const EMIT_SQL = `SELECT * FROM emit_message_notification($1::uuid,$2::uuid,$3::timestamptz,$4::uuid,$5,$6,$7,$8,$9::interval,$10::timestamptz)`
const emit = async (c: Client, at: string, o: EmitOpts = {}) => {
  const thread = o.thread ?? T1
  const r = await q(c, EMIT_SQL, [o.user ?? R, thread, at, o.actor === undefined ? S : o.actor, o.title ?? 'Sender', BODY, `/profile/notifications?tab=messages&thread=${thread}`, null, o.window ?? '10 minutes', o.now ?? null])
  return r.rows as Array<{ notification_id: string; unread_count: number; should_push: boolean }>
}
/** Runs fn as the `authenticated` role with auth.uid() = uid, in ONE transaction (what a PostgREST RPC call is). */
async function asUser<T>(c: Client, uid: string | null, fn: (c: Client) => Promise<T>, role = 'authenticated'): Promise<T> {
  await q(c, 'BEGIN')
  try {
    await q(c, `SET LOCAL ROLE ${role}`)
    if (uid) await q(c, `SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid])
    const out = await fn(c)
    await q(c, 'COMMIT')
    return out
  } catch (e) { try { await q(c, 'ROLLBACK') } catch { /* closed */ } throw e }
}
const markThread = (c: Client, uid: string, thread: string) => asUser(c, uid, async (x) => (await q(x, `SELECT mark_thread_read($1::uuid) AS n`, [thread])).rows[0].n as number)
const markAll = (c: Client, uid: string, ids: string[] | null = null) => asUser(c, uid, async (x) => (await q(x, `SELECT mark_notifications_read($1::uuid[]) AS n`, [ids])).rows[0].n as number)
const rows = async (user = R, thread = T1) => (await q(main, `SELECT id, actor_id, title, read_at, created_at::text AS created_at, (data->>'count')::int AS count, data->>'lastPushAt' AS last_push, data->>'lastMessageAt' AS last_msg, data->>'firstMessageAt' AS first_msg, category, push_status, body FROM notifications WHERE user_id=$1 AND type='message' AND data->>'threadId'=$2 ORDER BY created_at, id`, [user, thread])).rows as Array<Record<string, any>>
const unread = async (user = R, thread = T1) => (await rows(user, thread)).filter((r) => r.read_at === null)
const cursor = async (user = R, thread = T1) => (await q(main, `SELECT last_read_at::text AS t FROM chat_reads WHERE user_id=$1 AND thread_id=$2`, [user, thread])).rows[0]?.t as string | undefined
const reset = async () => { await q(main, 'TRUNCATE notifications, chat_messages, chat_reads, user_blocks'); for (const u of [R, S, S2, S3]) await q(main, 'INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [u]) }

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'collapse-draft-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} })
  await pg.initialise(); await pg.start(); await pg.createDatabase(DB)
  main = await newClient()
  await q(main, FIXTURE_SQL)
  await q(main, readFileSync(DRAFT, 'utf8'))
  await q(main, `GRANT SELECT, INSERT, UPDATE ON public.chat_reads TO authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role`)
  for (const u of [R, S, S2, S3]) await q(main, 'INSERT INTO auth.users (id) VALUES ($1)', [u])
  for (const t of [T1, T2]) { await q(main, 'INSERT INTO chat_threads (id) VALUES ($1)', [t]); for (const u of [R, S, S2, S3]) await q(main, 'INSERT INTO chat_participants VALUES ($1,$2)', [t, u]) }
}, 240_000)
afterAll(async () => {
  for (const c of clients) { try { await c.end() } catch { /* closed */ } }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file locks */ }
}, 60_000)

describe('draft · privileges, shape and privacy', () => {
  it('authenticated and anon can NOT call emit (a client must never mint a notification for an arbitrary user); service_role can', async () => {
    await reset()
    const at = await msg(main, T1, S)
    for (const role of ['authenticated', 'anon']) {
      await expect(asUser(main, R, (x) => q(x, EMIT_SQL, [R, T1, at, S, 't', BODY, '/x', null, '10 minutes', null]), role)).rejects.toMatchObject({ code: '42501' })
    }
    expect((await asUser(main, null, (x) => q(x, EMIT_SQL, [R, T1, at, S, 't', BODY, '/x', null, '10 minutes', null]), 'service_role')).rows).toHaveLength(1)
  })

  it('anon can not call the mark functions; a caller without auth.uid() is refused (42501); a non-participant is refused (42501, the route maps it to 404)', async () => {
    await reset()
    await expect(asUser(main, R, (x) => q(x, `SELECT mark_thread_read($1)`, [T1]), 'anon')).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(main, R, (x) => q(x, `SELECT mark_notifications_read(NULL)`), 'anon')).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(main, null, (x) => q(x, `SELECT mark_thread_read($1)`, [T1]))).rejects.toMatchObject({ code: '42501' })
    await expect(markThread(main, X, T1)).rejects.toMatchObject({ code: '42501' })
  })

  it('the row fills every NOT NULL production column, uses the fixed sentence, and NO text of the message appears in any column', async () => {
    await reset()
    const at = await msg(main, T1, S, iso(1), 'SECRET-BODY-should-never-leak'); await emit(main, at)
    const [row] = await rows()
    expect(row).toMatchObject({ category: 'social', push_status: 'pending', body: BODY, title: 'Sender', actor_id: S, count: 1 })
    const all = (await q(main, `SELECT row_to_json(n)::text AS j FROM notifications n`)).rows.map((r) => r.j).join('\n')
    expect(all).not.toContain('SECRET-BODY')
  })
})

describe('draft · collapse, attribution (D8), created_at (D9), nullable sender', () => {
  it('five messages → one unread row, count 5, one push; created_at follows the NEWEST message (D9) and firstMessageAt keeps the first', async () => {
    await reset()
    const pushes: boolean[] = []
    for (let i = 1; i <= 5; i++) { const at = await msg(main, T1, S, iso(i)); pushes.push((await emit(main, at, { now: iso(i) }))[0].should_push) }
    expect(pushes).toEqual([true, false, false, false, false])
    const [row] = await unread()
    expect(row.count).toBe(5)
    expect(new Date(row.created_at).toISOString()).toBe(iso(5))
    expect(new Date(row.first_msg!).toISOString()).toBe(iso(1))
  })

  it('D8 · attribution (actor, title) follows the LATEST message; an out-of-order or retried OLDER emit never regresses it and never pushes', async () => {
    await reset()
    const a1 = await msg(main, T1, S, iso(1)); await emit(main, a1, { actor: S, title: 'Sender One', now: iso(1) })
    const a2 = await msg(main, T1, S2, iso(2)); await emit(main, a2, { actor: S2, title: 'Sender Two', now: iso(2) })
    expect((await unread())[0]).toMatchObject({ actor_id: S2, title: 'Sender Two', count: 2 })
    const late = await emit(main, a1, { actor: S, title: 'Sender One', now: iso(3) })        // the OLD message's emit arrives last
    expect(late[0]).toMatchObject({ unread_count: 2, should_push: false })
    const [row] = await unread()
    expect(row).toMatchObject({ actor_id: S2, title: 'Sender Two', count: 2 })
    expect(new Date(row.last_msg!).toISOString()).toBe(iso(2))
    expect(new Date(row.created_at).toISOString()).toBe(iso(2))
  })

  it('nullable sender · a message whose sender account was deleted (sender_id NULL) is counted; its attribution is NULL actor + the fallback title', async () => {
    await reset()
    const a1 = await msg(main, T1, S, iso(1)); await emit(main, a1, { now: iso(1) })
    await q(main, `INSERT INTO auth.users (id) VALUES ('66666666-6666-4666-8666-666666666666')`)
    const gone = await msg(main, T1, '66666666-6666-4666-8666-666666666666', iso(2))
    await q(main, `DELETE FROM auth.users WHERE id = '66666666-6666-4666-8666-666666666666'`)     // ON DELETE SET NULL, as in the real table
    expect((await q(main, `SELECT sender_id FROM chat_messages WHERE created_at = $1`, [gone])).rows[0].sender_id).toBeNull()
    const e = await emit(main, gone, { actor: null, title: 'TappyAI', now: iso(3) })
    expect(e[0].unread_count).toBe(2)
    expect((await unread())[0]).toMatchObject({ actor_id: null, title: 'TappyAI', count: 2 })
  })

  it('D8 · block interaction: a row whose latest actor the recipient blocked is hidden by the RESTRICTIVE policy; a newer message from another sender attributes the row to them and it is visible again', async () => {
    await reset()
    await q(main, 'INSERT INTO user_blocks VALUES ($1,$2)', [R, S])
    const a1 = await msg(main, T1, S, iso(1)); await emit(main, a1, { actor: S, now: iso(1) })
    const visible = () => asUser(main, R, async (x) => Number((await q(x, `SELECT count(*) AS n FROM notifications WHERE type='message'`)).rows[0].n))
    expect(await visible()).toBe(0)
    const a2 = await msg(main, T1, S2, iso(2)); await emit(main, a2, { actor: S2, title: 'Sender Two', now: iso(2) })
    expect(await visible()).toBe(1)
  })

  it('D8 · account-deletion cleanup (rows whose actor was deleted are removed, 20261005): the next emit reopens ONE row with the full derived count and may push', async () => {
    await reset()
    for (let i = 1; i <= 3; i++) { const at = await msg(main, T1, S2, iso(i)); await emit(main, at, { actor: S2, now: iso(i) }) }
    await q(main, `DELETE FROM notifications WHERE actor_id = $1`, [S2])            // what the cleanup does to rows the deleted user caused
    const at = await msg(main, T1, S, iso(10)); const e = await emit(main, at, { actor: S, now: iso(10) })
    expect(e[0]).toMatchObject({ unread_count: 4, should_push: true })
    expect(await unread()).toHaveLength(1)
  })

  it('retry · emitting the same message twice changes nothing (count is derived); the throttle holds 10 minutes and then releases (injected clock)', async () => {
    await reset()
    const at = await msg(main, T1, S, iso(1))
    const a = await emit(main, at, { now: iso(1) }); const b = await emit(main, at, { now: iso(2) })
    expect([a[0].unread_count, b[0].unread_count, a[0].should_push, b[0].should_push]).toEqual([1, 1, true, false])
    const out: boolean[] = []
    for (const s of [60, 599, 600, 601, 1500]) { const m = await msg(main, T1, S, iso(s)); out.push((await emit(main, m, { now: iso(s) }))[0].should_push) }
    expect(out).toEqual([false, false, false, true, true]) // the window is measured from the LAST PUSH (t=1 s): 599 s after it is still inside, 600 s releases it, then 1500 s is 899 s after the push at 601 s
    expect(await unread()).toHaveLength(1)
  })
})

describe('draft · reading: D1 cursor, D7 mark-all-read, D10 database clock, self-heal', () => {
  it('D10 · mark_thread_read uses the DATABASE clock, reads the row, and the cursor never regresses (a cursor written ahead by a client stays)', async () => {
    await reset()
    const at = await msg(main, T1, S, iso(1)); await emit(main, at, { now: iso(1) })
    expect(await markThread(main, R, T1)).toBe(1)
    expect(await unread()).toHaveLength(0)
    const c1 = await cursor()
    expect(Math.abs(new Date(c1!).getTime() - Date.now())).toBeLessThan(120_000)     // the DB's now(), not a caller-supplied time
    await q(main, `UPDATE chat_reads SET last_read_at = now() + interval '1 day' WHERE user_id=$1 AND thread_id=$2`, [R, T1])
    const ahead = await cursor()
    await markThread(main, R, T1)
    expect(await cursor()).toBe(ahead)                                                // GREATEST: never moves backwards
  })

  it('D7 · "mark all read" ALSO moves the chat cursors in the same transaction → the next message opens a row with count 1 (nothing resurrects); other notification types and a tampered row are read too', async () => {
    await reset()
    for (let i = 1; i <= 3; i++) { const at = await msg(main, T1, S, iso(i)); await emit(main, at, { now: iso(i) }) }
    const t2 = await msg(main, T2, S2, iso(4)); await emit(main, t2, { thread: T2, actor: S2, now: iso(4) })
    await q(main, `INSERT INTO notifications (user_id, type, category, title, body) VALUES ($1,'like','social','x','y')`, [R])
    await q(main, `INSERT INTO notifications (user_id, type, category, title, body, data) VALUES ($1,'message','social','x','y','{"threadId":"not-a-uuid"}')`, [R])
    expect(await markAll(main, R)).toBe(4)                                              // T1 row + T2 row + like + tampered
    expect((await q(main, `SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL`, [R])).rows[0].n).toBe(0)
    expect(await cursor(R, T1)).toBeTruthy(); expect(await cursor(R, T2)).toBeTruthy()
    const later = new Date(Date.now() + 5_000).toISOString()
    const m = await msg(main, T1, S, later)
    const e = await emit(main, m, { now: later })
    expect(e[0]).toMatchObject({ unread_count: 1, should_push: true })
  })

  it('D7 · marking ONE collapsed row by id reads that thread only: its cursor moves, the other thread stays unread with no cursor; another user\'s ids change nothing', async () => {
    await reset()
    const a = await msg(main, T1, S, iso(1)); const [e1] = await emit(main, a, { now: iso(1) })
    const b = await msg(main, T2, S, iso(2)); await emit(main, b, { thread: T2, now: iso(2) })
    expect(await markAll(main, S2, [e1.notification_id])).toBe(0)                       // S2 does not own it
    expect(await unread(R, T1)).toHaveLength(1)
    expect(await markAll(main, R, [e1.notification_id])).toBe(1)
    expect(await unread(R, T1)).toHaveLength(0); expect(await cursor(R, T1)).toBeTruthy()
    expect(await unread(R, T2)).toHaveLength(1); expect(await cursor(R, T2)).toBeUndefined()
  })

  it('SELF-HEAL · a cursor written directly (bypassing the functions) leaves the stale row until the next emit, which reads it and opens a new one; a direct client read_at UPDATE also leaves the unique index satisfied', async () => {
    await reset()
    const a = await msg(main, T1, S, iso(1)); await emit(main, a, { now: iso(1) })
    await q(main, `INSERT INTO chat_reads (user_id, thread_id, last_read_at) VALUES ($1,$2,$3)`, [R, T1, iso(5)])
    expect(await unread()).toHaveLength(1)
    const b = await msg(main, T1, S, iso(9)); const e = await emit(main, b, { now: iso(9) })
    expect(e[0]).toMatchObject({ unread_count: 1, should_push: true })
    expect((await rows())).toHaveLength(2)
    expect((await unread())[0].count).toBe(1)
    // client marks the current row read directly (RLS allows), then a message arrives: a NEW row, no unique violation
    await asUser(main, R, (x) => q(x, `UPDATE notifications SET read_at = now() WHERE type='message'`))
    const c = await msg(main, T1, S, iso(20)); const e2 = await emit(main, c, { now: iso(20) })
    expect(e2[0].should_push).toBe(true)
    expect(await unread()).toHaveLength(1)
  })
})

describe('draft · locking, races, bounded failure (real concurrent connections)', () => {
  it('20 concurrent emits for one (recipient, thread) → exactly ONE unread row, count 20, exactly ONE push', async () => {
    await reset()
    let last = ''
    for (let i = 1; i <= 20; i++) last = await msg(main, T1, S, iso(i))
    const conns = await Promise.all(Array.from({ length: 20 }, () => newClient()))
    const results = await Promise.all(conns.map((c) => emit(c, last, { now: iso(30) })))
    expect(await rows()).toHaveLength(1)
    expect((await unread())[0].count).toBe(20)
    expect(results.filter((r) => r[0]?.should_push).length).toBe(1)
    for (const c of conns) { await c.end(); clients.splice(clients.indexOf(c), 1) }
  })

  it('SEND then READ: mark_thread_read waits for the open emit transaction (pending), then reads the row; READ then SEND: the next emit opens a new row', async () => {
    await reset()
    const at = await msg(main, T1, S, iso(1))
    const a = await newClient(); const b = await newClient()
    await q(a, 'BEGIN'); await emit(a, at, { now: iso(2) })                                // A holds the (recipient, thread) lock
    const readP = markThread(b, R, T1)
    expect(await settles(readP, 300)).toBe('pending')
    await q(a, 'COMMIT')
    expect(await readP).toBe(1)
    expect(await unread()).toHaveLength(0)
    const later = new Date(Date.now() + 5_000).toISOString()
    const m = await msg(main, T1, S, later); expect((await emit(main, m, { now: later }))[0].unread_count).toBe(1)
    expect(await unread()).toHaveLength(1)
  })

  it('mark-all-read vs emit on the same thread: the read waits for the emit and vice versa; no deadlock when mark-all holds several thread locks in sorted order', async () => {
    await reset()
    const a1 = await msg(main, T1, S, iso(1)); await emit(main, a1, { now: iso(1) })
    const a2 = await msg(main, T2, S, iso(2)); await emit(main, a2, { thread: T2, now: iso(2) })
    const holder = await newClient(); const reader = await newClient()
    await q(holder, 'BEGIN'); const nm = await msg(holder, T2, S2, iso(3)); await emit(holder, nm, { thread: T2, actor: S2, now: iso(3) })   // holds T2's lock
    const allP = markAll(reader, R)
    expect(await settles(allP, 300)).toBe('pending')
    await q(holder, 'COMMIT')
    expect(await allP).toBe(2)                                                           // both rows read (T2's newest message predates now())
    expect((await q(main, `SELECT count(*)::int AS n FROM notifications WHERE read_at IS NULL`)).rows[0].n).toBe(0)
  })

  it('lock_timeout is a FUNCTION attribute: a held lock makes emit fail with 55P03 within ~2 s instead of hanging; the session setting does not leak; the degraded plain INSERT keeps ONE unread row and never pushes', async () => {
    await reset()
    const at = await msg(main, T1, S, iso(1))
    const holder = await newClient(); const caller = await newClient()
    await q(holder, 'BEGIN'); await emit(holder, at, { now: iso(2) })
    const t0 = Date.now()
    await expect(emit(caller, at, { now: iso(3) })).rejects.toMatchObject({ code: '55P03' })
    const waited = Date.now() - t0
    expect(waited).toBeGreaterThanOrEqual(1_500); expect(waited).toBeLessThan(4_000)
    expect((await q(caller, 'SHOW lock_timeout')).rows[0].lock_timeout).toBe('0')
    await q(holder, 'ROLLBACK')                                                           // the holder's row never committed
    // degraded path (F3): ONE plain INSERT … ON CONFLICT DO NOTHING on the unique index, executed by the app when the function fails
    const degraded = () => q(caller, `INSERT INTO notifications (user_id, type, category, title, body, data) VALUES ($1,'message','social','t',$3,jsonb_build_object('threadId',$2::text)) ON CONFLICT DO NOTHING`, [R, T1, BODY])
    await degraded(); await degraded()
    expect(await unread()).toHaveLength(1)
    const next = await msg(main, T1, S, iso(5)); const e = await emit(main, next, { now: iso(6) })       // the next successful emit repairs the count
    expect(e[0].unread_count).toBe(2); expect(await unread()).toHaveLength(1)
  })

  it('property run · 5 connections × 40 random operations (send+emit, older-message emit, mark thread, mark all): no deadlock (40P01), never two unread rows, counts converge to the derived value', async () => {
    await reset()
    const conns = await Promise.all(Array.from({ length: 5 }, () => newClient()))
    const unexpected: string[] = []
    let seed = 7
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
    const sent: Array<{ at: string; sender: string; thread: string }> = []
    await Promise.all(conns.map(async (c) => {
      for (let i = 0; i < 40; i++) {
        const thread = rnd(2) ? T1 : T2; const op = rnd(10)
        try {
          if (op < 5) { const sender = [S, S2, S3][rnd(3)]; const at = await msg(c, thread, sender); sent.push({ at, sender, thread }); await emit(c, at, { thread, actor: sender, title: 'P' }) }
          else if (op < 6 && sent.length) { const o = sent[rnd(sent.length)]; await emit(c, o.at, { thread: o.thread, actor: o.sender, title: 'P' }) }
          else if (op < 8) { await markThread(c, R, thread) }
          else { await markAll(c, R) }
        } catch (e) { const code = (e as { code?: string }).code; if (code !== '55P03') unexpected.push(`${code}:${(e as Error).message}`) }   // a bounded lock timeout is allowed; a deadlock is not
      }
    }))
    expect(unexpected).toEqual([])
    for (const t of [T1, T2]) expect((await unread(R, t)).length).toBeLessThanOrEqual(1)
    const dup = await q(main, `SELECT count(*)::int AS n FROM (SELECT user_id, data->>'threadId' FROM notifications WHERE type='message' AND read_at IS NULL GROUP BY 1,2 HAVING count(*) > 1) d`)
    expect(dup.rows[0].n).toBe(0)
    for (const c of conns) { await c.end(); clients.splice(clients.indexOf(c), 1) }
    // convergence: a final quiesced emit for the newest message of each thread leaves count == derived count
    for (const t of [T1, T2]) {
      const newest = (await q(main, `SELECT created_at::text AS at, sender_id FROM chat_messages WHERE thread_id=$1 ORDER BY created_at DESC LIMIT 1`, [t])).rows[0]
      if (!newest) continue
      await emit(main, newest.at, { thread: t, actor: newest.sender_id })
      const derived = Number((await q(main, `SELECT count(*) AS n FROM chat_messages WHERE thread_id=$1 AND sender_id IS DISTINCT FROM $2 AND created_at > COALESCE((SELECT last_read_at FROM chat_reads WHERE user_id=$2 AND thread_id=$1), '-infinity')`, [t, R])).rows[0].n)
      const u = await unread(R, t)
      if (derived === 0) expect(u).toHaveLength(0); else expect(u[0].count).toBe(derived)
    }
  }, 120_000)
})

describe('draft · rollback', () => {
  it('the rollback script drops exactly the functions and the index, leaves the rows, and the draft re-applies cleanly (idempotent)', async () => {
    await reset()
    const at = await msg(main, T1, S, iso(1)); await emit(main, at, { now: iso(1) })
    await q(main, readFileSync(ROLLBACK, 'utf8'))
    const gone = await q(main, `SELECT to_regprocedure('emit_message_notification(uuid,uuid,timestamptz,uuid,text,text,text,text,interval,timestamptz)') AS e, to_regprocedure('mark_thread_read(uuid)') AS t, to_regprocedure('mark_notifications_read(uuid[])') AS a, to_regclass('notifications_unread_message_uidx') AS i`)
    expect(gone.rows[0]).toEqual({ e: null, t: null, a: null, i: null })
    expect(await rows()).toHaveLength(1)                                                  // data untouched; no data migration either way
    await q(main, readFileSync(DRAFT, 'utf8'))
    await q(main, readFileSync(DRAFT, 'utf8'))                                            // twice: CREATE OR REPLACE / IF NOT EXISTS
    const b = await msg(main, T1, S, iso(2)); expect((await emit(main, b, { now: iso(2) }))[0].unread_count).toBe(2)
  })
})
