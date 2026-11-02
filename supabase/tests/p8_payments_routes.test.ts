import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALICE, BOB, loadProdSchema, readRepo, startP8Db, type P8Db } from './p8Harness'

// PAYMENTS — the web routes end to end against the REAL SQL: POST /api/payments/orders creates the
// order, POST /api/payments/sepay settles it. Only the Supabase transport and the mail are faked.

// The route's "already active?" read is covered in p8_subscriptions_routes; here the payer has no plan row.
const noRows = vi.hoisted(() => {
  const q: Record<string, unknown> = {}
  for (const k of ['select', 'eq', 'gt', 'limit', 'order']) q[k] = () => q
  q.maybeSingle = async () => ({ data: null })
  return { from: () => q }
})

const h = vi.hoisted(() => ({
  t: null as unknown as { rows: (role: string, sql: string, sub?: string | null, params?: unknown[]) => Promise<Record<string, unknown>[]> },
  user: null as null | { id: string; is_anonymous?: boolean },
  mails: [] as unknown[],
  mailThrows: false,
}))

/** A service-role client whose `rpc` runs the real function on the embedded database. */
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const keys = Object.keys(args)
      const sql = `SELECT public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) AS r`
      try {
        const rows = await h.t.rows('service_role', sql, null, keys.map((k) => {
          const v = args[k]
          return v !== null && typeof v === 'object' ? JSON.stringify(v) : v
        }))
        return { data: rows[0].r, error: null }
      } catch (e) {
        return { data: null, error: { code: (e as { code?: string }).code } }
      }
    },
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: `${id.slice(0, 4)}@example.test` } } }) } },
  }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: h.user, supabase: noRows }) }))
vi.mock('@/lib/account/accountStatus', async (orig) => ({ ...(await orig<typeof import('@/lib/account/accountStatus')>()), getAccountRestriction: async () => ({ blocked: false }) }))
vi.mock('@/lib/security/distributedRateLimit', async (orig) => ({ ...(await orig<typeof import('@/lib/security/distributedRateLimit')>()), distributedRateLimit: async () => ({ ok: true, retryAfter: 0 }) }))
vi.mock('@/lib/payments/mail', () => ({
  sendPaymentMail: async (m: unknown) => { if (h.mailThrows) throw new Error('smtp down'); h.mails.push(m); return 'sent' },
}))

import { POST as createOrder } from '@/app/api/payments/orders/route'
import { POST as sepayHook } from '@/app/api/payments/sepay/route'

const KEY = 'test-sepay-key-0123456789'
const ACCOUNT = '0011223344'
let t: P8Db

beforeAll(async () => {
  t = await startP8Db(54843, 'p8payroutes', [])
  await loadProdSchema(t.db)
  for (const id of [ALICE, BOB]) await t.db.query(`INSERT INTO public.profiles (id) VALUES ($1) ON CONFLICT DO NOTHING`, [id])
  await t.db.query(readRepo('supabase/migrations/20260924_p8_subscriptions_plan_model.sql'))
  await t.db.query(readRepo('supabase/migrations/20261011_p8_payments.sql'))
  h.t = t
}, 240_000)
afterAll(async () => { await t?.stop() })

beforeEach(() => {
  vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
  vi.stubEnv('SEPAY_WEBHOOK_API_KEY', KEY)
  // This suite covers the API-key FALLBACK; HMAC (the default) is covered in p8_subscriptions_routes.
  vi.stubEnv('SEPAY_WEBHOOK_AUTH_MODE', 'apikey')
  vi.stubEnv('SEPAY_BANK_ACCOUNT', ACCOUNT)
  vi.stubEnv('SEPAY_BANK_CODE', 'MBBank')
  vi.stubEnv('SEPAY_ACCOUNT_NAME', 'PHAM HUY')
  h.user = { id: BOB }
  h.mails.length = 0
  h.mailThrows = false
})
afterEach(() => vi.unstubAllEnvs())

async function order(plan = 'momo'): Promise<{ id: string; code: string; amountVnd: number }> {
  await t.db.query(`UPDATE public.payment_orders SET status = 'expired' WHERE status = 'pending'`)
  const res = await createOrder(new Request('https://t.test/api/payments/orders', { method: 'POST', body: JSON.stringify({ plan }) }))
  expect(res.status).toBe(201)
  return (await res.json()).order
}
let txSeq = 50_000
const hook = (body: Record<string, unknown>, auth = `Apikey ${KEY}`) =>
  sepayHook(new Request('https://t.test/api/payments/sepay', {
    method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
const tx = (code: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id: ++txSeq, gateway: 'MBBank', transactionDate: '2026-09-27 10:00:00', accountNumber: ACCOUNT, subAccount: '',
  code: null, content: `${code} chuyen tien`, transferType: 'in', description: 'x', transferAmount: amount,
  accumulated: 0, referenceCode: `FT${txSeq}`, ...extra,
})
const expiry = async (user: string) =>
  new Date((await t.one<{ e: Date }>(`SELECT current_period_end AS e FROM public.subscriptions WHERE user_id = $1`, [user])).e).getTime()
const orderRow = (id: string) => t.one<{ status: string }>(`SELECT status FROM public.payment_orders WHERE id = $1`, [id])
const DAY = 86_400_000

describe('POST /api/payments/sepay', () => {
  it('wrong or missing API key → 401, nothing recorded', async () => {
    const o = await order()
    expect((await hook(tx(o.code, o.amountVnd), 'Apikey nope')).status).toBe(401)
    expect((await hook(tx(o.code, o.amountVnd), '')).status).toBe(401)
    expect((await hook(tx(o.code, o.amountVnd), `Bearer ${KEY}`)).status).toBe(401)
    expect((await orderRow(o.id)).status).toBe('pending')
  })

  it('full amount (code found in the content, lower-case) → 200 {success:true}, paid, plan granted, mail sent', async () => {
    const o = await order('momo')
    const res = await hook(tx(o.code.toLowerCase(), 179_000))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect((await orderRow(o.id)).status).toBe('paid')
    expect((await expiry(BOB)) - Date.now()).toBeGreaterThan(29.9 * DAY)
    expect(h.mails).toHaveLength(1)
  })

  it('the same transaction again → 200, granted once', async () => {
    const o = await order('pip')
    const body = tx(o.code, 29_000)
    await hook(body)
    const once = await expiry(BOB)
    const again = await hook(body)
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ success: true })
    expect(await expiry(BOB)).toBe(once)
  })

  it('a second purchase while paid STACKS on the current expiry', async () => {
    const before = await expiry(BOB)
    const o = await order('pip')
    await hook(tx(o.code, 29_000, { code: o.code }))
    expect((await expiry(BOB)) - before).toBeCloseTo(7 * DAY, -4)
  })

  it('short amount → mismatch, no grant, still 200', async () => {
    const before = await expiry(BOB)
    const o = await order('coco')
    const res = await hook(tx(o.code, 400_000))
    expect(res.status).toBe(200)
    expect((await orderRow(o.id)).status).toBe('mismatch')
    expect(await expiry(BOB)).toBe(before)
  })

  it('paid after the 15 minutes with the right amount → still granted', async () => {
    const before = await expiry(BOB)
    const o = await order('pip')
    await t.db.query(`UPDATE public.payment_orders SET expires_at = now() - interval '1 hour' WHERE id = $1`, [o.id])
    await hook(tx(o.code, 29_000))
    expect((await orderRow(o.id)).status).toBe('paid')
    expect((await expiry(BOB)) - before).toBeCloseTo(7 * DAY, -4)
  })

  it('a failing mail never fails the webhook', async () => {
    h.mailThrows = true
    const o = await order('pip')
    const res = await hook(tx(o.code, 29_000))
    expect(res.status).toBe(200)
    expect((await orderRow(o.id)).status).toBe('paid')
  })

  it('outgoing, unknown code, or another account → 200, nothing paid', async () => {
    const o = await order('pip')
    expect((await hook(tx(o.code, 29_000, { transferType: 'out' }))).status).toBe(200)
    expect((await hook(tx('TAPPYZZZZZZ', 29_000))).status).toBe(200)
    expect((await hook(tx(o.code, 29_000, { accountNumber: '9999999999' }))).status).toBe(200)
    expect((await orderRow(o.id)).status).toBe('pending')
  })

  it('404 while p8_payments is OFF (nothing reachable)', async () => {
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '')
    expect((await hook(tx('TAPPYAAAAAA', 1))).status).toBe(404)
    expect((await createOrder(new Request('https://t.test/x', { method: 'POST', body: '{"plan":"pip"}' }))).status).toBe(404)
  })
})

describe('POST /api/payments/orders', () => {
  it('answers the code, amount, account and a SePay QR', async () => {
    await t.db.query(`UPDATE public.payment_orders SET status = 'expired' WHERE status = 'pending'`)
    const res = await createOrder(new Request('https://t.test/x', { method: 'POST', body: '{"plan":"sunny"}' }))
    const body = await res.json()
    expect(body.order.amountVnd).toBe(1_719_000)
    expect(body.bank).toEqual({ accountNumber: ACCOUNT, accountName: 'PHAM HUY', bankCode: 'MBBank' })
    expect(body.qrUrl).toBe(`https://qr.sepay.vn/img?acc=${ACCOUNT}&bank=MBBank&amount=1719000&des=${body.order.code}`)
  })

  it('the client cannot choose the price; unknown plans are refused', async () => {
    const res = await createOrder(new Request('https://t.test/x', { method: 'POST', body: '{"plan":"gold","amount":1}' }))
    expect(res.status).toBe(400)
    expect((await res.json()).message).toBeTruthy()
  })

  it('at most 3 live pending orders', async () => {
    h.user = { id: ALICE }
    for (let i = 0; i < 3; i++) {
      expect((await createOrder(new Request('https://t.test/x', { method: 'POST', body: '{"plan":"pip"}' }))).status).toBe(201)
    }
    const res = await createOrder(new Request('https://t.test/x', { method: 'POST', body: '{"plan":"pip"}' }))
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('too_many_pending')
  })

  it('guests must sign in first', async () => {
    h.user = { id: BOB, is_anonymous: true }
    expect((await createOrder(new Request('https://t.test/x', { method: 'POST', body: '{"plan":"pip"}' }))).status).toBe(403)
    h.user = null
    expect((await createOrder(new Request('https://t.test/x', { method: 'POST', body: '{"plan":"pip"}' }))).status).toBe(401)
  })

  it('503 with a plain message when the receiving account is not configured', async () => {
    vi.stubEnv('SEPAY_BANK_ACCOUNT', '')
    const res = await createOrder(new Request('https://t.test/x', { method: 'POST', body: '{"plan":"pip"}' }))
    expect(res.status).toBe(503)
    expect((await res.json()).message).toMatch(/tạm dừng|paused/)
  })
})
