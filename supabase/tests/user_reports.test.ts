import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, ANON_USER, BOB, CAROL, loadProdSchema, readRepo, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// Reports of comments and users (migration 20261001b_user_reports.sql) against the FULL production schema, real PostgreSQL.

const MIGRATION = readRepo('supabase/migrations/20261001b_user_reports.sql')
const ROLLBACK = readRepo('supabase/migrations/rollback/20261001b_user_reports_rollback.sql')
const R = 'aaaaaaaa-0000-4000-8000-00000000000a'

let t: BlocksDb
let commentBob: string
let commentAlice: string
const as = (sub: string, sql: string) => t.exec('authenticated', sql, sub)
const rowsAs = <T = Record<string, unknown>>(sub: string, sql: string) => t.rows<T>('authenticated', sql, sub)
const file = (sub: string, type: string, target: string, reason = 'spam', note = 'null') =>
  as(sub, `INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason, note) VALUES ('${sub}','${type}','${target}','${reason}',${note})`)

beforeAll(async () => {
  t = await startBlocksDb(54903, 'userreports', [])
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB, CAROL]) await t.db.query(`INSERT INTO public.profiles (id, username) VALUES ($1, $2)`, [id, id.slice(0, 5)])
  await t.db.query(`INSERT INTO public.reviews (id, user_id, place_id, place_name) VALUES ($1,$2,'p','Phở A')`, [R, ALICE])
  commentBob = ((await t.db.query(`INSERT INTO public.review_comments (review_id, user_id, body) VALUES ($1,$2,'bob says') RETURNING id`, [R, BOB])) as { rows: { id: string }[] }).rows[0].id
  commentAlice = ((await t.db.query(`INSERT INTO public.review_comments (review_id, user_id, body) VALUES ($1,$2,'alice says') RETURNING id`, [R, ALICE])) as { rows: { id: string }[] }).rows[0].id
  await t.db.query(MIGRATION)
}, 240_000)
afterAll(async () => { await t?.stop() })

describe('user_reports — table and RLS', () => {
  it('content_reports is untouched (same FK to reviews, no new target types)', async () => {
    const r = await t.db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='content_reports' AND column_name IN ('target_type')`)
    expect(r.rows).toEqual([])
  })

  it('files a report on a comment and on a user; the reporter reads exactly their own rows', async () => {
    expect(await file(ALICE, 'comment', commentBob, 'harassment', `'rude'`)).toBeNull()
    expect(await file(ALICE, 'user', BOB)).toBeNull()
    const mine = await rowsAs<{ target_type: string }>(ALICE, 'SELECT target_type FROM public.user_reports ORDER BY target_type')
    expect(mine.map((r) => r.target_type)).toEqual(['comment', 'user'])
  })

  it('nobody else reads them — not the reported person, not a stranger, not anonymous', async () => {
    expect(await rowsAs(BOB, 'SELECT * FROM public.user_reports')).toEqual([])
    expect(await rowsAs(CAROL, 'SELECT * FROM public.user_reports')).toEqual([])
    expect(await rowsAs(ANON_USER, 'SELECT * FROM public.user_reports')).toEqual([])
    expect(await t.exec('anon', 'SELECT * FROM public.user_reports', null)).toBe('42501')
  })

  it('one report per reporter per target (23505), a different target is fine', async () => {
    expect(await file(ALICE, 'user', BOB, 'violence')).toBe('23505')
    expect(await file(ALICE, 'user', CAROL)).toBeNull()
  })

  it('cannot report yourself (user) or your own comment', async () => {
    expect(await file(BOB, 'user', BOB)).toBe('23514')
    expect(await file(ALICE, 'comment', commentAlice)).toBe('42501')
  })

  it('cannot file as someone else, and anonymous sessions cannot file', async () => {
    expect(await as(BOB, `INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${ALICE}','user','${CAROL}','spam')`)).toBe('42501')
    expect(await file(ANON_USER, 'user', BOB)).toBe('42501')
  })

  it('bad target type, reason or a note over 300 characters is refused', async () => {
    expect(await file(CAROL, 'post', BOB)).toBe('23514')
    expect(await file(CAROL, 'user', BOB, 'dislike')).toBe('23514')
    expect(await file(CAROL, 'user', BOB, 'spam', `'${'x'.repeat(301)}'`)).toBe('23514')
  })

  it('no client can update or delete a report', async () => {
    expect(await as(ALICE, `DELETE FROM public.user_reports`)).toBe('42501')
    expect(await as(ALICE, `UPDATE public.user_reports SET reason='other'`)).toBe('42501')
  })

  it('deleting the REPORTER keeps the report, anonymised; deleting the TARGET keeps it too', async () => {
    const before = Number((await t.one<{ n: string }>(`SELECT count(*) n FROM public.user_reports`)).n)
    await t.db.query(`DELETE FROM auth.users WHERE id = $1`, [CAROL]) // Carol reported nothing yet, as a stranger no-op
    expect(await file(BOB, 'user', ALICE)).toBeNull()
    await t.db.query(`DELETE FROM auth.users WHERE id = $1`, [BOB])
    const rows = (await t.db.query(`SELECT reporter_id, target_id FROM public.user_reports WHERE target_id = $1`, [ALICE])).rows
    expect(rows).toEqual([{ reporter_id: null, target_id: ALICE }])
    expect(Number((await t.one<{ n: string }>(`SELECT count(*) n FROM public.user_reports`)).n)).toBe(before + 1)
  })

  it('rollback removes the table and leaves content_reports alone', async () => {
    await t.db.query(ROLLBACK)
    expect((await t.one<{ r: string | null }>(`SELECT to_regclass('public.user_reports') r`)).r).toBeNull()
    expect((await t.one<{ r: string | null }>(`SELECT to_regclass('public.content_reports') r`)).r).not.toBeNull()
  })
})
