import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, BOB, loadProdSchema, readRepo, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// Migration 20261207: enough DIFFERENT reporters hold a post by themselves — real PostgreSQL, the production schema, the real migration files (queue trigger first, then auto-hold).

const QUEUE_MIG = readRepo('supabase/migrations/20261009_content_reports_to_queue.sql')
const MIG = readRepo('supabase/migrations/20261207_auto_hold_reported_posts.sql')
const ROLLBACK = readRepo('supabase/migrations/rollback/20261207_auto_hold_reported_posts_rollback.sql')
const post = (n: number) => `bbbbbbbb-0000-4000-8000-00000000000${n}`

let t: BlocksDb
const svc = (sql: string) => t.exec('service_role', sql, null, undefined)
const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await t.db.query(sql, params as never)).rows as T[]
const file = (id: string, reason: string, source: string) =>
  svc(`INSERT INTO public.content_reports (content_id, reporter_source_id, reason) VALUES ('${id}', '${source}', '${reason}')`)
const state = async (id: string) => (await q<{ publication_state: string | null }>(`SELECT publication_state FROM public.reviews WHERE id = '${id}'`))[0].publication_state
const heldRows = (id: string) => q<{ status: string; priority: number; auto: boolean | null }>(
  `SELECT status::text, priority, (metadata->>'auto_hold')::boolean AS auto FROM public.moderation_queue WHERE target_id = '${id}' AND status = 'in_review'`)

beforeAll(async () => {
  t = await startBlocksDb(54915, 'contentreportautohold', [])
  await loadProdSchema(t.db)
  await t.db.query(`INSERT INTO public.profiles (id, username) VALUES ($1, 'alice'), ($2, 'bob')`, [ALICE, BOB])
  for (let n = 1; n <= 6; n++) await t.db.query(`INSERT INTO public.reviews (id, user_id, place_id, place_name, publication_state) VALUES ($1,$2,'p','Quán ${n}', 'PUBLISHED')`, [post(n), ALICE])
  await t.db.query(QUEUE_MIG)
  await t.db.query(MIG)
}, 300_000)
afterAll(async () => { await t?.stop() })

describe('auto-hold of a reported post', () => {
  it('a severe reason holds the post at the THIRD different reporter, not before', async () => {
    await file(post(1), 'violence', 's1'); await file(post(1), 'inappropriate', 's2')
    expect(await state(post(1))).toBe('PUBLISHED')
    await file(post(1), 'violence', 's3')
    expect(await state(post(1))).toBe('RESTRICTED')
  })

  it('exactly ONE queue row is moved to review, marked as the system hold and raised to urgent; the others stay pending', async () => {
    const held = await heldRows(post(1))
    expect(held).toEqual([{ status: 'in_review', priority: 3, auto: true }])
    const pending = Number((await q<{ n: string }>(`SELECT count(*) n FROM public.moderation_queue WHERE target_id = '${post(1)}' AND status = 'pending'`))[0].n)
    expect(pending).toBe(2)
  })

  it('harassment needs FIVE different reporters', async () => {
    for (let i = 1; i <= 4; i++) await file(post(2), 'harassment', `h${i}`)
    expect(await state(post(2))).toBe('PUBLISHED')
    await file(post(2), 'harassment', 'h5')
    expect(await state(post(2))).toBe('RESTRICTED')
  })

  it('spam, copyright, misinformation and other NEVER hold a post, however many report', async () => {
    for (const [i, reason] of ['spam', 'copyright', 'misinformation', 'other'].entries()) {
      for (let k = 1; k <= 8; k++) await file(post(3), reason, `x${i}-${k}`)
    }
    expect(await state(post(3))).toBe('PUBLISHED')
  })

  it('a post the gate or a moderator already restricted is left alone (no queue row is touched)', async () => {
    await t.db.query(`UPDATE public.reviews SET publication_state = 'UNDER_REVIEW' WHERE id = $1`, [post(4)])
    for (let i = 1; i <= 4; i++) await file(post(4), 'violence', `u${i}`)
    expect(await state(post(4))).toBe('UNDER_REVIEW')
    expect(await heldRows(post(4))).toEqual([])
  })

  it('reports from before a "no violation" verdict do not count again: the same people cannot re-hide a cleared post', async () => {
    for (let i = 1; i <= 3; i++) await file(post(5), 'violence', `c${i}`)
    expect(await state(post(5))).toBe('RESTRICTED')
    // the moderator clears it: the held row is dismissed and the post restored (what the decide route does)
    await t.db.query(`UPDATE public.moderation_queue SET status = 'dismissed', resolved_at = now() WHERE target_id = $1 AND status = 'in_review'`, [post(5)])
    await t.db.query(`UPDATE public.reviews SET publication_state = 'PUBLISHED' WHERE id = $1`, [post(5)])
    await t.db.query(`UPDATE public.content_reports SET created_at = now() - interval '1 hour' WHERE content_id = $1`, [post(5)])
    await file(post(5), 'violence', 'c-new-1'); await file(post(5), 'violence', 'c-new-2')
    expect(await state(post(5))).toBe('PUBLISHED')            // only 2 new reporters since the verdict
    await file(post(5), 'violence', 'c-new-3')
    expect(await state(post(5))).toBe('RESTRICTED')           // three NEW reporters hold it again
  })

  it('the same reporter repeating a report counts once (the table refuses the repeat)', async () => {
    await file(post(6), 'violence', 'r1')
    expect(await file(post(6), 'violence', 'r1')).not.toBeNull()
    await file(post(6), 'violence', 'r2')
    expect(await state(post(6))).toBe('PUBLISHED')
  })

  it('no client role can call the function', async () => {
    const rows = await q<{ anon: boolean; authenticated: boolean }>(
      `SELECT has_function_privilege('anon', 'public.content_report_auto_hold()', 'EXECUTE') AS anon, has_function_privilege('authenticated', 'public.content_report_auto_hold()', 'EXECUTE') AS authenticated`)
    expect(rows[0]).toEqual({ anon: false, authenticated: false })
  })

  it('rollback removes the trigger and leaves held posts held', async () => {
    await t.db.query(ROLLBACK)
    expect((await q(`SELECT 1 FROM pg_trigger WHERE tgname = 'content_report_zz_auto_hold' AND NOT tgisinternal`)).length).toBe(0)
    expect(await state(post(1))).toBe('RESTRICTED')
    for (let i = 1; i <= 5; i++) await file(post(3), 'violence', `after-${i}`)
    expect(await state(post(3))).toBe('PUBLISHED')
  })
})
