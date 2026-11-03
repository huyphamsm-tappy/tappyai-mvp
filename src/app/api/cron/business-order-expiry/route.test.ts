import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The real shared check (src/lib/security/cronAuth.ts) runs here, not a mock: the point of this route's
// auth change (owner 30/10, mục D) is that it uses THAT check, fails closed without a secret, and runs
// before the database function is reached.
const expireStaleOrders = vi.fn()
vi.mock('@/lib/business/repositories/orders', () => ({
  expireStaleOrders: () => expireStaleOrders(),
}))
vi.mock('@/lib/business/logging', () => ({ logBusinessError: vi.fn() }))

import { GET } from './route'

const SECRET = 'cron-secret-for-tests'
const call = (auth: string | null) =>
  GET(new Request('https://t.test/api/cron/business-order-expiry', auth === null ? {} : { headers: { authorization: auth } }))

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET)
  expireStaleOrders.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/cron/business-order-expiry', () => {
  it('refuses a request without the scheduler bearer, before any order is touched', async () => {
    for (const auth of [null, '', SECRET, `bearer ${SECRET}`, `Bearer ${SECRET}x`, 'Bearer ']) {
      const res = await call(auth)
      expect(res.status, String(auth)).toBe(401)
      expect(await res.json()).toEqual({ error: 'Unauthorized' })
    }
    expect(expireStaleOrders).not.toHaveBeenCalled()
  })

  it('fails closed when no CRON_SECRET is configured ("Bearer undefined" included)', async () => {
    vi.stubEnv('CRON_SECRET', '')
    for (const auth of ['Bearer undefined', 'Bearer ']) expect((await call(auth)).status).toBe(401)
    expect(expireStaleOrders).not.toHaveBeenCalled()
  })

  it('runs the expiry once for the scheduler and returns the count', async () => {
    expireStaleOrders.mockResolvedValue(3)
    const res = await call(`Bearer ${SECRET}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, expired: 3 })
    expect(expireStaleOrders).toHaveBeenCalledTimes(1)
  })

  it('answers 500 without detail when the expiry fails', async () => {
    expireStaleOrders.mockRejectedValue(new Error('db down'))
    const res = await call(`Bearer ${SECRET}`)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'expiry_failed' })
  })
})
