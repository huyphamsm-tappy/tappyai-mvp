import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, BOB, CAROL, loadProdSchema, readRepo, startP8Db, type P8Db } from './p8Harness'

// PHASE 8 / PAYMENTS — ledger, orders, SePay decision, the one entitlement writer; FULL prod schema.

const PLAN_MODEL = readRepo('supabase/migrations/20260924_p8_subscriptions_plan_model.sql')
const MIGRATION = readRepo('supabase/migrations/20261011_p8_payments.sql')
const ROLLBACK = readRepo('supabase/migrations/rollback/20261011_p8_payments_rollback.sql')
const DAY = 86_400_000

let t: P8Db
beforeAll(async () => {
  t = await startP8Db(54842, 'p8payments', [])
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB, CAROL]) await t.db.query(`INSERT INTO public.profiles (id) VALUES ($1) ON CONFLICT DO NOTHING`, [id])
  await t.db.query(PLAN_MODEL)
  await t.db.query(MIGRATION)
}, 240_000)
afterAll(async () => { await t?.stop() })

type Json = Record<string, unknown>
const svc = async (sql: string, params: unknown[] = []) => (await t.rows<{ r: Json }>('service_role', sql, null, params))[0].r
const apply = (user: string, plan: string | null, source: string, ref: string, mode: string,
  opts: { base?: Date; seconds?: number; expires?: Date; cancel?: boolean } = {}) =>
  svc(`SELECT public.p8_apply_entitlement($1,$2,$3,$4,$5,$6,$7,$8,$9) AS r`,
    [user, plan, source, ref, mode, opts.base ?? null, opts.seconds ?? null, opts.expires ?? null, opts.cancel ?? null])
const sub = (user: string) => t.one<{ plan: string; status: string; source: string; current_period_end: Date; cancel_at_period_end: boolean }>(
  `SELECT plan, status, source, current_period_end, cancel_at_period_end FROM public.subscriptions WHERE user_id = $1`, [user])
const daysLeft = (d: Date) => (new Date(d).getTime() - Date.now()) / DAY
const createOrder = (user: string, plan = 'momo', amount = 179000, days = 30) =>
  svc(`SELECT public.p8_payments_create_order($1,$2,$3,$4) AS r`, [user, plan, amount, days])
const sepay = (tx: number, code: string | null, amount: number, type = 'in') =>
  svc(`SELECT public.p8_payments_apply_sepay($1,$2,$3,$4) AS r`, [tx, code, amount, type])

describe('p8_apply_entitlement (grantPlan)', () => {
  it('a first purchase starts now and lasts the plan length', async () => {
    const r = await apply(ALICE, 'pip', 'web_sepay', 'test:a1', 'stack', { seconds: 7 * 86400 })
    expect(r.status).toBe('applied')
    const s = await sub(ALICE)
    expect(s).toMatchObject({ plan: 'pip', status: 'active', source: 'web_sepay' })
    expect(daysLeft(s.current_period_end)).toBeCloseTo(7, 1)
  })

  it('is idempotent by external_ref', async () => {
    expect((await apply(ALICE, 'pip', 'web_sepay', 'test:a1', 'stack', { seconds: 7 * 86400 })).status).toBe('duplicate')
    expect(daysLeft((await sub(ALICE)).current_period_end)).toBeCloseTo(7, 1)
  })

  it('buying again while active STACKS from the current expiry, across channels', async () => {
    await apply(ALICE, 'momo', 'google_play', 'test:a2', 'stack', { base: new Date(), seconds: 30 * 86400, expires: new Date(Date.now() + 30 * DAY) })
    const s = await sub(ALICE)
    expect(daysLeft(s.current_period_end)).toBeCloseTo(37, 1)
    expect(s).toMatchObject({ plan: 'momo', source: 'google_play' })
  })

  it('an expired row restarts from the purchase time, not from the old end', async () => {
    await t.db.query(`INSERT INTO public.subscriptions (user_id, plan, status, current_period_end, source)
      VALUES ($1, 'momo', 'active', now() - interval '5 days', 'manual')`, [BOB])
    await apply(BOB, 'pip', 'web_sepay', 'test:b1', 'stack', { seconds: 7 * 86400 })
    expect(daysLeft((await sub(BOB)).current_period_end)).toBeCloseTo(7, 1)
  })

  it('extend_to never shortens and adds no time', async () => {
    const before = (await sub(ALICE)).current_period_end
    await apply(ALICE, null, 'google_play', 'test:a3', 'extend_to', { expires: new Date(Date.now() + 2 * DAY) })
    expect((await sub(ALICE)).current_period_end).toEqual(before)
    await apply(ALICE, null, 'google_play', 'test:a4', 'extend_to', { expires: new Date(Date.now() + 60 * DAY) })
    expect(daysLeft((await sub(ALICE)).current_period_end)).toBeCloseTo(60, 1)
  })

  it('mark (cancellation) keeps access until the end', async () => {
    const before = (await sub(ALICE)).current_period_end
    await apply(ALICE, null, 'google_play', 'test:a5', 'mark', { cancel: true })
    const s = await sub(ALICE)
    expect(s).toMatchObject({ status: 'active', cancel_at_period_end: true })
    expect(s.current_period_end).toEqual(before)
  })

  it('revoke_store removes only the unused store time and keeps web-paid time', async () => {
    await t.db.query(`DELETE FROM public.subscriptions WHERE user_id = $1`, [CAROL])
    await apply(CAROL, 'momo', 'web_sepay', 'test:c1', 'stack', { seconds: 30 * 86400 })
    await apply(CAROL, 'momo', 'google_play', 'test:c2', 'stack',
      { base: new Date(), seconds: 30 * 86400, expires: new Date(Date.now() + 30 * DAY) })
    expect(daysLeft((await sub(CAROL)).current_period_end)).toBeCloseTo(60, 1)
    await apply(CAROL, null, 'google_play', 'test:c3', 'revoke_store', { expires: new Date() })
    const s = await sub(CAROL)
    expect(daysLeft(s.current_period_end)).toBeCloseTo(30, 1)
    expect(s.status).toBe('active')
  })

  it('a natural store expiration changes nothing', async () => {
    const before = (await sub(CAROL)).current_period_end
    // the store period already ran out (last known store expiry in the past)
    await apply(CAROL, 'pip', 'apple_iap', 'test:c4', 'stack',
      { base: new Date(Date.now() - 10 * DAY), seconds: 7 * 86400, expires: new Date(Date.now() - 3 * DAY) })
    const mid = (await sub(CAROL)).current_period_end
    await apply(CAROL, null, 'apple_iap', 'test:c5', 'revoke_store', { expires: new Date(Date.now() - 3 * DAY) })
    expect((await sub(CAROL)).current_period_end).toEqual(mid)
    expect(new Date(mid).getTime()).toBeGreaterThan(new Date(before).getTime())
  })

  it('refuses unknown sources, modes and plans', async () => {
    expect(await t.exec('service_role', `SELECT public.p8_apply_entitlement('${BOB}', 'gold', 'web_sepay', 'x1', 'stack', NULL, 10)`)).toBe('22023')
    expect(await t.exec('service_role', `SELECT public.p8_apply_entitlement('${BOB}', 'pip', 'paypal', 'x2', 'stack', NULL, 10)`)).toBe('22023')
    expect(await t.exec('service_role', `SELECT public.p8_apply_entitlement('${BOB}', 'pip', 'web_sepay', 'x3', 'burn', NULL, 10)`)).toBe('22023')
  })

  it('only the service role can call it; the ledger is append-only and private', async () => {
    expect(await t.exec('authenticated', `SELECT public.p8_apply_entitlement('${ALICE}', 'sunny', 'web_sepay', 'hack', 'stack', NULL, 999999)`, ALICE)).toBe('42501')
    expect(await t.exec('anon', `SELECT public.p8_apply_entitlement('${ALICE}', 'sunny', 'web_sepay', 'hack', 'stack', NULL, 999999)`)).toBe('42501')
    expect(await t.exec('authenticated', 'SELECT * FROM public.entitlement_ledger', ALICE)).toBe('42501')
    expect(await t.exec('postgres', `UPDATE public.entitlement_ledger SET note = 'x'`)).toBe('42501')
    expect(await t.exec('postgres', `DELETE FROM public.entitlement_ledger`)).toBe('42501')
  })
})

describe('payment orders', () => {
  it('creates a TAPPY code without look-alike characters, 15 minutes', async () => {
    const r = await createOrder(BOB)
    expect(r.status).toBe('created')
    const o = r.order as Json
    expect(o.code).toMatch(/^TAPPY[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    const mins = (new Date(o.expires_at as string).getTime() - Date.now()) / 60_000
    expect(mins).toBeGreaterThan(14.5)
    expect(mins).toBeLessThan(15.5)
  })

  it('caps live pending orders at 3 per user; expired ones do not count', async () => {
    await createOrder(BOB); await createOrder(BOB)
    expect((await createOrder(BOB)).status).toBe('too_many_pending')
    await t.db.query(`UPDATE public.payment_orders SET expires_at = now() - interval '1 minute' WHERE user_id = $1`, [BOB])
    expect((await createOrder(BOB)).status).toBe('created')
    expect((await t.one<{ n: string }>(`SELECT count(*) AS n FROM public.payment_orders WHERE user_id = $1 AND status = 'expired'`, [BOB])).n).toBe('3')
  })

  it('a user reads only their own orders and cannot write any', async () => {
    const own = await t.rows('authenticated', 'SELECT id FROM public.payment_orders', BOB)
    expect(own.length).toBe(4)
    expect((await t.rows('authenticated', 'SELECT id FROM public.payment_orders', ALICE)).length).toBe(0)
    expect(await t.exec('authenticated', `UPDATE public.payment_orders SET status = 'paid'`, BOB)).toBe('42501')
    expect(await t.exec('authenticated', `INSERT INTO public.payment_orders (user_id, plan, amount_vnd, duration_days, code, expires_at)
      VALUES ('${BOB}', 'pip', 1, 7, 'TAPPYAAAAAA', now())`, BOB)).toBe('42501')
    expect(await t.exec('authenticated', `SELECT public.p8_payments_create_order('${BOB}', 'pip', 1, 7)`, BOB)).toBe('42501')
  })

  it('is in the realtime publication', async () => {
    const r = await t.one<{ n: string }>(`SELECT count(*) AS n FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'payment_orders'`)
    expect(r.n).toBe('1')
  })
})

describe('p8_payments_apply_sepay', () => {
  const freshOrder = async (user: string, plan = 'momo', amount = 179000, days = 30) => {
    await t.db.query(`UPDATE public.payment_orders SET status = 'expired' WHERE user_id = $1 AND status = 'pending'`, [user])
    return ((await createOrder(user, plan, amount, days)).order as Json)
  }

  it('full amount → paid + plan granted (stacked on the current expiry)', async () => {
    await t.db.query(`DELETE FROM public.subscriptions WHERE user_id = $1`, [BOB])
    const o = await freshOrder(BOB)
    const r = await sepay(9001, (o.code as string).toLowerCase(), 179000)
    expect(r.result).toBe('paid')
    const row = await t.one<{ status: string; sepay_tx_id: string; paid_at: Date }>(`SELECT status, sepay_tx_id, paid_at FROM public.payment_orders WHERE id = $1`, [o.id])
    expect(row.status).toBe('paid')
    expect(row.sepay_tx_id).toBe('9001')
    expect(daysLeft((await sub(BOB)).current_period_end)).toBeCloseTo(30, 1)
    const o2 = await freshOrder(BOB, 'pip', 25000, 7)
    expect((await sepay(9002, o2.code as string, 25000)).result).toBe('paid')
    expect(daysLeft((await sub(BOB)).current_period_end)).toBeCloseTo(37, 1)
  })

  it('the same SePay transaction twice → duplicate, granted once', async () => {
    const before = (await sub(BOB)).current_period_end
    expect((await sepay(9002, 'whatever', 25000)).result).toBe('duplicate')
    expect((await sub(BOB)).current_period_end).toEqual(before)
  })

  it('short amount → mismatch, nothing granted', async () => {
    const before = (await sub(BOB)).current_period_end
    const o = await freshOrder(BOB)
    expect((await sepay(9003, o.code as string, 100000)).result).toBe('mismatch')
    const row = await t.one<{ status: string; received_vnd: string }>(`SELECT status, received_vnd FROM public.payment_orders WHERE id = $1`, [o.id])
    expect(row).toMatchObject({ status: 'mismatch', received_vnd: '100000' })
    expect((await sub(BOB)).current_period_end).toEqual(before)
    // a second transfer for a settled order is recorded, not auto-granted
    expect((await sepay(9004, o.code as string, 179000)).result).toBe('already_settled')
    expect((await sub(BOB)).current_period_end).toEqual(before)
  })

  it('paid AFTER the order expired but with the right amount → still granted', async () => {
    const o = await freshOrder(CAROL, 'pip', 25000, 7)
    await t.db.query(`UPDATE public.payment_orders SET expires_at = now() - interval '2 hours' WHERE id = $1`, [o.id])
    const before = new Date((await sub(CAROL)).current_period_end).getTime()
    expect((await sepay(9005, o.code as string, 25000)).result).toBe('late_paid')
    expect(new Date((await sub(CAROL)).current_period_end).getTime() - before).toBeCloseTo(7 * DAY, -5)
  })

  it('outgoing transfers and unknown codes are recorded and ignored', async () => {
    expect((await sepay(9006, 'TAPPYZZZZZZ', 25000, 'out')).result).toBe('ignored_out')
    expect((await sepay(9007, 'TAPPYZZZZZZ', 25000)).result).toBe('no_order')
    expect((await sepay(9008, null, 25000)).result).toBe('no_order')
    const n = await t.one<{ n: string }>(`SELECT count(*) AS n FROM public.payment_events WHERE provider = 'sepay'`)
    expect(Number(n.n)).toBe(8)
  })

  it('only the service role can apply a SePay transaction', async () => {
    expect(await t.exec('authenticated', `SELECT public.p8_payments_apply_sepay(1, 'TAPPYAAAAAA', 1, 'in')`, ALICE)).toBe('42501')
    expect(await t.exec('authenticated', 'SELECT * FROM public.payment_events', ALICE)).toBe('42501')
  })
})

describe('rollback', () => {
  it('drops only what it added and keeps every entitlement', async () => {
    const before = await sub(BOB)
    await t.db.query(ROLLBACK)
    const after = await sub(BOB)
    expect(after.current_period_end).toEqual(before.current_period_end)
    expect(after.source).toBe('manual')
    const left = await t.one<{ n: string }>(`SELECT count(*) AS n FROM pg_tables WHERE tablename IN ('payment_orders','payment_events','entitlement_ledger')`)
    expect(left.n).toBe('0')
    await t.db.query(MIGRATION) // re-applies cleanly
  })
})
