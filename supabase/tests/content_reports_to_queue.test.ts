import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, BOB, loadProdSchema, readRepo, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// Migration 20261009: a report about a post reaches the moderation queue when it is filed, with a priority — real PostgreSQL, the
// production schema, the real migration file. The daily ingest stays as a backstop and must not duplicate what the trigger queued.

const MIG = readRepo('supabase/migrations/20261009_content_reports_to_queue.sql')
const ROLLBACK = readRepo('supabase/migrations/rollback/20261009_content_reports_to_queue_rollback.sql')
const R = 'aaaaaaaa-0000-4000-8000-0000000000a1'

let t: BlocksDb
const svc = (sql: string, params?: unknown[]) => t.exec('service_role', sql, null, params)
const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await t.db.query(sql, params as never)).rows as T[]
const file = (reason: string, source: string) =>
  svc(`INSERT INTO public.content_reports (content_id, reporter_source_id, reason) VALUES ('${R}', '${source}', '${reason}')`)
const queueRow = (reason: string) =>
  q<{ priority: number; status: string; type: string; target_type: string; reported_by: string | null }>(
    `SELECT priority, status, type::text AS type, target_type, reported_by::text AS reported_by FROM public.moderation_queue WHERE target_id = '${R}' AND reason = '${reason}'`)

beforeAll(async () => {
  t = await startBlocksDb(54910, 'contentreportqueue', [])
  await loadProdSchema(t.db)
  await t.db.query(`INSERT INTO public.profiles (id, username) VALUES ($1, 'alice'), ($2, 'bob')`, [ALICE, BOB])
  await t.db.query(`INSERT INTO public.reviews (id, user_id, place_id, place_name) VALUES ($1,$2,'p','Phở A')`, [R, ALICE])
  await t.db.query(MIG)
}, 300_000)
afterAll(async () => { await t?.stop() })

describe('a post report is queued at once, with a priority', () => {
  it('queues each reason with its severity: violence and inappropriate are urgent (3)', async () => {
    expect(await file('violence', 'src-1')).toBeNull()
    expect(await file('inappropriate', 'src-2')).toBeNull()
    for (const reason of ['violence', 'inappropriate']) {
      const rows = await queueRow(reason)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ priority: 3, status: 'pending', type: 'review_report', target_type: 'review', reported_by: null })
    }
  })

  it('harassment and misinformation are 2; spam, copyright and other are 1', async () => {
    for (const [i, [reason, p]] of ([['harassment', 2], ['misinformation', 2], ['spam', 1], ['copyright', 1], ['other', 1]] as const).entries()) {
      await file(reason, `src-b${i}`)
      expect((await queueRow(reason))[0].priority).toBe(p)
    }
  })

  it('keeps the reporter opaque (ADR-026): only the one-way source id is in the metadata', async () => {
    const [row] = await q<{ metadata: Record<string, string> }>(`SELECT metadata FROM public.moderation_queue WHERE target_id = '${R}' AND reason = 'violence'`)
    expect(row.metadata).toMatchObject({ source_table: 'content_reports', reporter_source_id: 'src-1' })
  })

  it('the daily ingest finds it already queued and adds nothing', async () => {
    const before = Number((await q<{ n: string }>(`SELECT count(*) n FROM public.moderation_queue WHERE target_id = '${R}'`))[0].n)
    await svc('SELECT public.fn_ingest_moderation_reports()')
    const after = Number((await q<{ n: string }>(`SELECT count(*) n FROM public.moderation_queue WHERE target_id = '${R}'`))[0].n)
    expect(after).toBe(before)
  })

  it('a repeat report (same source, content, reason) is refused by the table and queues nothing new', async () => {
    const before = Number((await q<{ n: string }>(`SELECT count(*) n FROM public.moderation_queue WHERE target_id = '${R}'`))[0].n)
    expect(await file('violence', 'src-1')).not.toBeNull()
    expect(Number((await q<{ n: string }>(`SELECT count(*) n FROM public.moderation_queue WHERE target_id = '${R}'`))[0].n)).toBe(before)
  })

  it('a report removes, hides and sanctions nothing', async () => {
    expect((await q<{ is_hidden: boolean | null }>(`SELECT is_hidden FROM public.reviews WHERE id = '${R}'`))[0].is_hidden).toBeFalsy()
  })

  it('no client role can call the trigger function', async () => {
    const rows = await q<{ anon: boolean; authenticated: boolean }>(
      `SELECT has_function_privilege('anon', 'public.content_report_to_queue()', 'EXECUTE') AS anon, has_function_privilege('authenticated', 'public.content_report_to_queue()', 'EXECUTE') AS authenticated`)
    expect(rows[0]).toEqual({ anon: false, authenticated: false })
  })

  it('rollback removes the trigger and keeps the rows already queued', async () => {
    const before = Number((await q<{ n: string }>(`SELECT count(*) n FROM public.moderation_queue WHERE target_id = '${R}'`))[0].n)
    await t.db.query(ROLLBACK)
    expect((await q(`SELECT 1 FROM pg_trigger WHERE tgname = 'content_report_to_queue' AND NOT tgisinternal`)).length).toBe(0)
    expect(Number((await q<{ n: string }>(`SELECT count(*) n FROM public.moderation_queue WHERE target_id = '${R}'`))[0].n)).toBe(before)
    await file('other', 'src-after-rollback')       // without the trigger a new report waits for the daily ingest
    expect(Number((await q<{ n: string }>(`SELECT count(*) n FROM public.moderation_queue WHERE target_id = '${R}'`))[0].n)).toBe(before)
  })
})
