import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALICE, BOB, CAROL, loadProdSchema, readRepo, startP8Db, type P8Db } from './p8Harness'

// PHASE 8 / SUBSCRIPTIONS (docs/payments/PLAN.md) — 20261015 on top of the FULL prod schema +
// 20260924 plan model + 20261011 payments. Written by the security session (p8/subscriptions).
//   P8-7  manual grant/revoke never loses paid time, needs a reason
//   P8-8  legacy writers and late store webhooks cannot override the ledger
//   P8-17 a short transfer cannot lock someone else's order
//   + one row per user, expiry job, Pip bought again after it ends, RLS,
//   account deletion keeps ANONYMISED payment records, rollback

const PLAN_MODEL = readRepo('supabase/migrations/20260924_p8_subscriptions_plan_model.sql')
const PAYMENTS = readRepo('supabase/migrations/20261011_p8_payments.sql')
const MIGRATION = readRepo('supabase/migrations/20261015_p8_subscriptions.sql')
const ROLLBACK = readRepo('supabase/migrations/rollback/20261015_p8_subscriptions_rollback.sql')
const DAY = 86_400_000
const DAVE = '55555555-5555-4555-8555-555555555555'
const ERIN = '66666666-6666-4666-8666-666666666666'
const FRANK = '77777777-7777-4777-8777-777777777777'

let t: P8Db
beforeAll(async () => {
  // extra users BEFORE the prod schema (its auth.users trigger expects Supabase's columns)
  t = await startP8Db(54850, 'p8subscriptions', [`INSERT INTO auth.users (id) VALUES ('${DAVE}'), ('${ERIN}'), ('${FRANK}')`])
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB, CAROL, DAVE, ERIN, FRANK]) {
    await t.db.query(`INSERT INTO public.profiles (id) VALUES ($1) ON CONFLICT DO NOTHING`, [id])
  }
  await t.db.query(PLAN_MODEL)
  await t.db.query(PAYMENTS)
  await t.db.query(MIGRATION)
}, 240_000)
afterAll(async () => { await t?.stop() })

type Json = Record<string, unknown>
const svc = async (sql: string, params: unknown[] = []) => (await t.rows<{ r: Json }>('service_role', sql, null, params))[0].r
const apply = (user: string, plan: string | null, source: string, ref: string, mode: string,
  opts: { base?: Date; seconds?: number; expires?: Date; cancel?: boolean; note?: string } = {}) =>
  svc(`SELECT public.p8_apply_entitlement($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10) AS r`,
    [user, plan, source, ref, mode, opts.base ?? null, opts.seconds ?? null, opts.expires ?? null, opts.cancel ?? null, opts.note ?? null])
const revokeManual = (user: string, grantRef: string, note: string | null = 'support check') =>
  svc(`SELECT public.p8_revoke_manual_grant($1,$2,NULL,$3) AS r`, [user, grantRef, note])
const sub = (user: string) => t.one<{ plan: string; status: string; source: string; current_period_end: Date; cancel_at_period_end: boolean }>(
  `SELECT plan, status, source, current_period_end, cancel_at_period_end FROM public.subscriptions WHERE user_id = $1`, [user])
const daysLeft = (d: Date) => (new Date(d).getTime() - Date.now()) / DAY
const createOrder = (user: string, plan = 'momo', amount = 179000, days = 30) =>
  svc(`SELECT public.p8_payments_create_order($1,$2,$3,$4) AS r`, [user, plan, amount, days])
const sepay = (tx: number, code: string | null, amount: number, type = 'in') =>
  svc(`SELECT public.p8_payments_apply_sepay($1,$2,$3,$4) AS r`, [tx, code, amount, type])
const noRow = async (user: string) =>
  (await t.one<{ n: string }>(`SELECT count(*) AS n FROM public.subscriptions WHERE user_id = $1`, [user])).n === '0'
/** Test-only time travel: moves a period as the ledger writer would (the guard lets it through). */
const asWriter = async (sql: string, params: unknown[]) => {
  await t.db.query(`SELECT set_config('p8.entitlement_writer', 'on', false)`)
  try { await t.db.query(sql, params) } finally { await t.db.query(`SELECT set_config('p8.entitlement_writer', '', false)`) }
}
const clear = (user: string) => t.db.query(`DELETE FROM public.subscriptions WHERE user_id = $1`, [user])

describe('P8-7 — manual grants', () => {
  it('a manual grant without a reason is refused', async () => {
    expect(await t.exec('service_role', `SELECT public.p8_apply_entitlement('${ALICE}', 'pip', 'manual', 'm0', 'stack', NULL, 86400)`)).toBe('22023')
    expect(await t.exec('service_role', `SELECT public.p8_apply_entitlement('${ALICE}', 'pip', 'manual', 'm0', 'stack', NULL, 86400, NULL, NULL, NULL, '  ')`)).toBe('22023')
  })

  it('a manual grant on a paid row stacks and keeps the paid source and plan', async () => {
    await clear(ALICE)
    await apply(ALICE, 'momo', 'web_sepay', 'pay:a1', 'stack', { seconds: 30 * 86400 })
    await apply(ALICE, 'pip', 'manual', 'grant:a1', 'stack', { seconds: 10 * 86400, note: 'comp for outage' })
    const s = await sub(ALICE)
    expect(s).toMatchObject({ plan: 'momo', source: 'web_sepay', status: 'active' })
    expect(daysLeft(s.current_period_end)).toBeCloseTo(40, 1)
  })

  it('ending the manual grant removes ONLY its unused time — paid time stays', async () => {
    const r = await revokeManual(ALICE, 'grant:a1')
    expect(r.status).toBe('applied')
    const s = await sub(ALICE)
    expect(daysLeft(s.current_period_end)).toBeCloseTo(30, 1)
    expect(s).toMatchObject({ status: 'active', source: 'web_sepay' })
    expect((await revokeManual(ALICE, 'grant:a1')).status).toBe('duplicate')
    expect(daysLeft((await sub(ALICE)).current_period_end)).toBeCloseTo(30, 1)
  })

  it('a grant followed by a purchase: revoking the grant keeps the whole purchase', async () => {
    await clear(BOB)
    await apply(BOB, 'pip', 'manual', 'grant:b1', 'stack', { seconds: 10 * 86400, note: 'uat tester' })
    await apply(BOB, 'momo', 'google_play', 'pay:b1', 'stack', { base: new Date(), seconds: 30 * 86400, expires: new Date(Date.now() + 30 * DAY) })
    expect(daysLeft((await sub(BOB)).current_period_end)).toBeCloseTo(40, 1)
    await revokeManual(BOB, 'grant:b1')
    const s = await sub(BOB)
    expect(daysLeft(s.current_period_end)).toBeCloseTo(30, 1)
    expect(s.status).toBe('active')
  })

  it('a half-used grant: only the unused half is removed', async () => {
    await clear(CAROL)
    // grant of 10 days that started 5 days ago, then 30 paid days on top
    await t.db.query(`INSERT INTO public.entitlement_ledger (user_id, external_ref, source, mode, plan, seconds, before_end, after_end, note)
      VALUES ($1, 'grant:c1', 'manual', 'stack', 'pip', 864000, NULL, now() + interval '5 days', 'old grant')`, [CAROL])
    await t.db.query(`INSERT INTO public.subscriptions (user_id, plan, status, current_period_end, source)
      VALUES ($1, 'momo', 'active', now() + interval '35 days', 'web_sepay')`, [CAROL])
    await revokeManual(CAROL, 'grant:c1')
    expect(daysLeft((await sub(CAROL)).current_period_end)).toBeCloseTo(30, 1)
  })

  it('a manual-only plan ends now and reads as cancelled', async () => {
    await clear(DAVE)
    await apply(DAVE, 'coco', 'manual', 'grant:d1', 'stack', { seconds: 90 * 86400, note: 'press account' })
    await revokeManual(DAVE, 'grant:d1')
    const s = await sub(DAVE)
    expect(s.status).toBe('canceled')
    expect(daysLeft(s.current_period_end)).toBeLessThan(0.001)
  })

  it('revoke needs a reason and the grant must belong to that user', async () => {
    expect(await t.exec('service_role', `SELECT public.p8_revoke_manual_grant('${ALICE}', 'grant:b1', NULL, 'x')`)).toBe('22023')
    expect((await revokeManual(ALICE, 'grant:b1')).status).toBe('not_found')
    expect((await revokeManual(ALICE, 'pay:a1')).status).toBe('not_found') // a purchase is never "manual"
    expect(await t.exec('authenticated', `SELECT public.p8_revoke_manual_grant('${ALICE}', 'grant:a1', NULL, 'reason')`, ALICE)).toBe('42501')
  })

  it('every manual change is in the ledger with its reason', async () => {
    const rows = await t.db.query(`SELECT mode, note FROM public.entitlement_ledger WHERE user_id = $1 AND source = 'manual' ORDER BY id`, [ALICE])
    expect(rows.rows).toEqual([{ mode: 'stack', note: 'comp for outage' }, { mode: 'revoke_manual', note: 'support check' }])
  })
})

describe('P8-8 — nothing but the ledger changes a ledger-managed paid row', () => {
  it('a release Stripe-style upsert cannot cut or relabel it', async () => {
    const before = await sub(ALICE)
    expect(await t.exec('service_role', `INSERT INTO public.subscriptions (user_id, plan, status, current_period_end, stripe_sub_id)
      VALUES ('${ALICE}', 'pro', 'canceled', now(), 'sub_x')
      ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, status = EXCLUDED.status,
        current_period_end = EXCLUDED.current_period_end, stripe_sub_id = EXCLUDED.stripe_sub_id`)).toBeNull()
    const after = await sub(ALICE)
    expect(after).toMatchObject({ plan: before.plan, status: 'active', source: before.source })
    expect(after.current_period_end).toEqual(before.current_period_end)
  })

  it('an Apple-notification-style update cannot expire it', async () => {
    const before = await sub(BOB)
    await t.exec('service_role', `UPDATE public.subscriptions SET status = 'expired', current_period_end = now() - interval '1 day' WHERE user_id = '${BOB}'`)
    expect((await sub(BOB)).current_period_end).toEqual(before.current_period_end)
  })

  it('legacy rows the ledger never touched keep the release behaviour', async () => {
    await t.db.query(`INSERT INTO public.subscriptions (user_id, plan, status, current_period_end, stripe_sub_id)
      VALUES ($1, 'pro', 'active', now() + interval '20 days', 'sub_legacy')`, [ERIN])
    await t.exec('service_role', `UPDATE public.subscriptions SET status = 'canceled' WHERE user_id = '${ERIN}'`)
    expect((await sub(ERIN)).status).toBe('canceled')
  })

  it('a late EXPIRATION of an older store period does not take away a newer renewal', async () => {
    await clear(FRANK)
    const old = new Date(Date.now() - 60_000)
    await apply(FRANK, 'pip', 'apple_iap', 'rc:r1', 'stack', { base: new Date(), seconds: 7 * 86400, expires: new Date(Date.now() + 7 * DAY) })
    const before = (await sub(FRANK)).current_period_end
    // the expiration HAPPENED before the purchase above was applied (a retried old event)
    const r = await apply(FRANK, null, 'apple_iap', 'rc:old-exp', 'revoke_store', { base: old, expires: old })
    expect(r).toMatchObject({ status: 'applied', changed: false })
    expect((await sub(FRANK)).current_period_end).toEqual(before)
    // a refund that happens now still removes the store time
    await apply(FRANK, null, 'apple_iap', 'rc:refund', 'revoke_store', { base: new Date(Date.now() + 1000), expires: new Date() })
    expect(daysLeft((await sub(FRANK)).current_period_end)).toBeLessThan(0.01)
  })

  it('replaying the same store event changes nothing', async () => {
    expect((await apply(FRANK, 'pip', 'apple_iap', 'rc:r1', 'stack', { seconds: 7 * 86400 })).status).toBe('duplicate')
  })
})

describe('one plan per user, server-only writes, own-row reads', () => {
  it('a second subscriptions row for the same user is impossible', async () => {
    expect(await t.exec('postgres', `INSERT INTO public.subscriptions (user_id, plan, status) VALUES ('${ALICE}', 'pip', 'active')`)).toBe('23505')
  })

  it('a signed-in user can read only their own row and cannot write any', async () => {
    expect((await t.rows('authenticated', 'SELECT user_id FROM public.subscriptions', ALICE)).map((r) => r.user_id)).toEqual([ALICE])
    expect(await t.exec('authenticated', `UPDATE public.subscriptions SET current_period_end = now() + interval '9 years' WHERE user_id = '${ALICE}'`, ALICE)).toBe('42501')
    expect(await t.exec('authenticated', `INSERT INTO public.subscriptions (user_id, plan, status) VALUES ('${CAROL}', 'sunny', 'active')`, CAROL)).toBe('42501')
    expect(await t.exec('authenticated', 'TRUNCATE public.subscriptions', ALICE)).toBe('42501')
    expect(await t.exec('anon', 'TRUNCATE public.subscriptions')).toBe('42501')
  })
})

describe('P8-17 — web orders', () => {
  const freshOrder = async (user: string, plan = 'momo', amount = 179000, days = 30) => {
    await t.db.query(`UPDATE public.payment_orders SET status = 'expired' WHERE user_id = $1 AND status = 'pending'`, [user])
    return ((await createOrder(user, plan, amount, days)).order as Json)
  }

  it('a stranger sending 1đ with my code does not block my order', async () => {
    await clear(CAROL)
    const o = await freshOrder(CAROL)
    expect((await sepay(7001, o.code as string, 1)).result).toBe('mismatch')
    expect(await noRow(CAROL)).toBe(true)
    expect((await sepay(7002, o.code as string, 179000)).result).toBe('paid')
    expect(daysLeft((await sub(CAROL)).current_period_end)).toBeCloseTo(30, 1)
  })

  it('two short transfers that add up to the price pay the order once', async () => {
    await clear(DAVE)
    const o = await freshOrder(DAVE, 'pip', 25000, 7)
    expect((await sepay(7003, o.code as string, 20000)).result).toBe('mismatch')
    expect((await sepay(7004, o.code as string, 5000)).result).toBe('paid')
    expect(daysLeft((await sub(DAVE)).current_period_end)).toBeCloseTo(7, 1)
    expect((await sepay(7005, o.code as string, 25000)).result).toBe('already_settled')
    expect(daysLeft((await sub(DAVE)).current_period_end)).toBeCloseTo(7, 1)
  })

  it('the plan always goes to the order owner, whoever pays', async () => {
    await clear(ERIN)
    const o = await freshOrder(ERIN, 'pip', 25000, 7)
    // BOB's bank pays ERIN's code: the order is ERIN's, BOB gets nothing
    const bobBefore = (await sub(BOB)).current_period_end
    expect((await sepay(7006, o.code as string, 25000)).result).toBe('paid')
    expect((await sub(ERIN)).status).toBe('active')
    expect((await sub(BOB)).current_period_end).toEqual(bobBefore)
  })

  it('without the webhook nothing is granted (a client "success" is not enough)', async () => {
    await clear(FRANK)
    await freshOrder(FRANK)
    // the user cannot mark their own order paid and there is no other path
    expect(await t.exec('authenticated', `UPDATE public.payment_orders SET status = 'paid' WHERE user_id = '${FRANK}'`, FRANK)).toBe('42501')
    expect(await noRow(FRANK)).toBe(true)
  })
})

describe('expiry job', () => {
  it('active → expired after the end; legacy Stripe rows untouched', async () => {
    // a direct UPDATE of a live ledger row is kept back by the guard (P8-8) …
    await t.db.query(`UPDATE public.subscriptions SET current_period_end = now() - interval '1 hour' WHERE user_id = $1`, [DAVE])
    expect(daysLeft((await sub(DAVE)).current_period_end)).toBeGreaterThan(1)
    // … so time travel goes through the writer marker
    await asWriter(`UPDATE public.subscriptions SET current_period_end = now() - interval '1 hour', status = 'active' WHERE user_id = ANY($1)`, [[DAVE, ERIN]])
    await asWriter(`UPDATE public.subscriptions SET source = 'web', current_period_end = now() - interval '1 hour', status = 'active', stripe_sub_id = 'sub_old' WHERE user_id = $1`, [CAROL])
    const n = await t.rows<{ n: number }>('service_role', 'SELECT public.p8_subscriptions_expire() AS n')
    expect(n[0].n).toBeGreaterThanOrEqual(2)
    expect((await sub(DAVE)).status).toBe('expired')
    expect((await sub(ERIN)).status).toBe('expired')
    expect((await sub(CAROL)).status).toBe('active')
    expect(await t.exec('authenticated', 'SELECT public.p8_subscriptions_expire()', ALICE)).toBe('42501')
  })

  it('auto-renew off: the plan stays active until the end, then expires', async () => {
    await clear(FRANK)
    await apply(FRANK, 'momo', 'google_play', 'rc:f-buy', 'stack', { base: new Date(), seconds: 30 * 86400, expires: new Date(Date.now() + 30 * DAY) })
    await apply(FRANK, null, 'google_play', 'rc:f-cancel', 'mark', { cancel: true })
    expect(await sub(FRANK)).toMatchObject({ status: 'active', cancel_at_period_end: true })
    await asWriter(`UPDATE public.subscriptions SET current_period_end = now() - interval '1 minute' WHERE user_id = $1`, [FRANK])
    await t.rows('service_role', 'SELECT public.p8_subscriptions_expire()')
    expect((await sub(FRANK)).status).toBe('expired')
  })

  it('a renewal after expiry starts a fresh period', async () => {
    await apply(FRANK, 'momo', 'google_play', 'rc:f-renew', 'stack', { base: new Date(), seconds: 30 * 86400, expires: new Date(Date.now() + 30 * DAY) })
    const s = await sub(FRANK)
    expect(s.status).toBe('active')
    expect(daysLeft(s.current_period_end)).toBeCloseTo(30, 1)
  })
})

describe('Pip can be bought again', () => {
  it('no once-per-account limit: Pip, it ends, Pip again — each a full 7 days', async () => {
    await clear(ALICE)
    const o1 = await svc(`SELECT public.p8_payments_create_order($1,'pip',25000,7) AS r`, [ALICE])
    expect((await svc(`SELECT public.p8_payments_apply_sepay(8101, $1, 25000, 'in') AS r`, [(o1.order as Json).code])).result).toBe('paid')
    await asWriter(`UPDATE public.subscriptions SET current_period_end = now() - interval '1 minute' WHERE user_id = $1`, [ALICE])
    await t.rows('service_role', 'SELECT public.p8_subscriptions_expire()')
    expect((await sub(ALICE)).status).toBe('expired')
    const o2 = await svc(`SELECT public.p8_payments_create_order($1,'pip',25000,7) AS r`, [ALICE])
    expect((await svc(`SELECT public.p8_payments_apply_sepay(8102, $1, 25000, 'in') AS r`, [(o2.order as Json).code])).result).toBe('paid')
    const s = await sub(ALICE)
    expect(s).toMatchObject({ plan: 'pip', status: 'active' })
    expect(daysLeft(s.current_period_end)).toBeCloseTo(7, 1)
  })
})

describe('account deletion — payment records stay, the person goes', () => {
  it('ledger, events and orders are kept but no longer point to the deleted account', async () => {
    const counts = async () => ({
      ledger: (await t.one<{ n: string }>(`SELECT count(*) AS n FROM public.entitlement_ledger`)).n,
      events: (await t.one<{ n: string }>(`SELECT count(*) AS n FROM public.payment_events`)).n,
      orders: (await t.one<{ n: string }>(`SELECT count(*) AS n FROM public.payment_orders`)).n,
    })
    const mine = (await t.one<{ n: string }>(`SELECT count(*) AS n FROM public.entitlement_ledger WHERE user_id = $1`, [ALICE])).n
    expect(Number(mine)).toBeGreaterThan(0)
    const before = await counts()
    await t.db.query(`DELETE FROM auth.users WHERE id = $1`, [ALICE])
    expect(await counts()).toEqual(before)
    expect(await noRow(ALICE)).toBe(true)
    const refs = await t.one<{ l: string; e: string; o: string; notes: string }>(`SELECT
      (SELECT count(*) FROM public.entitlement_ledger WHERE user_id = $1 OR actor_id = $1) AS l,
      (SELECT count(*) FROM public.payment_events WHERE user_id = $1) AS e,
      (SELECT count(*) FROM public.payment_orders WHERE user_id = $1 OR resolved_by = $1) AS o,
      (SELECT count(*) FROM public.entitlement_ledger WHERE user_id IS NULL AND note IS NOT NULL) AS notes`, [ALICE])
    expect(refs).toEqual({ l: '0', e: '0', o: '0', notes: '0' })
    // what stays for accounting: provider ids, plan, amounts, dates, status
    const kept = await t.one<{ n: string }>(`SELECT count(*) AS n FROM public.payment_orders o JOIN public.payment_events e ON e.order_id = o.id
      WHERE o.user_id IS NULL AND o.status = 'paid' AND e.event_id IN ('8101','8102') AND o.amount_vnd = 25000 AND o.plan = 'pip'`)
    expect(kept.n).toBe('2')
  })

  it('the ledger is still append-only for everyone else, including a hand-written "anonymise"', async () => {
    expect(await t.exec('postgres', `UPDATE public.entitlement_ledger SET user_id = NULL WHERE user_id = '${BOB}'`)).toBe('42501')
    await t.db.query(`SELECT set_config('p8.ledger_anonymize', 'on', false)`)
    expect(await t.exec('postgres', `UPDATE public.entitlement_ledger SET user_id = NULL WHERE user_id = '${BOB}'`)).toBe('42501')
    await t.db.query(`SELECT set_config('p8.ledger_anonymize', '', false)`)
    expect(await t.exec('postgres', `DELETE FROM public.entitlement_ledger WHERE user_id IS NULL`)).toBe('42501')
  })
})

describe('rollback', () => {
  it('drops what 20261015 added, keeps entitlements, re-applies cleanly', async () => {
    const before = await sub(BOB)
    await t.db.query(ROLLBACK)
    const after = await t.one<{ current_period_end: Date }>(`SELECT current_period_end FROM public.subscriptions WHERE user_id = $1`, [BOB])
    expect(after.current_period_end).toEqual(before.current_period_end)
    const left = await t.one<{ n: string }>(`SELECT count(*) AS n FROM pg_proc WHERE proname IN ('p8_revoke_manual_grant','p8_subscriptions_expire','p8_anonymize_payment_records','p8_subscriptions_ledger_guard')`)
    expect(left.n).toBe('0')
    await t.db.query(MIGRATION)
    expect((await sub(BOB)).status).toBe(before.status)
  })
})
