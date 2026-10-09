import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadProdSchema, readRepo, startP8Db, type P8Db } from './p8Harness'

// PHASE 8 / Task 02 — the cost indexes apply on the prod schema, are used by the hot queries, and roll back.

const MIGRATION = readRepo('supabase/migrations/20261005_p8_cost_indexes.sql')
const ROLLBACK = readRepo('supabase/migrations/rollback/20261005_p8_cost_indexes_rollback.sql')
const NAMES = ['reviews_place_created_idx', 'reviews_user_created_idx', 'conversations_user_updated_idx']

let t: P8Db
beforeAll(async () => {
  t = await startP8Db(54836, 'p8costindexes', [])
  await loadProdSchema(t.db)
}, 240_000)
afterAll(async () => { await t?.stop() })

const present = async () =>
  (await t.db.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)`, [[...NAMES, 'chat_messages_attachment_idx']])).rows
    .map((r: { indexname: string }) => r.indexname).sort()

const plan = async (sql: string) => {
  await t.db.query('SET enable_seqscan = off')
  const rows = (await t.db.query(`EXPLAIN ${sql}`)).rows as { 'QUERY PLAN': string }[]
  await t.db.query('RESET enable_seqscan')
  return rows.map((r) => r['QUERY PLAN']).join('\n')
}

describe('cost indexes', () => {
  it('apply cleanly (twice — idempotent); the Task 06 column is optional', async () => {
    await t.db.query(MIGRATION)
    await t.db.query(MIGRATION)
    expect(await present()).toEqual([...NAMES].sort())
  })
  it('the hot queries can use them', async () => {
    expect(await plan(`SELECT id FROM public.reviews WHERE place_id = 'p' ORDER BY created_at DESC LIMIT 50`)).toContain('reviews_place_created_idx')
    expect(await plan(`SELECT id FROM public.conversations WHERE user_id = '11111111-1111-4111-8111-111111111111' ORDER BY updated_at DESC LIMIT 20`)).toContain('conversations_user_updated_idx')
  })
  it('chat_messages.attachment_id is indexed once that column exists', async () => {
    await t.db.query(`ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS attachment_id uuid`)
    await t.db.query(MIGRATION)
    expect(await present()).toContain('chat_messages_attachment_idx')
  })
  it('rollback drops all four', async () => {
    await t.db.query(ROLLBACK)
    expect(await present()).toEqual([])
  })
})
