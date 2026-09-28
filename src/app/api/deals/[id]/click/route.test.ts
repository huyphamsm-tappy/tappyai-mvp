/**
 * security-audit L1 — the deal click counter cannot be inflated.
 * Old route: no limiter, the caller's client, and the RPC granted to anon — every case below fails
 * against it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  userClientRpc: 0,
  burstDenied: false,
  dailySeen: new Set<string>(),
  rpcThrows: false,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      if (h.rpcThrows) throw new Error('db down')
      h.rpcCalls.push({ fn, args })
      return { data: null, error: null }
    },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ rpc: async () => { h.userClientRpc += 1; return { data: null, error: null } } }),
}))
vi.mock('@/lib/security/publicRateLimit', () => ({
  publicRateLimit: async () => ({ ok: !h.burstDenied, retryAfter: 1, scope: 'distributed' }),
  publicDailyRateLimit: async (key: string) => {
    const first = !h.dailySeen.has(key)
    h.dailySeen.add(key)
    return { ok: first, retryAfter: 0, scope: 'distributed' }
  },
}))

import { POST } from './route'

const DEAL = '3f2b8c1e-7d4a-4c6b-9e2f-1a2b3c4d5e6f'
const click = (id = DEAL, ip = '203.0.113.9') =>
  POST(new Request(`http://localhost/api/deals/${id}/click`, { method: 'POST', headers: { 'x-vercel-forwarded-for': ip } }), { params: { id } })

beforeEach(() => {
  h.rpcCalls = []
  h.userClientRpc = 0
  h.burstDenied = false
  h.dailySeen = new Set()
  h.rpcThrows = false
})

describe('POST /api/deals/[id]/click', () => {
  it('counts a first click through the SERVICE ROLE, never the caller\'s client', async () => {
    const res = await click()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, counted: true })
    expect(h.rpcCalls).toEqual([{ fn: 'increment_deal_click', args: { p_deal_id: DEAL } }])
    expect(h.userClientRpc).toBe(0)
  })

  it('counts one click per deal per IP per day — repeats are answered but not counted', async () => {
    await click()
    const again = await click()
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ success: true, counted: false })
    expect(h.rpcCalls).toHaveLength(1)
    await click(DEAL, '198.51.100.4') // another visitor still counts
    expect(h.rpcCalls).toHaveLength(2)
  })

  it('a burst over the per-IP cap is answered 200 and not counted (the link must still open)', async () => {
    h.burstDenied = true
    const res = await click()
    expect(res.status).toBe(200)
    expect(h.rpcCalls).toHaveLength(0)
    expect(h.userClientRpc).toBe(0)
  })

  it('an id that is not a UUID never reaches the database', async () => {
    const res = await click('not-a-uuid')
    expect(res.status).toBe(200)
    expect(h.rpcCalls).toHaveLength(0)
    expect(h.userClientRpc).toBe(0)
  })

  it('a database failure is swallowed — still 200', async () => {
    h.rpcThrows = true
    expect((await click()).status).toBe(200)
  })
})
