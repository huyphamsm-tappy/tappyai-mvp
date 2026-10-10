import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// SPIKE — NOT A MIGRATION, NOTHING SHIPS FROM THIS FILE.
//
// docs/phase8/MESSENGER-NOTIFICATION-COLLAPSE-PROPOSAL.md (§7, §7d) keeps the collapse a PROPOSAL until its acceptance criteria are testable. This file makes the DATABASE half of
// them testable: it builds a minimal schema inline (the three tables the proposal touches), the two functions the proposal describes and the partial unique index, and runs them on
// a REAL PostgreSQL with REAL concurrent connections. It verifies: the unique-index behaviour, the per-(recipient, thread) advisory lock, the derived count, read/send races in both
// orders, retry idempotence, the push throttle (with an injected clock), lock_timeout bounding, the degraded path, and a randomised multi-connection property run.
// What it does NOT prove: anything about the production schema, RLS, grants, Android/iOS handling of the notification type, or the application layer (the route, the Web read ordering).
// If the proposal is approved, the SQL below becomes the starting point of a real migration with its own tests on the production schema snapshot.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const PORT = 54355
const DB = 'collapsespike'

const SPIKE_SQL = `
CREATE TABLE chat_messages  (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL, sender_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE chat_reads     (user_id uuid NOT NULL, thread_id uuid NOT NULL, last_read_at timestamptz NOT NULL, PRIMARY KEY (user_id, thread_id));
CREATE TABLE notifications  (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, type text NOT NULL, data jsonb NOT NULL DEFAULT '{}', read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());

-- at most ONE unread message notification per (recipient, thread): the backstop under the lock
CREATE UNIQUE INDEX notifications_unread_message_uidx ON notifications (user_id, (data->>'threadId')) WHERE type = 'message' AND read_at IS NULL;

-- p_message_at: created_at of the message that triggered the emit. p_now / p_push_window are parameters so the clock can be injected in tests.
CREATE FUNCTION emit_message_notification(p_user uuid, p_thread uuid, p_message_at timestamptz, p_now timestamptz DEFAULT now(), p_push_window interval DEFAULT interval '10 minutes')
RETURNS TABLE (notification_id uuid, unread_count int, should_push boolean) LANGUAGE plpgsql AS $$
DECLARE v_cursor timestamptz; v_count int; v_id uuid; v_last_push timestamptz; v_push boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_thread::text, 0));          -- D2: serialise per (recipient, thread)
  SELECT last_read_at INTO v_cursor FROM chat_reads WHERE user_id = p_user AND thread_id = p_thread; -- re-read the cursor UNDER the lock
  IF v_cursor IS NOT NULL AND p_message_at <= v_cursor THEN RETURN; END IF;                          -- the message is covered by the cursor: nothing to point at
  SELECT count(*) INTO v_count FROM chat_messages                                                    -- D5: DERIVED count, never incremented
   WHERE thread_id = p_thread AND sender_id <> p_user AND created_at > COALESCE(v_cursor, '-infinity');
  SELECT n.id, (n.data->>'lastPushAt')::timestamptz INTO v_id, v_last_push FROM notifications n
   WHERE n.user_id = p_user AND n.type = 'message' AND n.data->>'threadId' = p_thread::text AND n.read_at IS NULL;
  IF v_id IS NULL THEN
    v_push := true;
    INSERT INTO notifications (user_id, type, data, created_at)
    VALUES (p_user, 'message', jsonb_build_object('threadId', p_thread::text, 'count', v_count, 'lastMessageAt', p_message_at, 'lastPushAt', p_now), p_now) RETURNING id INTO v_id;
  ELSE
    v_push := v_last_push IS NULL OR p_now - v_last_push >= p_push_window;                            -- D3: 10-minute throttle, state in Postgres
    UPDATE notifications SET created_at = p_now,
           data = data || jsonb_build_object('count', v_count, 'lastMessageAt', p_message_at) || CASE WHEN v_push THEN jsonb_build_object('lastPushAt', p_now) ELSE '{}'::jsonb END
     WHERE id = v_id;
  END IF;
  RETURN QUERY SELECT v_id, v_count, v_push;
END $$;

CREATE FUNCTION mark_thread_notifications_read(p_user uuid, p_thread uuid, p_now timestamptz DEFAULT now()) RETURNS int LANGUAGE plpgsql AS $$
DECLARE v_n int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_thread::text, 0));          -- the SAME lock as the emit
  INSERT INTO chat_reads (user_id, thread_id, last_read_at) VALUES (p_user, p_thread, p_now)
    ON CONFLICT (user_id, thread_id) DO UPDATE SET last_read_at = GREATEST(chat_reads.last_read_at, EXCLUDED.last_read_at);
  UPDATE notifications SET read_at = p_now                                                           -- D1: read only if the cursor has passed the message it counts
   WHERE user_id = p_user AND type = 'message' AND read_at IS NULL AND data->>'threadId' = p_thread::text AND (data->>'lastMessageAt')::timestamptz <= p_now;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
`

const R = '11111111-1111-4111-8111-111111111111' // recipient
const S = '22222222-2222-4222-8222-222222222222' // sender
const S2 = '33333333-3333-4333-8333-333333333333'
const T1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const T2 = 'aaaaaaaa-0000-4000-8000-000000000002'

let pg: EmbeddedPostgres
let dataDir: string
const clients: Client[] = []
async function newClient(): Promise<Client> {
  const c = pg.getPgClient(DB) as unknown as Client
  await c.connect()
  clients.push(c)
  return c
}
let main: Client

const sendMessage = async (c: Client, thread: string, sender: string, at: string) =>
  (await c.query(`INSERT INTO chat_messages (thread_id, sender_id, created_at) VALUES ($1, $2, $3) RETURNING created_at::text AS at`, [thread, sender, at])).rows[0].at as string
const emit = async (c: Client, user: string, thread: string, at: string, now: string, window = '10 minutes') =>
  (await c.query(`SELECT * FROM emit_message_notification($1, $2, $3::timestamptz, $4::timestamptz, $5::interval)`, [user, thread, at, now, window])).rows as Array<{ notification_id: string; unread_count: number; should_push: boolean }>
const read = async (c: Client, user: string, thread: string, now: string) =>
  (await c.query(`SELECT mark_thread_notifications_read($1, $2, $3::timestamptz) AS n`, [user, thread, now])).rows[0].n as number
const rows = async (user = R, thread = T1) =>
  (await main.query(`SELECT id, read_at, (data->>'count')::int AS count, data->>'lastPushAt' AS last_push FROM notifications WHERE user_id = $1 AND data->>'threadId' = $2 ORDER BY created_at, id`, [user, thread])).rows as Array<{ id: string; read_at: string | null; count: number; last_push: string | null }>
const unread = async (user = R, thread = T1) => (await rows(user, thread)).filter((r) => r.read_at === null)
const reset = async () => { await main.query('TRUNCATE chat_messages, chat_reads, notifications') }
const iso = (s: number) => new Date(Date.UTC(2026, 9, 10, 3, 0, s)).toISOString()
const settles = <T,>(p: Promise<T>, ms: number) => Promise.race([p.then(() => 'settled' as const), new Promise<'pending'>((r) => setTimeout(() => r('pending'), ms))])

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'collapse-spike-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} })
  await pg.initialise(); await pg.start(); await pg.createDatabase(DB)
  main = await newClient()
  await main.query(SPIKE_SQL)
}, 240_000)
afterAll(async () => {
  for (const c of clients) { try { await c.end() } catch { /* closed */ } }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file locks */ }
}, 60_000)

describe('collapse spike · semantics (single connection)', () => {
  it('1 · five sequential messages → ONE unread row, count = 5 (derived), exactly one push', async () => {
    await reset()
    const pushes: boolean[] = []
    for (let i = 1; i <= 5; i++) { const at = await sendMessage(main, T1, S, iso(i)); const r = await emit(main, R, T1, at, iso(i)); pushes.push(r[0].should_push) }
    expect(await rows()).toHaveLength(1)
    expect((await unread())[0].count).toBe(5)
    expect(pushes).toEqual([true, false, false, false, false])
  })

  it('2 · opening the thread reads the row; the next message starts a NEW row with count 1; history is kept', async () => {
    await reset()
    for (let i = 1; i <= 3; i++) { const at = await sendMessage(main, T1, S, iso(i)); await emit(main, R, T1, at, iso(i)) }
    expect(await read(main, R, T1, iso(10))).toBe(1)
    expect(await unread()).toHaveLength(0)
    const at = await sendMessage(main, T1, S, iso(20)); const e = await emit(main, R, T1, at, iso(20))
    expect(e[0]).toMatchObject({ unread_count: 1, should_push: true })
    const all = await rows()
    expect(all).toHaveLength(2)
    expect(all.filter((r) => r.read_at === null)).toHaveLength(1)
  })

  it('4 · retry: emitting twice for the same message changes nothing (the count is derived, not incremented)', async () => {
    await reset()
    const at = await sendMessage(main, T1, S, iso(1))
    const a = await emit(main, R, T1, at, iso(1))
    const b = await emit(main, R, T1, at, iso(2))
    expect(a[0].unread_count).toBe(1); expect(b[0].unread_count).toBe(1)
    expect(await rows()).toHaveLength(1)
  })

  it('6 · a message older than the cursor creates nothing (it is covered, exactly as the Messenger\'s own unread derivation treats it)', async () => {
    await reset()
    await read(main, R, T1, iso(100))
    const at = await sendMessage(main, T1, S, iso(50))
    expect(await emit(main, R, T1, at, iso(101))).toHaveLength(0)
    expect(await rows()).toHaveLength(0)
  })

  it('7 · recipients and threads are independent; the sender\'s own messages are never counted for the sender', async () => {
    await reset()
    const a1 = await sendMessage(main, T1, S, iso(1)); await emit(main, R, T1, a1, iso(1)); await emit(main, S2, T1, a1, iso(1))
    const a2 = await sendMessage(main, T2, S, iso(2)); await emit(main, R, T2, a2, iso(2))
    expect(await unread(R, T1)).toHaveLength(1); expect(await unread(S2, T1)).toHaveLength(1); expect(await unread(R, T2)).toHaveLength(1)
    // a message written by the recipient themself does not count towards the recipient's own count
    await sendMessage(main, T1, R, iso(3))
    const a4 = await sendMessage(main, T1, S, iso(4)); await emit(main, R, T1, a4, iso(4))
    expect((await unread(R, T1))[0].count).toBe(2)
  })

  it('9 · push throttle with an injected clock: pushes at the first message, not inside 10 minutes, again after 10 minutes — state lives in Postgres only', async () => {
    await reset()
    const out: boolean[] = []
    for (const s of [0, 60, 599, 600, 601, 1500]) { const at = await sendMessage(main, T1, S, iso(s)); out.push((await emit(main, R, T1, at, iso(s)))[0].should_push) }
    expect(out).toEqual([true, false, false, true, false, true])
    expect(await rows()).toHaveLength(1)
  })

  it('the unique index is the backstop: a second unread row for the same (recipient, thread) is refused by the database, a read row does not block a new one', async () => {
    await reset()
    await main.query(`INSERT INTO notifications (user_id, type, data) VALUES ($1, 'message', jsonb_build_object('threadId', $2::text))`, [R, T1])
    await expect(main.query(`INSERT INTO notifications (user_id, type, data) VALUES ($1, 'message', jsonb_build_object('threadId', $2::text))`, [R, T1])).rejects.toMatchObject({ code: '23505' })
    await main.query(`UPDATE notifications SET read_at = now()`)
    await main.query(`INSERT INTO notifications (user_id, type, data) VALUES ($1, 'message', jsonb_build_object('threadId', $2::text))`, [R, T1])
    expect(await rows()).toHaveLength(2)
  })
})

describe('collapse spike · concurrency (several real connections)', () => {
  it('3 · 20 concurrent emits for one (recipient, thread) → exactly ONE unread row, count 20, exactly ONE push', async () => {
    await reset()
    let last = ''
    for (let i = 1; i <= 20; i++) last = await sendMessage(main, T1, S, iso(i))
    const conns = await Promise.all(Array.from({ length: 20 }, () => newClient()))
    const results = await Promise.all(conns.map((c) => emit(c, R, T1, last, iso(30))))
    expect((await rows())).toHaveLength(1)
    expect((await unread())[0].count).toBe(20)
    expect(results.filter((r) => r[0]?.should_push).length).toBe(1)
    for (const c of conns) { await c.end(); clients.splice(clients.indexOf(c), 1) }
  })

  it('5a · SEND then READ (read waits for the open send transaction; afterwards the row is read because the cursor passed the message)', async () => {
    await reset()
    const at = await sendMessage(main, T1, S, iso(1))
    const a = await newClient(); const b = await newClient()
    await a.query('BEGIN'); await emit(a, R, T1, at, iso(2))                       // A holds the lock
    const readP = read(b, R, T1, iso(5))                                             // B must wait for A
    expect(await settles(readP, 250)).toBe('pending')
    await a.query('COMMIT')
    expect(await readP).toBe(1)
    expect(await unread()).toHaveLength(0)
  })

  it('5b · READ then SEND (the send waits for the open read; the later message opens a NEW unread row)', async () => {
    await reset()
    const old = await sendMessage(main, T1, S, iso(1)); await emit(main, R, T1, old, iso(1))
    const a = await newClient(); const b = await newClient()
    await a.query('BEGIN'); await read(a, R, T1, iso(5))                              // A (the reader) holds the lock
    const fresh = await sendMessage(main, T1, S, iso(10))
    const emitP = emit(b, R, T1, fresh, iso(11))                                       // B must wait for the reader
    expect(await settles(emitP, 250)).toBe('pending')
    await a.query('COMMIT')
    expect((await emitP)[0]).toMatchObject({ unread_count: 1, should_push: true })
    const all = await rows()
    expect(all).toHaveLength(2)
    expect(all.filter((r) => r.read_at === null)).toHaveLength(1)
  })

  it('6b · a message that started BEFORE the read but is emitted AFTER it (older than the cursor) creates no stale unread row', async () => {
    await reset()
    const early = await sendMessage(main, T1, S, iso(1))
    await read(main, R, T1, iso(5))
    expect(await emit(main, R, T1, early, iso(6))).toHaveLength(0)
    expect(await unread()).toHaveLength(0)
  })

  it('16 · lock_timeout bounds the wait: a held lock makes the emit fail fast with 55P03 instead of hanging the request', async () => {
    await reset()
    const at = await sendMessage(main, T1, S, iso(1))
    const holder = await newClient(); const waiter = await newClient()
    await holder.query('BEGIN'); await emit(holder, R, T1, at, iso(2))
    await waiter.query('BEGIN'); await waiter.query(`SET LOCAL lock_timeout = '200ms'`)
    const t0 = Date.now()
    await expect(emit(waiter, R, T1, at, iso(3))).rejects.toMatchObject({ code: '55P03' })
    expect(Date.now() - t0).toBeLessThan(2_000)
    await waiter.query('ROLLBACK')
    await holder.query('COMMIT')
  })

  it('13 + 14 · degraded path: when the locked emit times out, ONE plain INSERT … ON CONFLICT DO NOTHING keeps exactly one unread row and never pushes; the next successful emit repairs the count', async () => {
    await reset()
    const m1 = await sendMessage(main, T1, S, iso(1))
    const holder = await newClient(); const waiter = await newClient()
    await holder.query('BEGIN'); await emit(holder, R, T1, m1, iso(2))                 // the first message's row exists only inside the holder's open transaction
    const m2 = await sendMessage(main, T1, S, iso(3))
    await waiter.query('BEGIN'); await waiter.query(`SET LOCAL lock_timeout = '150ms'`)
    await expect(emit(waiter, R, T1, m2, iso(4))).rejects.toMatchObject({ code: '55P03' })
    await waiter.query('ROLLBACK')
    await holder.query('COMMIT')                                                        // now the first row is visible
    // the degraded insert (no lock, no count change, never pushes) must not create a second unread row
    const degraded = await main.query(
      `INSERT INTO notifications (user_id, type, data) VALUES ($1, 'message', jsonb_build_object('threadId', $2::text, 'count', 1, 'lastMessageAt', $3::text))
       ON CONFLICT (user_id, (data->>'threadId')) WHERE type = 'message' AND read_at IS NULL DO NOTHING RETURNING id`, [R, T1, m2])
    expect(degraded.rowCount).toBe(0)
    expect(await unread()).toHaveLength(1)
    // the count is stale (1) until the next successful emit, which derives it from the source of truth (2 messages)
    expect((await unread())[0].count).toBe(1)
    const m3 = await sendMessage(main, T1, S, iso(5))
    expect((await emit(main, R, T1, m3, iso(6)))[0].unread_count).toBe(3)
    expect((await unread())[0].count).toBe(3)
  })

  it('15 · nothing in this path touches a key-value store: the collapse, the lock and the throttle are Postgres-only (a KV outage cannot change them)', async () => {
    expect(SPIKE_SQL).not.toMatch(/kv|redis|upstash/i)
  })

  it('17 · property run: 6 connections, 240 random operations (send, emit, read, emit-with-short-lock-timeout) → never two unread rows; unique violations never leak; counts converge', async () => {
    await reset()
    let seed = 20261010
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
    const conns = await Promise.all(Array.from({ length: 6 }, () => newClient()))
    const threads = [T1, T2]
    let clock = 1000
    const errors: string[] = []
    await Promise.all(conns.map(async (c, ci) => {
      for (let k = 0; k < 40; k++) {
        const thread = threads[Math.floor(rnd() * threads.length)]
        const op = rnd(); const now = iso(clock++)
        try {
          if (op < 0.4) { const at = await sendMessage(c, thread, S, now); await emit(c, R, thread, at, now) }
          else if (op < 0.6) { await read(c, R, thread, now) }
          else if (op < 0.8) { const at = await sendMessage(c, thread, S, now); await c.query('BEGIN'); await c.query(`SET LOCAL lock_timeout = '30ms'`); try { await emit(c, R, thread, at, now); await c.query('COMMIT') } catch (e) { await c.query('ROLLBACK'); if ((e as { code?: string }).code !== '55P03') throw e } }
          else { const at = await sendMessage(c, thread, S, now); await emit(c, R, thread, at, now) }
        } catch (e) { errors.push(`conn ${ci}: ${(e as { code?: string; message?: string }).code ?? (e as Error).message}`) }
      }
    }))
    expect(errors).toEqual([])
    for (const thread of threads) expect((await unread(R, thread)).length, `thread ${thread}`).toBeLessThanOrEqual(1)
    // convergence: one more emit per thread derives the exact count from the messages after the cursor
    for (const thread of threads) {
      const at = await sendMessage(main, thread, S, iso(clock++))
      const e = await emit(main, R, thread, at, iso(clock++))
      const expected = (await main.query(`SELECT count(*)::int AS n FROM chat_messages m WHERE m.thread_id = $1 AND m.sender_id <> $2 AND m.created_at > COALESCE((SELECT last_read_at FROM chat_reads WHERE user_id = $2 AND thread_id = $1), '-infinity')`, [thread, R])).rows[0].n
      expect(e[0].unread_count).toBe(expected)
      expect((await unread(R, thread))).toHaveLength(1)
    }
    for (const c of conns) { await c.end(); clients.splice(clients.indexOf(c), 1) }
  })
})
