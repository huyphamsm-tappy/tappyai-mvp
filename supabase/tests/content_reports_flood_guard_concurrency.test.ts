import { createHash } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { BOB, CAROL, ALICE, loadProdSchema, readRepo, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// 20261010 under concurrency, with REAL concurrent connections (a count-then-insert guard is only as good as its behaviour when two reports arrive at once).
//   A  the first version of the guard (no lock) — kept here as the documented counter-example: three transactions that each see 9 reports all pass.
//   B  the shipped guard: concurrent reports from ONE reporter are serialized (transaction-level advisory lock), so the second waits for the first
//      and then sees it; the ceiling holds exactly. Other reporters are not blocked.

const M_0930 = readRepo('supabase/migrations/20260930_content_reports_insert_check.sql')
const M_1010 = readRepo('supabase/migrations/20261010_content_reports_flood_guard.sql')
const DB = 'floodguardconc'
const source = (uid: string) => createHash('sha256').update(`content_report:${uid}`).digest('hex')
const post = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`
const POSTS = 40
const UNLOCKED = `
  CREATE OR REPLACE FUNCTION public.content_report_flood_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DECLARE v_recent integer;
  BEGIN
    SELECT count(*) INTO v_recent FROM public.content_reports c WHERE c.reporter_source_id = NEW.reporter_source_id AND c.created_at > now() - interval '10 minutes';
    IF v_recent >= 10 THEN RAISE EXCEPTION 'report_rate_limited' USING ERRCODE = '53400'; END IF;
    RETURN NEW;
  END $$;`

let t: BlocksDb
const opened: Client[] = []

/** A separate connection acting as `sub` (authenticated role, JWT claims set), like one PostgREST request. */
async function connect(sub: string): Promise<Client> {
  const c = t.pg.getPgClient(DB) as unknown as Client
  await c.connect()
  opened.push(c)
  await c.query('SET ROLE authenticated')
  await c.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub])
  await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub, is_anonymous: false })])
  return c
}
const insert = (c: Client, n: number, sub: string) =>
  c.query(`INSERT INTO public.content_reports (content_id, reporter_source_id, reason) VALUES ($1, $2, 'spam')`, [post(n), source(sub)])
const rows = async (sub: string) => Number(((await t.db.query(`SELECT count(*) n FROM public.content_reports WHERE reporter_source_id = $1`, [source(sub)])).rows[0] as { n: string }).n)
const reset = async (sub: string, seeded: number) => {
  await t.db.query(`DELETE FROM public.content_reports WHERE reporter_source_id = $1`, [source(sub)])
  for (let i = 1; i <= seeded; i++) await t.db.query(`INSERT INTO public.content_reports (content_id, reporter_source_id, reason) VALUES ($1, $2, 'spam')`, [post(i), source(sub)])
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeAll(async () => {
  t = await startBlocksDb(54914, DB, [])
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB, CAROL]) await t.db.query(`INSERT INTO public.profiles (id, username) VALUES ($1, $2)`, [id, id.slice(0, 5)])
  for (let i = 1; i <= POSTS; i++) await t.db.query(`INSERT INTO public.reviews (id, user_id, place_id, place_name) VALUES ($1, $2, 'p', $3)`, [post(i), CAROL, `Phở ${i}`])
  await t.db.query(M_0930)
  await t.db.query(M_1010)
}, 300_000)
// a failing assertion must not leave a transaction (and its lock) open for the next test
afterEach(async () => { for (const c of opened) await c.query('ROLLBACK').catch(() => {}) })
afterAll(async () => {
  for (const c of opened) await c.end().catch(() => {})
  await t?.stop()
})

describe('A — the first version (no lock): the race is real', () => {
  it('three transactions that each saw 9 reports all pass: 12 reports, past the ceiling of 10', async () => {
    await t.db.query(UNLOCKED)
    await reset(BOB, 9)
    const cs = await Promise.all([connect(BOB), connect(BOB), connect(BOB)])
    for (const c of cs) await c.query('BEGIN')
    for (const [i, c] of cs.entries()) await insert(c, 10 + i, BOB)      // none blocks: each counted 9 committed rows
    for (const c of cs) await c.query('COMMIT')
    expect(await rows(BOB)).toBe(12)
  })
})

describe('B — the shipped guard (per-reporter advisory lock)', () => {
  it('the second report waits for the first, then sees it: the ceiling holds exactly', async () => {
    await t.db.query(M_1010)                                              // installs the shipped function over the counter-example
    await reset(BOB, 9)
    const [c1, c2] = await Promise.all([connect(BOB), connect(BOB)])
    await c1.query('BEGIN'); await insert(c1, 10, BOB)                    // 10th report, uncommitted: holds the reporter's lock
    await c2.query('BEGIN')
    const second = insert(c2, 11, BOB).then(() => 'inserted', (e: { code?: string }) => e.code ?? 'error')
    expect(await Promise.race([second, sleep(500).then(() => 'still waiting')])).toBe('still waiting')   // blocked behind c1, not racing past it
    await c1.query('COMMIT')
    expect(await second).toBe('53400')                                    // after c1 commits it counts 10 and refuses
    await c2.query('ROLLBACK')
    expect(await rows(BOB)).toBe(10)
  })

  it('a burst of 25 simultaneous reports from one reporter ends at exactly 10, the rest refused with 53400', async () => {
    await reset(BOB, 0)
    const results = await Promise.all(Array.from({ length: 25 }, async (_, i) => {
      const c = await connect(BOB)
      return insert(c, 1 + i, BOB).then(() => 'ok', (e: { code?: string }) => e.code ?? 'error')
    }))
    expect(results.filter((r) => r === 'ok')).toHaveLength(10)
    expect(results.filter((r) => r !== 'ok').every((r) => r === '53400')).toBe(true)
    expect(await rows(BOB)).toBe(10)
  })

  it('another reporter is not blocked behind a waiting one', async () => {
    await reset(BOB, 9); await reset(ALICE, 0)
    const [b1, a1] = await Promise.all([connect(BOB), connect(ALICE)])
    await b1.query('BEGIN'); await insert(b1, 10, BOB)                    // BOB holds his lock, uncommitted
    const started = Date.now()
    await insert(a1, 1, ALICE)                                           // ALICE must go straight through
    expect(Date.now() - started).toBeLessThan(400)
    await b1.query('COMMIT')
  })
})
