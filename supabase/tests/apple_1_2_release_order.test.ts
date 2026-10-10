import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadProdSchema, readRepo, startBlocksDb, type BlocksDb } from './userBlocksHarness'

// App Review 1.2 release order, on a real PostgreSQL with the production baseline schema:
//   apply 20260930 → 20261001 → 20261001b → 20261001d → 20261009 → 20261010 (the minimal set the 10/10 production probe showed missing, plus the flood guard),
//   run the ACTUAL read-only probes from the repo against it, then roll back in reverse and require the schema to return to where it started.
// 20261001e (banned identities, triggers on auth.users) is deliberately NOT in this set: no application code uses it.

const FILES = ['20260930_content_reports_insert_check', '20261001_user_blocks', '20261001b_user_reports', '20261001d_moderation_standards', '20261009_content_reports_to_queue', '20261010_content_reports_flood_guard']
const apply = (name: string) => readRepo(`supabase/migrations/${name}.sql`)
const undo = (name: string) => readRepo(`supabase/migrations/rollback/${name}_rollback.sql`)
/** The statement of a probe file: its non-comment lines. */
const statement = (path: string) => readRepo(path).split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
const PROBE_1 = statement('scripts/release/sql/apple-1-2-probe-editor.sql')
const PROBE_2 = statement('scripts/release/sql/apple-1-2-probe-editor-2.sql')

const FINGERPRINT = `
  SELECT jsonb_build_object(
    'tables', (SELECT jsonb_agg(n.nspname || '.' || c.relname ORDER BY n.nspname, c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname IN ('public', 'safety_private') AND c.relkind IN ('r', 'p')),
    'policies', (SELECT jsonb_agg(tablename || '.' || policyname || '.' || cmd || '.' || permissive || '.' || md5(coalesce(qual, '') || '|' || coalesce(with_check, ''))
                ORDER BY tablename, policyname) FROM pg_policies WHERE schemaname = 'public'),
    'triggers', (SELECT jsonb_agg(tgname || '@' || tgrelid::regclass::text ORDER BY tgname, tgrelid::regclass::text) FROM pg_trigger WHERE NOT tgisinternal),
    'functions', (SELECT jsonb_agg(n.nspname || '.' || p.proname ORDER BY n.nspname, p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname IN ('public', 'safety_private')),
    'schemas', (SELECT coalesce(jsonb_agg(nspname), '[]'::jsonb) FROM pg_namespace WHERE nspname = 'safety_private'),
    'indexes', (SELECT jsonb_agg(indexname ORDER BY indexname) FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('content_reports', 'moderation_queue', 'user_reports')),
    'constraints', (SELECT jsonb_agg(conrelid::regclass::text || '.' || conname || '.' || convalidated::text ORDER BY conrelid::regclass::text, conname) FROM pg_constraint WHERE connamespace = 'public'::regnamespace),
    'content_reports_grants', (SELECT jsonb_agg(grantee || ':' || privilege_type ORDER BY grantee, privilege_type) FROM information_schema.role_table_grants
                                WHERE table_schema = 'public' AND table_name = 'content_reports')
  ) AS fp`

let t: BlocksDb
const q = async <T = Record<string, unknown>>(sql: string) => (await t.db.query(sql)).rows as T[]
const fingerprint = async () => (await q<{ fp: unknown }>(FINGERPRINT))[0].fp
const probe = async (sql: string) => JSON.parse(Object.values((await q<Record<string, string>>(sql))[0])[0])

let before: unknown

beforeAll(async () => {
  t = await startBlocksDb(54911, 'releaseorder', [])
  await loadProdSchema(t.db)
  before = await fingerprint()
}, 300_000)
afterAll(async () => { await t?.stop() })

describe('the minimal release set, in order', () => {
  it('starts like production did on 10/10: no blocks, no user reports, no ledger, no post-report trigger, insert policy still WITH CHECK (true)', async () => {
    const p = await probe(PROBE_1)
    expect(p.tables).toMatchObject({ content_reports: true, moderation_queue: true, moderation_actions: true, user_blocks: false, user_reports: false, moderation_decisions: false })
    expect(p.block_policy_count).toBe(0)
    expect(p.triggers).toEqual([])
    expect(p.functions).toMatchObject({ blocked_ids: false, user_report_to_queue: false, content_report_to_queue_20261009: false })
    const c = await probe(`SELECT jsonb_pretty(jsonb_build_object('applied', coalesce(bool_or(with_check LIKE '%content_report:%'), false), 'still_true', coalesce(bool_or(with_check = 'true'), false))) AS p
                           FROM pg_policies WHERE schemaname = 'public' AND tablename = 'content_reports' AND policyname = 'Users can file a content report'`)
    expect(c).toEqual({ applied: false, still_true: true })
  })

  it('applies cleanly in order, each file in its own transaction', async () => {
    for (const f of FILES) await t.db.query(apply(f))
  })

  it('the production probes now report the full chain (the same SQL the owner runs in the dashboard)', async () => {
    const p = await probe(PROBE_1)
    expect(Object.entries(p.tables as Record<string, boolean>).filter(([k]) => k !== 'banned_identities').every(([, v]) => v)).toBe(true)
    expect(p.tables.banned_identities).toBe(false)            // 20261001e is not part of the set
    expect(p.block_policy_count).toBe(10)
    expect(p.functions).toEqual({ blocked_ids: true, review_author_blocked: true, user_report_to_queue: true, fn_ingest_moderation_reports: true, content_report_to_queue_20261009: true })
    expect(p.triggers).toEqual(['content_report_to_queue', 'moderation_appeals_guard', 'moderation_decisions_guard', 'user_report_to_queue'])
    const p2 = await probe(PROBE_2)
    expect(Object.values(p2.prerequisite_tables as Record<string, boolean>).every(Boolean)).toBe(true)
    expect(p2.content_reports_policies).toEqual(['Users can file a content report : INSERT'])
  })

  it('20260930 is applied: the insert policy now pins the reporter', async () => {
    const c = await probe(`SELECT jsonb_pretty(jsonb_build_object('applied', coalesce(bool_or(with_check LIKE '%content_report:%'), false), 'still_true', coalesce(bool_or(with_check = 'true'), false))) AS p
                           FROM pg_policies WHERE schemaname = 'public' AND tablename = 'content_reports' AND policyname = 'Users can file a content report'`)
    expect(c).toEqual({ applied: true, still_true: false })
  })

  it('rolls back in reverse order and the schema is exactly what it was before', async () => {
    for (const f of [...FILES].reverse()) await t.db.query(undo(f))
    expect(await fingerprint()).toEqual(before)
  })

  it('and the set can be applied again (rollback leaves nothing behind)', async () => {
    for (const f of FILES) await t.db.query(apply(f))
    expect((await probe(PROBE_1)).block_policy_count).toBe(10)
  })
})
