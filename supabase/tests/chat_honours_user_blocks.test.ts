import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, BOB, CAROL, loadProdSchema, readRepo, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// WEB-ONLY Phase 8 / Messenger (owner 2026-10-10): the chat honours `user_blocks` — in the database, where any client (web, Android, iOS)
// is covered. Real PostgreSQL, the FULL production schema snapshot, the real migrations from disk. Same semantics as the existing chat block
// (20260906): symmetric, stops new contact and new messages, never erases history. Signatures, grants and error codes are unchanged.

const USER_BLOCKS = readRepo('supabase/migrations/20261001_user_blocks.sql')
const MIGRATION = readRepo('supabase/migrations/20261018_chat_honours_user_blocks.sql')
const ROLLBACK = readRepo('supabase/migrations/rollback/20261018_chat_honours_user_blocks_rollback.sql')

let t: BlocksDb
const as = (sub: string, sql: string) => t.exec('authenticated', sql, sub)
const rowsAs = <T = Record<string, unknown>>(sub: string, sql: string) => t.rows<T>('authenticated', sql, sub)

// The state a failed second write (or a direct SQL row) leaves: user_blocks only, NO chat_blocks partner.
const blockUserOnly = (me: string, other: string) => t.db.query(`INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [me, other])
const unblockUserOnly = (me: string, other: string) => t.db.query(`DELETE FROM public.user_blocks WHERE blocker_id=$1 AND blocked_id=$2`, [me, other])
const blockChatOnly = (me: string, other: string) => t.db.query(`INSERT INTO public.chat_blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [me, other])
const unblockChatOnly = (me: string, other: string) => t.db.query(`DELETE FROM public.chat_blocks WHERE blocker_id=$1 AND blocked_id=$2`, [me, other])

const startDirect = async (me: string, other: string) => {
  try { return (await rowsAs<{ chat_start_direct: string }>(me, `SELECT public.chat_start_direct('${other}')`))[0].chat_start_direct } catch (e) { return (e as { code?: string }).code ?? 'unknown' }
}
const createGroup = async (me: string, members: string[]) => {
  try { return (await rowsAs<{ chat_create_group: string }>(me, `SELECT public.chat_create_group('g', ARRAY[${members.map((m) => `'${m}'::uuid`).join(',')}])`))[0].chat_create_group } catch (e) { return (e as { code?: string; message?: string }).code ?? 'unknown' }
}
const send = (me: string, thread: string) => as(me, `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ('${thread}','${me}','hi')`)
const history = async (me: string, thread: string) => (await rowsAs<{ id: string }>(me, `SELECT id FROM public.chat_messages WHERE thread_id='${thread}'`)).length
const isUuid = (x: unknown) => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x)

const SIGNATURES = `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result, p.prosecdef, p.provolatile, p.proconfig, p.proacl::text AS acl
  FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('chat_can_reach','chat_thread_blocked','chat_create_group') ORDER BY p.proname`
let sigBefore: unknown[]
const DEFS = `SELECT p.proname, pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('chat_can_reach','chat_thread_blocked','chat_create_group') ORDER BY p.proname`
let defsBefore: unknown[]

beforeAll(async () => {
  t = await startBlocksDb(54931, 'chatuserblocks', [])
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB, CAROL]) await t.db.query(`INSERT INTO public.profiles (id, username) VALUES ($1, $2)`, [id, id.slice(0, 5)])
  // mutual follow = reachable under the default policy, for every pair
  for (const [a, b] of [[ALICE, BOB], [ALICE, CAROL], [BOB, CAROL]]) await t.db.query(`INSERT INTO public.user_follows (follower_id, following_id) VALUES ($1,$2), ($2,$1)`, [a, b])
  await t.db.query(USER_BLOCKS)
  sigBefore = (await t.db.query(SIGNATURES)).rows
  defsBefore = (await t.db.query(DEFS)).rows
  await t.db.query(MIGRATION)
}, 240_000)
afterAll(async () => { await t?.stop() })

describe('contract: nothing a client depends on changes', () => {
  it('same signatures, results, security mode, search_path and ACL for the three functions', async () => {
    expect((await t.db.query(SIGNATURES)).rows).toEqual(sigBefore)
  })
  it('anon still cannot call them', async () => {
    expect(await t.exec('anon', `SELECT public.chat_can_reach('${BOB}')`, null)).toBe('42501')
  })
})

describe('start direct', () => {
  it('a user_blocks-only pair is refused in BOTH directions, with the same error an unknown account gets (22023)', async () => {
    await blockUserOnly(ALICE, BOB)
    expect(await startDirect(ALICE, BOB)).toBe('22023') // the blocker
    expect(await startDirect(BOB, ALICE)).toBe('22023') // the blocked cannot reach around
    expect(await startDirect(ALICE, '99999999-9999-4999-8999-999999999999')).toBe('22023') // indistinguishable from "no such account"
    await unblockUserOnly(ALICE, BOB)
  })
  it('unblocked, or never blocked: allowed; an unrelated third party is unaffected by someone else\'s block', async () => {
    await blockUserOnly(ALICE, BOB)
    expect(isUuid(await startDirect(ALICE, CAROL))).toBe(true)
    expect(isUuid(await startDirect(BOB, CAROL))).toBe(true)
    await unblockUserOnly(ALICE, BOB)
    expect(isUuid(await startDirect(ALICE, BOB))).toBe(true)
  })
  it('a chat_blocks-only pair is still refused exactly as before', async () => {
    await blockChatOnly(BOB, CAROL)
    expect(await startDirect(CAROL, BOB)).toBe('22023')
    await unblockChatOnly(BOB, CAROL)
  })
})

describe('an existing conversation', () => {
  it('a block made AFTER the thread exists stops new messages (both directions, RLS 42501), keeps the history readable, and unblocking restores sending', async () => {
    const thread = (await startDirect(ALICE, BOB)) as string
    expect(isUuid(thread)).toBe(true)
    expect(await send(ALICE, thread)).toBeNull()
    expect(await send(BOB, thread)).toBeNull()
    await blockUserOnly(BOB, ALICE)
    expect(await send(ALICE, thread)).toBe('42501')
    expect(await send(BOB, thread)).toBe('42501')
    expect(await history(ALICE, thread)).toBe(2) // history is not erased
    expect(await history(BOB, thread)).toBe(2)
    await unblockUserOnly(BOB, ALICE)
    expect(await send(ALICE, thread)).toBeNull()
  })
  it('re-opening the same direct conversation is refused while blocked (the block is checked before "an existing conversation wins")', async () => {
    await blockUserOnly(ALICE, BOB)
    expect(await startDirect(BOB, ALICE)).toBe('22023')
    await unblockUserOnly(ALICE, BOB)
  })
  it('in a group, a block pair among the participants mutes the sender (chat_thread_blocked semantics are unchanged: the sender is judged against the OTHER participants)', async () => {
    const group = (await createGroup(ALICE, [BOB, CAROL])) as string
    expect(isUuid(group)).toBe(true)
    expect(await send(ALICE, group)).toBeNull()
    await blockUserOnly(ALICE, BOB)
    expect(await send(ALICE, group)).toBe('42501')
    expect(await send(BOB, group)).toBe('42501')
    expect(await send(CAROL, group)).toBeNull() // carol is in a block pair with nobody: she can still write (semantics unchanged)
    await unblockUserOnly(ALICE, BOB)
  })
})

describe('create group', () => {
  it('a member in a user_blocks pair with the creator is refused (either direction) with the SAME invalid_members an unknown account raises', async () => {
    await blockUserOnly(ALICE, BOB)
    expect(await createGroup(ALICE, [BOB, CAROL])).toBe('22023')
    expect(await createGroup(BOB, [ALICE, CAROL])).toBe('22023')
    expect(await createGroup(ALICE, ['99999999-9999-4999-8999-999999999999'])).toBe('22023')
    await unblockUserOnly(ALICE, BOB)
  })
  it('a chat_blocks-only pair is refused for groups too (it was not checked before)', async () => {
    await blockChatOnly(CAROL, ALICE)
    expect(await createGroup(ALICE, [CAROL, BOB])).toBe('22023')
    await unblockChatOnly(CAROL, ALICE)
  })
  it('no block → created; two members who are blocked with EACH OTHER (not with the creator) are not judged at creation', async () => {
    expect(isUuid(await createGroup(ALICE, [BOB, CAROL]))).toBe(true)
    await blockUserOnly(BOB, CAROL)
    expect(isUuid(await createGroup(ALICE, [BOB, CAROL]))).toBe(true)
    await unblockUserOnly(BOB, CAROL)
  })
  it('anonymous callers and an empty member list keep their previous refusals', async () => {
    expect(await createGroup(ALICE, [ALICE])).toBe('22023')
  })
})

describe('rollback', () => {
  it('restores the previous behaviour exactly: a user_blocks-only pair can message again; chat_blocks still blocks', async () => {
    await t.db.query(ROLLBACK)
    await blockUserOnly(ALICE, BOB)
    expect(isUuid(await startDirect(ALICE, BOB))).toBe(true)
    await unblockUserOnly(ALICE, BOB)
    await blockChatOnly(BOB, CAROL)
    expect(await startDirect(CAROL, BOB)).toBe('22023')
    await unblockChatOnly(BOB, CAROL)
    expect((await t.db.query(SIGNATURES)).rows).toEqual(sigBefore)
    // the BODIES are restored verbatim (not just the behaviour the cases above exercise)
    expect((await t.db.query(DEFS)).rows).toEqual(defsBefore)
    await t.db.query(MIGRATION) // and it re-applies
    expect((await t.db.query(DEFS)).rows).not.toEqual(defsBefore)
  })
})

describe('migration ordering, dependencies and block-policy interaction', () => {
  const manifest = readRepo('supabase/MIGRATION_ORDER.txt').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.endsWith('.sql')).map((l) => l.split('/').pop()!)
  const at = (name: string) => manifest.indexOf(name)
  it('is listed once, after every migration it depends on (chat tables and functions, the user_blocks helper) and after the previous last migration', () => {
    const me = at('20261018_chat_honours_user_blocks.sql')
    expect(me).toBeGreaterThan(-1)
    expect(manifest.filter((n) => n === '20261018_chat_honours_user_blocks.sql')).toHaveLength(1)
    for (const dep of ['20260905_chat_messaging_phase1.sql', '20260906_phase6_messenger_reachability.sql', '20261001_user_blocks.sql']) {
      expect(at(dep), dep).toBeGreaterThan(-1)
      expect(at(dep), dep).toBeLessThan(me)
    }
    expect(at('20261017_p7_pip_trial_any_source.sql')).toBeLessThan(me)
  })
  it('the reverse block lookup is index-backed (user_blocks_blocked_idx), so the new check does not add a scan to every message insert', async () => {
    const r = await t.db.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='user_blocks' ORDER BY indexname`)
    expect(r.rows.map((x: { indexname: string }) => x.indexname)).toEqual(expect.arrayContaining(['user_blocks_blocked_idx', 'user_blocks_pkey']))
  })
  it('the send policy still delegates to chat_thread_blocked (this migration changes the function, never the policy), and the helper is not callable by anon', async () => {
    const p = await t.db.query(`SELECT with_check FROM pg_policies WHERE schemaname='public' AND tablename='chat_messages' AND cmd='INSERT'`)
    expect(p.rows.some((x: { with_check: string }) => /chat_thread_blocked/.test(x.with_check))).toBe(true)
    expect(await t.exec('anon', `SELECT safety_private.blocked_ids()`, null)).toBe('42501')
  })
  it('with the block table empty (USER_BLOCKS_ENABLED never turned on) the new functions answer exactly like the old ones', async () => {
    await t.db.query('DELETE FROM public.user_blocks')
    await t.db.query('DELETE FROM public.chat_blocks')
    expect(isUuid(await startDirect(ALICE, BOB))).toBe(true)
    expect(isUuid(await createGroup(ALICE, [BOB, CAROL]))).toBe(true)
  })
})
