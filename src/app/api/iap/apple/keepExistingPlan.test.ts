import { describe, it, expect, vi, beforeEach } from 'vitest'
import { keepsLongerExternalPlan } from '@/lib/apple-iap/transactionPolicy'

// ── App Review 3.1.3(b): an App Store purchase or restore must not wipe a plan the account already holds ──
//
// `subscriptions` has ONE row per account and /api/iap/apple/verify upserts it. Before this change a purchase (or a
// Restore that replayed an expired transaction) REPLACED an active plan from another source, or marked it expired.
// Rule now: an active non-App-Store plan that lasts longer than the App Store period stays; nothing is written.

const h = vi.hoisted(() => {
  const state = {
    existing: null as Record<string, unknown> | null,
    existingError: null as unknown,
    tx: null as Record<string, unknown> | null,
    upserts: [] as Record<string, unknown>[],
    rpcCalls: [] as string[],
  }
  // Two lookups hit `subscriptions` before the write: "who else holds this App Store subscription" (has .neq) and
  // "what does THIS account hold" (no .neq). The chain tells them apart.
  const from = () => {
    let isHolderLookup = false
    const q: Record<string, unknown> = {}
    Object.assign(q, {
      select: () => q, eq: () => q, limit: () => q,
      neq: () => { isHolderLookup = true; return q },
      maybeSingle: async () => (isHolderLookup
        ? { data: null, error: null }
        : { data: state.existing, error: state.existingError }),
      upsert: async (row: Record<string, unknown>) => { state.upserts.push(row); return { error: null } },
    })
    return q
  }
  const rpc = async (fn: string) => { state.rpcCalls.push(fn); return { data: { status: 'applied', changed: true }, error: null } }
  return { state, admin: { from, rpc } }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: { id: 'u1' } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/apple-iap/api', () => ({
  isAppleIAPConfigured: () => true,
  isSubscriptionActive: async () => false,
  getSubscriptionStatuses: async () => { throw new Error('App Store Server API 404') },
}))
vi.mock('@/lib/apple-iap/jws', () => {
  class JWSVerificationError extends Error {}
  return { JWSVerificationError, verifyTransactionInfo: async () => h.state.tx, verifyNotificationPayload: async () => ({}) }
})

import { POST as verify } from './verify/route'

const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()
const OURS = (expiresDate: number) => ({
  bundleId: 'com.tappyai.ios', environment: 'Production', productId: 'com.tappyai.ios.pro.monthly',
  originalTransactionId: '2000000123456789', expiresDate, type: 'Auto-Renewable Subscription',
})
const post = () => verify(new Request('http://localhost/api/iap/apple/verify', {
  method: 'POST',
  body: JSON.stringify({ originalTransactionId: '2000000123456789', productId: 'com.tappyai.ios.pro.monthly', signedTransactionInfo: 'jws' }),
}))

beforeEach(() => {
  h.state.existing = null
  h.state.existingError = null
  h.state.tx = null
  h.state.upserts = []
  h.state.rpcCalls = []
  delete process.env.APPLE_IAP_ENV
  delete process.env.APPLE_IAP_ALLOW_SANDBOX
})

describe('keepsLongerExternalPlan (pure rule)', () => {
  const now = new Date('2026-10-26T00:00:00Z')
  const active = (over: Record<string, unknown> = {}) => ({
    status: 'active', current_period_end: iso(now.getTime() + 60 * DAY), source: 'web', stripe_sub_id: 'sub_123', ...over,
  })

  it('keeps an active web plan that outlasts the App Store period', () => {
    expect(keepsLongerExternalPlan(active(), new Date(now.getTime() + 30 * DAY), now)).toBe(true)
  })
  it('does not keep it when the App Store period is longer: the longer one wins', () => {
    expect(keepsLongerExternalPlan(active(), new Date(now.getTime() + 90 * DAY), now)).toBe(false)
  })
  it('keeps it when the App Store side has no usable period (an expired transaction must not mark it expired)', () => {
    expect(keepsLongerExternalPlan(active(), null, now)).toBe(true)
  })
  it.each([
    ['no row', null],
    ['an expired plan', active({ current_period_end: iso(now.getTime() - DAY) })],
    ['a non-active plan', active({ status: 'expired' })],
    ['a plan without an end', active({ current_period_end: null })],
    ['an unreadable end', active({ current_period_end: 'not a date' })],
  ])('does not keep %s', (_name, row) => {
    expect(keepsLongerExternalPlan(row as never, new Date(now.getTime() + 30 * DAY), now)).toBe(false)
  })
  it('never keeps an App Store row: a renewal or a second device is the normal update', () => {
    expect(keepsLongerExternalPlan(active({ source: 'apple_iap' }), null, now)).toBe(false)
    expect(keepsLongerExternalPlan(active({ source: null, stripe_sub_id: 'apple_2000000123456789' }), null, now)).toBe(false)
  })
  it('treats manual, sepay and play plans as external too', () => {
    for (const source of ['manual', 'web_sepay', 'google_play', null]) {
      expect(keepsLongerExternalPlan(active({ source }), new Date(now.getTime() + 30 * DAY), now)).toBe(true)
    }
  })
})

describe('POST /api/iap/apple/verify keeps the longer external plan', () => {
  it('🚨 a web plan that outlasts the purchase is NOT replaced: no upsert, no ledger call, plan reported as the existing one', async () => {
    h.state.existing = { plan: 'sunny', status: 'active', current_period_end: iso(Date.now() + 200 * DAY), source: 'web_sepay', stripe_sub_id: 'sepay_1' }
    h.state.tx = OURS(Date.now() + 30 * DAY)
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ isPro: true, plan: 'sunny', kept: 'existing_plan' })
    expect(h.state.upserts).toEqual([])
    expect(h.state.rpcCalls).toEqual([])
  })

  it('🚨 an EXPIRED App Store transaction (restore of an old one) does not mark an active web plan expired', async () => {
    h.state.existing = { plan: 'coco', status: 'active', current_period_end: iso(Date.now() + 20 * DAY), source: 'manual', stripe_sub_id: null }
    h.state.tx = OURS(Date.now() - 5 * DAY)
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ isPro: true, plan: 'coco', kept: 'existing_plan' })
    expect(h.state.upserts).toEqual([])
  })

  it('when the App Store period is the longer one it is recorded (nothing is lost, the source says apple_iap)', async () => {
    h.state.existing = { plan: 'pip', status: 'active', current_period_end: iso(Date.now() + 3 * DAY), source: 'web_sepay', stripe_sub_id: 'sepay_2' }
    h.state.tx = OURS(Date.now() + 30 * DAY)
    const res = await post()
    expect(res.status).toBe(200)
    expect(h.state.upserts[0]).toMatchObject({ user_id: 'u1', source: 'apple_iap', status: 'active', plan: 'momo' })
  })

  it('an account with no plan, or with its own App Store row, records the purchase as before', async () => {
    h.state.tx = OURS(Date.now() + 30 * DAY)
    expect((await post()).status).toBe(200)
    h.state.existing = { plan: 'momo', status: 'active', current_period_end: iso(Date.now() + 5 * DAY), source: 'apple_iap', stripe_sub_id: 'apple_2000000123456789' }
    expect((await post()).status).toBe(200)
    expect(h.state.upserts).toHaveLength(2)
  })

  it('fails closed (503, nothing written) when the account\'s current plan cannot be read', async () => {
    h.state.existingError = { message: 'db down' }
    h.state.tx = OURS(Date.now() + 30 * DAY)
    const res = await post()
    expect(res.status).toBe(503)
    expect(h.state.upserts).toEqual([])
  })
})
