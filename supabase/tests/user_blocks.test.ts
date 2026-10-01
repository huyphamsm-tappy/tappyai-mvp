import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, ANON_USER, BOB, CAROL, loadProdSchema, readRepo, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// User-blocks slice (owner 01/10) against the FULL production schema snapshot, on a real PostgreSQL.
// Migration 20261001_user_blocks.sql: a NEW table + private helpers + RESTRICTIVE policies. public.chat_blocks is NOT touched.

const MIGRATION = readRepo('supabase/migrations/20261001_user_blocks.sql')
const ROLLBACK = readRepo('supabase/migrations/rollback/20261001_user_blocks_rollback.sql')

const R_ALICE = 'aaaaaaaa-0000-4000-8000-00000000000a'
const R_BOB = 'bbbbbbbb-0000-4000-8000-00000000000b'
const R_CAROL = 'aaaaaaaa-0000-4000-8000-00000000000c'
const R_DAVE = 'dddddddd-0000-4000-8000-00000000000d'
const DAVE = '55555555-5555-4555-8555-555555555555' // only a pre-existing RELEASE-CHAT block with Bob

let t: BlocksDb
const as = (sub: string, sql: string) => t.exec('authenticated', sql, sub)
const rowsAs = <T = Record<string, unknown>>(sub: string, sql: string) => t.rows<T>('authenticated', sql, sub)
// What the route does when someone blocks: BOTH tables, as the caller (RLS own-row).
const block = async (me: string, other: string) => {
  expect(await as(me, `INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ('${me}','${other}') ON CONFLICT DO NOTHING`)).toBeNull()
  expect(await as(me, `INSERT INTO public.chat_blocks (blocker_id, blocked_id) VALUES ('${me}','${other}') ON CONFLICT DO NOTHING`)).toBeNull()
}
const unblock = async (me: string, other: string) => {
  await as(me, `DELETE FROM public.user_blocks WHERE blocker_id='${me}' AND blocked_id='${other}'`)
  await as(me, `DELETE FROM public.chat_blocks WHERE blocker_id='${me}' AND blocked_id='${other}'`)
}
const reviewsSeen = async (me: string) => (await rowsAs<{ id: string }>(me, 'SELECT id FROM public.reviews ORDER BY id')).map((r) => r.id)
const chatBlocksShape = async () => ({
  kind: (await t.one(`SELECT relkind FROM pg_class WHERE oid='public.chat_blocks'::regclass`)) as { relkind: string },
  cols: (await t.db.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_blocks' ORDER BY ordinal_position`)).rows,
  policies: (await t.db.query(`SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='chat_blocks' ORDER BY policyname`)).rows,
  grants: (await t.db.query(`SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='chat_blocks' ORDER BY grantee, privilege_type`)).rows,
})

let chatBefore: Awaited<ReturnType<typeof chatBlocksShape>>
let chatRowsBefore: unknown[]

beforeAll(async () => {
  t = await startBlocksDb(54901, 'userblocks', [])
  await t.db.query(`INSERT INTO auth.users (id, is_anonymous) VALUES ('${DAVE}', false)`) // before the schema: the signup trigger is not there yet
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB, CAROL, DAVE]) await t.db.query(`INSERT INTO public.profiles (id, username) VALUES ($1, $2)`, [id, id.slice(0, 5)])
  await t.db.query(`INSERT INTO public.reviews (id, user_id, place_id, place_name) VALUES ($1,$2,'p','Phở A'), ($3,$4,'p','Phở B'), ($5,$6,'p','Bún C'), ($7,$8,'p','Cơm D')`, [R_ALICE, ALICE, R_BOB, BOB, R_CAROL, CAROL, R_DAVE, DAVE])
  await t.db.query(`INSERT INTO public.review_comments (review_id, user_id, body) VALUES ($1,$2,'bob on alice'), ($3,$4,'carol on alice'), ($1,$5,'alice on alice')`, [R_ALICE, BOB, R_ALICE, CAROL, ALICE])
  await t.db.query(`INSERT INTO public.user_follows (follower_id, following_id) VALUES ($1,$2), ($2,$1)`, [ALICE, BOB])
  // A pre-existing chat block made through the release chat: Dave blocked Bob.
  await t.db.query(`INSERT INTO public.chat_blocks (blocker_id, blocked_id) VALUES ($1,$2)`, [DAVE, BOB])
  chatBefore = await chatBlocksShape()
  chatRowsBefore = (await t.db.query(`SELECT blocker_id, blocked_id FROM public.chat_blocks ORDER BY blocker_id, blocked_id`)).rows
  await t.db.query(MIGRATION)
}, 240_000)
afterAll(async () => { await t?.stop() })

describe('chat_blocks is untouched (condition 2)', () => {
  it('still a TABLE with the same columns, policies, grants and the same rows', async () => {
    const after = await chatBlocksShape()
    expect(after.kind).toEqual({ relkind: 'r' })
    expect(after).toEqual(chatBefore)
    expect((await t.db.query(`SELECT blocker_id, blocked_id FROM public.chat_blocks ORDER BY blocker_id, blocked_id`)).rows).toEqual(chatRowsBefore)
  })
})

describe('table and RLS', () => {
  it('own-row only: the blocked person and strangers read nothing and cannot write for someone else', async () => {
    await block(ALICE, BOB)
    expect(await rowsAs(ALICE, 'SELECT blocked_id FROM public.user_blocks')).toEqual([{ blocked_id: BOB }])
    expect(await rowsAs(BOB, 'SELECT * FROM public.user_blocks')).toEqual([])
    expect(await rowsAs(CAROL, 'SELECT * FROM public.user_blocks')).toEqual([])
    expect(await as(BOB, `INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ('${ALICE}','${CAROL}')`)).toBe('42501')
    expect(await as(BOB, `DELETE FROM public.user_blocks WHERE blocker_id='${ALICE}'`)).toBeNull() // RLS: matches no row
    expect((await t.one(`SELECT count(*)::int n FROM public.user_blocks WHERE blocker_id=$1`, [ALICE])).n).toBe(1)
    await unblock(ALICE, BOB)
  })
  it('an anonymous session cannot block; nobody can block themselves', async () => {
    expect(await t.exec('authenticated', `INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ('${ANON_USER}','${BOB}')`, ANON_USER)).toBe('42501')
    expect(await as(ALICE, `INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ('${ALICE}','${ALICE}')`)).toBe('23514')
  })
  it('anon (not signed in) has no access at all', async () => {
    expect(await t.exec('anon', `SELECT * FROM public.user_blocks`)).toBe('42501')
  })
  it('a block is idempotent (primary key on the pair)', async () => {
    await block(ALICE, BOB); await block(ALICE, BOB)
    expect((await t.one(`SELECT count(*)::int n FROM public.user_blocks WHERE blocker_id=$1`, [ALICE])).n).toBe(1)
    await unblock(ALICE, BOB)
  })
})

describe('P8-11 fixed: the helpers are private and answer only about the caller', () => {
  it('nothing named p8_* or block-related is callable from the public schema', async () => {
    const r = await t.db.query(`SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND (proname LIKE 'p8_%' OR proname IN ('blocked_ids','review_author_blocked','user_blocked_with_caller'))`)
    expect(r.rows).toEqual([])
  })
  it('anon and PUBLIC cannot execute the private helpers; the schema is closed to them', async () => {
    for (const fn of ['safety_private.blocked_ids()', 'safety_private.review_author_blocked(uuid)']) {
      expect((await t.one(`SELECT has_function_privilege('anon', '${fn}', 'EXECUTE') AS ok`)).ok).toBe(false)
      expect((await t.one(`SELECT has_function_privilege('authenticated', '${fn}', 'EXECUTE') AS ok`)).ok).toBe(true) // RLS runs as the caller
    }
    expect((await t.one(`SELECT has_schema_privilege('anon', 'safety_private', 'USAGE') AS ok`)).ok).toBe(false)
  })
  it('review_author_blocked answers false for a review that does not exist — exactly like "no block" (no existence oracle)', async () => {
    const r = await rowsAs<{ x: boolean }>(CAROL, `SELECT safety_private.review_author_blocked('99999999-9999-4999-8999-999999999999') AS x`)
    expect(r[0].x).toBe(false)
  })
  it('blocked_ids is empty for a user in no pair and for a session with no identity; it READS the release chat_blocks', async () => {
    expect((await rowsAs<{ x: string[] }>(CAROL, `SELECT safety_private.blocked_ids() AS x`))[0].x).toEqual([])
    expect((await t.rows<{ x: string[] }>('authenticated', `SELECT safety_private.blocked_ids() AS x`, null))[0].x).toEqual([])
    expect((await rowsAs<{ x: string[] }>(DAVE, `SELECT safety_private.blocked_ids() AS x`))[0].x).toEqual([BOB]) // Dave blocked Bob in the release chat
    expect((await rowsAs<{ x: string[] }>(BOB, `SELECT safety_private.blocked_ids() AS x`))[0].x).toEqual([DAVE]) // and Bob is in the same pair
  })
})

describe('what a block does, both directions', () => {
  it('A blocks B: neither sees the other’s posts nor comments; a third person still sees both', async () => {
    await block(ALICE, BOB)
    expect(await reviewsSeen(ALICE)).toEqual([R_ALICE, R_CAROL, R_DAVE].sort())
    expect(await reviewsSeen(BOB)).toEqual([R_BOB, R_CAROL].sort()) // not Alice (API block), not Dave (release-chat block)
    expect((await reviewsSeen(CAROL)).sort()).toEqual([R_ALICE, R_BOB, R_CAROL, R_DAVE].sort())
    const aliceSees = (await rowsAs<{ user_id: string }>(ALICE, `SELECT user_id FROM public.review_comments WHERE review_id='${R_ALICE}'`)).map((c) => c.user_id)
    expect(aliceSees).not.toContain(BOB)
    expect(aliceSees).toContain(CAROL)
    expect((await rowsAs(BOB, `SELECT id FROM public.reviews WHERE id='${R_ALICE}'`)).length).toBe(0)
  })
  it('no follow in either direction; an unrelated follow still works', async () => {
    expect(await as(BOB, `INSERT INTO public.user_follows (follower_id, following_id) VALUES ('${BOB}','${ALICE}') ON CONFLICT DO NOTHING`)).toBe('42501')
    expect(await as(ALICE, `INSERT INTO public.user_follows (follower_id, following_id) VALUES ('${ALICE}','${BOB}') ON CONFLICT DO NOTHING`)).toBe('42501')
    expect(await as(CAROL, `INSERT INTO public.user_follows (follower_id, following_id) VALUES ('${CAROL}','${ALICE}') ON CONFLICT DO NOTHING`)).toBeNull()
  })
  it('no comment on each other’s posts, either direction — even by guessing the post id', async () => {
    expect(await as(BOB, `INSERT INTO public.review_comments (review_id, user_id, body) VALUES ('${R_ALICE}','${BOB}','hi')`)).toBe('42501')
    expect(await as(ALICE, `INSERT INTO public.review_comments (review_id, user_id, body) VALUES ('${R_BOB}','${ALICE}','hi')`)).toBe('42501')
    expect(await as(CAROL, `INSERT INTO public.review_comments (review_id, user_id, body) VALUES ('${R_ALICE}','${CAROL}','still fine')`)).toBeNull()
  })
  it('notifications caused by the other person are hidden; others are not', async () => {
    await t.db.query(`INSERT INTO public.notifications (user_id, type, category, title, body, actor_id) VALUES ($1,'comment','social','t1','b',$2), ($1,'comment','social','t2','b',$3), ($1,'system','system','t3','b',NULL)`, [ALICE, BOB, CAROL])
    const titles = (await rowsAs<{ title: string }>(ALICE, 'SELECT title FROM public.notifications ORDER BY title')).map((r) => r.title)
    expect(titles).toEqual(['t2', 't3'])
  })
  it('the release chat honours it: chat_can_reach is false both ways (the API wrote chat_blocks too)', async () => {
    const reach = async (me: string, other: string) => (await rowsAs<{ ok: boolean }>(me, `SELECT public.chat_can_reach('${other}') AS ok`))[0].ok
    expect(await reach(ALICE, BOB)).toBe(false)
    expect(await reach(BOB, ALICE)).toBe(false)
  })
  it('unblocking restores everything', async () => {
    await unblock(ALICE, BOB)
    expect((await reviewsSeen(ALICE)).sort()).toEqual([R_ALICE, R_BOB, R_CAROL, R_DAVE].sort())
    expect(await as(BOB, `INSERT INTO public.user_follows (follower_id, following_id) VALUES ('${BOB}','${ALICE}') ON CONFLICT DO NOTHING`)).toBeNull()
    expect(await as(BOB, `INSERT INTO public.review_comments (review_id, user_id, body) VALUES ('${R_ALICE}','${BOB}','back')`)).toBeNull()
    expect((await rowsAs<{ title: string }>(ALICE, 'SELECT title FROM public.notifications')).length).toBe(3)
  })
  it('a block made ONLY in the release chat (chat_blocks) also hides posts, both ways: Dave blocked Bob', async () => {
    expect(await reviewsSeen(DAVE)).not.toContain(R_BOB)
    expect(await reviewsSeen(BOB)).not.toContain(R_DAVE)
    expect(await reviewsSeen(CAROL)).toContain(R_BOB)
  })
})

describe('comment moderation', () => {
  it('the post’s creator may delete someone else’s comment on it; a third party may not', async () => {
    const [{ id }] = await t.db.query(`INSERT INTO public.review_comments (review_id, user_id, body) VALUES ('${R_ALICE}','${BOB}','spam') RETURNING id`).then((r) => r.rows as { id: string }[])
    await as(CAROL, `DELETE FROM public.review_comments WHERE id='${id}'`)
    expect((await t.one(`SELECT count(*)::int n FROM public.review_comments WHERE id=$1`, [id])).n).toBe(1)
    await as(ALICE, `DELETE FROM public.review_comments WHERE id='${id}'`)
    expect((await t.one(`SELECT count(*)::int n FROM public.review_comments WHERE id=$1`, [id])).n).toBe(0)
  })
})

describe('account deletion', () => {
  it('deleting a user removes the block rows in BOTH columns', async () => {
    await block(ALICE, CAROL); await block(BOB, ALICE)
    expect((await t.one(`SELECT count(*)::int n FROM public.user_blocks`)).n).toBe(2)
    await t.db.query(`DELETE FROM auth.users WHERE id = $1`, [ALICE])
    expect((await t.one(`SELECT count(*)::int n FROM public.user_blocks`)).n).toBe(0)
  })
})

describe('migration hygiene', () => {
  it('re-applying the migration is a no-op (idempotent)', async () => {
    await t.db.query(MIGRATION)
    expect((await t.one(`SELECT count(*)::int n FROM pg_policies WHERE policyname LIKE 'user_blocks_%'`)).n).toBeGreaterThanOrEqual(9)
  })
  it('rollback removes every new object and leaves chat_blocks and the reviews exactly as they were', async () => {
    await t.db.query(ROLLBACK)
    expect((await t.one(`SELECT to_regclass('public.user_blocks') AS r`)).r).toBeNull()
    expect((await t.one(`SELECT to_regnamespace('safety_private') AS r`)).r).toBeNull()
    expect((await t.one(`SELECT count(*)::int n FROM pg_policies WHERE policyname LIKE 'user_blocks_%'`)).n).toBe(0)
    expect(await chatBlocksShape()).toEqual(chatBefore)
    const all = (await t.one(`SELECT count(*)::int n FROM public.reviews`)).n
    expect((await rowsAs(DAVE, 'SELECT id FROM public.reviews')).length).toBe(all) // even Dave (release-chat block with Bob) sees everything again
  })
})
