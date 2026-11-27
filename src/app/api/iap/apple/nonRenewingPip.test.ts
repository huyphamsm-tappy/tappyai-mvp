import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── The 7-day Pip pack (tappy_pip_1w) is a NON-RENEWING App Store product ───────────────────────────────────
// Apple gives it no expiresDate and no subscription status, so before this change a purchase never opened the plan.
// Rules (owner, 27/11/2026): the server computes the end (purchase date + 7 days, from the verified transaction);
// one Pip per account for life, web Pip included; the same transaction sent twice never adds time.

const h = vi.hoisted(() => {
  const state = {
    tx: null as Record<string, unknown> | null,
    tables: { subscriptions: [] as Record<string, unknown>[], entitlement_ledger: [] as Record<string, unknown>[], payment_orders: [] as Record<string, unknown>[] },
    upserts: [] as Record<string, unknown>[],
    rpcCalls: [] as Array<Record<string, unknown>>,
    rpcResult: { data: { status: 'applied', changed: true }, error: null } as { data: unknown; error: unknown },
    statusApiCalls: 0,
  }
  const table = (name: keyof typeof state.tables) => {
    const eqs: Array<[string, unknown]> = []
    const neqs: Array<[string, unknown]> = []
    const rows = () => state.tables[name].filter(r => eqs.every(([k, v]) => r[k] === v) && neqs.every(([k, v]) => r[k] !== v))
    const q: Record<string, unknown> = {}
    Object.assign(q, {
      select: () => q,
      eq: (k: string, v: unknown) => { eqs.push([k, v]); return q },
      neq: (k: string, v: unknown) => { neqs.push([k, v]); return q },
      limit: () => q,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      upsert: async (row: Record<string, unknown>) => { state.upserts.push(row); return { error: null } },
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null }),
    })
    return q
  }
  const admin = {
    from: (name: string) => table(name as keyof typeof state.tables),
    rpc: async (fn: string, args: Record<string, unknown>) => { state.rpcCalls.push({ fn, ...args }); return state.rpcResult },
  }
  return { state, admin }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: { id: 'u1' } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/apple-iap/api', () => ({
  isAppleIAPConfigured: () => true,
  isSubscriptionActive: async () => { h.state.statusApiCalls++; return false },
  getSubscriptionStatuses: async () => { h.state.statusApiCalls++; throw new Error('App Store Server API 404') },
}))
vi.mock('@/lib/apple-iap/jws', () => {
  class JWSVerificationError extends Error {}
  return { JWSVerificationError, verifyTransactionInfo: async () => h.state.tx, verifyNotificationPayload: async () => ({}) }
})

import { POST as verify } from './verify/route'

const DAY = 86_400_000
const SEC = '2000000555000111'
const PIP = 'tappy_pip_1w'
const iso = (ms: number) => new Date(ms).toISOString()
const ours = (purchaseDate: number, over: Record<string, unknown> = {}) => ({
  bundleId: 'com.tappyai.ios', environment: 'Production', productId: PIP, transactionId: SEC, originalTransactionId: SEC,
  purchaseDate, originalPurchaseDate: purchaseDate, type: 'Non-Renewing Subscription', ...over,
})
const post = (body: Record<string, unknown> = {}) => verify(new Request('http://localhost/api/iap/apple/verify', {
  method: 'POST',
  body: JSON.stringify({ originalTransactionId: SEC, transactionId: SEC, productId: PIP, signedTransactionInfo: 'jws', ...body }),
}))
const json = async (r: Response) => (await r.json()) as Record<string, any>

beforeEach(() => {
  h.state.tx = null
  h.state.tables.subscriptions = []
  h.state.tables.entitlement_ledger = []
  h.state.tables.payment_orders = []
  h.state.upserts = []
  h.state.rpcCalls = []
  h.state.rpcResult = { data: { status: 'applied', changed: true }, error: null }
  h.state.statusApiCalls = 0
  delete process.env.APPLE_IAP_ENV
  delete process.env.APPLE_IAP_ALLOW_SANDBOX
})

describe('POST /api/iap/apple/verify, non-renewing Pip', () => {
  it('🚨 opens Pip for exactly 7 days from the PURCHASE date (not from now), without asking Apple for a subscription status', async () => {
    const purchase = Date.now() - 1 * DAY
    h.state.tx = ours(purchase)
    const res = await post()
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body).toMatchObject({ isPro: true, plan: 'pip', currentPeriodEnd: iso(purchase + 7 * DAY) })
    expect(h.state.statusApiCalls).toBe(0)
    expect(h.state.rpcCalls).toHaveLength(1)
    expect(h.state.rpcCalls[0]).toMatchObject({
      fn: 'p8_apply_entitlement', p_user: 'u1', p_plan: 'pip', p_source: 'apple_iap', p_external_ref: `apple_${SEC}`, p_mode: 'stack',
      p_base_at: iso(purchase), p_seconds: 7 * 86_400, p_expires_at: iso(purchase + 7 * DAY),
    })
    expect(h.state.upserts[0]).toMatchObject({ user_id: 'u1', stripe_sub_id: `apple_${SEC}`, plan: 'pip', source: 'apple_iap', status: 'active', current_period_end: iso(purchase + 7 * DAY) })
  })

  it('the same transaction sent twice (reopen the app, Restore) adds no time: same end, same arguments', async () => {
    const purchase = Date.now() - 2 * DAY
    h.state.tx = ours(purchase)
    const first = await json(await post())
    // the first grant is now in the ledger; the database answers the replay "duplicate"
    h.state.tables.entitlement_ledger.push({ user_id: 'u1', external_ref: `apple_${SEC}`, plan: 'pip', mode: 'stack' })
    h.state.rpcResult = { data: { status: 'duplicate' }, error: null }
    const second = await json(await post())
    expect(second).toMatchObject({ isPro: true, plan: 'pip', currentPeriodEnd: first.currentPeriodEnd })
    expect(h.state.rpcCalls).toHaveLength(2)
    expect(h.state.rpcCalls[1]).toEqual(h.state.rpcCalls[0])
    for (const u of h.state.upserts) expect(u.current_period_end).toBe(iso(purchase + 7 * DAY))
  })

  it('🚨 a SECOND Pip transaction on the same account is refused (409 pip_already_used): no ledger call, no write', async () => {
    h.state.tables.entitlement_ledger.push({ user_id: 'u1', external_ref: 'apple_1999000000000001', plan: 'pip', mode: 'stack' })
    h.state.tx = ours(Date.now() - DAY)
    const res = await post()
    expect(res.status).toBe(409)
    expect((await json(res)).error).toBe('pip_already_used')
    expect(h.state.rpcCalls).toHaveLength(0)
    expect(h.state.upserts).toHaveLength(0)
  })

  it('🚨 a Pip already used through the WEB (a Pip grant in the ledger from another source) also blocks it', async () => {
    h.state.tables.entitlement_ledger.push({ user_id: 'u1', external_ref: 'sepay_ORD1', plan: 'pip', mode: 'stack' })
    h.state.tx = ours(Date.now() - DAY)
    expect((await post()).status).toBe(409)
    expect(h.state.rpcCalls).toHaveLength(0)
  })

  it('a paid web Pip order also counts as used', async () => {
    h.state.tables.payment_orders.push({ user_id: 'u1', plan: 'pip', status: 'paid' })
    h.state.tx = ours(Date.now() - DAY)
    expect((await post()).status).toBe(409)
    expect(h.state.upserts).toHaveLength(0)
  })

  it('a pending or expired web Pip order does not count (nothing was paid)', async () => {
    h.state.tables.payment_orders.push({ user_id: 'u1', plan: 'pip', status: 'pending' }, { user_id: 'u1', plan: 'pip', status: 'expired' })
    h.state.tx = ours(Date.now() - DAY)
    expect((await post()).status).toBe(200)
  })

  it('another account\'s Pip does not block this one', async () => {
    h.state.tables.entitlement_ledger.push({ user_id: 'u2', external_ref: 'apple_1999000000000002', plan: 'pip', mode: 'stack' })
    h.state.tx = ours(Date.now() - DAY)
    expect((await post()).status).toBe(200)
  })

  it('the race (two Pip purchases landing together): the database unique index answers 23505, mapped to pip_already_used', async () => {
    h.state.tx = ours(Date.now() - DAY)
    h.state.rpcResult = { data: null, error: { code: '23505' } }
    const res = await post()
    expect(res.status).toBe(409)
    expect((await json(res)).error).toBe('pip_already_used')
    expect(h.state.upserts).toHaveLength(0)
  })

  it('a purchase older than 7 days (an old transaction replayed by Restore) is reported expired and writes nothing', async () => {
    const purchase = Date.now() - 10 * DAY
    h.state.tx = ours(purchase)
    const res = await post()
    expect(res.status).toBe(200)
    expect(await json(res)).toMatchObject({ isPro: false, plan: 'pip', currentPeriodEnd: iso(purchase + 7 * DAY) })
    expect(h.state.rpcCalls).toHaveLength(0)
    expect(h.state.upserts).toHaveLength(0)
  })

  it('refuses without a signed transaction: a non-renewing product has no other trusted source (400)', async () => {
    const res = await post({ signedTransactionInfo: undefined, expiresDate: Math.floor((Date.now() + 365 * DAY) / 1000) })
    expect(res.status).toBe(400)
    expect(h.state.rpcCalls).toHaveLength(0)
  })

  it('a client-claimed expiresDate is never used', async () => {
    const purchase = Date.now() - DAY
    h.state.tx = ours(purchase)
    const body = await json(await post({ expiresDate: Math.floor((Date.now() + 365 * DAY) / 1000) }))
    expect(body.currentPeriodEnd).toBe(iso(purchase + 7 * DAY))
  })

  it('a transaction that was refunded or revoked is refused', async () => {
    h.state.tx = ours(Date.now() - DAY, { revocationDate: Date.now() - 1000 })
    expect((await post()).status).toBe(400)
    expect(h.state.rpcCalls).toHaveLength(0)
  })

  it('the product the client names must be the one Apple signed', async () => {
    h.state.tx = ours(Date.now() - DAY, { productId: 'com.tappyai.ios.pro.monthly' })
    expect((await post()).status).toBe(400)
  })

  it('a transaction bound to another account is refused (409 transaction_in_use)', async () => {
    h.state.tables.entitlement_ledger.push({ user_id: 'u2', external_ref: `apple_${SEC}`, plan: 'pip', mode: 'stack' })
    h.state.tx = ours(Date.now() - DAY)
    const res = await post()
    expect(res.status).toBe(409)
    expect((await json(res)).error).toBe('transaction_in_use')
    expect(h.state.rpcCalls).toHaveLength(0)
  })

  it('a plan the account already holds that outlasts Pip is not replaced: nothing is written', async () => {
    h.state.tables.subscriptions.push({ user_id: 'u1', plan: 'coco', status: 'active', current_period_end: iso(Date.now() + 40 * DAY), source: 'web_sepay', stripe_sub_id: 'sepay_1' })
    h.state.tx = ours(Date.now() - DAY)
    const res = await post()
    expect(res.status).toBe(200)
    expect(await json(res)).toMatchObject({ isPro: true, plan: 'coco', kept: 'existing_plan' })
    expect(h.state.rpcCalls).toHaveLength(0)
    expect(h.state.upserts).toHaveLength(0)
  })

  it('the auto-renewing monthly product still goes through the old path (unchanged)', async () => {
    h.state.tx = { bundleId: 'com.tappyai.ios', environment: 'Production', productId: 'com.tappyai.ios.pro.monthly', originalTransactionId: SEC, expiresDate: Date.now() + 30 * DAY, type: 'Auto-Renewable Subscription' }
    await post({ productId: 'com.tappyai.ios.pro.monthly' })
    expect(h.state.statusApiCalls).toBe(1)
  })
})
