import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, BOB, CAROL, loadProdSchema, readRepo, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// Migration 20261208: hiding a comment — real PostgreSQL, the production schema, the real migration files in order (comment boundary 20260928c, reports 20261001b, moderation 20261001d, then this one).

const MIG_C = readRepo('supabase/migrations/20260928c_review_comments_publication_boundary.sql')
const MIG_B = readRepo('supabase/migrations/20261001b_user_reports.sql')
const MIG_D = readRepo('supabase/migrations/20261001d_moderation_standards.sql')
const MIG = readRepo('supabase/migrations/20261208_comment_hiding.sql')
const ROLLBACK = readRepo('supabase/migrations/rollback/20261208_comment_hiding_rollback.sql')

const MOD = '66666666-6666-4666-8666-666666666666'
const R = 'cccccccc-0000-4000-8000-000000000001'
const rid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

let t: BlocksDb
const svc = (sql: string, params?: unknown[]) => t.exec('service_role', sql, null, params)
const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await t.db.query(sql, params as never)).rows as T[]
const newComment = async () => (await q<{ id: string }>(`INSERT INTO public.review_comments (review_id, user_id, body) VALUES ('${R}','${BOB}','một bình luận') RETURNING id`))[0].id
const report = (comment: string, n: number, reason: string) =>
  svc(`INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${rid(n)}','comment','${comment}','${reason}')`)
const hidden = async (id: string) => (await q<{ hidden_at: string | null; hidden_by: string | null }>(`SELECT hidden_at, hidden_by FROM public.review_comments WHERE id='${id}'`))[0]
const held = (id: string) => q<{ status: string; priority: number; auto: string | null }>(`SELECT status::text, priority, metadata->>'auto_hold' AS auto FROM public.moderation_queue WHERE target_id='${id}' AND status='in_review'`)
const seenBy = async (role: 'anon' | 'authenticated', sub: string | null, id: string) => (await t.rows(role, `SELECT id FROM public.review_comments WHERE id='${id}'`, sub)).length

beforeAll(async () => {
  t = await startBlocksDb(54916, 'commenthiding', [])
  await t.db.query(`INSERT INTO auth.users (id, is_anonymous) VALUES ('${MOD}', false)`)
  await t.db.query(`INSERT INTO auth.users (id, is_anonymous) SELECT ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, false FROM generate_series(1, 8) g`)
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB, CAROL, MOD]) await t.db.query(`INSERT INTO public.profiles (id, username) VALUES ($1, $2)`, [id, id.slice(0, 5)])
  await t.db.query(`INSERT INTO public.profiles (id, username) SELECT id, 'rep' || row_number() OVER () FROM auth.users WHERE id::text LIKE '00000000-0000-4000-8000-%'`)
  await t.db.query(`INSERT INTO public.reviews (id, user_id, place_id, place_name, publication_state) VALUES ($1,$2,'p','Phở A','PUBLISHED')`, [R, ALICE])
  await t.db.query(MIG_C)
  await t.db.query(MIG_B)
  await t.db.query(MIG_D)
  await t.db.query(`INSERT INTO public.platform_owner (user_id, active, assigned_by) VALUES ('${MOD}', true, '${MOD}')`)
  await t.db.query(MIG)
}, 300_000)
afterAll(async () => { await t?.stop() })

describe('who can read a hidden comment', () => {
  it('everyone sees a normal comment; once hidden, only its author, the owner of the post and a moderator do', async () => {
    const c = await newComment()
    for (const [role, sub] of [['anon', null], ['authenticated', CAROL], ['authenticated', BOB], ['authenticated', ALICE]] as const) expect(await seenBy(role, sub, c)).toBe(1)
    await svc(`UPDATE public.review_comments SET hidden_at = now(), hidden_by = 'owner' WHERE id = '${c}'`)
    expect(await seenBy('anon', null, c)).toBe(0)
    expect(await seenBy('authenticated', CAROL, c)).toBe(0)       // a stranger
    expect(await seenBy('authenticated', BOB, c)).toBe(1)         // its author
    expect(await seenBy('authenticated', ALICE, c)).toBe(1)       // the owner of the post
    expect(await seenBy('authenticated', MOD, c)).toBe(1)         // a moderator
  })
  it('hidden_by accepts only owner, auto, moderator', async () => {
    const c = await newComment()
    expect(await svc(`UPDATE public.review_comments SET hidden_at = now(), hidden_by = 'someone' WHERE id = '${c}'`)).not.toBeNull()
  })
})

describe('auto-hide on reports of a comment', () => {
  it('a severe reason hides the comment at the THIRD different reporter, marks one queue row as the system hold, and the comment is not deleted', async () => {
    const c = await newComment()
    await report(c, 1, 'violence'); await report(c, 2, 'hate')
    expect((await hidden(c)).hidden_at).toBeNull()
    await report(c, 3, 'sexual')
    expect(await hidden(c)).toMatchObject({ hidden_by: 'auto' })
    expect((await hidden(c)).hidden_at).not.toBeNull()
    expect(await held(c)).toEqual([{ status: 'in_review', priority: 3, auto: 'true' }])
    expect(await seenBy('authenticated', CAROL, c)).toBe(0)
  })
  it('harassment needs FIVE; scam, spam, copyright, misinformation and other never hide a comment', async () => {
    const h = await newComment()
    for (let i = 1; i <= 4; i++) await report(h, i, 'harassment')
    expect((await hidden(h)).hidden_at).toBeNull()
    await report(h, 5, 'harassment')
    expect((await hidden(h)).hidden_by).toBe('auto')
    const never = await newComment()
    const reasons = ['scam', 'spam', 'copyright', 'misinformation', 'other']
    for (let i = 0; i < reasons.length; i++) await report(never, i + 1, reasons[i])
    for (let i = 6; i <= 8; i++) await report(never, i, 'spam')
    expect((await hidden(never)).hidden_at).toBeNull()
  })
  it('reports from before a "no violation" verdict do not count again', async () => {
    const c = await newComment()
    for (let i = 1; i <= 3; i++) await report(c, i, 'violence')
    expect((await hidden(c)).hidden_by).toBe('auto')
    // the moderator clears it (what the decide route does): the hold row is dismissed, the comment shown again
    await svc(`UPDATE public.moderation_queue SET status = 'dismissed', resolved_at = now() WHERE target_id = '${c}' AND status = 'in_review'`)
    await svc(`UPDATE public.review_comments SET hidden_at = NULL, hidden_by = NULL WHERE id = '${c}'`)
    await svc(`UPDATE public.user_reports SET created_at = now() - interval '1 hour' WHERE target_id = '${c}'`)
    await report(c, 4, 'violence'); await report(c, 5, 'violence')
    expect((await hidden(c)).hidden_at).toBeNull()
    await report(c, 6, 'violence')
    expect((await hidden(c)).hidden_by).toBe('auto')
  })
  it('a report of a USER never touches comments, and no client role can call the trigger function', async () => {
    for (let i = 1; i <= 4; i++) await svc(`INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${rid(i)}','user','${CAROL}','violence')`)
    expect(Number((await q<{ n: string }>(`SELECT count(*) n FROM public.review_comments WHERE hidden_at IS NOT NULL AND user_id = '${CAROL}'`))[0].n)).toBe(0)
    const p = (await q<{ anon: boolean; authenticated: boolean }>(`SELECT has_function_privilege('anon','public.user_report_comment_auto_hold()','EXECUTE') AS anon, has_function_privilege('authenticated','public.user_report_comment_auto_hold()','EXECUTE') AS authenticated`))[0]
    expect(p).toEqual({ anon: false, authenticated: false })
  })
})

describe('rollback', () => {
  it('removes the trigger, the policy and the columns (comments become readable again)', async () => {
    await t.db.query(ROLLBACK)
    expect((await q(`SELECT 1 FROM pg_trigger WHERE tgname = 'user_report_zz_comment_auto_hold' AND NOT tgisinternal`)).length).toBe(0)
    expect((await q(`SELECT 1 FROM information_schema.columns WHERE table_name = 'review_comments' AND column_name IN ('hidden_at','hidden_by')`)).length).toBe(0)
    expect((await q(`SELECT 1 FROM pg_policies WHERE policyname = 'review_comments_hidden_boundary'`)).length).toBe(0)
  })
})
