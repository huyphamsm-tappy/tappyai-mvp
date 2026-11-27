import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// iOS needs to know BEFORE it offers the 7-day Pip pack whether this account already used its one Pip (store, web or staff grant).
// GET /api/subscription answers `pipUsed` with the SAME function the web's /api/payments/me and the order rules use (p7_pip_used).

const h = vi.hoisted(() => {
  const state = {
    user: null as { id: string; is_anonymous?: boolean } | null,
    subRow: null as Record<string, unknown> | null,
    rpc: { data: false as unknown, error: null as unknown },
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  }
  return { state }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({
    user: h.state.user,
    supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.state.subRow, error: null }) }) }) }) },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: async (fn: string, args: Record<string, unknown>) => { h.state.rpcCalls.push({ fn, args }); return h.state.rpc } }),
}))
vi.mock('@/lib/ai/quota/aiQuestionQuota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/quota/aiQuestionQuota')>()
  return { ...actual, peekAiQuestionQuota: async () => ({ limit: 10, period: 'day', used: 0, remaining: 10 }) }
})

import { GET } from './route'

const get = async () => {
  const res = await GET(new Request('https://t.test/api/subscription', { headers: { 'x-forwarded-for': '203.0.113.5' } }))
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
  h.state.user = { id: 'u1' }
  h.state.subRow = null
  h.state.rpc = { data: false, error: null }
  h.state.rpcCalls = []
})
afterEach(() => { vi.unstubAllEnvs() })

describe('GET /api/subscription: pipUsed', () => {
  it('false for an account that never had Pip (asks the database rule for this user)', async () => {
    const r = await get()
    expect(r.status).toBe(200)
    expect(r.body.pipUsed).toBe(false)
    expect(h.state.rpcCalls).toEqual([{ fn: 'p7_pip_used', args: { p_user: 'u1' } }])
  })

  it('true once the database says Pip was used, whatever the account holds now', async () => {
    h.state.rpc = { data: true, error: null }
    h.state.subRow = { plan: 'coco', status: 'active', current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(), source: 'web_sepay' }
    expect((await get()).body.pipUsed).toBe(true)
  })

  it('a guest has no Pip to have used: false, and the database is not asked', async () => {
    h.state.user = { id: 'g1', is_anonymous: true }
    h.state.rpc = { data: true, error: null }
    const r = await get()
    expect(r.body.pipUsed).toBe(false)
    expect(h.state.rpcCalls).toHaveLength(0)
  })

  it('when the rule cannot be read, an account that holds Pip right now is still reported as used', async () => {
    h.state.rpc = { data: null, error: { code: 'x' } }
    h.state.subRow = { plan: 'pip', status: 'active', current_period_end: new Date(Date.now() + 3 * 86_400_000).toISOString(), source: 'apple_iap' }
    expect((await get()).body.pipUsed).toBe(true)
  })

  it('the rest of the contract is untouched (additive field)', async () => {
    const b = (await get()).body
    for (const k of ['isPro', 'plan', 'source', 'status', 'entitlementSource', 'currentPeriodEnd', 'freeDailyLimit', 'quotaPeriod', 'isAnonymous', 'todayMessageCount', 'remaining']) expect(b, k).toHaveProperty(k)
  })
})
