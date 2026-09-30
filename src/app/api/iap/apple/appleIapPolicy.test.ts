import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Security audit 2026-09-30 · Apple IAP: a genuine Apple signature is not a TappyAI purchase ──
//
// Reproduces, at the route level, the path an attacker takes:
//   1. POST /api/iap/apple/verify with a MADE-UP originalTransactionId → the App Store Server API
//      lookup fails (404), which used to fall through to the client-sent JWS;
//   2. the JWS is genuinely Apple-signed (so jws.ts accepts it) but belongs to ANOTHER app, or to a
//      free Sandbox purchase, or to another product/subscription;
//   3. the route wrote subscriptions.status = 'active' → Pro.
// jws.ts is mocked to "Apple-signed, here is the payload"; everything after it is the real code.

const h = vi.hoisted(() => {
  const state = {
    tx: null as Record<string, unknown> | null,
    holder: null as { user_id: string } | null,
    upserts: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    notifData: null as Record<string, unknown> | null,
    subRow: { user_id: 'u1' } as { user_id: string } | null,
  }
  const q: Record<string, unknown> = {}
  Object.assign(q, {
    select: () => q, eq: () => q, neq: () => q, limit: () => q,
    maybeSingle: async () => ({ data: state.holder ?? state.subRow, error: null }),
    upsert: async (row: Record<string, unknown>) => { state.upserts.push(row); return { error: null } },
    update: (row: Record<string, unknown>) => { state.updates.push(row); return q },
  })
  return { state, admin: { from: () => q } }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: { id: 'u1' } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/apple-iap/api', () => ({
  isAppleIAPConfigured: () => true,
  isSubscriptionActive: async () => false,
  getSubscriptionStatuses: async () => { throw new Error('App Store Server API 404 at /inApps/v1/subscriptions/999') },
}))
vi.mock('@/lib/apple-iap/jws', () => {
  class JWSVerificationError extends Error {}
  return {
    JWSVerificationError,
    verifyTransactionInfo: async () => h.state.tx,
    verifyNotificationPayload: async () => ({ notificationType: 'DID_RENEW', data: { ...h.state.notifData, signedTransactionInfo: 'x' } }),
  }
})

import { POST as verify } from './verify/route'
import { POST as notify } from './notifications/route'
import { checkAppleTransaction } from '@/lib/apple-iap/transactionPolicy'

const FUTURE = Date.now() + 30 * 86_400_000
const OURS = {
  bundleId: 'com.tappyai.ios', environment: 'Production', productId: 'com.tappyai.ios.pro.monthly',
  originalTransactionId: '2000000123456789', expiresDate: FUTURE, type: 'Auto-Renewable Subscription',
}
const post = (body: unknown) => verify(new Request('http://localhost/api/iap/apple/verify', { method: 'POST', body: JSON.stringify(body) }))
const claim = (otid = OURS.originalTransactionId) => ({ originalTransactionId: otid, productId: OURS.productId, signedTransactionInfo: 'jws' })

beforeEach(() => {
  h.state.tx = { ...OURS }
  h.state.holder = null
  h.state.subRow = null
  h.state.upserts = []
  h.state.updates = []
  h.state.notifData = { bundleId: 'com.tappyai.ios', environment: 'Production' }
  delete process.env.APPLE_IAP_ENV
  delete process.env.APPLE_IAP_BUNDLE_ID
})

describe('checkAppleTransaction', () => {
  it('accepts our Pro product in our environment', () => {
    expect(checkAppleTransaction(OURS, { originalTransactionId: OURS.originalTransactionId })).toBeNull()
  })
  it.each([
    [{ bundleId: 'com.attacker.app' }, 'wrong_bundle'],
    [{ environment: 'Sandbox' }, 'wrong_environment'],
    [{ productId: 'com.tappyai.ios.coins' }, 'unknown_product'],
    [{ revocationDate: Date.now() }, 'revoked'],
  ])('refuses %o → %s', (patch, reason) => {
    expect(checkAppleTransaction({ ...OURS, ...patch } as never)).toBe(reason)
  })
  it('Sandbox is accepted only by a deployment configured for it', () => {
    expect(checkAppleTransaction({ ...OURS, environment: 'Sandbox' }, {}, { APPLE_IAP_ENV: 'Sandbox' } as never)).toBeNull()
  })
})

describe('POST /api/iap/apple/verify — the client-JWS fallback', () => {
  it('🚨 an Apple-signed transaction of ANOTHER app no longer grants Pro', async () => {
    h.state.tx = { ...OURS, bundleId: 'com.attacker.app' }
    const res = await post(claim())
    expect(res.status).toBe(400)
    expect(h.state.upserts).toEqual([])
  })

  it('🚨 a free Sandbox purchase does not grant Pro on a Production deployment', async () => {
    h.state.tx = { ...OURS, environment: 'Sandbox' }
    expect((await post(claim())).status).toBe(400)
    expect(h.state.upserts).toEqual([])
  })

  it('🚨 a JWS for a different subscription cannot stand in for the one claimed', async () => {
    const res = await post(claim('999'))  // made up — the API 404s — with a real JWS for another otid
    expect(res.status).toBe(400)
    expect(h.state.upserts).toEqual([])
  })

  it('🚨 another product of the app does not grant Pro', async () => {
    h.state.tx = { ...OURS, productId: 'com.tappyai.ios.something_else' }
    expect((await post(claim())).status).toBe(400)
  })

  it('🚨 an App Store subscription already registered to ANOTHER account is refused (no sharing)', async () => {
    h.state.holder = { user_id: 'someone-else' }
    const res = await post(claim())
    expect(res.status).toBe(409)
    expect(h.state.upserts).toEqual([])
  })

  it('a malformed transaction id is refused before anything else', async () => {
    expect((await post(claim('abc) or (1=1'))).status).toBe(400)
  })

  it('the real purchase still grants Pro', async () => {
    const res = await post(claim())
    expect(res.status).toBe(200)
    expect(h.state.upserts[0]).toMatchObject({ user_id: 'u1', stripe_sub_id: `apple_${OURS.originalTransactionId}`, status: 'active' })
  })
})

describe('POST /api/iap/apple/notifications', () => {
  const call = () => notify(new Request('http://localhost/api/iap/apple/notifications', { method: 'POST', body: JSON.stringify({ signedPayload: 'p' }) }))

  it('🚨 another app\'s (Apple-signed) notification changes nothing', async () => {
    h.state.notifData = { bundleId: 'com.attacker.app', environment: 'Production' }
    h.state.subRow = { user_id: 'u1' }
    const body = await (await call()).json()
    expect(body).toMatchObject({ ok: false, reason: 'wrong_bundle' })
    expect(h.state.upserts).toEqual([])
  })

  it('🚨 a Sandbox notification does not touch a Production deployment', async () => {
    h.state.notifData = { bundleId: 'com.tappyai.ios', environment: 'Sandbox' }
    h.state.subRow = { user_id: 'u1' }
    expect(await (await call()).json()).toMatchObject({ ok: false, reason: 'wrong_environment' })
    expect(h.state.upserts).toEqual([])
  })
})
