import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, BOB, CAROL, loadProdSchema, readRepo, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// 20260930 + 20261010 on the production baseline, real PostgreSQL: what a signed-in client can and cannot do straight through the REST API.
//   can      — file a report as itself (the route's own insert), one per (post, reason)
//   cannot   — forge the reporter, the lifecycle columns or the id/time; read, edit or delete anybody's reports; store a free-text reason;
//              file more than 10 in 10 minutes (the flood guard) — while another account is unaffected.

const M_0930 = readRepo('supabase/migrations/20260930_content_reports_insert_check.sql')
const M_1010 = readRepo('supabase/migrations/20261010_content_reports_flood_guard.sql')
const R_1010 = readRepo('supabase/migrations/rollback/20261010_content_reports_flood_guard_rollback.sql')

/** Exactly what POST /api/reviews/[id]/report computes. */
const source = (uid: string) => createHash('sha256').update(`content_report:${uid}`).digest('hex')
const post = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`
const POSTS = 20

let t: BlocksDb
const file = (as: string, content: string, reason = 'spam', reporter = source(as), extra = '', extraVals = '') =>
  t.exec('authenticated', `INSERT INTO public.content_reports (content_id, reporter_source_id, reason${extra}) VALUES ('${content}', '${reporter}', '${reason}'${extraVals})`, as)
const count = async (where = 'true') => Number(((await t.db.query(`SELECT count(*) n FROM public.content_reports WHERE ${where}`)).rows[0] as { n: string }).n)

beforeAll(async () => {
  t = await startBlocksDb(54912, 'floodguard', [])
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB, CAROL]) await t.db.query(`INSERT INTO public.profiles (id, username) VALUES ($1, $2)`, [id, id.slice(0, 5)])
  for (let i = 1; i <= POSTS; i++) await t.db.query(`INSERT INTO public.reviews (id, user_id, place_id, place_name) VALUES ('${post(i)}', '${CAROL}', 'p', 'Phở ${i}')`)
  await t.db.query(M_0930)
  await t.db.query(M_1010)
}, 300_000)
afterAll(async () => { await t?.stop() })

describe('what a legitimate client can still do', () => {
  it('files a report as itself, for each canonical reason', async () => {
    for (const [i, reason] of ['spam', 'harassment', 'inappropriate', 'copyright', 'misinformation', 'violence', 'other'].entries()) {
      expect(await file(ALICE, post(1 + i % 2), reason, source(ALICE))).toBeNull()
    }
  })
})

describe('what it cannot forge (20260930)', () => {
  it('refuses another account\'s reporter id and an invented one', async () => {
    expect(await file(ALICE, post(3), 'spam', source(BOB))).toBe('42501')
    expect(await file(ALICE, post(3), 'spam', 'a'.repeat(64))).toBe('42501')
  })

  it('refuses every sensitive column, even with a valid reporter id (no INSERT privilege on them)', async () => {
    for (const [col, val] of [['verification_state', `'VERIFIED'`], ['status', `'closed'`], ['created_at', `now() - interval '9 days'`], ['id', `gen_random_uuid()`]] as const) {
      expect(await file(ALICE, post(4), 'spam', source(ALICE), `, ${col}`, `, ${val}`), col).toBe('42501')
    }
  })

  it('can neither read, change nor delete anybody\'s reports (row-level security answers zero rows, not an error)', async () => {
    const total = await count()
    expect(total).toBeGreaterThan(0)
    expect(await t.rows('authenticated', `SELECT id FROM public.content_reports`, ALICE)).toHaveLength(0)   // no SELECT policy: nothing is visible
    await t.exec('authenticated', `UPDATE public.content_reports SET status = 'closed', verification_state = 'VERIFIED'`, ALICE)
    await t.exec('authenticated', `DELETE FROM public.content_reports`, ALICE)
    expect(await count()).toBe(total)                                                                          // nothing was deleted
    expect(await count(`status <> 'open' OR verification_state <> 'UNVERIFIED'`)).toBe(0)                     // nothing was changed
  })

  it('anon cannot file', async () => {
    expect(await t.exec('anon', `INSERT INTO public.content_reports (content_id, reporter_source_id, reason) VALUES ('${post(5)}', '${source(ALICE)}', 'spam')`)).toBe('42501')
  })
})

describe('the flood guard and the reason check (20261010)', () => {
  it('stores no free-text reason and no oversized policy id', async () => {
    expect(await file(BOB, post(6), 'my own reason', source(BOB))).toBe('23514')
    expect(await file(BOB, post(6), 'spam', source(BOB), ', policy_id', `, '${'x'.repeat(81)}'`)).toBe('23514')
    expect(await file(BOB, post(6), 'spam', source(BOB), ', policy_id', `, 'ts.harassment'`)).toBeNull()
  })

  it('refuses the 11th report from one account inside 10 minutes (SQLSTATE 53400), another account is unaffected', async () => {
    const before = await count(`reporter_source_id = '${source(BOB)}'`)       // one report already filed above
    const results: Array<string | null> = []
    for (let i = 7; i <= POSTS; i++) results.push(await file(BOB, post(i), 'spam', source(BOB)))
    // BOB can file until the 10th (counting the earlier one), then is refused
    const accepted = results.filter((r) => r === null).length
    expect(before + accepted).toBe(10)
    expect(results.filter((r) => r !== null).every((r) => r === '53400')).toBe(true)
    expect(await file(ALICE, post(20), 'spam', source(ALICE))).toBeNull()
  })

  it('an older report does not count: after the window the same account may file again', async () => {
    await t.db.query(`UPDATE public.content_reports SET created_at = now() - interval '11 minutes' WHERE reporter_source_id = '${source(BOB)}'`)
    expect(await file(BOB, post(13), 'harassment', source(BOB))).toBeNull()
  })

  it('the count uses an index, not a table scan', async () => {
    await t.db.query('SET enable_seqscan = off')
    const plan = (await t.db.query(`EXPLAIN SELECT count(*) FROM public.content_reports c WHERE c.reporter_source_id = '${source(BOB)}' AND c.created_at > now() - interval '10 minutes'`)).rows
      .map((r) => Object.values(r)[0]).join('\n')
    await t.db.query('RESET enable_seqscan')
    expect(plan).toMatch(/content_reports_reporter_recent_idx/)
  })

  it('the rollback removes the guard and the checks and keeps every row', async () => {
    const rows = await count()
    await t.db.query(R_1010)
    expect(await count()).toBe(rows)
    expect(await file(CAROL, post(2), 'my own reason', source(CAROL))).toBeNull()   // free text accepted again, no guard
  })
})
