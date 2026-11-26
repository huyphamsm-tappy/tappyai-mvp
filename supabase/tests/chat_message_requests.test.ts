import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, BOB, CAROL, loadProdSchema, readRepo, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// Message requests (owner 26/11/2026): people who are NOT mutually reachable can still write; the thread is a PENDING request in the recipient's
// waiting list; the sender may send 3 text messages until the recipient replies; at most 10 new requests per sender per 24 h; blocks still stop all.
// Real PostgreSQL, the full production schema snapshot, the real migrations from disk.

const USER_BLOCKS = readRepo('supabase/migrations/20261001_user_blocks.sql')
const HONOURS = readRepo('supabase/migrations/20261018_chat_honours_user_blocks.sql')
const MIGRATION = readRepo('supabase/migrations/20261210_message_requests.sql')
const ROLLBACK = readRepo('supabase/migrations/rollback/20261210_message_requests_rollback.sql')

let t: BlocksDb
const as = (sub: string, sql: string) => t.exec('authenticated', sql, sub)
const rowsAs = <T = Record<string, unknown>>(sub: string, sql: string) => t.rows<T>('authenticated', sql, sub)
const code = async (p: Promise<unknown>) => { try { await p; return 'ok' } catch (e) { const x = e as { code?: string; message?: string }; return `${x.code}:${x.message}` } }

const startDirect = async (me: string, other: string) => (await rowsAs<{ chat_start_direct: string }>(me, `SELECT public.chat_start_direct('${other}')`))[0].chat_start_direct
// rowsAs throws the database error (exec only returns its code), so the named reason is visible.
const send = (me: string, thread: string, body = 'hi') => rowsAs(me, `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ('${thread}','${me}','${body}') RETURNING id`)
const state = async (thread: string) => (await t.db.query(`SELECT request_state, request_sender FROM public.chat_threads WHERE id=$1`, [thread])).rows[0] as { request_state: string | null; request_sender: string | null }
const follow = (a: string, b: string) => t.db.query(`INSERT INTO public.user_follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [a, b])

beforeAll(async () => {
  t = await startBlocksDb(54933, 'chatmessagerequests', [])
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB, CAROL]) await t.db.query(`INSERT INTO public.profiles (id, username) VALUES ($1, $2)`, [id, id.slice(0, 5)])
  await t.db.query(USER_BLOCKS)
  await t.db.query(HONOURS)
  // the snapshot predates the picture columns (media_path ...); production has them since 20261109, which sorts before this migration
  await t.db.query(readRepo('supabase/migrations/20261109_chat_media.sql'))
  await t.db.query(MIGRATION)
}, 240_000)
afterAll(async () => { await t?.stop() })

describe('message requests', () => {
  it('a stranger can start a conversation: it is a pending request from the sender', async () => {
    const th = await startDirect(ALICE, BOB)
    expect(await state(th)).toEqual({ request_state: 'pending', request_sender: ALICE })
  })

  it('the sender may send 3 text messages, the 4th is refused; the recipient does not see the thread in the main list but sees it as an incoming request', async () => {
    const th = await startDirect(ALICE, BOB)
    for (let i = 0; i < 3; i++) await send(ALICE, th, `m${i}`)
    expect(await code(send(ALICE, th, 'm3'))).toMatch(/request_limit/)

    expect((await rowsAs<{ thread_id: string }>(BOB, `SELECT thread_id FROM public.chat_thread_summaries()`)).map((r) => r.thread_id)).not.toContain(th)
    const reqs = await rowsAs<{ thread_id: string; direction: string; remaining: number; unread_count: number }>(BOB, `SELECT * FROM public.chat_request_summaries()`)
    expect(reqs.find((r) => r.thread_id === th)).toMatchObject({ direction: 'incoming', remaining: 0, unread_count: 3 })
    // the sender still sees their own thread, as outgoing
    expect((await rowsAs<{ thread_id: string }>(ALICE, `SELECT thread_id FROM public.chat_thread_summaries()`)).map((r) => r.thread_id)).toContain(th)
    expect((await rowsAs<{ thread_id: string; direction: string }>(ALICE, `SELECT * FROM public.chat_request_summaries()`)).find((r) => r.thread_id === th)?.direction).toBe('outgoing')
  })

  it('a picture is refused while the request is pending (text only)', async () => {
    const th = await startDirect(ALICE, CAROL)
    expect(await code(rowsAs(ALICE, `INSERT INTO public.chat_messages (thread_id, sender_id, body, media_path, media_type) VALUES ('${th}','${ALICE}','','${th}/${ALICE}/x.jpg','image') RETURNING id`))).toMatch(/request_text_only/)
  })

  it('the recipient replying turns it into an ordinary conversation: the sender may send again, and it moves to the main list', async () => {
    const th = await startDirect(CAROL, BOB)
    await send(CAROL, th)
    await send(BOB, th, 'hello')
    expect((await state(th)).request_state).toBeNull()
    await send(CAROL, th, 'again')
    await send(CAROL, th, 'and again')
    await send(CAROL, th, 'and again 2')
    expect((await rowsAs<{ thread_id: string }>(BOB, `SELECT thread_id FROM public.chat_thread_summaries()`)).map((r) => r.thread_id)).toContain(th)
  })

  it('ignoring a request: only the recipient can; the sender can send no more and is not told', async () => {
    await t.db.query(`DELETE FROM public.chat_messages; DELETE FROM public.chat_participants; DELETE FROM public.chat_threads`)
    const th = await startDirect(ALICE, BOB)
    await send(ALICE, th)
    expect((await rowsAs<{ chat_decline_request: boolean }>(ALICE, `SELECT public.chat_decline_request('${th}')`))[0].chat_decline_request).toBe(false)
    expect((await rowsAs<{ chat_decline_request: boolean }>(BOB, `SELECT public.chat_decline_request('${th}')`))[0].chat_decline_request).toBe(true)
    expect(await code(send(ALICE, th))).toMatch(/request_limit/)
    // a declined request vanishes for the recipient and reads the same as pending for the sender
    expect(await rowsAs(BOB, `SELECT * FROM public.chat_request_summaries()`)).toHaveLength(0)
    expect((await rowsAs<{ direction: string }>(ALICE, `SELECT * FROM public.chat_request_summaries()`))[0].direction).toBe('outgoing')
  })

  it('a mutual follower is still an ordinary conversation, not a request', async () => {
    await follow(ALICE, CAROL); await follow(CAROL, ALICE)
    const th = await startDirect(ALICE, CAROL)
    expect((await state(th)).request_state).toBeNull()
  })

  it('a block stops a request with the same error as no such account', async () => {
    await t.db.query(`INSERT INTO public.chat_blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [BOB, CAROL])
    expect(await code(startDirect(CAROL, BOB))).toMatch(/22023:invalid_target/)
    await t.db.query(`DELETE FROM public.chat_blocks WHERE blocker_id=$1`, [BOB])
  })

  it('opening the same pair again is not a new request', async () => {
    const a = await startDirect(ALICE, BOB)
    expect(await startDirect(ALICE, BOB)).toBe(a)
    expect(await startDirect(BOB, ALICE)).toBe(a)
  })

  it('at most 10 new requests per sender in 24 hours (the 11th says request_daily_limit, 53400)', async () => {
    await t.db.query(`DELETE FROM public.chat_messages; DELETE FROM public.chat_participants; DELETE FROM public.chat_threads`)
    await t.db.query(`ALTER TABLE auth.users DISABLE TRIGGER USER`)
    const others: string[] = []
    for (let i = 0; i < 11; i++) {
      const id = `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`
      others.push(id)
      await t.db.query(`INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [id])
    }
    for (let i = 0; i < 10; i++) await startDirect(ALICE, others[i])
    const res = await code(startDirect(ALICE, others[10]))
    expect(res).toMatch(/53400:request_daily_limit/)
  })

  it('rollback restores the old behaviour: strangers refused again, columns gone', async () => {
    await t.db.query(`DELETE FROM public.chat_messages; DELETE FROM public.chat_participants; DELETE FROM public.chat_threads`)
    await t.db.query(ROLLBACK)
    expect(await code(startDirect(ALICE, BOB))).toMatch(/22023:invalid_target/)
    const cols = await t.db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='chat_threads' AND column_name LIKE 'request_%'`)
    expect(cols.rows).toHaveLength(0)
  })
})
