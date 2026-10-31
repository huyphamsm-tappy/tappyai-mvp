import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, BOB, CAROL, loadProdSchema, readRepo, startP8Db, type P8Db } from './p8Harness'

// Owner 01/11/2026 - the Tappy (Promax) plan ids promax1m / promax3m. 20261102_plans_promax.sql widens every allowed plan list
// (subscriptions / entitlement_ledger / payment_orders CHECKs and p8_apply_entitlement) and changes nothing else.

const MIGRATION = readRepo('supabase/migrations/20261102_plans_promax.sql')
const ROLLBACK = readRepo('supabase/migrations/rollback/20261102_plans_promax_rollback.sql')
const P8_SUBSCRIPTIONS = readRepo('supabase/migrations/20261015_p8_subscriptions.sql')

let t: P8Db
beforeAll(async () => {
  t = await startP8Db(54852, 'plans_promax', [])
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB, CAROL]) await t.db.query(`INSERT INTO public.profiles (id) VALUES ($1) ON CONFLICT DO NOTHING`, [id])
  await t.db.query(readRepo('supabase/migrations/20260924_p8_subscriptions_plan_model.sql'))
  await t.db.query(readRepo('supabase/migrations/20261011_p8_payments.sql'))
  await t.db.query(P8_SUBSCRIPTIONS)
  await t.db.query(readRepo('supabase/migrations/20261016_p7_pip_one_time.sql'))
  await t.db.query(readRepo('supabase/migrations/20261017_p7_pip_trial_any_source.sql'))
}, 240_000)
afterAll(async () => { await t?.stop() })

let n = 0
const grant = (user: string, plan: string) =>
  t.exec('postgres', `SELECT public.p8_apply_entitlement('${user}', '${plan}', 'manual', 'promax-test-${++n}', 'stack', NULL, 2592000, NULL, NULL, '${ALICE}', 'uat grant')`)
const order = (user: string, plan: string, code: string) =>
  t.exec('postgres', `INSERT INTO public.payment_orders (user_id, plan, amount_vnd, duration_days, code, expires_at) VALUES ('${user}', '${plan}', 225000, 30, '${code}', now() + interval '15 minutes')`)
const planOf = async (user: string) => (await t.one<{ plan: string }>(`SELECT plan FROM public.subscriptions WHERE user_id = '${user}'`)).plan

describe('20261102_plans_promax', () => {
  it('before it: the database refuses the Tappy plans', async () => {
    expect(await grant(BOB, 'promax1m')).toBe('22023')
    expect(await order(BOB, 'promax3m', 'TAPPYAAAAA2')).toBe('23514')
  })

  it('the writer is the 20261015 function with only its plan list widened', () => {
    const fn = (sql: string) => sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.p8_apply_entitlement('), sql.indexOf('-- ── P8-7'))
    const before = fn(P8_SUBSCRIPTIONS).trimEnd()
    const after = MIGRATION.slice(MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public.p8_apply_entitlement(')).trimEnd()
    expect(after).toBe(before.replace("NOT IN ('pip', 'momo', 'coco', 'milo', 'sunny')", "NOT IN ('pip', 'momo', 'coco', 'milo', 'sunny', 'promax1m', 'promax3m')"))
    expect(ROLLBACK.slice(ROLLBACK.indexOf('CREATE OR REPLACE FUNCTION public.p8_apply_entitlement(')).trimEnd()).toBe(before)
  })

  it('after it: promax1m / promax3m are granted, ordered and stored; an unknown plan is still refused', async () => {
    await t.db.query(MIGRATION)
    expect(await grant(BOB, 'promax1m')).toBeNull()
    expect(await planOf(BOB)).toBe('promax1m')
    expect(await grant(CAROL, 'promax3m')).toBeNull()
    expect(await planOf(CAROL)).toBe('promax3m')
    expect(await order(BOB, 'promax3m', 'TAPPYAAAAA3')).toBeNull()
    expect(await grant(BOB, 'gold')).toBe('22023')
    expect(await order(BOB, 'gold', 'TAPPYAAAAA4')).toBe('23514')
    // (a direct UPDATE of subscriptions is skipped by the ledger guard trigger, so the CHECKs are read from the catalog)
    const checks = await t.rows('postgres', `SELECT conrelid::regclass::text AS t, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conname IN ('subscriptions_plan_check', 'entitlement_ledger_plan_check', 'payment_orders_plan_check') ORDER BY 1`)
    expect(checks.map((c) => c.t)).toEqual(['entitlement_ledger', 'payment_orders', 'subscriptions'])
    for (const c of checks) {
      expect(c.def).toContain("'promax1m'")
      expect(c.def).toContain("'promax3m'")
      expect(c.def).not.toContain("'gold'")
    }
  })

  it('the plans already sold keep working, and the writer stays service-role only', async () => {
    expect(await grant(ALICE, 'momo')).toBeNull()
    expect(await planOf(ALICE)).toBe('momo')
    expect(await t.exec('authenticated', `SELECT public.p8_apply_entitlement('${ALICE}', 'promax3m', 'web_sepay', 'x', 'stack', NULL, 999, NULL, NULL, NULL, NULL)`, ALICE)).toBe('42501')
    expect(await t.exec('anon', `SELECT public.p8_apply_entitlement('${ALICE}', 'promax3m', 'web_sepay', 'x', 'stack', NULL, 999, NULL, NULL, NULL, NULL)`)).toBe('42501')
  })

  it('rollback: new Tappy writes are refused again, the rows already written stay; it re-applies', async () => {
    await t.db.query(ROLLBACK)
    expect(await planOf(BOB)).toBe('promax1m')
    expect(await grant(ALICE, 'promax1m')).toBe('22023')
    expect(await order(ALICE, 'promax1m', 'TAPPYAAAAA5')).toBe('23514')
    await t.db.query(MIGRATION)
    expect(await grant(ALICE, 'promax1m')).toBeNull()
  })
})
