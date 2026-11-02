import { afterAll, beforeAll, describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadProdSchema, readRepo, REPO, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// MEASUREMENT, not an assertion suite: EXPLAIN ANALYZE of the feed-shaped reads on `reviews` / `review_comments`
// BEFORE the migration, WITH it (the InitPlan array policy that ships), and with a per-row-function variant for comparison.
// Run:  BLOCKS_MEASURE=1 npx vitest run supabase/tests/user_blocks.measure.test.ts --project db
// Writes docs/security/USER-BLOCKS-MEASURE.json. Skipped in every normal run.

const ON = process.env.BLOCKS_MEASURE === '1'
const MIGRATION = readRepo('supabase/migrations/20261001_user_blocks.sql')
const N_USERS = Number(process.env.MEASURE_USERS ?? 3000)
const N_REVIEWS = Number(process.env.MEASURE_REVIEWS ?? 300000)
const N_COMMENTS = Number(process.env.MEASURE_COMMENTS ?? 600000)
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const NO_BLOCKS = uid(1) // blocks nobody
const FEW_BLOCKS = uid(2) // blocks 5 people, blocked by 5
const MANY_BLOCKS = uid(3) // blocks 100, blocked by 100

let t: BlocksDb
const ms = (plan: string) => Number(/Execution Time: ([\d.]+) ms/.exec(plan)?.[1] ?? NaN)

async function time(sub: string, sql: string, runs = 7): Promise<{ median: number; min: number; plan: string }> {
  await t.db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub])
  await t.db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub, is_anonymous: false })])
  await t.db.query('SET ROLE authenticated')
  const times: number[] = []
  let plan = ''
  try {
    for (let i = 0; i < runs; i++) {
      const r = await t.db.query(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`)
      plan = r.rows.map((x: Record<string, string>) => x['QUERY PLAN']).join('\n')
      times.push(ms(plan))
    }
  } finally { await t.db.query('RESET ROLE') }
  times.sort((a, b) => a - b)
  return { median: times[Math.floor(times.length / 2)], min: times[0], plan }
}

const QUERIES: Record<string, (sub: string, ids: string[]) => string> = {
  explore_pool_200: () => `SELECT id, created_at, like_count FROM public.reviews WHERE (is_hidden IS NULL OR is_hidden = false) AND (publication_state IS NULL OR publication_state = 'PUBLISHED') ORDER BY created_at DESC LIMIT 200`,
  latest_page_20: () => `SELECT id, created_at, place_name FROM public.reviews WHERE (is_hidden IS NULL OR is_hidden = false) AND (publication_state IS NULL OR publication_state = 'PUBLISHED') ORDER BY created_at DESC LIMIT 20 OFFSET 40`,
  following_feed_20: (_s, ids) => `SELECT id, created_at, place_name FROM public.reviews WHERE user_id IN (${ids.map((i) => `'${i}'`).join(',')}) AND (is_hidden IS NULL OR is_hidden = false) ORDER BY created_at DESC LIMIT 20`,
  profile_grid_30: () => `SELECT id, created_at, place_name FROM public.reviews WHERE user_id = '${uid(500)}' ORDER BY created_at DESC LIMIT 30`,
  comments_of_one_review_50: () => `SELECT id, body, user_id FROM public.review_comments WHERE review_id = (SELECT id FROM public.reviews WHERE user_id = '${uid(777)}' LIMIT 1) ORDER BY created_at LIMIT 50`,
  my_notifications_50: (sub) => `SELECT id, title FROM public.notifications WHERE user_id = '${sub}' ORDER BY created_at DESC LIMIT 50`,
}

describe.skipIf(!ON)('user blocks — query cost (measurement)', () => {
  beforeAll(async () => {
    t = await startBlocksDb(54902, 'blocksmeasure', [])
    await t.db.query(`INSERT INTO auth.users (id, is_anonymous) SELECT ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, false FROM generate_series(1, ${N_USERS}) g ON CONFLICT DO NOTHING`)
    await loadProdSchema(t.db)
    await t.db.query(`INSERT INTO public.profiles (id, username) SELECT ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'u' || g FROM generate_series(1, ${N_USERS}) g ON CONFLICT DO NOTHING`)
    await t.db.query(`INSERT INTO public.reviews (id, user_id, place_id, place_name, created_at, like_count, publication_state)
      SELECT gen_random_uuid(), ('00000000-0000-4000-8000-' || lpad((1 + (random() * ${N_USERS - 1})::int)::text, 12, '0'))::uuid, 'p', 'place ' || g,
             now() - (g * interval '20 seconds'), (random() * 50)::int, CASE WHEN random() < 0.03 THEN 'UNDER_REVIEW' ELSE 'PUBLISHED' END
        FROM generate_series(1, ${N_REVIEWS}) g`)
    await t.db.query(`INSERT INTO public.review_comments (review_id, user_id, body, created_at)
      SELECT r.id, ('00000000-0000-4000-8000-' || lpad((1 + (random() * ${N_USERS - 1})::int)::text, 12, '0'))::uuid, 'c', now() - (random() * interval '30 days')
        FROM (SELECT id FROM public.reviews ORDER BY random() LIMIT ${Math.floor(N_COMMENTS / 3)}) r, generate_series(1, 3)`)
    await t.db.query(`INSERT INTO public.notifications (user_id, type, category, title, body, actor_id)
      SELECT ('00000000-0000-4000-8000-' || lpad((1 + (random() * 50)::int)::text, 12, '0'))::uuid, 'like', 'social', 't', 'b', ('00000000-0000-4000-8000-' || lpad((1 + (random() * ${N_USERS - 1})::int)::text, 12, '0'))::uuid FROM generate_series(1, 100000)`)
    await t.db.query('ANALYZE')
  }, 900_000)
  afterAll(async () => { await t?.stop() })

  it('measures', async () => {
    const result: Record<string, unknown> = { data: { users: N_USERS, reviews: N_REVIEWS, comments: N_COMMENTS, notifications: 100000 }, at: new Date().toISOString() }
    const followIds = Array.from({ length: 200 }, (_, i) => uid(10 + i))
    const profiles: Array<[string, string]> = [['no_blocks', NO_BLOCKS], ['few_blocks_10', FEW_BLOCKS], ['many_blocks_200', MANY_BLOCKS]]
    const run = async (label: string) => {
      const out: Record<string, Record<string, number>> = {}
      for (const [pname, sub] of profiles) {
        out[pname] = {}
        for (const [q, mk] of Object.entries(QUERIES)) out[pname][q] = (await time(sub, mk(sub, followIds))).median
      }
      result[label] = out
    }
    await run('1_before_migration')
    await t.db.query(MIGRATION)
    // block rows: FEW = 5 + 5, MANY = 100 + 100 (both tables, like the API writes them)
    const blockSql = (who: string, n: number) => `
      INSERT INTO public.user_blocks (blocker_id, blocked_id) SELECT '${who}', ('00000000-0000-4000-8000-' || lpad((100 + g)::text, 12, '0'))::uuid FROM generate_series(1, ${n}) g ON CONFLICT DO NOTHING;
      INSERT INTO public.chat_blocks (blocker_id, blocked_id) SELECT '${who}', ('00000000-0000-4000-8000-' || lpad((100 + g)::text, 12, '0'))::uuid FROM generate_series(1, ${n}) g ON CONFLICT DO NOTHING;
      INSERT INTO public.user_blocks (blocker_id, blocked_id) SELECT ('00000000-0000-4000-8000-' || lpad((300 + g)::text, 12, '0'))::uuid, '${who}' FROM generate_series(1, ${n}) g ON CONFLICT DO NOTHING;`
    await t.db.query(blockSql(FEW_BLOCKS, 5)); await t.db.query(blockSql(MANY_BLOCKS, 100)); await t.db.query('ANALYZE')
    await run('2_with_migration_initplan_array')

    // The alternative measured for comparison: a per-row function call instead of the once-per-statement array.
    await t.db.query(`
      CREATE OR REPLACE FUNCTION safety_private.is_blocked_one(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
        SELECT p = ANY (safety_private.blocked_ids()) $$;
      GRANT EXECUTE ON FUNCTION safety_private.is_blocked_one(uuid) TO authenticated;
      DROP POLICY user_blocks_reviews_select ON public.reviews;
      CREATE POLICY user_blocks_reviews_select ON public.reviews AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT safety_private.is_blocked_one(user_id));
      DROP POLICY user_blocks_comments_select ON public.review_comments;
      CREATE POLICY user_blocks_comments_select ON public.review_comments AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT safety_private.is_blocked_one(user_id));`)
    await run('3_alternative_per_row_function')
    result.plans = {
      initplan_explore_many: (await (async () => { await t.db.query(MIGRATION); return time(MANY_BLOCKS, QUERIES.explore_pool_200(MANY_BLOCKS, followIds), 1) })()).plan,
    }
    writeFileSync(join(REPO, 'docs', 'security', 'USER-BLOCKS-MEASURE.json'), JSON.stringify(result, null, 1))
    console.log(JSON.stringify(result, null, 1))
  }, 900_000)
})
