import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, loadProdSchema, readRepo, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// 20261001 on the hot tables — HOW PostgreSQL executes the policies (EXPLAIN on a real PostgreSQL, production baseline schema, small data).
// What this proves: which tables get a policy, what each filters on, that the block set is computed ONCE per statement (an InitPlan, not per row),
// and that the two block lookups can use their indexes. What it does NOT prove: latency, lock waits or behaviour at production size/load —
// those are NOT measured here. (Synthetic 300k-row timings from the security session are in docs/security/USER-BLOCKS-MEASURE.json.)

const MIG = readRepo('supabase/migrations/20261001_user_blocks.sql')
let t: BlocksDb

const plan = async (sql: string, sub = ALICE) => (await t.rows<Record<string, string>>('authenticated', `EXPLAIN (COSTS OFF) ${sql}`, sub)).map((r) => Object.values(r)[0]).join('\n')

beforeAll(async () => {
  t = await startBlocksDb(54913, 'blocksplan', [])
  await loadProdSchema(t.db)
  await t.db.query(MIG)
}, 300_000)
afterAll(async () => { await t?.stop() })

describe('which policies the migration puts on the existing tables', () => {
  it('seven new policies on five hot tables, six of them RESTRICTIVE (AND-ed with everything already there), plus the owner-can-delete-comments one', async () => {
    const rows = await t.db.query(`SELECT tablename, policyname, cmd, permissive FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'user_blocks_%' AND tablename <> 'user_blocks' ORDER BY 1, 2`)
    expect(rows.rows.map((r: Record<string, string>) => `${r.tablename}.${r.policyname}.${r.cmd}.${r.permissive}`)).toEqual([
      'notifications.user_blocks_notifications_select.SELECT.RESTRICTIVE',
      'review_comments.user_blocks_comments_delete_by_review_owner.DELETE.PERMISSIVE',
      'review_comments.user_blocks_comments_insert.INSERT.RESTRICTIVE',
      'review_comments.user_blocks_comments_select.SELECT.RESTRICTIVE',
      'review_likes.user_blocks_likes_insert.INSERT.RESTRICTIVE',
      'reviews.user_blocks_reviews_select.SELECT.RESTRICTIVE',
      'user_follows.user_blocks_follows_insert.INSERT.RESTRICTIVE',
    ])
  })
})

describe('how PostgreSQL executes them', () => {
  it('reads of reviews, comments and notifications evaluate the block set ONCE per statement (an InitPlan), then filter each row against that array', async () => {
    for (const [table, column] of [['reviews', 'user_id'], ['review_comments', 'user_id'], ['notifications', 'actor_id']] as const) {
      const p = await plan(`SELECT * FROM public.${table}`)
      expect(p, table).toMatch(/InitPlan/)
      // PostgreSQL rewrites NOT (x = ANY (arr)) as x <> ALL (arr); the array is the InitPlan's single result
      expect(p, table).toContain(`${column} <> ALL ((InitPlan 1).col1)`)
    }
  })

  it('a point read of one review by id still uses the primary key (the policy adds a filter, not a scan)', async () => {
    await t.db.query('SET enable_seqscan = off')
    const p = await plan(`SELECT * FROM public.reviews WHERE id = '00000000-0000-4000-8000-000000000001'`)
    await t.db.query('RESET enable_seqscan')
    expect(p).toMatch(/reviews_pkey|Index Scan/)
  })

  it('both directions of the block lookup can use an index (primary key for "I blocked", blocked_id index for "blocked me")', async () => {
    await t.db.query('SET enable_seqscan = off')
    const mine = (await t.db.query(`EXPLAIN (COSTS OFF) SELECT blocked_id FROM public.user_blocks WHERE blocker_id = '${ALICE}'`)).rows.map((r: Record<string, string>) => Object.values(r)[0]).join('\n')
    const theirs = (await t.db.query(`EXPLAIN (COSTS OFF) SELECT blocker_id FROM public.user_blocks WHERE blocked_id = '${ALICE}'`)).rows.map((r: Record<string, string>) => Object.values(r)[0]).join('\n')
    await t.db.query('RESET enable_seqscan')
    expect(mine).toMatch(/user_blocks_pkey/)
    expect(theirs).toMatch(/user_blocks_blocked_idx/)
  })

  it('no policy applies to anon or service_role (public pages and the server\'s own reads are untouched)', async () => {
    const rows = await t.db.query(`SELECT DISTINCT roles::text AS r FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'user_blocks_%'`)
    expect(rows.rows.map((r: Record<string, string>) => r.r)).toEqual(['{authenticated}'])
  })
})
