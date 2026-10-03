import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALICE, BOB, CAROL, loadProdSchema, readRepo, startP8Db, type P8Db } from './p8Harness'

// SUBSCRIPTIONS (docs/payments/PLAN.md) — the routes end to end against the REAL SQL (20260924 +
// 20261011 + 20261015), the user's own reads under RLS as `authenticated`, the server's writes as
// `service_role`. The bank is the FAKE adapter, which goes through the REAL webhook verification.
// Written by the security session (p8/subscriptions).

type Run = (role: string, sql: string, sub: string | null, params: unknown[]) => Promise<Record<string, unknown>[]>
const h = vi.hoisted(() => ({
  run: null as unknown as (role: string, sql: string, sub: string | null, params: unknown[]) => Promise<Record<string, unknown>[]>,
  user: null as null | { id: string; is_anonymous?: boolean },
  audits: [] as Record<string, unknown>[],
}))

/**
 * A tiny PostgREST stand-in: select/eq/gt/in/order/limit/maybeSingle/update/rpc → real SQL.
 * `role`/`sub` decide RLS exactly as Supabase would (authenticated + JWT sub, or service_role).
 */
function client(role: string, sub: string | null) {
  const run: Run = (r, sql, s, p) => h.run(r, sql, s, p)
  const table = (name: string) => {
    let cols = '*'
    let patch: Record<string, unknown> | null = null
    const where: string[] = []
    const params: unknown[] = []
    let order = ''
    let limit = ''
    const p = (v: unknown) => { params.push(v); return `$${params.length}` }
    const exec = async (single: boolean) => {
      try {
        let sql: string
        if (patch) {
          const sets = Object.entries(patch).map(([k, v]) => `${k} = ${p(v)}`).join(', ')
          sql = `UPDATE public.${name} SET ${sets}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} RETURNING ${cols}`
        } else {
          sql = `SELECT ${cols} FROM public.${name}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}${order}${limit}`
        }
        const rows = await run(role, sql, sub, params)
        return { data: single ? (rows[0] ?? null) : rows, error: null }
      } catch (e) {
        return { data: null, error: { code: (e as { code?: string }).code ?? 'x', message: (e as Error).message } }
      }
    }
    const b = {
      select(c = '*') { cols = c; return b },
      update(v: Record<string, unknown>) { patch = v; return b },
      eq(c: string, v: unknown) { where.push(`${c} = ${p(v)}`); return b },
      gt(c: string, v: unknown) { where.push(`${c} > ${p(v)}`); return b },
      in(c: string, v: unknown[]) { where.push(`${c} = ANY(${p(v)})`); return b },
      order(c: string, o: { ascending?: boolean } = {}) { order = ` ORDER BY ${c} ${o.ascending === false ? 'DESC' : 'ASC'}`; return b },
      limit(n: number) { limit = ` LIMIT ${Number(n)}`; return b },
      maybeSingle: () => exec(true),
      single: () => exec(true),
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return exec(false).then(res, rej) },
    }
    return b
  }
  return {
    from: table,
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      const keys = Object.keys(args)
      try {
        const rows = await run(role, `SELECT * FROM public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) AS r`, sub,
          keys.map((k) => { const v = args[k]; return v !== null && typeof v === 'object' ? JSON.stringify(v) : v }))
        const one = rows.length === 1 && 'r' in rows[0] ? rows[0].r : rows
        return { data: one, error: null }
      } catch (e) {
        return { data: null, error: { code: (e as { code?: string }).code } }
      }
    },
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: null } } }) } },
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client('service_role', null) }))
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({ user: h.user, supabase: client(h.user ? 'authenticated' : 'anon', h.user?.id ?? null) }),
}))
vi.mock('@/lib/payments/mail', async (orig) => ({ ...(await orig<typeof import('@/lib/payments/mail')>()), sendPaymentMail: async () => 'skipped' }))
vi.mock('@/lib/security/limiter', () => ({ sharedRateLimit: async () => ({ ok: true }) }))
// admin plan-grant plumbing (RBAC is tested in its own suite)
vi.mock('@/lib/admin/permissions', () => ({
  PERMISSIONS: { USERS_SUBSCRIPTION_GRANT: 'users.subscription.grant' },
  requirePermission: async () => ({ user: { id: CAROL_STAFF, email: 'staff@t.test' }, actor: {}, decision: { allowed: true } }),
}))
vi.mock('@/lib/admin/permissions/decisionAudit', () => ({ auditActorRole: () => 'admin' }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: Record<string, unknown>) => { h.audits.push(e) } }))
vi.mock('@/lib/security/distributedRateLimit', async (orig) => ({ ...(await orig<typeof import('@/lib/security/distributedRateLimit')>()), distributedRateLimit: async () => ({ ok: true, retryAfter: 0 }) }))
vi.mock('@/lib/admin/users/identity', () => ({ guardMutationTarget: async () => null }))
vi.mock('@/lib/admin/rbac', async (orig) => ({ ...(await orig<typeof import('@/lib/admin/rbac')>()), isSameOrigin: () => true }))

const CAROL_STAFF = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const DAVE = '55555555-5555-4555-8555-555555555555'
const ERIN = '66666666-6666-4666-8666-666666666666'
const FRANK = '77777777-7777-4777-8777-777777777777'

import { GET as catalog } from '@/app/api/payments/catalog/route'
import { GET as me } from '@/app/api/payments/me/route'
import { GET as history } from '@/app/api/payments/history/route'
import { POST as createOrder } from '@/app/api/payments/orders/route'
import { POST as sepayHook } from '@/app/api/payments/sepay/route'
import { GET as expireCron } from '@/app/api/cron/subscriptions-expire/route'
import { fakeBank, FakeBankRefused } from '@/lib/payments/providers'

const KEY = 'test-sepay-key-0123456789'
const HMAC_SECRET = 'test-sepay-hmac-secret-0123456789'
const ACCOUNT = '0011223344'
const DAY = 86_400_000
let t: P8Db

beforeAll(async () => {
  t = await startP8Db(54851, 'p8subroutes', [`INSERT INTO auth.users (id) VALUES ('${CAROL_STAFF}'), ('${DAVE}'), ('${ERIN}'), ('${FRANK}')`])
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB, CAROL, DAVE, ERIN, FRANK]) await t.db.query(`INSERT INTO public.profiles (id) VALUES ($1) ON CONFLICT DO NOTHING`, [id])
  await t.db.query(readRepo('supabase/migrations/20260924_p8_subscriptions_plan_model.sql'))
  await t.db.query(readRepo('supabase/migrations/20261011_p8_payments.sql'))
  await t.db.query(readRepo('supabase/migrations/20261015_p8_subscriptions.sql'))
  await t.db.query(readRepo('supabase/migrations/20261016_p7_pip_one_time.sql'))
  h.run = (role, sql, sub, params) => t.rows(role, sql, sub, params)
}, 240_000)
afterAll(async () => { await t?.stop() })

const ON = { SUBSCRIPTIONS_ENABLED: '1', P8_PAYMENTS: '1', P8_AI_QUOTA_V2: '1' }
beforeEach(() => {
  for (const [k, v] of Object.entries(ON)) vi.stubEnv(k, v)
  vi.stubEnv('P8_MANUAL_PLAN_GRANT', '1')
  vi.stubEnv('SEPAY_WEBHOOK_API_KEY', KEY)
  vi.stubEnv('SEPAY_WEBHOOK_HMAC_SECRET', HMAC_SECRET)
  vi.stubEnv('SEPAY_BANK_ACCOUNT', ACCOUNT)
  vi.stubEnv('SEPAY_BANK_CODE', 'MBBank')
  vi.stubEnv('SEPAY_ACCOUNT_NAME', 'TEST ACCOUNT')
  vi.stubEnv('CRON_SECRET', 'cron-test')
  h.user = { id: BOB }
  h.audits.length = 0
})
afterEach(() => vi.unstubAllEnvs())

const get = (fn: (r: Request) => Promise<Response>, url = 'https://t.test/x') => fn(new Request(url))
const post = (fn: (r: Request) => Promise<Response>, body: unknown) =>
  fn(new Request('https://t.test/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
const myPlan = async () => (await (await get(me)).json()) as { signedIn: boolean; subscription: Record<string, unknown>; quota: Record<string, number> }
const deliver = (headers: Headers, rawBody: string) =>
  sepayHook(new Request('https://t.test/api/payments/sepay', { method: 'POST', headers, body: rawBody }))
const bankPays = async (code: string, amount: number, over: Record<string, unknown> = {}) => {
  const n = fakeBank().transfer(code, amount, over)
  return deliver(n.headers, n.rawBody)
}
const newOrder = async (plan: string) => {
  await t.db.query(`UPDATE public.payment_orders SET status = 'expired' WHERE status = 'pending'`)
  return post(createOrder, { plan })
}

describe('flag OFF = phase8-master behaviour', () => {
  it('/api/payments/me and the catalog do not exist', async () => {
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '')
    expect((await get(me)).status).toBe(404)
    expect((await get(catalog)).status).toBe(404)
  })

  it('the cron jobs do nothing', async () => {
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '')
    const res = await expireCron(new Request('https://t.test/x', { headers: { authorization: 'Bearer cron-test' } }))
    expect(await res.json()).toEqual({ ok: true, skipped: 'flag_off' })
  })
})

describe('the purchase flow (web): order → bank → verified webhook → ACTIVE → quota', () => {
  it('a guest sees the guest allowance and no plan', async () => {
    h.user = null
    const r = await myPlan()
    expect(r.signedIn).toBe(false)
    expect(r.subscription.state).toBe('NONE')
    expect(r.quota).toMatchObject({ limit: 5, period: 'lifetime' })
  })

  it('a free account: NONE, the live Free limit', async () => {
    const r = await myPlan()
    expect(r.subscription).toMatchObject({ state: 'NONE', canBuy: true })
    expect(r.quota).toMatchObject({ limit: 15, period: 'day' }) // p8_free_daily_limit_v2 OFF → release 15
  })

  it('creating an order (server price) → PENDING; a client "success" changes nothing', async () => {
    const res = await newOrder('momo')
    expect(res.status).toBe(201)
    const { order } = await res.json()
    expect(order.amountVnd).toBe(179_000)
    expect((await myPlan()).subscription.state).toBe('PENDING')
    // There is no endpoint that accepts a client's "paid": the only writer is the verified webhook.
    expect((await t.rows('authenticated', 'SELECT 1 FROM public.subscriptions', BOB)).length).toBe(0)
  })

  it('a webhook without the right key activates nothing', async () => {
    const { order } = await (await newOrder('momo')).json()
    const n = fakeBank().transfer(order.code, 179_000)
    const h = new Headers(n.headers); h.set('x-sepay-signature', 'sha256=' + '0'.repeat(64))
    const res = await deliver(h, n.rawBody)
    expect(res.status).toBe(401)
    expect((await myPlan()).subscription.state).toBe('PENDING')
  })

  it('wrong amount → not active', async () => {
    const { order } = await (await newOrder('momo')).json()
    expect((await bankPays(order.code, 100_000)).status).toBe(200)
    expect((await myPlan()).subscription.state).not.toBe('ACTIVE')
  })

  it('verified full payment → ACTIVE, 30 a day, buy hidden; replay grants nothing more', async () => {
    const { order } = await (await newOrder('momo')).json()
    const n = fakeBank().transfer(order.code, 179_000)
    const send = () => deliver(n.headers, n.rawBody)
    expect((await send()).status).toBe(200)
    const r = await myPlan()
    expect(r.subscription).toMatchObject({ state: 'ACTIVE', plan: { id: 'momo', name: 'Momo' }, channel: 'web', autoRenew: false, canBuy: false })
    expect(r.quota).toMatchObject({ limit: 30, period: 'day' })
    const end = r.subscription.periodEnd as string
    expect((await send()).status).toBe(200)
    expect((await myPlan()).subscription.periodEnd).toBe(end)
  })

  it('no second purchase while ACTIVE (409), even in the last days; after it ends, buy again (Pip too)', async () => {
    const res = await newOrder('pip')
    expect(res.status).toBe(409)
    expect((await res.json()).message).toMatch(/mua lại|buy again/)
    await t.db.query(`SELECT set_config('p8.entitlement_writer', 'on', false)`)
    await t.db.query(`UPDATE public.subscriptions SET current_period_end = now() + interval '1 hour' WHERE user_id = $1`, [BOB])
    await t.db.query(`SELECT set_config('p8.entitlement_writer', '', false)`)
    expect((await newOrder('momo')).status).toBe(409)
    await t.db.query(`SELECT set_config('p8.entitlement_writer', 'on', false)`)
    await t.db.query(`UPDATE public.subscriptions SET current_period_end = now() - interval '1 minute' WHERE user_id = $1`, [BOB])
    await t.db.query(`SELECT set_config('p8.entitlement_writer', '', false)`)
    expect((await myPlan()).subscription).toMatchObject({ state: 'EXPIRED', canBuy: true })
    // Pip is a one-time trial: BOB never bought it, so the FIRST Pip is allowed...
    const first = await newOrder('pip')
    expect(first.status).toBe(201)
    await bankPays((await first.json()).order.code, 29_000)
    const mine = (await myPlan()).subscription
    expect(mine).toMatchObject({ state: 'ACTIVE', plan: { id: 'pip' } })
    expect((Date.parse(mine.periodEnd as string) - Date.now()) / DAY).toBeCloseTo(7, 0)
    // ...and once it has ended, a Pip is never sold again, while any other plan is.
    await t.db.query(`SELECT set_config('p8.entitlement_writer', 'on', false)`)
    await t.db.query(`UPDATE public.subscriptions SET current_period_end = now() - interval '1 minute' WHERE user_id = $1`, [BOB])
    await t.db.query(`SELECT set_config('p8.entitlement_writer', '', false)`)
    expect((await newOrder('pip')).status).toBe(409)
    expect((await newOrder('momo')).status).toBe(201)
  })

  it('the response carries no internal fields', async () => {
    h.user = { id: BOB }
    const s = JSON.stringify(await myPlan())
    expect(s).not.toMatch(/grant_note|granted_by|stripe|external_ref|ledger|sepay:/)
  })
})

describe('SePay webhook HMAC (default)', () => {
  const freshOrder = async (plan = 'momo') => {
    await t.db.query(`DELETE FROM public.subscriptions WHERE user_id = $1`, [CAROL])
    h.user = { id: CAROL }
    const res = await newOrder(plan)
    expect(res.status).toBe(201)
    return (await res.json()).order as { code: string; amountVnd: number }
  }
  const state = async () => (await myPlan()).subscription.state

  it('body changed after signing (amount raised) → 401, nothing activated', async () => {
    const o = await freshOrder()
    const n = fakeBank().transfer(o.code, 1_000)
    expect((await deliver(n.headers, n.rawBody.replace('"transferAmount":1000', '"transferAmount":179000'))).status).toBe(401)
    expect(await state()).toBe('PENDING')
  })

  it('timestamp older than 5 minutes → 401 even with a correct signature for it', async () => {
    const o = await freshOrder()
    const n = fakeBank().transfer(o.code, 179_000, {}, Date.now() - 6 * 60_000)
    expect((await deliver(n.headers, n.rawBody)).status).toBe(401)
    expect(await state()).toBe('PENDING')
  })

  it('an Apikey header is not accepted while HMAC is the mode', async () => {
    const o = await freshOrder()
    const n = fakeBank().transfer(o.code, 179_000)
    expect((await deliver(new Headers({ authorization: `Apikey ${KEY}` }), n.rawBody)).status).toBe(401)
    expect(await state()).toBe('PENDING')
  })

  it('no secret configured → 401 (fails closed)', async () => {
    const o = await freshOrder()
    const n = fakeBank().transfer(o.code, 179_000)
    vi.stubEnv('SEPAY_WEBHOOK_HMAC_SECRET', '')
    expect((await deliver(n.headers, n.rawBody)).status).toBe(401)
    vi.stubEnv('SEPAY_WEBHOOK_HMAC_SECRET', HMAC_SECRET)
    expect(await state()).toBe('PENDING')
  })

  it('valid → ACTIVE; the same request replayed, or the same id re-signed, grants nothing more', async () => {
    const o = await freshOrder()
    const n = fakeBank().transfer(o.code, 179_000)
    expect((await deliver(n.headers, n.rawBody)).status).toBe(200)
    const end = (await myPlan()).subscription.periodEnd
    expect(await state()).toBe('ACTIVE')
    expect((await deliver(n.headers, n.rawBody)).status).toBe(200) // replay inside the 5 minutes
    const again = fakeBank().transfer(o.code, 179_000, { id: (n.body as { id: number }).id }) // same tx id, new signature
    expect((await deliver(again.headers, again.rawBody)).status).toBe(200)
    expect((await myPlan()).subscription.periodEnd).toBe(end)
  })

  it('wrong receiving account → recorded, nothing activated', async () => {
    const o = await freshOrder()
    const n = fakeBank().transfer(o.code, 179_000, { accountNumber: '9999999999' })
    expect((await deliver(n.headers, n.rawBody)).status).toBe(200)
    expect(await state()).toBe('PENDING')
  })

  it('the API-key fallback works only when chosen', async () => {
    const o = await freshOrder()
    vi.stubEnv('SEPAY_WEBHOOK_AUTH_MODE', 'apikey')
    const n = fakeBank().transfer(o.code, 179_000)
    expect(n.headers.get('authorization')).toBe(`Apikey ${KEY}`)
    expect((await deliver(n.headers, n.rawBody)).status).toBe(200)
    expect(await state()).toBe('ACTIVE')
  })
})

describe('Tappy Pip — one-time trial per account (owner decision, enforced in the database)', () => {
  const setEnd = async (user: string, sql: string) => {
    await t.db.query(`SELECT set_config('p8.entitlement_writer', 'on', false)`)
    await t.db.query(`UPDATE public.subscriptions SET ${sql} WHERE user_id = $1`, [user])
    await t.db.query(`SELECT set_config('p8.entitlement_writer', '', false)`)
  }
  const buyPip = async (user: string) => {
    h.user = { id: user }
    const res = await newOrder('pip')
    expect(res.status).toBe(201)
    const { order } = await res.json()
    expect(order.amountVnd).toBe(29_000)
    const n = fakeBank().transfer(order.code, 29_000)
    expect((await deliver(n.headers, n.rawBody)).status).toBe(200)
    return { order, n }
  }
  const pipGrants = async (user: string) =>
    Number((await t.one<{ c: string }>(`SELECT count(*) AS c FROM public.entitlement_ledger WHERE user_id = $1 AND plan = 'pip' AND source = 'web_sepay'`, [user])).c)
  type Me = { pipUsed: boolean; subscription: Record<string, unknown>; quota: Record<string, number> }

  it('first purchase allowed: $1 plan, 7 days, ACTIVE, 30 a day; the account is then marked as having used Pip', async () => {
    h.user = { id: DAVE }
    expect(((await myPlan()) as unknown as Me).pipUsed).toBe(false)
    await buyPip(DAVE)
    const r = (await myPlan()) as unknown as Me
    expect(r.subscription).toMatchObject({ state: 'ACTIVE', plan: { id: 'pip' } })
    expect(r.quota).toMatchObject({ limit: 30, period: 'day' })
    expect(r.pipUsed).toBe(true)
  })

  it('a second Pip is rejected while the first is still active', async () => {
    h.user = { id: DAVE }
    expect((await newOrder('pip')).status).toBe(409)
  })

  it('expired → still rejected with the Pip message (vi); other plans stay buyable', async () => {
    await setEnd(DAVE, `current_period_end = now() - interval '1 minute'`)
    h.user = { id: DAVE }
    const res = await newOrder('pip')
    expect(res.status).toBe(409)
    const j = await res.json()
    expect(j.error).toBe('pip_already_used')
    expect(j.message).toMatch(/đã sử dụng gói Pip/)
    expect(((await myPlan()) as unknown as Me).pipUsed).toBe(true)
    expect((await myPlan()).subscription).toMatchObject({ state: 'EXPIRED', canBuy: true })
  })

  it('English wording of the refusal', async () => {
    h.user = { id: DAVE }
    await t.db.query(`UPDATE public.payment_orders SET status = 'expired' WHERE status = 'pending'`)
    const en = await createOrder(new Request('https://t.test/x', {
      method: 'POST', headers: { 'content-type': 'application/json', 'accept-language': 'en' }, body: JSON.stringify({ plan: 'pip' }),
    }))
    expect(en.status).toBe(409)
    expect((await en.json()).message).toMatch(/once per account/i)
  })

  it('cancelled → still rejected (not decided from the current subscription status)', async () => {
    await setEnd(DAVE, `status = 'canceled'`)
    h.user = { id: DAVE }
    expect((await newOrder('pip')).status).toBe(409)
  })

  it('the subscription row gone entirely → still rejected (history is the ledger, not the row)', async () => {
    await t.db.query(`DELETE FROM public.subscriptions WHERE user_id = $1`, [DAVE])
    h.user = { id: DAVE }
    const res = await newOrder('pip')
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('pip_already_used')
  })

  it('duplicate payment is idempotent: replaying the bank notification grants nothing more', async () => {
    const { n } = await buyPip(ERIN)
    const end = (await myPlan()).subscription.periodEnd
    expect((await deliver(n.headers, n.rawBody)).status).toBe(200)
    expect((await myPlan()).subscription.periodEnd).toBe(end)
    expect(await pipGrants(ERIN)).toBe(1)
  })

  it('retry after success creates no second Pip order and no second grant', async () => {
    h.user = { id: ERIN }
    expect((await newOrder('pip')).status).toBe(409)
    const orders = await t.one<{ c: string }>(`SELECT count(*) AS c FROM public.payment_orders WHERE user_id = $1 AND plan = 'pip'`, [ERIN])
    expect(Number(orders.c)).toBe(1)
    expect(await pipGrants(ERIN)).toBe(1)
  })

  it('two Pip orders opened before paying: only the first payment grants; the second is recorded for a refund', async () => {
    h.user = { id: FRANK }
    await t.db.query(`DELETE FROM public.subscriptions WHERE user_id = $1`, [FRANK])
    const o1 = (await (await post(createOrder, { plan: 'pip' })).json()).order
    const o2 = (await (await post(createOrder, { plan: 'pip' })).json()).order
    expect(o1.code).not.toBe(o2.code)
    expect((await bankPays(o1.code, 29_000)).status).toBe(200)
    const end = (await myPlan()).subscription.periodEnd
    expect((await bankPays(o2.code, 29_000)).status).toBe(200)
    expect((await myPlan()).subscription.periodEnd).toBe(end)
    expect(await pipGrants(FRANK)).toBe(1)
    const ev = await t.one<{ result: string }>(`SELECT e.result FROM public.payment_events e JOIN public.payment_orders o ON o.id = e.order_id WHERE o.code = $1`, [o2.code])
    expect(ev.result).toBe('pip_used')
    expect((await t.one<{ status: string }>(`SELECT status FROM public.payment_orders WHERE code = $1`, [o2.code])).status).toBe('mismatch')
  })

  it('the database refuses it directly too (service role), and the unique backstop holds', async () => {
    const r = await t.rows<{ r: { status: string } }>('service_role', `SELECT public.p8_payments_create_order($1,'pip',29000,7) AS r`, null, [FRANK])
    expect(r[0].r.status).toBe('pip_used')
    const dup = await t.exec('service_role', `INSERT INTO public.entitlement_ledger (user_id, external_ref, source, mode, plan, seconds) VALUES ('${FRANK}', 'dup:pip', 'web_sepay', 'stack', 'pip', 604800)`)
    expect(dup).toBe('23505')
  })

  it("a staff comp of Pip is not the account's purchase: it does not use up the trial", async () => {
    await t.rows('service_role', `SELECT public.p8_apply_entitlement($1, 'pip', 'manual', 'grant:gift', 'stack', now(), 86400, NULL, NULL, NULL, 'comp')`, null, [ALICE])
    await t.db.query(`DELETE FROM public.subscriptions WHERE user_id = $1`, [ALICE])
    h.user = { id: ALICE }
    expect((await newOrder('pip')).status).toBe(201)
  })

  it('the catalog marks Pip as a one-time trial and carries the $ list price', async () => {
    h.user = null
    const c = await (await get(catalog)).json()
    const pip = c.plans.find((p: { id: string }) => p.id === 'pip')
    expect(pip).toMatchObject({ priceUsd: 1, trialOnce: true, durationDays: 7, priceVnd: 29_000 })
    expect(c.plans.filter((p: { trialOnce: boolean }) => p.trialOnce)).toHaveLength(1)
  })
})

describe('payment history', () => {
  it('lists only my paid / short web orders: date, plan, amount, status - nothing else', async () => {
    h.user = { id: BOB }
    const mine = await (await get(history)).json()
    expect(mine.items.length).toBeGreaterThan(0)
    for (const it of mine.items) {
      expect(Object.keys(it).sort()).toEqual(['amountVnd', 'date', 'plan', 'status'])
      expect(['paid', 'mismatch']).toContain(it.status)
    }
    h.user = { id: ALICE }
    expect((await (await get(history)).json()).items).toEqual([])
    h.user = null
    expect((await get(history)).status).toBe(401)
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '')
    h.user = { id: BOB }
    expect((await get(history)).status).toBe(404)
  })
})

describe('store plans', () => {
  it('a store plan cannot be topped up from the web (it would be billed twice)', async () => {
    await t.db.query(`DELETE FROM public.subscriptions WHERE user_id = $1`, [CAROL])
    await t.rows('service_role', `SELECT public.p8_apply_entitlement($1, 'coco', 'google_play', 'rc:x1', 'stack', now(), 7776000, now() + interval '90 days')`, null, [CAROL])
    h.user = { id: CAROL }
    const r = await myPlan()
    expect(r.subscription).toMatchObject({ state: 'ACTIVE', channel: 'google_play', autoRenew: true, manage: 'google_play' })
    const res = await newOrder('momo')
    expect(res.status).toBe(409)
    expect((await res.json()).message).toMatch(/cửa hàng|store/)
  })
})

describe('expiry cron + fake bank safety', () => {
  it('needs the cron secret, then expires ended plans', async () => {
    expect((await expireCron(new Request('https://t.test/x'))).status).toBe(401)
    await t.db.query(`SELECT set_config('p8.entitlement_writer', 'on', false)`)
    await t.db.query(`UPDATE public.subscriptions SET current_period_end = now() - interval '1 minute' WHERE user_id = $1`, [BOB])
    await t.db.query(`SELECT set_config('p8.entitlement_writer', '', false)`)
    const res = await expireCron(new Request('https://t.test/x', { headers: { authorization: 'Bearer cron-test' } }))
    expect((await res.json()).expired).toBeGreaterThanOrEqual(1)
    expect((await myPlan()).subscription).toMatchObject({ state: 'EXPIRED', canBuy: true })
    expect((await myPlan()).quota.limit).toBe(15)
  })

  it('the fake bank refuses to exist in production', () => {
    expect(() => fakeBank({ VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toThrow(FakeBankRefused)
    expect(() => fakeBank({ NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toThrow(FakeBankRefused)
  })
})

describe('20261016 Pip rule — rollback', () => {
  it('drops the rule and the backstop, keeps every grant, and re-applies cleanly', async () => {
    const grants = await t.one<{ n: string }>(`SELECT count(*) AS n FROM public.entitlement_ledger WHERE plan = 'pip'`)
    await t.db.query(readRepo('supabase/migrations/rollback/20261016_p7_pip_one_time_rollback.sql'))
    expect((await t.one<{ n: string }>(`SELECT count(*) AS n FROM pg_proc WHERE proname = 'p7_pip_used'`)).n).toBe('0')
    expect((await t.one<{ n: string }>(`SELECT count(*) AS n FROM pg_indexes WHERE indexname = 'entitlement_ledger_pip_once'`)).n).toBe('0')
    expect((await t.one<{ n: string }>(`SELECT count(*) AS n FROM public.entitlement_ledger WHERE plan = 'pip'`)).n).toBe(grants.n)
    await t.db.query(readRepo('supabase/migrations/20261016_p7_pip_one_time.sql'))
    const r = await t.rows<{ r: { status: string } }>('service_role', `SELECT public.p8_payments_create_order($1,'pip',29000,7) AS r`, null, [FRANK])
    expect(r[0].r.status).toBe('pip_used')
  })
})
